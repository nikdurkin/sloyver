import fs from 'node:fs';import * as THREE from '../renderer/vendor/three.module.js';import {makeProject3MF,EXPORT_PRINTERS} from '../renderer/project-3mf.js';
const directory=new URL('./catalog-temp/',import.meta.url);fs.mkdirSync(directory,{recursive:true});
const positions=new Float32Array(new THREE.BoxGeometry(40,20,20).toNonIndexed().attributes.position.array),pose={basis:[[1,0,0],[0,1,0],[0,0,1]],min:[-20,-10,-10],max:[20,10,10]},base={nozzle:.4,layer:.2,walls:4,infill:23,top:5,bottom:5,outerSpeed:60,innerSpeed:120,supportSetting:'off',brim:'Без каймы',plate:'textured'},material={id:'pla-basic',name:'PLA Basic',density:1.24,nozzleC:[220,220],bedC:[55,55]},regions=[{id:'local-1',center:[-10,0,0],size:[12,20,20],walls:8}],cases=[];
for(const [printer,p] of Object.entries(EXPORT_PRINTERS)){for(const nozzle of p.generic?['0.5']:Object.keys(p.variants)){
 const profile={...base,nozzle:Number(nozzle),layer:Number(nozzle)===.2?.1:.2},id=printer+'-'+nozzle,filename=id+'.3mf',m=p.generic?{...material,id:'general',name:'QA custom PLA',family:'PLA',generic:true}:material;
 const result=makeProject3MF({positions,pose,profile,material:m,regions,printer,bed:p.generic?[300,250,280]:undefined});fs.writeFileSync(new URL(filename,directory),result.bytes);cases.push({id,filename,printer,nozzle:Number(nozzle),config:result.config});
}}
fs.writeFileSync(new URL('cases.json',directory),JSON.stringify(cases));console.log('Generated',cases.length,'native import cases.');
