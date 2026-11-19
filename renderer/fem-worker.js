import {runFEM} from './fem/solver.js';
import {prepareFEMMesh} from './fem/planning.js';
import {printStructure} from './fem/print-structure.js';
import {boundaryConditions} from './fem/boundary.js';
self.onmessage=e=>{
 const options=e.data;
 try{
  if(options.operation==='preview'){
   const {mesh:outer,plan}=prepareFEMMesh(options),structure=printStructure(outer,options.structure,options.basis),mesh=structure.mesh,boundary=boundaryConditions(mesh,options.positions,options.scheme,options.caseIndex??null,{allowApproximate:plan.relaxedSelected});
   self.postMessage({type:'preview',preview:{plan,elements:mesh.active.length,nodes:mesh.nodes.length/3,spacing:mesh.spacing,volumeError:mesh.volumeError,structure:structure.summary,restraintRank:boundary.restraintRank,fixtures:boundary.fixtures.map(p=>({label:p.label,nodes:p.nodes.length})),loads:boundary.loads.map(p=>({label:p.label,nodes:p.nodes.length})),warnings:boundary.warnings}});return;
  }
  if(options.operation==='batch'){
   if(!Array.isArray(options.poses)||!options.poses.length||options.poses.length>3)throw new Error('Для сравнения выберите от одного до трёх положений.');
   for(let index=0;index<options.poses.length;index++){
    const pose=options.poses[index];
    try{
     const result=runFEM({...options,basis:pose.basis},(p,label)=>self.postMessage({type:'progress',p:(index+p)/options.poses.length,label:`Положение ${index+1}/${options.poses.length} · ${label}`}));
     self.postMessage({type:'candidate',poseId:pose.id,result});
    }catch(error){self.postMessage({type:'candidate-error',poseId:pose.id,message:error.message||String(error)});}
   }
   self.postMessage({type:'batch-complete'});return;
  }
  const result=runFEM(options,(p,label)=>self.postMessage({type:'progress',p,label}));
  self.postMessage({type:'result',result});
 }catch(error){self.postMessage({type:'error',message:error.message||String(error)});}
};
