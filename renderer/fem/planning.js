import {prepareMesh} from '../geometry.js';
import {voxelMesh,LIMITS} from './mesh.js';

export const MESH_PRESETS={quick:{name:'Быстро',elements:12000,across:2},standard:{name:'Обычно',elements:32000,across:3},fine:{name:'Подробно',elements:80000,across:4}};
const finitePositive=v=>Number.isFinite(v)&&v>0;
const resolutionWarning=(diameter,step)=>'Отверстие или окружность Ø'+diameter.toFixed(2)+' мм передаётся приближённо: шаг '+step.toFixed(3)+' мм. Расчёт можно продолжить, но локальные напряжения у этого участка требуют проверки на более подробной сетке.';
export function meshPlan(source,scheme={},options={}){
 const preset=Object.hasOwn(MESH_PRESETS,options.meshQuality)?options.meshQuality:'standard',quality=MESH_PRESETS[preset],targets=[...(scheme.fixtures||[]),...(scheme.loads||[])].map(v=>v.target),diameters=targets.filter(t=>t.kind!=='face'&&finitePositive(t.radius)).map(t=>t.radius*2),maxStep=diameters.length?Math.min(...diameters)/2.5:Infinity;
 const size=source.size,volume=source.volume||size.reduce((a,b)=>a*b,1),sample=options.features||{},thickness=[sample.p10,sample.minimum].filter(finitePositive),thin=thickness.length?Math.min(...thickness):null;
 const desired=Math.min(Math.cbrt(volume/quality.elements),Math.max(...size)/18,Math.min(...size)/3,diameters.length?Math.min(...diameters)/quality.across:Infinity,thin?thin/(preset==='fine'?3:preset==='quick'?1:1.25):Infinity);
 const resourceStep=Math.cbrt(volume/(LIMITS.elements*.85)),domainStep=Math.max(Math.cbrt(size.reduce((a,b)=>a*b,1)/LIMITS.cells)*1.05,Math.max(...size)/1490);
 // Prefer resolving selected features, but fit the calculation into the worker
 // budget. An unresolved feature is explicitly approximate, not a hard stop.
 const recommended=Math.max(.01,resourceStep,domainStep,Math.min(desired,maxStep*.98)),automatic=options.meshMode==='auto'||!finitePositive(options.step),step=automatic?recommended:options.step;
 const dims=size.map(v=>Math.max(1,Math.ceil(v/step-1e-9))),domainCells=dims.reduce((a,b)=>a*b,1),estimate=Math.round(volume/step**3),warnings=[],relaxedSelected=Number.isFinite(maxStep)&&step>maxStep*(1+1e-8);
 if(relaxedSelected)warnings.push(resolutionWarning(maxStep*2.5,step));
 if(thin&&step>thin/3)warnings.push('В выборочно найденном тонком участке меньше трёх шагов. Его локальная жёсткость требует проверки уточнением.');
 const otherHoles=(sample.holeDiameters||[]).filter(finitePositive);if(otherHoles.some(d=>d<step*2.5))warnings.push('Часть небольших отверстий вне выбранных опор и нагрузок может быть грубо передана. Проверьте объёмную сетку.');
 return {automatic,preset,step,recommended,maxSelectedStep:Number.isFinite(maxStep)?maxStep:null,relaxedSelected,estimatedElements:estimate,estimatedDomainCells:domainCells,estimatedRange:[Math.round(estimate*.65),Math.round(estimate*1.4)],thinSample:thin,issues:[],warnings};
}

export function prepareFEMMesh(options,onProgress=()=>{}){
 const source=prepareMesh(options.positions),plan=meshPlan(source,options.scheme,options);
 let step=plan.step,lastError;
 for(let attempt=0;attempt<10;attempt++){
  try{
   const output=voxelMesh(options.positions,step,onProgress,source),actualStep=Math.max(...output.mesh.spacing);
   plan.step=step;plan.actualElements=output.mesh.active.length;plan.actualNodes=output.mesh.nodes.length/3;plan.actualSpacing=[...output.mesh.spacing];plan.adapted=attempt>0;
   plan.relaxedSelected=plan.maxSelectedStep!==null&&actualStep>plan.maxSelectedStep*(1+1e-8);
   plan.warnings=plan.warnings.filter(s=>!s.startsWith('Отверстие или окружность Ø'));
   if(plan.relaxedSelected)plan.warnings.unshift(resolutionWarning(plan.maxSelectedStep*2.5,actualStep));
   return {...output,plan};
  }catch(error){
   lastError=error;if(!plan.automatic)throw error;
   const resource=/слишком велика|много узлов|максимум|ячеек области/i.test(error.message),detail=/распалась|расхождение больше 30|слишком грубо/i.test(error.message);
   if(resource)step*=1.18;
   else if(detail)step*=.84;
   else throw error;
  }
 }
 throw new Error('Не удалось автоматически подготовить сетку: '+lastError.message);
}
