import {meshTopology,checkConnected} from './mesh.js';
import {validateRegions,elementCenter,regionCoverage} from './reinforcement.js';

const clamp=v=>Math.max(0,Math.min(1,v));
export function validateStructure(raw){
 if(!raw||raw.mode!=='printed')return {mode:'solid'};
 const out={mode:'printed',wallThickness:Number(raw.wallThickness),topThickness:Number(raw.topThickness),bottomThickness:Number(raw.bottomThickness),infill:Number(raw.infill),coreRatio:raw.coreRatio==null?null:Number(raw.coreRatio),note:String(raw.note||'').slice(0,300),linked:raw.linked!==false,regions:validateRegions(raw.regions)};
 for(const key of ['wallThickness','topThickness','bottomThickness'])if(!Number.isFinite(out[key])||out[key]<0||out[key]>10000)throw new Error('Укажите толщину стенок и сплошных слоёв от 0 до 10 000 мм.');
 if(!Number.isFinite(out.infill)||out.infill<0||out.infill>100)throw new Error('Заполнение расчётной модели должно быть от 0 до 100%.');
 if(out.coreRatio!==null&&(!Number.isFinite(out.coreRatio)||out.coreRatio<0||out.coreRatio>1))throw new Error('Доля жёсткости заполнения должна быть от 0 до 1.');
 if(out.infill>0&&out.coreRatio===0)throw new Error('При ненулевом заполнении его жёсткость должна быть положительной.');
 if(out.infill===0&&out.coreRatio!==null&&out.coreRatio!==0)throw new Error('При нулевом заполнении его жёсткость равна нулю.');
 return out;
}

export function profileStructure(profile,old={}){
 return validateStructure({...old,mode:'printed',wallThickness:profile.wallThickness,topThickness:profile.top*profile.layer,bottomThickness:profile.bottom*profile.layer,infill:profile.infill,linked:true});
}
export function comparisonProfile(profile,raw){
 const structure=validateStructure(raw);
 if(structure.mode==='solid')return {...profile,infill:100};
 return {...profile,wallThickness:structure.wallThickness,walls:structure.wallThickness/(profile.nozzle*1.05),top:structure.topThickness/profile.layer,bottom:structure.bottomThickness/profile.layer,infill:structure.infill};
}

// An explicitly approximate shell/core model on the existing voxel geometry.
// Boundary bands use fractions of boundary voxels, not a fictitious minimum E.
// Top/bottom distances follow the print-axis projection onto each stair face.
// Core stress is a homogenized average; it is NOT filament or bead stress.
export function printStructure(mesh,raw,basis){
 const parameters=validateStructure(raw);
 if(parameters.mode==='solid')return {mesh,parameters,factors:null,density:null,shell:null,summary:{mode:'solid',materialVolume:mesh.volume,relativeMaterialVolume:1,coreRatio:1,assumed:false}};
 const {dims,lookup,active,spacing}=mesh,count=active.length,shell=new Float32Array(count),voidFraction=new Float64Array(count).fill(1),z=basis[2],order=Array.from({length:count},(_,e)=>e).sort((a,b)=>active[a]-active[b]),rho=parameters.infill/100,coreRatio=rho===1?1:rho===0?0:parameters.coreRatio??rho*rho;
 for(let axis=0;axis<3;axis++){
  const stride=axis===0?1:axis===1?dims[0]:dims[0]*dims[1],h=spacing[axis],wall=parameters.wallThickness*Math.sqrt(Math.max(0,1-z[axis]*z[axis]));
  const minusT=Math.max(wall,Math.abs(z[axis])*(z[axis]<0?parameters.topThickness:parameters.bottomThickness)),plusT=Math.max(wall,Math.abs(z[axis])*(z[axis]>0?parameters.topThickness:parameters.bottomThickness));
  const before=new Int32Array(count),after=new Int32Array(count);
  for(const e of order){const coordinate=Math.floor(active[e]/stride)%dims[axis],previous=coordinate>0?lookup[active[e]-stride]:-1;before[e]=previous<0?0:before[previous]+1;}
  for(let i=count-1;i>=0;i--){const e=order[i],coordinate=Math.floor(active[e]/stride)%dims[axis],next=coordinate<dims[axis]-1?lookup[active[e]+stride]:-1;after[e]=next<0?0:after[next]+1;}
  for(let e=0;e<count;e++)voidFraction[e]*=1-clamp(clamp(minusT/h-before[e])+clamp(plusT/h-after[e]));
 }
 const factors=new Float32Array(count),density=new Float32Array(count),keep=[];
 let materialFractionSum=0,shellFractionSum=0,reinforcementSum=0;
 for(let e=0;e<count;e++){
  shell[e]=1-voidFraction[e];density[e]=shell[e]+voidFraction[e]*rho;factors[e]=shell[e]+voidFraction[e]*coreRatio;
  if(parameters.regions.length){const fraction=regionCoverage(elementCenter(mesh,e),spacing,parameters.regions),extra=(1-density[e])*fraction;reinforcementSum+=extra;density[e]+=extra;factors[e]+=(1-factors[e])*fraction;}
  materialFractionSum+=density[e];shellFractionSum+=shell[e];if(factors[e]>0)keep.push(e);
 }
 if(!keep.length)throw new Error('Расчётная деталь пуста: добавьте стенки, сплошные слои или заполнение.');
 let outputMesh=mesh,outputFactors=factors,outputDensity=density,outputShell=shell;
 if(keep.length!==count){
  outputMesh=meshTopology({min:mesh.min,size:mesh.size,dims:mesh.dims,active:keep.map(e=>active[e])});
  outputMesh.sourceVolume=mesh.sourceVolume;outputMesh.volumeError=mesh.volumeError;checkConnected(outputMesh);
  outputFactors=Float32Array.from(keep,e=>factors[e]);outputDensity=Float32Array.from(keep,e=>density[e]);outputShell=Float32Array.from(keep,e=>shell[e]);
 }
 const cellVolume=spacing.reduce((a,b)=>a*b,1),summary={mode:'printed',materialVolume:materialFractionSum*cellVolume,relativeMaterialVolume:materialFractionSum/count,shellVolume:shellFractionSum*cellVolume,coreRatio,assumed:rho>0&&rho<1&&parameters.coreRatio===null,outerVoxelVolume:mesh.volume,removedVoidElements:count-keep.length,wallThickness:parameters.wallThickness,topThickness:parameters.topThickness,bottomThickness:parameters.bottomThickness,infill:parameters.infill,thinBands:Math.min(...[parameters.wallThickness,parameters.topThickness,parameters.bottomThickness].filter(v=>v>0))<Math.max(...spacing)};
 summary.reinforcementVolume=reinforcementSum*cellVolume;
 summary.reinforcementCount=parameters.regions.filter(r=>r.enabled).length;
 return {mesh:outputMesh,parameters,factors:outputFactors,density:outputDensity,shell:outputShell,summary};
}
