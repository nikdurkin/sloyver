import {unzipSync,strFromU8} from './vendor/libs/fflate.module.js';
const number=v=>Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
const sum=a=>a.reduce((s,v)=>s+(number(v)||0),0);
const weight=(v,k)=>number(v?.[k]?.weight??v?.weight?.[k]??v?.[k+'_weight']??v?.['weight_'+k]);
export function parseDuration(text){
 if(typeof text==='number')return text;
 const s=String(text||'').trim();if(/^\d+(?::\d+){1,2}$/.test(s))return s.split(':').reduce((n,v)=>n*60+Number(v),0);
 let seconds=0,found=false;for(const [re,factor] of [[/(\d+(?:\.\d+)?)\s*d/i,86400],[/(\d+(?:\.\d+)?)\s*h/i,3600],[/(\d+(?:\.\d+)?)\s*m(?!s)/i,60],[/(\d+(?:\.\d+)?)\s*s/i,1]]){const m=s.match(re);if(m){seconds+=Number(m[1])*factor;found=true;}}
 return found?seconds:/^\d+(\.\d+)?$/.test(s)?Number(s):null;
}
export function parseStatistics(raw,name='Статистика'){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Некорректная статистика.');
 if(raw.version!=null&&(!Number.isInteger(Number(raw.version))||Number(raw.version)>1))throw new Error('Версия статистики не поддерживается: '+raw.version);
 const s=raw.summary||raw,units=raw.units||{};
 for(const [key,allowed] of [['time',['s','seconds','second']],['weight',['g','grams','gram']]])if(units[key]&&!allowed.includes(units[key]))throw new Error('Неизвестные единицы статистики: '+units[key]);
 const filaments=(Array.isArray(s.filaments)?s.filaments:[]).slice(0,32).map((f,i)=>({id:/^[a-z0-9_-]{1,30}$/i.test(String(f.id))?String(f.id):String(i+1),name:String(f.name||f.type||'Материал '+(i+1)).slice(0,100),grams:number(f.weight??f.grams??f.total_weight),modelGrams:weight(f,'model'),supportGrams:weight(f,'support'),purgeGrams:weight(f,'flush'),towerGrams:weight(f,'prime_tower')}));
 if(new Set(filaments.map(f=>f.id)).size!==filaments.length)throw new Error('В статистике повторяются идентификаторы материалов.');
 const grams=number(s.weight??s.grams??s.total_weight)??(filaments.length?sum(filaments.map(f=>f.grams)):null);
 const seconds=number(s.time??s.seconds??s.total_time),supportGrams=filaments.some(f=>f.supportGrams!==null)?sum(filaments.map(f=>f.supportGrams)):null;
 if(!(grams>0)||!(seconds>0))throw new Error('В статистике не найдены общая масса в граммах и время в секундах.');
 return {version:1,name,source:'Статистика слайсера',grams,hours:seconds/3600,supportGrams,purgeGrams:filaments.some(f=>f.purgeGrams!==null)?sum(filaments.map(f=>f.purgeGrams)):null,filaments,quantityHint:Array.isArray(raw.objects)&&raw.objects.length?Math.min(100000,raw.objects.length):1,date:new Date().toISOString()};
}
export function parseGcode(text,name='G-code'){
 // Only inspect comments. Never execute or send G-code to a printer.
 const comments=(text.slice(0,600000)+'\n'+text.slice(-600000)).split(/\r?\n/).filter(l=>/^\s*;/.test(l)).join('\n');
 const list=value=>(value.match(/[\d.]+/g)||[]).map(Number);
 const wm=comments.match(/(?:total\s+)?filament (?:used|weight)\s*\[g\]\s*[:=]\s*([^\r\n;]+)/i);
 const weights=wm?list(wm[1]):[],grams=sum(weights);
 const tm=comments.match(/total estimated time\s*[:=]\s*([^\r\n;]+)/i)||comments.match(/estimated printing time\s*\(normal mode\)\s*[:=]\s*([^\r\n;]+)/i);
 const seconds=tm?parseDuration(tm[1]):null;
 if(!(grams>0)||!(seconds>0))throw new Error('В G-code нет поддерживаемых комментариев с общей массой и временем. Импортируйте statistics.json либо введите данные вручную.');
 return {version:1,name,source:'Заголовок G-code',grams,hours:seconds/3600,supportGrams:null,purgeGrams:null,filaments:weights.map((grams,i)=>({id:String(i+1),name:'Материал '+(i+1),grams})),date:new Date().toISOString()};
}
export function parseSlicerBytes(bytes,name){
 const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 if(data.byteLength>80*1024*1024)throw new Error('Статистика или 3MF должны быть меньше 80 МБ.');
 if(/\.3mf$/i.test(name)){
  let expanded=0;const files=unzipSync(data,{filter:f=>{if(!/(?:\.statistics\.json|\.gcode)$/i.test(f.name))return false;if(f.originalSize>64*1024*1024||(expanded+=f.originalSize)>100*1024*1024)throw new Error('Слишком большой объём данных внутри 3MF.');return true;}});
  const stats=Object.keys(files).filter(n=>/\.statistics\.json$/i.test(n)).sort(),names=stats.length?stats:Object.keys(files).filter(n=>/\.gcode$/i.test(n)).sort();
  if(!names.length)throw new Error('В 3MF нет статистики или G-code. Сначала выполните нарезку и экспорт результата.');
  return names.map(n=>stats.length?parseStatistics(JSON.parse(strFromU8(files[n])),n):parseGcode(strFromU8(files[n]),n));
 }
 const text=new TextDecoder().decode(data);
 return [/\.json$/i.test(name)?parseStatistics(JSON.parse(text),name):parseGcode(text,name)];
}
export function bindStatistics(stats,context,{quantity=1,scope='piece',confirmed=false,prices={}}={}){
 if(!confirmed)throw new Error('Подтвердите, что статистика относится к выбранной модели, ориентации и профилю.');
 if(!Number.isInteger(quantity)||quantity<1||quantity>100000)throw new Error('Укажите число деталей в статистике.');
 return {...stats,context,quantity,scope:scope==='plate'?'plate':'piece',prices:{...prices},confirmed:true};
}
