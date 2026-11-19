import {stressInBasis} from './material.js';

export const LIMIT_NAMES={tXY:'Растяжение в слоях',cXY:'Сжатие в слоях',tZ:'Растяжение поперёк слоёв',cZ:'Сжатие поперёк слоёв',sXY:'Сдвиг в слоях',sZ:'Межслойный сдвиг'};
export function validateLimits(raw){
 if(!raw?.enabled)return null;
 const out={enabled:true,source:String(raw.source||'').trim().slice(0,300)};
 if(out.source.length<5)throw new Error('Для оценки запаса укажите источник и условия испытаний материала.');
 for(const key of Object.keys(LIMIT_NAMES)){const value=Number(raw[key]);if(!Number.isFinite(value)||value<=0||value>1e6)throw new Error('Для оценки запаса заполните все шесть характеристик прочности в МПа.');out[key]=value;}
 return out;
}

export function measuredTensileModulus({force,length,area,elongation}){
 for(const value of [force,length,area,elongation])if(!Number.isFinite(value)||value<=0)throw new Error('Для образца укажите положительные силу, длину, площадь и удлинение.');
 if(elongation/length>.01)throw new Error('Удлинение образца больше 1% длины. Используйте наклон начального линейного участка, а не точку при большой деформации.');
 return force*length/(area*elongation);
}

export function reserveEstimate(result,raw,comparison){
 const limits=validateLimits(raw);if(!limits)return {available:false,reason:'Нет полного набора характеристик прочности с условиями испытаний.'};
 if(!result.fullSolid)return {available:false,reason:'Средние напряжения однородного заполнения нельзя сравнивать с прочностью сплошного образца.'};
 if(result.boundary?.approximate||result.meshPlan?.relaxedSelected)return {available:false,reason:'Мелкие отверстия или окружности переданы приближённо. Подтверждение запаса требует более подробной сетки.'};
 if(result.summary.maxStrain>.01||result.summary.maxDisplacement/Math.hypot(...result.mesh.size)>.05)return {available:false,reason:'Получены большие деформации; линейной модели недостаточно для оценки запаса.'};
 if(!comparison||comparison.displacementPct>5||comparison.energyPct>5||comparison.stressP95Pct>10)return {available:false,reason:'Сначала проверьте чувствительность к сетке. Локальные пики могут оставаться несошедшимися.'};
 let ratio=Infinity,governing=null;
 for(let e=0;e<result.stress.length/6;e++){
  const s=stressInBasis(result.stress.subarray(e*6,e*6+6),result.basis),m=(s[0]+s[1])/2,r=Math.hypot((s[0]-s[1])/2,s[3]),hi=m+r,lo=m-r;
  const demands={tXY:Math.max(0,hi),cXY:Math.max(0,-lo),tZ:Math.max(0,s[2]),cZ:Math.max(0,-s[2]),sXY:r,sZ:Math.hypot(s[4],s[5])};
  for(const [key,demand] of Object.entries(demands)){const value=demand>1e-15?limits[key]/demand:Infinity;if(value<ratio){ratio=value;governing={element:e,mode:key,demand,limit:limits[key]};}}
 }
 return {available:Number.isFinite(ratio),ratio:Number.isFinite(ratio)?ratio:null,governing,source:limits.source,reason:'Оценка по раздельным предельным напряжениям и средним напряжениям элементов. Взаимодействие напряжений и разрушение не смоделированы; это не сертифицированная несущая способность.'};
}

function elementCenter(mesh,e){const key=mesh.active[e],p=[key%mesh.dims[0],Math.floor(key/mesh.dims[0])%mesh.dims[1],Math.floor(key/(mesh.dims[0]*mesh.dims[1]))];return p.map((v,j)=>mesh.min[j]+(v+.5)*mesh.spacing[j]);}
export function hotspots(result){
 const out=[];let node=0,maximum=-1;
 for(let n=0;n<result.displacement.length/3;n++){const value=Math.hypot(...result.displacement.subarray(n*3,n*3+3));if(value>maximum){maximum=value;node=n;}}
 out.push({field:'displacement',point:Array.from(result.mesh.nodes.subarray(node*3,node*3+3)),title:'Где сильнее прогибается',value:maximum,unit:'мм',node});
 for(const [field,title] of [['vonMises','Где выше напряжения'],['layerNormal','Где нагружены слои поперёк'],['layerShear','Где слои сдвигаются']]){
  let e=0;for(let i=1;i<result.fields[field].length;i++)if(result.fields[field][i]>result.fields[field][e])e=i;
  const point=elementCenter(result.mesh,e);let nearSupport=false;
  for(const patch of result.boundary.fixtures)for(const n of patch.nodes){if(Math.hypot(...point.map((v,j)=>v-result.mesh.nodes[n*3+j]))<2*Math.max(...result.mesh.spacing)){nearSupport=true;break;}}
  out.push({field,point,title,value:result.fields[field][e],unit:'МПа',element:e,nearSupport});
 }
 return out;
}

