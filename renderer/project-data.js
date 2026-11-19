import {restoreScheme} from './load-scheme.js';
import {restoreManualCircles} from './circular-features.js';
import {defaultEnvironment} from './material-advisor.js';
import {validatePrintRecord} from './production.js';
import {catalogEntry} from './catalog.js';
import {restoreBedFace} from './build-plane.js';
export function remapContext(context,oldId,newId){
 try{const parsed=JSON.parse(context);if(Array.isArray(parsed)&&parsed[0]===oldId){parsed[0]=newId;return JSON.stringify(parsed);}}catch{}
 return typeof context==='string'&&context.startsWith(oldId+'|')?newId+context.slice(oldId.length):context;
}
export function restoreProduction(project,newId,knownIds){
 const environment={...defaultEnvironment};
 for(const k of ['printer','process','drying'])if(typeof project.environment?.[k]==='string')environment[k]=project.environment[k].slice(0,200);
 for(const k of ['outdoor','wet','hardened'])if(typeof project.environment?.[k]==='boolean')environment[k]=project.environment[k];
 for(const [k,min,max] of [['temperature',-50,300],['maxNozzle',150,450],['maxBed',20,200],['maxChamber',0,150]]){const n=project.environment?.[k];if(Number.isFinite(n)&&n>=min&&n<=max)environment[k]=n;}
 if(['balanced','stiff','impact','flexible'].includes(project.environment?.purpose))environment.purpose=project.environment.purpose;
 const printRuns=Array.isArray(project.printRuns)?project.printRuns:[];if(printRuns.length>200)throw new Error('Слишком много записей печати.');
 for(const r of printRuns){validatePrintRecord(r);if(!Number.isFinite(Date.parse(r.date))||String(r.recipeKey).length>10000||String(r.notes||'').length>5000)throw new Error('Некорректная запись истории.');}
 if(printRuns.reduce((s,r)=>s+(r.photos||[]).reduce((s,p)=>s+p.length,0),0)>10*1024*1024)throw new Error('Слишком много фотографий в проекте.');
 const slicerRecords={};for(const [key,record] of Object.entries(project.slicerRecords||{}).slice(-30)){const s=record?.statistics;if(!s?.confirmed||!(s.grams>0&&s.grams<10000000&&s.hours>0&&s.hours<100000&&Number.isInteger(s.quantity)&&s.quantity>=1&&s.quantity<=100000)||!['plate','piece'].includes(s.scope)||!Array.isArray(s.filaments)||s.filaments.length>32)continue;if(!s.filaments.every(f=>/^[a-z0-9_-]{1,30}$/i.test(String(f.id))&&typeof f.name==='string'&&f.name.length<200&&Number.isFinite(f.grams)&&f.grams>=0))continue;const next=remapContext(key,project.id,newId);slicerRecords[next]={statistics:{...s,context:next},profiles:record.profiles};}
 const catalog={};for(const [id,r] of Object.entries(project.catalog||{}))if(knownIds.includes(id))catalog[id]=catalogEntry(r,knownIds);
 const holeEdits={};for(const [id,edit] of Object.entries(project.holeEdits||{}).slice(0,100)){if(!/^hole-[a-z0-9]+$/.test(id))continue;const e={};if(['ignore','soft','vertical'].includes(edit?.rule))e.rule=edit.rule;if(Array.isArray(edit?.axis)&&edit.axis.length===3&&edit.axis.every(Number.isFinite)&&Math.hypot(...edit.axis)>.00001)e.axis=edit.axis;holeEdits[id]=e;}
 return {loadScheme:restoreScheme(project.loadScheme),manualCircles:restoreManualCircles(project.manualCircles),environment,printRuns,slicerRecords,catalog,holeEdits,bedFace:restoreBedFace(project.bedFace),pinnedRecipe:typeof project.pinnedRecipe==='string'?project.pinnedRecipe:null};
}
