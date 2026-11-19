import {toSI} from './load-units.js';
// Relative layer orientation from idealized straight support-to-load paths.
// This is NOT an FE solver. No reactions, stresses, deflections or allowable
// loads are inferred. Multiple restraints are separate conservative paths.
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]),len=a=>Math.hypot(...a),unit=a=>a.map(v=>v/len(a));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const emptyScheme=()=>({version:1,fixtures:[],loads:[]});
export const SUPPORTS={fixed:{name:'Жёсткое крепление',hint:'Удерживает участок во всех направлениях.'},pin:{name:'Отверстие на гладкой оси',hint:'Запрещает радиальное перемещение. Допускает скольжение и вращение вокруг оси; нужны дополнительные опоры.'},roller:{name:'Скользящая опора на плоскости',hint:'Удерживает по нормали к грани, допускает движение вдоль неё. Отрыв и трение не моделируются.'},guide:{name:'Направляющая вдоль оси',hint:'Разрешает перемещение только вдоль оси выбранного отверстия или нормали грани.'}};
export function supportType(f){return Object.hasOwn(SUPPORTS,f?.support||f?.type)?(f.support||f.type):'fixed';}
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<1e7);
function restoreTarget(t){
 if(!t||!['face','circle','hole'].includes(t.kind)||!vector(t.center)||!vector(t.normal)||len(t.normal)<1e-8)throw new Error('Некорректное место закрепления или нагрузки.');
 const out={kind:t.kind,center:[...t.center],normal:unit(t.normal),label:String(t.label||'Участок').slice(0,80)};
 if(t.kind==='face'){
  if(!vector(t.point)||!vector(t.min)||!vector(t.max)||!Number.isFinite(t.area)||t.area<=0||!Array.isArray(t.facetRanges)||t.facetRanges.length>450000||t.facetRanges.some(r=>!Array.isArray(r)||r.length!==2||!r.every(Number.isInteger)||r[0]<0||r[1]<1||r[0]+r[1]>450000))throw new Error('Некорректная плоская грань в схеме.');
  Object.assign(out,{point:[...t.point],min:[...t.min],max:[...t.max],area:t.area,facetRanges:t.facetRanges.map(r=>[...r])});
 }else{if(!(Number.isFinite(t.radius)&&t.radius>=.01&&t.radius<1e5))throw new Error('Некорректный диаметр окружности.');Object.assign(out,{radius:t.radius,featureId:String(t.featureId||'').slice(0,80)});if(Number.isFinite(t.length)&&t.length>0&&t.length<1e6)out.length=t.length;}
 return out;
}
export function restoreScheme(raw){
 if(raw==null)return emptyScheme();if(raw.version!==1||!Array.isArray(raw.fixtures)||!Array.isArray(raw.loads)||raw.fixtures.length>8||raw.loads.length>8)throw new Error('Некорректная схема нагрузки: максимум 8 закреплений и 8 сценариев.');
 const fixtures=raw.fixtures.map((f,i)=>{const target=restoreTarget(f.target),support=supportType(f);if(support==='roller'&&target.kind!=='face')throw new Error('Для скользящей опоры выберите плоскую грань.');if(support==='pin'&&target.kind==='face')throw new Error('Для опоры на ось выберите отверстие или окружность.');return {id:'fix-'+i,type:'fixed',support,target};});
 const loads=raw.loads.map((l,i)=>{if(!['force','moment'].includes(l.type)||!vector(l.direction)||len(l.direction)<1e-8)throw new Error('У нагрузки не задано направление.');const unitName=l.unit||(l.type==='moment'?'Nm':'N'),value=l.value??1;toSI(value,unitName,l.type);return {id:'load-'+i,type:l.type,target:restoreTarget(l.target),direction:unit(l.direction),value,unit:unitName,leverCm:Number.isFinite(l.leverCm)&&l.leverCm>0&&l.leverCm<=100000?l.leverCm:10};});
 return {version:1,fixtures,loads};
}
export function schemePaths(scheme){
 return scheme.loads.flatMap((load,caseIndex)=>scheme.fixtures.map((fixture,fixtureIndex)=>{const r=sub(load.target.center,fixture.target.center),span=len(r);return {caseIndex,fixtureIndex,type:load.type,direction:load.direction,axis:span>1e-8?unit(r):null,span,fixture:fixture.target.center,point:load.target.center};}));
}
export function schemeStatus(scheme){
 if(!scheme?.fixtures?.length)return {ready:false,code:'fixture',short:'Нужно крепление',title:'Где закреплена деталь?',message:'Отметьте отверстие, окружность или плоскую грань, которая жёстко закреплена.',target:'addFixtureBtn'};
 if(!scheme.loads?.length)return {ready:false,code:'load-point',short:'Нужна нагрузка',title:'Где и как нагружена деталь?',message:'Добавьте условную силу или момент на другой грани или окружности.',target:'addForceBtn'};
 const paths=schemePaths(scheme),bad=paths.find(p=>p.span<.01||!p.direction||len(p.direction)<1e-8);
 if(bad)return {ready:false,code:'coincident',short:'Проверьте места',title:'Закрепление и нагрузка совпали',message:'Для сравнения слоёв нужны разные места крепления и приложения нагрузки. Перенесите совпавшую нагрузку.',target:'schemeLoads'};
 return {ready:true,code:'scheme-ready',short:'По схеме',title:'Схема работы задана',message:'Подбор ориентации рассматривает нагрузки отдельно и сравнивает направление слоёв с путями к креплениям. Совместное действие сил и моментов — в «Проверке под нагрузкой».',target:null};
}
export function schemeLayerRisk(scheme,normal){
 if(!schemeStatus(scheme).ready)return null;normal=unit(normal);
 const paths=schemePaths(scheme),cases=[];
 for(let i=0;i<scheme.loads.length;i++){
  const load=scheme.loads[i],entries=paths.filter(p=>p.caseIndex===i).map(p=>{
   const u=p.axis,d=unit(p.direction),alignment=dot(u,normal)**2,parallel=Math.abs(dot(u,d)),perp=Math.sqrt(Math.max(0,1-parallel**2));let risk,kind;
   if(load.type==='force'){
    if(perp<.05){risk=alignment;kind=dot(u,d)>=0?'tension':'compression';}
    else {const transverse=unit(d.map((v,j)=>v-dot(u,d)*u[j]));risk=.8*alignment+.2*dot(transverse,normal)**2;kind='bending';}
   }else{
    const torsion=parallel,bending=perp,bendDir=bending>.000001?unit(cross(d,u)):null;
    risk=(torsion*(.5+.5*alignment)+bending*(.8*alignment+.2*(bendDir?dot(bendDir,normal)**2:0)))/Math.max(1e-8,torsion+bending);kind=torsion>.95?'torsion':bending>.95?'bending':'mixed';
   }
   return {...p,kind,risk:Math.min(1,Math.max(0,risk))};
  });
  const magnitude=toSI(load.value??1,load.unit||(load.type==='moment'?'Nm':'N'),load.type);const spanM=Math.max(...entries.map(p=>p.span))/1000;const equivalentForce=load.type==='moment'?magnitude/Math.max(spanM,.00001):magnitude;cases.push({index:i,type:load.type,risk:Math.max(...entries.map(x=>x.risk)),paths:entries,equivalentForce});
 }
 // Every scenario affects ranking; the worst case carries most of the weight.
 const maxForce=Math.max(...cases.map(c=>c.equivalentForce));for(const c of cases)c.weight=c.equivalentForce/maxForce;const risk=.7*Math.max(...cases.map(c=>c.risk*c.weight))+.3*cases.reduce((s,c)=>s+c.risk*c.weight,0)/cases.reduce((s,c)=>s+c.weight,0);
 return {risk,alignment:1-risk,cases,method:'straight-path-heuristic-v1',hasTorsion:cases.some(c=>c.paths.some(p=>['torsion','mixed'].includes(p.kind))),hasCompression:cases.some(c=>c.paths.some(p=>p.kind==='compression'))};
}
export function schemeSummary(scheme){const status=schemeStatus(scheme);return status.ready?`${scheme.fixtures.length} закрепл. · ${scheme.loads.length} сценар. нагрузки`:status.title;}
export function schemeDirections(scheme){
 if(!schemeStatus(scheme).ready)return [];const out=[];
 for(const p of schemePaths(scheme)){
  out.push(p.axis);const n=cross(p.axis,p.direction);if(len(n)>.01)out.push(unit(n));
  if(p.type==='moment'){const bend=cross(p.direction,p.axis);if(len(bend)>.01)out.push(unit(bend));}
 }
 return out;
}
