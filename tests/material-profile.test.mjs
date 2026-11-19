import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {assessMaterial,dryingTemperature} from '../renderer/material-advisor.js';
import {shapeProfile} from '../renderer/features.js';
import {restoreProduction} from '../renderer/project-data.js';
const {materialProfileMatches}=createRequire(import.meta.url)('../desktop/slicer.cjs');
const materials=JSON.parse(fs.readFileSync(new URL('../renderer/materials.json',import.meta.url))).materials;
const prices=JSON.parse(fs.readFileSync(new URL('../renderer/prices.json',import.meta.url))).prices;
const get=id=>materials.find(m=>m.id===id),added=['ppa-cf','pps-cf','pla-cf','petg-cf','abs-gf','asa-cf','pa6-gf','pc-fr'];

test('all added materials have separate XY/Z properties, pinned TDS and original Bambu price references',()=>{
 assert.equal(new Set(materials.map(m=>m.id)).size,18);
 for(const id of added){
  const m=get(id),price=prices.find(p=>p.material_id===id);
  for(const key of ['E_xy','E_z','tensile_xy','tensile_z','flexuralModulus_xy','flexuralModulus_z','flexuralStrength_xy','flexuralStrength_z','impact_xy','impact_z'])assert.ok(m[key].length===2&&m[key].every(Number.isFinite)&&m[key][0]>0,`${id}: ${key}`);
  assert.ok(m.conditioning.includes('100%'));assert.match(m.url,/^https:/);assert.match(m.version,/TDS/);
  assert.equal(price.brand,'Bambu Lab');assert.equal(price.verified,true);assert.equal(price.checked_date,'2026-10-28');assert.equal(price.officialSource,true);assert.ok(['USD','EUR'].includes(price.currency));assert.equal(price.unitPriceForeignPerKg,price.priceForeign*1000/price.massGrams);
 }
 assert.equal(prices.find(p=>p.material_id==='ppa-cf').massGrams,750);
 assert.equal(prices.find(p=>p.material_id==='pps-cf').massGrams,750);
});

test('PPS-CF requires an appropriate nozzle and a confirmed hot chamber for automatic selection',()=>{
 const m=get('pps-cf');
 assert.ok(assessMaterial(m,{maxNozzle:300,maxChamber:65},{nozzle:.6,chamber:'closed'}).blocked.some(s=>s.includes('сопла')));
 assert.ok(assessMaterial(m,{maxNozzle:350,maxChamber:0},{nozzle:.6,chamber:'closed'}).blocked.some(s=>s.includes('камеры')));
 assert.equal(assessMaterial(m,{maxNozzle:350,maxChamber:65},{nozzle:.6,chamber:'closed'}).eligible,true);
 assert.equal(assessMaterial(m,{maxNozzle:350,maxChamber:65},{nozzle:.6,chamber:'open'}).eligible,false);
 assert.equal(dryingTemperature(m),'100–140');
});

test('abrasive CF/GF cannot pass the nozzle checks for plain steel or 0.2 mm',()=>{
 for(const id of added.filter(id=>id!=='pc-fr')){
  assert.ok(assessMaterial(get(id),{hardened:false,maxNozzle:350,maxChamber:80},{nozzle:.6,chamber:'closed'}).blocked.some(s=>s.includes('износостойкое')));
  assert.ok(assessMaterial(get(id),{hardened:true,maxNozzle:350,maxChamber:80},{nozzle:.2,chamber:'closed'}).blocked.some(s=>s.includes('диаметр')));
 }
 assert.equal(assessMaterial(get('pc-fr'),{hardened:false},{nozzle:.2,chamber:'closed'}).eligible,true);
});

test('old projects get an unknown chamber capability and validated new projects retain it',()=>{
 const base={id:'p',printRuns:[]};
 assert.equal(restoreProduction(base,'p',materials.map(m=>m.id)).environment.maxChamber,0);
 assert.equal(restoreProduction({...base,environment:{maxChamber:65}},'p',[]).environment.maxChamber,65);
 assert.equal(restoreProduction({...base,environment:{maxChamber:200}},'p',[]).environment.maxChamber,0);
});

test('slicer profiles recognize new material families including the legacy named PPA alias',()=>{
 for(const [id,type] of [['ppa-cf','PPA-CF'],['pps-cf','PPS-CF'],['pla-cf','PLA-CF'],['petg-cf','PETG-CF'],['abs-gf','ABS-GF'],['asa-cf','ASA-CF'],['pa6-gf','PA6-GF'],['pc-fr','PC-FR']])assert.equal(materialProfileMatches(id,{filament_type:[type]}),true,`${id}: ${type}`);
 assert.equal(materialProfileMatches('ppa-cf',{filament_type:['PA-CF'],name:'Bambu PPA-CF @ X1C'}),true);
 assert.equal(materialProfileMatches('ppa-cf',{filament_type:['PA-CF'],name:'Bambu PA6-CF'}),false);
 assert.equal(materialProfileMatches('pa6-gf',{filament_type:['PA6-CF']}),false);
 assert.equal(materialProfileMatches('pps-cf',{filament_type:['PETG-CF']}),false);
});

test('infill varies with the work type rather than a universal strength percentage',()=>{
 const profiles=['bending','tension','compression','impact','unknown'].map(loadType=>shapeProfile({mode:'strength',loadType}));
 assert.ok(new Set(profiles.map(p=>p.infill)).size>=4);
 for(const p of profiles){assert.ok(p.infill>=p.infillRange[0]&&p.infill<=p.infillRange[1]);assert.ok(p.infillReason.length>40);}
 assert.ok(shapeProfile({mode:'accuracy'}).infill<shapeProfile({mode:'strength',loadType:'tension'}).infill);
});

test('localized thin spots do not weaken the whole profile and globally thin sections get an explanation',()=>{
 const normal=shapeProfile({mode:'strength',loadType:'bending'}),local=shapeProfile({mode:'strength',loadType:'bending',features:{p10:.5,median:6,p90:9}}),thin=shapeProfile({mode:'strength',loadType:'bending',features:{p10:1,median:1.5,p90:2}});
 assert.equal(local.walls,normal.walls);assert.equal(local.infill,normal.infill);
 assert.ok(thin.infill<normal.infill);assert.match(thin.infillReason,/выбороч|проверенных/i);
});

test('manual infill, including zero and solid, survives all recommendation priorities',()=>{
 for(const mode of ['strength','accuracy','balanced'])for(const value of [0,37,100]){
  const p=shapeProfile({mode,loadType:'impact',materialId:'tpu95a-hf',manualInfill:value});
  assert.equal(p.infill,value);assert.equal(p.infillManual,true);assert.match(p.infillReason,/Ваше заполнение/);
 }
 for(const value of [-1,101,NaN])assert.throws(()=>shapeProfile({manualInfill:value}),/0 до 100/);
});
