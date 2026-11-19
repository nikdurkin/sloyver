import {PRINTERS as EXPORT_PRINTERS} from './printer-profiles.js';
import {NATIVE_PROFILES} from './native-profile-refs.js';
import {zipSync,strToU8} from './vendor/libs/fflate.module.js';
import {orientPositions} from './geometry.js';
import {validateRegions,boxTriangles} from './fem/reinforcement.js';

export {PRINTERS as EXPORT_PRINTERS} from './printer-profiles.js';

const xml=v=>String(v??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
const n=v=>String(Number(Number(v).toFixed(7)));
const meta=(k,v)=>`<metadata key="${xml(k)}" value="${xml(v)}"/>`;
function positive(v,label){v=Number(v);if(!Number.isFinite(v)||v<=0)throw new Error('Некорректное значение: '+label);return v;}
export function exportRecipe(profile,structure){
 const out={...profile};
 if(structure?.mode==='solid')out.infill=100;
 if(structure?.mode==='printed'){
  out.infill=structure.infill;out.walls=Math.ceil(structure.wallThickness/(profile.nozzle*1.05)-1e-8);
  out.top=Math.ceil(structure.topThickness/profile.layer-1e-8);out.bottom=Math.ceil(structure.bottomThickness/profile.layer-1e-8);
 }
 out.walls=Math.max(1,Math.round(out.walls));out.top=Math.max(0,Math.round(out.top));out.bottom=Math.max(0,Math.round(out.bottom));
 out.wallThickness=out.walls*out.nozzle*1.05;out.pattern=out.infill===100?'Rectilinear':out.pattern||'Gyroid';return out;
}
export function profileReferences(printer,nozzle,materialName,layer,family){const refs=NATIVE_PROFILES[printer+'-'+Number(nozzle)],filament=refs?.filaments[materialName]||refs?.generics?.[family]||null;return {filament,defaults:refs?.defaults?.[filament]||{},process:[...(refs?.processes||[])].sort((a,b)=>Math.abs(a.layer-layer)-Math.abs(b.layer-layer))[0]?.name||null};}
export function projectSettings({profile,material,printer='x1c',bed,temperatures={}}){
 const machine=EXPORT_PRINTERS[printer];if(!machine)throw new Error('Выберите принтер для проекта 3MF.');
 const nozzle=positive(profile.nozzle,'сопло'),variant=machine.variants?.[String(profile.nozzle)],diameters=variant?.diameters||[nozzle],extruderCount=diameters.length,layer=positive(profile.layer,'высота слоя');
 if(!machine.generic&&!variant)throw new Error('Для этого Bambu Lab нет профиля выбранного сопла. Выберите стандартное сопло или General.');
 if(layer>nozzle*.85||layer<.04)throw new Error('Высота слоя не подходит для выбранного сопла.');
 const infill=Number(profile.infill);if(!Number.isFinite(infill)||infill<0||infill>100)throw new Error('Заполнение должно быть от 0 до 100%.');
 const average=(v,fallback)=>Array.isArray(v)?Math.round((v[0]+v[1])/2):fallback;
 const preset=material.generic?{}:profileReferences(printer,nozzle,material.name,layer).defaults,bedKey={textured:'textured_plate_temp',smooth:'hot_plate_temp',cool:'cool_plate_temp'}[profile.plate]||'textured_plate_temp';
 const hot=positive(temperatures.nozzle??preset.nozzle_temperature??average(material.nozzleC,220),'температура сопла'),warm=Number(temperatures.bed??preset[bedKey]??average(material.bedC,60));if(hot>500||!Number.isFinite(warm)||warm<0||warm>200)throw new Error('Проверьте температуры печати.');
 const area=machine.generic?(bed||machine.bed):(variant?.bed||machine.bed),plate={textured:'Textured PEI Plate',smooth:'High Temp Plate',cool:'Cool Plate'}[profile.plate]||'Textured PEI Plate',name=String(material.name||'Material'),family=material.family||name.replace(/^Bambu\s+/i,'').split(/[\s(]/)[0].replace(/-CF$/i,'-CF');
 const a=v=>[String(v)],config={
  version:'02.08.02.61',printer_settings_id:variant?.name||(machine.generic?'General FDM ':machine.name+' ')+n(nozzle)+' nozzle',printer_model:machine.generic?'General FDM':machine.name,printer_variant:n(nozzle),
  nozzle_diameter:diameters.map(n),extruder_type:Array(extruderCount).fill('Direct Drive'),nozzle_volume_type:Array(extruderCount).fill('Standard'),printer_extruder_variant:Array(extruderCount).fill('Direct Drive Standard'),printer_extruder_id:Array.from({length:extruderCount},(_,i)=>String(i+1)),print_extruder_variant:['Direct Drive Standard'],print_extruder_id:['1'],extruder_max_nozzle_count:Array(extruderCount).fill('1'),physical_extruder_map:Array.from({length:extruderCount},(_,i)=>String(i)),filament_map:['1'],filament_nozzle_map:['1'],filament_map_mode:'Manual',filament_extruder_variant:['Direct Drive Standard'],filament_extruder_compatibility:['0'],printable_area:['0x0',n(area[0])+'x0',n(area[0])+'x'+n(area[1]),'0x'+n(area[1])],printable_height:n(area[2]),
  line_width:n(nozzle*1.05),outer_wall_line_width:n(nozzle*1.05),inner_wall_line_width:n(nozzle*1.05),sparse_infill_line_width:n(nozzle*1.05),internal_solid_infill_line_width:n(nozzle*1.05),top_surface_line_width:n(nozzle*1.05),initial_layer_line_width:n(nozzle*1.05),
  print_settings_id:'Sloyver recommendations',layer_height:n(layer),initial_layer_print_height:n(Math.max(layer,.2)),
  wall_loops:String(Math.round(positive(profile.walls,'число стенок'))),sparse_infill_density:n(infill)+'%',sparse_infill_pattern:infill===100?'zig-zag':'gyroid',
  top_shell_layers:String(Math.max(0,Math.round(profile.top))),bottom_shell_layers:String(Math.max(0,Math.round(profile.bottom))),
  top_shell_thickness:n(profile.top*layer),bottom_shell_thickness:n(profile.bottom*layer),
  outer_wall_speed:n(positive(profile.outerSpeed||60,'скорость стенки')),inner_wall_speed:n(positive(profile.innerSpeed||100,'скорость стенок')),
  enable_support:profile.supportSetting==='off'?'0':'1',support_type:'normal(auto)',support_threshold_angle:n(profile.overhang||30),
  brim_type:/без|off|none/i.test(String(profile.brim))?'no_brim':'outer_only',brim_width:n(Number(String(profile.brim).match(/[\d.]+/)?.[0])||5),
  curr_bed_type:plate,filament_settings_id:a(name+' · Sloyver'),filament_type:a(family),filament_vendor:a(material.generic?(material.vendor||'Generic'):'Bambu Lab'),filament_colour:a('#38A877'),
  filament_diameter:a('1.75'),filament_density:a(positive(material.density||1.2,'плотность')),
  filament_is_support:a('0'),filament_soluble:a('0'),nozzle_temperature:a(hot),nozzle_temperature_initial_layer:a(hot),
  hot_plate_temp:a(warm),hot_plate_temp_initial_layer:a(warm),textured_plate_temp:a(warm),textured_plate_temp_initial_layer:a(warm),cool_plate_temp:a(warm),cool_plate_temp_initial_layer:a(warm)
 };
 return config;
}
function meshXml(positions,id,name,type='model'){
 const vertices=[],triangles=[],lookup=new Map();
 for(let i=0;i<positions.length;i+=9){const ids=[];for(let j=0;j<9;j+=3){const p=Array.from(positions.subarray(i+j,i+j+3));if(p.some(v=>!Number.isFinite(v)))throw new Error('Модель содержит некорректные координаты.');const key=p.map(n).join(',');let k=lookup.get(key);if(k===undefined){k=vertices.length;lookup.set(key,k);vertices.push(`<vertex x="${n(p[0])}" y="${n(p[1])}" z="${n(p[2])}"/>`);}ids.push(k);}triangles.push(`<triangle v1="${ids[0]}" v2="${ids[1]}" v3="${ids[2]}"/>`);}
 return `<object id="${id}" type="${type}" name="${xml(name)}"><mesh><vertices>${vertices.join('')}</vertices><triangles>${triangles.join('')}</triangles></mesh></object>`;
}
// Bake one common rigid transform into the CAD mesh and all modifier meshes.
// Modifier boxes retain their position relative to the original model.
export function makeProject3MF({positions,pose,profile,material,printer='x1c',bed,temperatures,name='Деталь',regions=[],assessment=null,comment='',date=new Date().toISOString()}){
 if(!(positions instanceof Float32Array)||!positions.length||positions.length%9)throw new Error('Нужна треугольная модель.');
 if(!pose||!Array.isArray(pose.basis)||pose.basis.length!==3||!pose.min?.every(Number.isFinite)||!pose.max?.every(Number.isFinite))throw new Error('Сначала выберите положение печати.');
 const axes=pose.basis;for(let i=0;i<3;i++){if(!axes[i]?.every(Number.isFinite)||Math.abs(Math.hypot(...axes[i])-1)>1e-5)throw new Error('Некорректные оси печати.');for(let j=0;j<i;j++)if(Math.abs(axes[i].reduce((s,v,k)=>s+v*axes[j][k],0))>1e-5)throw new Error('Некорректные оси печати.');}
 const machine=EXPORT_PRINTERS[printer];if(!machine)throw new Error('Выберите принтер.');const area=machine.generic?(bed||machine.bed):(machine.variants?.[String(profile.nozzle)]?.bed||machine.bed);if(area.length!==3||area.some(v=>!Number.isFinite(v)||v<=0))throw new Error('Проверьте размер стола.');
 if(pose.max.some((v,j)=>v-pose.min[j]>area[j]+1e-4))throw new Error('Деталь не помещается в область печати выбранного принтера.');
 const config=projectSettings({profile,material,printer,bed:area,temperatures}),zones=validateRegions(regions).filter(r=>r.enabled),transform=raw=>{const out=orientPositions(raw,pose);for(let i=0;i<out.length;i+=3){out[i]+=area[0]/2;out[i+1]+=area[1]/2;}return out;};
 const objects=[meshXml(transform(positions),1,name),...zones.map((r,i)=>meshXml(transform(boxTriangles(r)),i+2,r.name,'other'))],wrapper=zones.length+2;
 objects.push(`<object id="${wrapper}" type="model" name="${xml(name)}"><components>${[1,...zones.map((_,i)=>i+2)].map(id=>`<component objectid="${id}"/>`).join('')}</components></object>`);
 // The compatibility Application prefix is required by Bambu to load project-wide settings.
 // Sloyver is explicitly identified as the generator, including SemVer build metadata.
 const model=`<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="ru-RU" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:Sloyver="https://sloyver.local/3mf" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021"><metadata name="Application">BambuStudio-02.08.02.61+Sloyver.1.8.0</metadata><metadata name="Sloyver:Generator">Sloyver 1.8.0; Bambu Studio compatible project</metadata><metadata name="BambuStudio:3mfVersion">1</metadata><metadata name="Title">${xml(name)}</metadata><metadata name="Description">${xml(comment)}</metadata><metadata name="CreationDate">${xml(date)}</metadata><resources>${objects.join('')}</resources><build><item objectid="${wrapper}" printable="1"/></build></model>`;
 const perObject=['wall_loops','sparse_infill_density','sparse_infill_pattern','top_shell_layers','bottom_shell_layers','top_shell_thickness','bottom_shell_thickness','enable_support','support_type','support_threshold_angle','brim_type','brim_width'];
 const settings=`<?xml version="1.0" encoding="UTF-8"?><config><object id="${wrapper}">${meta('name',name)}${meta('extruder',1)}${perObject.map(k=>meta(k,config[k])).join('')}<part id="1" subtype="normal_part">${meta('name',name)}${meta('extruder',1)}</part>${zones.map((r,i)=>`<part id="${i+2}" subtype="modifier_part">${meta('name',r.name+' · 100%')}${meta('sparse_infill_density','100%')}${meta('sparse_infill_pattern','zig-zag')}</part>`).join('')}</object><plate>${meta('plater_id',1)}${meta('plater_name','Слойвер · '+name)}${meta('locked','false')}${meta('bed_type',config.curr_bed_type)}<model_instance>${meta('object_id',wrapper)}${meta('instance_id',0)}${meta('identify_id',1)}</model_instance></plate></config>`;
 const refs=profileReferences(printer,profile.nozzle,material.name,profile.layer,material.generic?material.family:null);
 const info={generator:'Sloyver',version:'1.8.0',units:'mm',date,name,printer:machine.name,material:{id:material.id,name:material.name,sourceURL:material.sourceURL||material.url,generic:!!material.generic,family:material.family,sourceNotes:material.sourceNotes},profile,nativeProfileReferences:refs,pose:{basis:pose.basis,min:pose.min,max:pose.max},regions:zones,assessment,comment,notes:['Unsliced project. Slice in Bambu Studio / OrcaSlicer before printing.','Local reinforcement is a slicer modifier, not added CAD material.','Linear analysis identifies candidate weak zones, not a fracture path.']};
 const baseFilament=refs.filament||'',baseProcess=refs.process||'';
 const processKeys=['line_width','outer_wall_line_width','inner_wall_line_width','sparse_infill_line_width','internal_solid_infill_line_width','top_surface_line_width','initial_layer_line_width','curr_bed_type','layer_height','initial_layer_print_height',...perObject,'sparse_infill_pattern','outer_wall_speed','inner_wall_speed'];
 config.inherits_group=[baseProcess,baseFilament,config.printer_settings_id];config.compatible_printers=[config.printer_settings_id];config.print_compatible_printers=[config.printer_settings_id];config.different_settings_to_system=[processKeys.join(';'),Object.keys(config).filter(k=>k.startsWith('filament_')||/temperature|_temp/.test(k)).join(';'),''];
 const processPreset={version:'02.08.02.61',compatible_printers:[config.printer_settings_id],type:'process',name:config.print_settings_id,print_settings_id:config.print_settings_id,from:'user',inherits:baseProcess,...Object.fromEntries(processKeys.map(k=>[k,config[k]]))};
 const filamentPreset={version:'02.08.02.61',compatible_printers:[config.printer_settings_id],type:'filament',name:config.filament_settings_id[0],from:'user',inherits:baseFilament,...Object.fromEntries(Object.entries(config).filter(([k])=>(k.startsWith('filament_')&&!/^filament_(map|nozzle_map|extruder)/.test(k))||/^(nozzle_temperature|hot_plate_temp|textured_plate_temp|cool_plate_temp)/.test(k)))};
 if(machine.generic){config.gcode_flavor='marlin';config.printer_technology='FFF';config.machine_start_gcode='';config.machine_end_gcode='';}
 const entries={
  '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="application/xml"/><Default Extension="json" ContentType="application/json"/><Default Extension="txt" ContentType="text/plain"/><Override PartName="/Metadata/project_settings.config" ContentType="application/json"/><Override PartName="/Metadata/process_settings_1.config" ContentType="application/json"/><Override PartName="/Metadata/filament_settings_1.config" ContentType="application/json"/></Types>',
  '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
  '3D/3dmodel.model':model,'Metadata/model_settings.config':settings,'Metadata/project_settings.config':JSON.stringify(config,null,2),
  'Metadata/process_settings_1.config':JSON.stringify(processPreset,null,2),'Metadata/filament_settings_1.config':JSON.stringify(filamentPreset,null,2),
  'Metadata/Sloyver/check.json':JSON.stringify(info,null,2),'Metadata/Sloyver/comments.txt':`${name}\n${comment}\n${assessment?.title||'Расчёт не приложен'}\n${assessment?.comment||''}\n${zones.map(r=>r.name+': 100% заполнение, стенки общего профиля. '+r.reason).join('\n')}\nПроект нужно нарезать в слайсере. Локальные зоны не заменяют повторную проверку.`
 };
 if(machine.generic){entries['Metadata/machine_settings_1.config']=JSON.stringify({type:'machine',name:config.printer_settings_id,from:'user',inherits:'',version:'02.08.02.61',...Object.fromEntries(['printer_settings_id','printer_model','printer_variant','nozzle_diameter','printable_area','printable_height','gcode_flavor','printer_technology','machine_start_gcode','machine_end_gcode','extruder_type','nozzle_volume_type'].map(k=>[k,config[k]]))},null,2);entries['[Content_Types].xml']=entries['[Content_Types].xml'].replace('</Types>','<Override PartName="/Metadata/machine_settings_1.config" ContentType="application/json"/></Types>');}
 return {bytes:zipSync(Object.fromEntries(Object.entries(entries).map(([k,v])=>[k,strToU8(v)])),{level:6}),config,regions:zones,info};
}
