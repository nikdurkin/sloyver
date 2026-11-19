import fs from 'node:fs';import * as THREE from '../../renderer/vendor/three.module.js';import {makeProject3MF} from '../../renderer/project-3mf.js';import {unzipSync,zipSync,strFromU8,strToU8} from '../../renderer/vendor/libs/fflate.module.js';
const positions=new Float32Array(new THREE.BoxGeometry(40,20,20).toNonIndexed().attributes.position.array),pose={basis:[[1,0,0],[0,1,0],[0,0,1]],min:[-20,-10,-10],max:[20,10,10]},profile={nozzle:.4,layer:.2,walls:4,infill:23,top:5,bottom:5,outerSpeed:60,innerSpeed:120,supportSetting:'off',brim:'Без каймы',plate:'textured'},material={id:'pla-basic',name:'PLA Basic',density:1.24,nozzleC:[220,220],bedC:[55,55]},regions=[{id:'local-1',center:[-18,0,0],size:[20,12,12],walls:8}];
const base={positions,pose,profile,material,printer:'x1c'};
fs.writeFileSync(new URL('./baseline.3mf',import.meta.url),makeProject3MF(base).bytes);
const result=makeProject3MF({...base,regions});fs.writeFileSync(new URL('./infill-only.3mf',import.meta.url),result.bytes);
const entries=unzipSync(result.bytes),key='Metadata/model_settings.config';entries[key]=strToU8(strFromU8(entries[key]).replace(/(<part[^>]*subtype="modifier_part">)/g,'$1<metadata key="wall_loops" value="8"/>'));
fs.writeFileSync(new URL('./walls-eight.3mf',import.meta.url),zipSync(entries));console.log('Current density-only and legacy wall-override fixtures ready.');