export function assessResult(result,comparison=null,options={}){
 const {summary:s,quality:q}=result,large=s.maxStrain>.01||s.maxDisplacement/Math.hypot(...result.mesh.size)>.05,numerical=q.converged&&q.relativeResidual<=1e-4&&q.forceBalanceRelative<=1e-4&&q.momentBalanceRelative<=1e-4,planWarnings=result.meshPlan?.warnings||[];
 const geometryGood=!result.boundary?.approximate&&!result.meshPlan?.relaxedSelected&&(s.volumeError??0)<=.05&&Math.min(...result.mesh.dims)>=3&&!planWarnings.length&&!result.structure?.summary.thinBands;
 const refined=!!comparison&&comparison.fineElements>comparison.coarseElements,stable=refined&&comparison.displacementPct<=5&&comparison.energyPct<=5&&comparison.stressP95Pct<=10;
 const checks=[{id:'solution',status:numerical?'checked':'attention',title:'Численное решение',detail:numerical?'Решение и равновесие сил/моментов проверены.':'Проверьте условия и решение.'},{id:'geometry',status:geometryGood?'checked':'attention',title:'Передача геометрии',detail:geometryGood?'Объём и основные габариты прошли встроенные проверки. Мелкие детали нужно осмотреть на сетке.':'Есть грубо переданные отверстия, тонкие участки или объёмные доли оболочки.'},{id:'mesh',status:stable?'checked':refined?'attention':'pending',title:'Чувствительность к сетке',detail:stable?'Перемещение, энергия и P95 изменились в пределах заданных порогов. Сходимость локального пика не подтверждена.':refined?'Результат заметно меняется при уточнении.':'Нужен повторный расчёт на более подробной сетке.'},{id:'model',status:large?'attention':result.fullSolid?'checked':'approximate',title:'Применимость модели',detail:large?'Большие деформации: линейный результат требует другой модели.':result.fullSolid?'Малые деформации сплошного упругого тела.':'Приближённая оболочка и однородное заполнение; траектории печати и контакты не построены.'}];
 const spots=hotspots(result),peak=spots.find(x=>x.field==='vonMises'),suggestions=[];
 if(large)suggestions.push('Уменьшите нагрузку для проверки линейного режима или используйте расчёт больших деформаций. Для усиления рассмотрите большее сечение и ребро по направлению прогиба.');
 if(s.stats.layerNormal.max>0)suggestions.push('Сравните ориентации, чтобы уменьшить растяжение поперёк слоёв. Одна смена заполнения не устраняет слабое межслойное направление.');
 if(peak?.nearSupport)suggestions.push('Пик рядом с креплением: проверьте тип опоры, площадь передачи нагрузки и скругление перехода. Жёсткая фиксация может давать локальный пик.');
 if(result.structure?.summary.mode==='printed')suggestions.push('Сравните увеличение стенок и сплошных слоёв с увеличением заполнения. Подтвердите выбранный рецепт контрольной печатью.');
 if(!stable)suggestions.push('Уточните сетку и сравните прогиб и энергию, прежде чем делать вывод по цветовой карте.');
 const reserve=reserveEstimate(result,options.limits,comparison);
 return {title:large?'Линейная модель требует проверки':stable&&geometryGood?'Приближение проверено уточнением':'Результат требует проверки',large,numerical,stable,checks,spots,suggestions,reserve,displacementLimit:options.displacementLimit>0?{limit:options.displacementLimit,within:s.maxDisplacement<=options.displacementLimit}:null};
}
