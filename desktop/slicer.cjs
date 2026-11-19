'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {randomUUID,createHash}=require('node:crypto');
const {fileData}=require('./policy.cjs');
const KINDS=new Set(['executable','machine','process','filament']);
function validExecutable(file){return /^(?:orca-slicer|orcaslicer|bambu-studio|bambustudio)(?:\.exe|\.appimage)?$/i.test(path.basename(file));}
function processOverrides(profile){
 const {layer,walls,infill,top,bottom,nozzle}=profile||{};
 if(![layer,walls,infill,top,bottom,nozzle].every(Number.isFinite)||layer<.06||layer>1||walls<1||walls>20||infill<0||infill>100||top<1||top>100||bottom<1||bottom>100||![.2,.4,.6,.8].includes(nozzle))throw new Error('Некорректный профиль печати.');
 const result={layer_height:String(layer),wall_loops:String(Math.round(walls)),sparse_infill_density:infill+'%',sparse_infill_pattern:'gyroid',top_shell_layers:String(Math.round(top)),bottom_shell_layers:String(Math.round(bottom))};
 for(const [source,key] of [['outerSpeed','outer_wall_speed'],['innerSpeed','inner_wall_speed']])if(Number.isFinite(profile[source])){if(profile[source]<=0||profile[source]>500)throw new Error('Некорректная скорость стенок.');result[key]=String(profile[source]);}
 return result;
}
function buildArguments({input,output,outputDir,machine,process:processFile,filament,help=''}){
 const args=[input,'--load-settings',machine+';'+processFile,'--load-filaments',filament,'--arrange','0','--slice','0','--outputdir',outputDir,'--export-3mf',output];
 if(help.includes('--export-statistics'))args.push('--export-statistics');
 return args;
}
function placeOnBed(bytes,machine,nozzle){
 const diameters=(Array.isArray(machine.nozzle_diameter)?machine.nozzle_diameter:[machine.nozzle_diameter]).map(Number);
 if(!diameters.length||Math.abs(diameters[0]-nozzle)>.001||!Number.isFinite(diameters[0]))throw new Error('Диаметр основного сопла в полном профиле принтера не совпадает с рекомендованным. Для второго сопла используйте отдельный профиль или импорт статистики.');
 const points=machine.printable_area?.map(p=>String(p).split('x').map(Number));if(!points?.length||points.some(p=>p.length!==2||p.some(v=>!Number.isFinite(v))))throw new Error('В полном профиле принтера не найдена printable_area.');
 const center=[0,1].map(i=>(Math.min(...points.map(p=>p[i]))+Math.max(...points.map(p=>p[i])))/2),data=Buffer.from(bytes);
 for(let i=84;i<data.length;i+=50)for(let j=0;j<3;j++)for(let k=0;k<3;k++){const offset=i+12+j*12+k*4,n=data.readFloatLE(offset);if(!Number.isFinite(n)||Math.abs(n)>100000)throw new Error('Некорректные координаты STL.');if(k<2)data.writeFloatLE(n+center[k],offset);}
 return data;
}
class SlicerService{
 constructor(directory,{spawnProcess=spawn,onProgress=()=>{}}={}){this.directory=directory;this.spawn=spawnProcess;this.onProgress=onProgress;this.active=null;this.outputs=new Map();}
 async configuration(){try{return JSON.parse(await fs.readFile(path.join(this.directory,'slicer.json'),'utf8'));}catch{return {};}}
 async configure(kind,file){
  if(!KINDS.has(kind))throw new Error('Неизвестный тип настройки.');
  const st=await fs.stat(file);if(!st.isFile())throw new Error('Выберите файл.');
  if(kind==='executable'){if(!validExecutable(file))throw new Error('Выберите orca-slicer.exe или bambu-studio.exe из установленной программы.');}
  else{if(st.size>2*1024*1024||!file.toLowerCase().endsWith('.json')||file.includes(';'))throw new Error('Нужен отдельный полный профиль JSON до 2 МБ.');const data=JSON.parse(await fs.readFile(file,'utf8'));if(!data||Array.isArray(data)||typeof data!=='object')throw new Error('Некорректный профиль.');const required={machine:'nozzle_diameter',process:'layer_height',filament:'filament_type'}[kind];if(data[required]===undefined)throw new Error('В профиле нет '+required+'. Экспортируйте полный профиль соответствующей вкладки слайсера.');}
  const config=await this.configuration();config[kind]=file;await fs.mkdir(this.directory,{recursive:true});await fs.writeFile(path.join(this.directory,'slicer.json'),JSON.stringify(config));return this.status();
 }
 async status(){const c=await this.configuration(),labels={},fingerprints={};for(const k of KINDS){labels[k]=c[k]?path.basename(c[k]):null;try{const stat=await fs.stat(c[k]);if(!stat.isFile())throw new Error();fingerprints[k]=k==='executable'?stat.size+':'+stat.mtimeMs:createHash('sha256').update(await fs.readFile(c[k])).digest('hex');}catch{fingerprints[k]=null;}}return {configured:[...KINDS].every(k=>c[k]&&fingerprints[k]),labels,fingerprints,active:!!this.active};}
 run(executable,args,{timeout=20*60*1000}={}){
  return new Promise((resolve,reject)=>{let log='',finished=false;const child=this.spawn(executable,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});this.active=child;
   const finish=(error)=>{if(finished)return;finished=true;clearTimeout(timer);if(this.active===child)this.active=null;error?reject(error):resolve(log);};
   const timer=setTimeout(()=>{child.kill();finish(new Error('Слайсер не завершился за отведённое время. Проверьте профиль и модель.'));},timeout);
   const collect=data=>{log=(log+data.toString()).slice(-32000);this.onProgress(data.toString().replace(/[\x00-\x08]/g,'').slice(-500));};child.stdout?.on('data',collect);child.stderr?.on('data',collect);
   child.on('error',e=>finish(new Error('Не удалось запустить слайсер: '+e.message)));child.on('close',(code,signal)=>finish(code===0?null:new Error(signal?'Нарезка отменена.':'Слайсер завершился с кодом '+code+'. '+log.slice(-1800))));
  });
 }
 cancel(){this.cancelRequested=true;this.active?.kill();return {ok:true};}
 async slice(payload){
  if(this.active)throw new Error('Слайсер уже выполняет задание.');const c=await this.configuration();if(![...KINDS].every(k=>c[k]))throw new Error('Выберите программу и три полных профиля: принтер, процесс и материал.');
  this.cancelRequested=false;
  if(!validExecutable(c.executable))throw new Error('Некорректная программа.');const overrides=processOverrides(payload.profile),raw=fileData(payload.data);
  if(raw.length<84||84+raw.readUInt32LE(80)*50!==raw.length)throw new Error('Нужна корректная бинарная модель STL.');
  const machine=JSON.parse(await fs.readFile(c.machine,'utf8'));
  const filament=JSON.parse(await fs.readFile(c.filament,'utf8'));
  if(!materialProfileMatches(payload.materialId,filament))throw new Error('Тип материала в полном профиле слайсера не совпадает с выбранным в Слойвере.');
  const data=placeOnBed(raw,machine,payload.profile.nozzle);
  if(data.length<84||84+data.readUInt32LE(80)*50!==data.length)throw new Error('Нужна корректная бинарная модель STL.');
  const id=randomUUID(),dir=path.join(this.directory,'slicer-jobs',id);await fs.mkdir(dir,{recursive:true});
  const input=path.join(dir,'part.stl'),processFile=path.join(dir,'process.json'),output=path.join(dir,'result.3mf');
  const original=JSON.parse(await fs.readFile(c.process,'utf8'));await fs.writeFile(processFile,JSON.stringify({...original,...overrides,enable_support:payload.supports===false?'0':'1'}));await fs.writeFile(input,data);
  try{
   let help='';try{help=await this.run(c.executable,['--help'],{timeout:20000});}catch{}
   if(this.cancelRequested)throw new Error('Нарезка отменена.');
   await this.run(c.executable,buildArguments({input,output,outputDir:dir,machine:c.machine,process:processFile,filament:c.filament,help}));
   const names=await fs.readdir(dir),statNames=names.filter(n=>n.endsWith('.statistics.json'));
   let target=statNames[0]?path.join(dir,statNames[0]):output;
   try{await fs.access(target);}catch{const gc=names.find(n=>n.endsWith('.gcode'));if(!gc)throw new Error('Слайсер не создал статистику или результат 3MF.');target=path.join(dir,gc);}
   const st=await fs.stat(target);if(st.size>80*1024*1024)throw new Error('Результат слишком большой. Экспортируйте статистику из слайсера вручную.');
   this.outputs.set(id,{directory:dir,output,executable:c.executable});
   const fingerprint=createHash('sha256').update(JSON.stringify([machine,filament,{...original,...overrides,enable_support:payload.supports===false?'0':'1'}])).digest('hex');
   return {ok:true,jobId:id,name:path.basename(target),data:new Uint8Array(await fs.readFile(target)),processName:path.basename(c.process),machineName:path.basename(c.machine),filamentName:path.basename(c.filament),fingerprint};
  }catch(e){await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});throw e;}
 }
 async openResult(id){const record=this.outputs.get(id);if(!record)throw new Error('Результат недоступен. Выполните нарезку снова.');await fs.access(record.output);const child=this.spawn(record.executable,[record.output],{shell:false,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref?.();return {ok:true};}
 async resultBytes(id){const r=this.outputs.get(id);if(!r)throw new Error('Результат недоступен.');const data=await fs.readFile(r.output);if(data.length>80*1024*1024)throw new Error('Результат больше 80 МБ.');return data;}
}
function materialProfileMatches(materialId,filament){
 const family={'pla-basic':'PLA','pla-cf':'PLA','petg-basic-new':'PETG','petg-hf':'PETG','petg-cf':'PETG',abs:'ABS','abs-gf':'ABS',asa:'ASA','asa-cf':'ASA',pc:'PC','pc-fr':'PC','paht-cf':'PA','pa6-cf':'PA','pa6-gf':'PA','pet-cf':'PET','ppa-cf':'PPA','pps-cf':'PPS','tpu95a-hf':'TPU'}[materialId];
 const type=String(Array.isArray(filament?.filament_type)?filament.filament_type[0]:filament?.filament_type||'').trim().toUpperCase();
 if(!family)return false;
 const label=[filament?.name,filament?.filament_settings_id,filament?.inherits].flat().join(' ').toUpperCase();
 if(materialId==='ppa-cf'&&['PA','PA-CF'].includes(type))return /\bPPA[- ]CF\b/.test(label);
 if(materialId.endsWith('-gf')&&type.endsWith('-CF'))return false;
 if(materialId.endsWith('-cf')&&type.endsWith('-GF'))return false;
 return family==='PA'?/^PA(?:\d+|HT)?(?:-(?:CF|GF))?$/.test(type):type===family||type.startsWith(family+'-');
}
module.exports={SlicerService,validExecutable,processOverrides,buildArguments,placeOnBed,materialProfileMatches};
