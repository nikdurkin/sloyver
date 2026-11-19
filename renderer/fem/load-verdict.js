import {stressInBasis} from './material.js';
import {toSI} from '../load-units.js';
import {elementCenter} from './reinforcement.js';

const keys=['tXY','cXY','tZ','cZ','sXY','sZ'];
const MODE_NAMES={tXY:'растяжение в слоях',cXY:'сжатие в слоях',tZ:'растяжение поперёк слоёв',cZ:'сжатие поперёк слоёв',sXY:'сдвиг в слоях',sZ:'межслойный сдвиг'};
export function strengthReference(material){
 const value=k=>Array.isArray(material?.[k])&&material[k][0]>0?material[k][0]:null;
 return {generic:!!material?.generic,materialId:String(material?.id||''),name:String(material?.name||''),tXY:value('tensile_xy'),tZ:value('tensile_z'),source:String(material?.sourceURL||material?.url||material?.sourceNotes||''),conditions:String(material?.conditioning||'')};
}
export function loadVerdict(result,options={},comparison=null){
 const safety=Number.isFinite(options.safetyFactor)&&options.safetyFactor>=1&&options.safetyFactor<=10?options.safetyFactor:2,measured=options.limits,complete=measured?.enabled&&String(measured.source||'').length>=5&&keys.every(k=>Number.isFinite(measured[k])&&measured[k]>0),reference=options.strengthReference||{},limits=complete?measured:{tXY:reference.tXY,tZ:reference.tZ},used=keys.filter(k=>limits[k]>0),missing=keys.filter(k=>!(limits[k]>0)),utilization=new Float32Array(result.mesh.active.length),hasSparse=result.structure?.factors?.some(v=>v<.99999)||false;
 const peakDemands=Object.fromEntries(keys.map(k=>[k,0]));
 let rawReserve=Infinity,governing=null;
 for(let e=0;e<utilization.length;e++){
  const multiplier=hasSparse?1/Math.max(result.structure.factors[e],1e-12):1,s=stressInBasis(result.stress.subarray(e*6,e*6+6),result.basis).map(v=>v*multiplier),m=(s[0]+s[1])/2,r=Math.hypot((s[0]-s[1])/2,s[3]),demands={tXY:Math.max(0,m+r),cXY:Math.max(0,-m+r),tZ:Math.max(0,s[2]),cZ:Math.max(0,-s[2]),sXY:r,sZ:Math.hypot(s[4],s[5])};
  for(const k of keys)peakDemands[k]=Math.max(peakDemands[k],demands[k]);
  for(const k of used){const u=demands[k]*safety/limits[k];utilization[e]=Math.max(utilization[e],u);if(demands[k]>1e-15&&limits[k]/demands[k]<rawReserve){rawReserve=limits[k]/demands[k];governing={element:e,mode:k,point:elementCenter(result.mesh,e),title:['tZ','sZ'].includes(k)?'Возможная зона начала расслоения':'Возможная зона начала разрушения'};}}
 }
 const quality=result.quality||{},numerical=quality.converged&&quality.relativeResidual<=1e-4&&quality.forceBalanceRelative<=1e-4&&quality.momentBalanceRelative<=1e-4,large=result.summary.maxStrain>.01||result.summary.maxDisplacement/Math.hypot(...result.mesh.size)>.05,meshStable=!!comparison&&comparison.fineElements>comparison.coarseElements&&comparison.displacementPct<=5&&comparison.energyPct<=5&&comparison.stressP95Pct<=10&&comparison.stressMaxPct<=10,geometry=!result.boundary?.approximate&&!result.meshPlan?.relaxedSelected&&(result.summary.volumeError??0)<=.05&&Math.min(...result.mesh.dims)>=3&&!result.meshPlan?.warnings?.length&&!(hasSparse&&result.structure?.summary?.thinBands);
 const canConfirm=!!complete&&!hasSparse&&numerical&&!large&&meshStable&&geometry,capacity=Number.isFinite(rawReserve)?rawReserve/safety:null;
 let category='unknown',level='pending',title='Допустимость нагрузки пока не подтверждена',comment='';
 if(!used.length)comment='Нет подходящих данных прочности материала. Можно увидеть нагруженные места и проверить усиление, но нельзя определить, выдержит ли деталь.';
 else if(canConfirm){
  if(capacity<1){category='overload';level='danger';title='Нагрузка выше допустимой';comment=rawReserve<1?'Материал не выдерживает заданную нагрузку в принятой расчётной модели.':'Материалу не хватает выбранного запаса: уменьшите нагрузку или усильте деталь.';}
  else if(capacity<1.25){category='limit';level='warning';title='Нагрузка близка к предельной';comment='По принятой модели деталь находится рядом с границей допуска. Для запаса рассмотрите усиление.';}
  else {category='within';level='good';title='Нагрузка в пределах допустимого';comment='По принятой модели и введённым характеристикам деталь выдерживает заданную нагрузку с выбранным запасом.';}
 }else{
  if(capacity!==null&&capacity<1){category='risk';level=rawReserve<1?'danger':'warning';title=rawReserve<1?'Есть риск разрушения':'Запас ниже желаемого';comment=rawReserve>=1?'По известным характеристикам выбранный запас не достигнут. Сравните усиление, ориентацию или уменьшение нагрузки.':complete?'Напряжения превышают принятый ориентир, но качество модели пока не позволяет подтвердить предельную нагрузку.':'По доступным данным растяжения материал может не выдержать нагрузку. Общая проверка прочности неполная.';}
  else if(capacity!==null&&capacity<1.25){category='risk-limit';level='warning';title='Близко к ориентиру прочности';comment='По доступным данным запас небольшой. Полная допустимость нагрузки ещё не подтверждена.';}
  else comment=complete?'Проверки материала, геометрии или сетки ещё не завершены.':'Перегрузка по известным характеристикам растяжения не обнаружена. Для общего вывода не хватает сжатия и сдвига.';
 }
 const criteria=keys.map(key=>({key,name:MODE_NAMES[key],available:limits[key]>0,limit:limits[key]>0?limits[key]:null,peakDemand:peakDemands[key],ratio:limits[key]>0&&peakDemands[key]>1e-15?limits[key]/peakDemands[key]:null}));
 const reasons=[];if(!numerical)reasons.push('Результат не прошёл проверку решения и равновесия.');if(!complete)reasons.push(reference.generic?'Для General известны только введённые свойства; неизвестные сжатие и сдвиг не подставлены.':'TDS даёт типовые свойства образцов, а не допустимую нагрузку готовой детали; сжатие и сдвиг неизвестны.');if(hasSparse)reasons.push('Заполнение заменено однородной средой. Для поиска зон напряжения приведены к условному сплошному материалу при той же деформации; прочность отдельных нитей не определена.');if(large)reasons.push('Получены большие деформации: линейная модель может быть неприменима.');if(!meshStable)reasons.push('Нужно уточнение сетки, включая проверку локального максимума.');if(!geometry)reasons.push('Есть грубо переданные геометрические особенности или тонкие полосы оболочки.');
 const loads=canConfirm&&capacity!==null?(result.boundary.loads||[]).map(l=>{const si=toSI(l.value,l.unit,l.type)*capacity;return l.type==='force'?{type:'force',label:l.label,value:si,unit:'N',equivalentKg:si/9.80665}:{type:'moment',label:l.label,value:si,unit:'Nm',equivalentKgAt10cm:si/(9.80665*.1)};}):[];
 return {criteria,category,level,title,comment,canConfirm,safetyFactor:safety,rawReserve:Number.isFinite(rawReserve)?rawReserve:null,capacityMultiplier:canConfirm?capacity:null,preliminaryMultiplier:capacity,utilization,governing,mode:governing?MODE_NAMES[governing.mode]:null,complete:!!complete,hasSparse,missing,referenceLabel:reference.generic?'данные пользователя':'TDS Bambu Lab',source:complete?measured.source:reference.source,conditions:complete?measured.source:reference.conditions,reasons,loads,method:'Maximum element-mean material-axis stress screening; no crack propagation or interacting-stress failure model'};
}
