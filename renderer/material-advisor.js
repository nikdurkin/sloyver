export const GUIDE='https://bambulab.com/en/filament/guide';
export const OUTDOOR='https://bambulab.com/en/filament/collections/outdoor-use';
// Guide HDT at 0.45 MPa: a specimen screening value, never a service limit.
// PC is deliberately unset: the existing PC TDS revision differs from the guide.
export const HDT={'pla-basic':57,'petg-basic-new':71,'petg-hf':69,abs:87,asa:100,'paht-cf':194,'pa6-cf':186,'pet-cf':205};
const OUTSIDE=new Set(['asa','petg-basic-new','petg-hf','pc','pet-cf','paht-cf','pa6-cf']);
const CLOSED=new Set(['abs','asa','pc','pet-cf','paht-cf','pa6-cf']);
export const defaultEnvironment={temperature:25,outdoor:false,wet:false,purpose:'balanced',hardened:true,maxNozzle:300,maxBed:110,maxChamber:0,printer:'',process:'',drying:''};
export const dryingTemperature=m=>m.generic?'по данным поставщика':Array.isArray(m.dryCRange)?m.dryCRange.join('–'):String(m.dryC);
export function assessMaterial(m,e={},hardware={}){
 e={...defaultEnvironment,...e};const blocked=[],notes=[],reasons=[],nozzle=Number(hardware.nozzle||.4),chamber=hardware.chamber||'closed';let rank=0;
 if(!m.generic&&!m.nozzleMm.includes(nozzle))blocked.push('Не поддерживает выбранный диаметр сопла');
 if(m.hardenedRequired&&!e.hardened)blocked.push('Нужно износостойкое сопло');
 if(e.maxNozzle<m.nozzleC[0])blocked.push('Не хватает температуры сопла');
 if(e.maxBed<m.bedC[0])blocked.push('Не хватает температуры стола');
 if((CLOSED.has(m.id)||m.enclosureRequired)&&chamber!=='closed')blocked.push('Для стабильной печати выберите закрытую камеру');
 if(m.minimumConfirmedChamberC&&e.maxChamber<m.minimumConfirmedChamberC)blocked.push('Для автоподбора подтвердите достижимую температуру камеры от '+m.minimumConfirmedChamberC+' °C в условиях принтера');
 if(e.maxNozzle>=m.nozzleC[0]&&e.maxNozzle<m.nozzleC[1])notes.push('Принтер покрывает часть диапазона TDS сопла; используйте профиль для своей машины, не превышая '+e.maxNozzle+' °C.');
 if(m.dryCRange)notes.push('Сушка по TDS: '+dryingTemperature(m)+' °C, '+m.dryHours.join('–')+' ч; проверьте возможности сушильного шкафа.');
 if(m.generic){notes.push(m.configured?'Свойства и температуры введены пользователем.':'General: E, плотность и температуры пока являются допущениями.');notes.push('Сушка, охлаждение, ударная вязкость и рабочая температура требуют данных поставщика.');return {id:m.id,name:m.name,rank:0,blocked,notes,reasons:['Выбран пользовательский материал.'],hdt:null,eligible:false};}
 const hdt=m.hdt045C??HDT[m.id];
 if(Number.isFinite(e.temperature)&&e.temperature>40){if(hdt&&e.temperature>=hdt)blocked.push('Заданная температура достигает или превышает HDT образца');else notes.push(hdt?'HDT '+hdt+' °C выше заданной температуры; длительная работа под нагрузкой требует проверки.':'Для выбранной версии нет согласованного HDT: проверить температуру по её TDS.');}
 if(e.outdoor){if(OUTSIDE.has(m.id)||['asa-cf','petg-cf'].includes(m.id)){rank+=2;reasons.push(m.id.startsWith('asa')?'ASA — кандидат для наружных деталей.':'Производитель включает материал в наружные применения; проверить УФ и срок службы.');}else{notes.push('Наружное применение и УФ требуют отдельного подтверждения.');rank-=3;}}
 if(e.wet){rank-=Math.log1p(m.absorption)*2;notes.push('Влагопоглощение образца '+m.absorption+'%; для посадок проверить размеры после кондиционирования.');}
 if(e.purpose==='stiff'){rank+=Math.log(Math.max(1,m.E_xy[0]));reasons.push('Модуль XY образца: '+m.E_xy[0]+' МПа.');if(m.id==='tpu95a-hf')blocked.push('Гибкий TPU не соответствует приоритету жёсткости');}
 else if(e.purpose==='impact'){rank+=Math.log(Math.max(1,m.impact_xy[0]));reasons.push('Ударная вязкость XY образца: '+m.impact_xy[0]+' кДж/м².');}
 else if(e.purpose==='flexible'){if(m.id==='tpu95a-hf'){rank+=15;reasons.push('Эластичный TPU.');}else blocked.push('Для гибкой детали в этом наборе предусмотрен TPU');}
 else{rank+=Math.log(Math.max(1,m.tensile_z[0]));if(m.id==='tpu95a-hf')rank-=5;const complexity={'pla-basic':0,'pla-cf':1,'petg-basic-new':1,'petg-hf':1,'petg-cf':2,abs:2,'abs-gf':3,asa:2,'asa-cf':3,pc:3,'pc-fr':3,'paht-cf':4,'pa6-cf':4,'pa6-gf':4,'pet-cf':4,'ppa-cf':7,'pps-cf':8,'tpu95a-hf':3}[m.id]||0;rank-=complexity*(e.goal==='strength'?.08:.45);reasons.push(e.goal==='strength'?'Приоритет межслойного растяжения образца с учётом требований печати.':'Учтены межслойное растяжение образца и сложность стабильной печати.');}
 if(m.hardenedRequired)notes.push('Температурные и механические данные зависят от сушки и термообработки TDS.');
 return {id:m.id,name:m.name,rank,blocked,notes,reasons,hdt:hdt??null,eligible:blocked.length===0};
}
export function rankMaterials(materials,environment,hardware){return materials.map(m=>assessMaterial(m,environment,hardware)).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||b.rank-a.rank);}
