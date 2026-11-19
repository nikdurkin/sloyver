import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../renderer/vendor/three.module.js';
import {prepareMesh,basis} from '../renderer/geometry.js';
import {planarTarget} from '../renderer/circular-features.js';
import {voxelMesh} from '../renderer/fem/mesh.js';
import {printStructure,comparisonProfile} from '../renderer/fem/print-structure.js';
import {meshPlan,prepareFEMMesh} from '../renderer/fem/planning.js';
import {runFEM} from '../renderer/fem/solver.js';
import {supportNormals} from '../renderer/fem/constraints.js';
import {restoreScheme} from '../renderer/load-scheme.js';
import {assessResult,reserveEstimate,measuredTensileModulus} from '../renderer/fem/assessment.js';
import {packFEM,unpackFEM,femContext} from '../renderer/fem/store.js';
import {vtkText,compareMeshes} from '../renderer/fem/fields.js';

const identity=[[1,0,0],[0,1,0],[0,0,1]],iso={model:'isotropic',E:2000,nu:0};
const box=(x=40,y=10,z=10)=>new Float32Array(new THREE.BoxGeometry(x,y,z).toNonIndexed().attributes.position.array);
const near=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
function face(p,n){const source=prepareMesh(p),i=source.triangles.findIndex(t=>t.normal.every((v,j)=>Math.abs(v-n[j])<1e-5));return {...planarTarget(p,i),label:'Грань'};}
function scheme(p){return {version:1,fixtures:[{type:'fixed',target:face(p,[-1,0,0])}],loads:[{type:'force',value:100,unit:'N',direction:[1,0,0],target:face(p,[1,0,0])}]};}

test('automatic grid respects a 4.2 mm selected bore and estimates resource usage before solving',()=>{
 const p=box(),s=scheme(p);s.fixtures[0].target={kind:'circle',radius:2.1,normal:[1,0,0],center:[-20,0,0],label:'Отверстие'};
 const plan=meshPlan(prepareMesh(p),s,{meshMode:'auto'});
 assert.ok(plan.step<=4.2/2.5);assert.ok(plan.estimatedElements>0);assert.equal(plan.automatic,true);
 const manual=meshPlan(prepareMesh(p),s,{meshMode:'manual',step:5});assert.equal(manual.relaxedSelected,true);near(manual.maxSelectedStep,1.68);assert.ok(manual.warnings.some(t=>t.includes('приближённо')));
});
test('an automatic mesh is actually built within its element/node limits',()=>{
 const p=box(),out=prepareFEMMesh({positions:p,scheme:scheme(p),meshMode:'auto',meshQuality:'quick'});
 assert.ok(out.mesh.active.length<=45000);assert.ok(out.mesh.nodes.length/3<=80000);assert.equal(out.plan.actualElements,out.mesh.active.length);
});
test('mesh detail presets provide progressively finer choices while preserving selected hole resolution',()=>{
 const source={size:[23.8,148.5,76.8],volume:115300},s={fixtures:[{target:{kind:'circle',radius:2.315}}],loads:[]},steps=['quick','standard','fine'].map(meshQuality=>meshPlan(source,s,{meshMode:'auto',meshQuality,features:{minimum:2.18,p10:2.18}}).step);
 assert.ok(steps[0]>steps[1]&&steps[1]>steps[2]);assert.ok(steps.every(h=>h<=4.63/2.5));
});
test('orientation comparison prices the explicit calculation recipe, including a custom core or full solid',()=>{
 const p={nozzle:.4,layer:.2,wallThickness:1.68,walls:4,infill:37,top:5,bottom:4},custom=comparisonProfile(p,{mode:'printed',wallThickness:2.1,topThickness:1.2,bottomThickness:.6,infill:15});
 near(custom.wallThickness,2.1);near(custom.infill,15);near(custom.top*custom.layer,1.2);near(custom.bottom*custom.layer,.6);assert.equal(comparisonProfile(p,{mode:'solid'}).infill,100);assert.equal(p.infill,37);
});
test('resource-limited hole resolution becomes an explicit approximation instead of a hard stop',()=>{
 const p=box(100,100,20),s=scheme(p);s.fixtures[0].target={kind:'circle',radius:.1,normal:[1,0,0],center:[-50,0,0],label:'Малое отверстие'};
 const out=prepareFEMMesh({positions:p,scheme:s,meshMode:'auto',meshQuality:'quick'});assert.equal(out.plan.relaxedSelected,true);assert.ok(out.mesh.active.length<=100000);assert.ok(out.mesh.nodes.length/3<=160000);assert.ok(out.plan.warnings.some(s=>s.includes('приближённо')));assert.equal(s.fixtures[0].target.radius,.1);
});

test('three frictionless planar supports reproduce axial compliance without any fully fixed nodes',()=>{
 const p=box(),s=scheme(p);s.fixtures=[[-1,0,0],[0,-1,0],[0,0,-1]].map(n=>({support:'roller',type:'fixed',target:face(p,n)}));
 const r=runFEM({positions:p,scheme:s,material:iso,step:2.5});
 near(r.summary.maxDisplacement,.02,1e-7);near(r.summary.reactionForce[0],-100,1e-5);assert.equal(r.quality.restraintRank,6);assert.ok(r.boundary.fixed.reduce((a,b)=>a+b,0)<r.boundary.constrained.reduce((a,b)=>a+b,0));
 for(const reaction of r.summary.reactions){near(reaction.force[1],0,1e-5);near(reaction.force[2],0,1e-5);}
});
test('a single sliding plane is rejected before the solve because it leaves rigid movements',()=>{
 const p=box(),s=scheme(p);s.fixtures[0].support='roller';assert.throws(()=>runFEM({positions:p,scheme:s,material:iso,step:2.5}),/свободно сдвигаться|из 6/);
});
test('a smooth cylindrical support constrains radial movement and preserves tangential and axial freedom',()=>{
 const f={support:'pin',target:{kind:'hole',center:[0,0,0],normal:[0,0,1]}},normal=supportNormals(f,[2,0,3]);assert.deepEqual(normal,[[1,0,0]]);
 assert.throws(()=>restoreScheme({version:1,fixtures:[{...f,target:{...face(box(),[-1,0,0])}}],loads:[]}),/отверстие/);
});
test('a shell/core model exactly recovers the aligned cube shell volume and removes a zero-infill void without artificial stiffness',()=>{
 const {mesh}=voxelMesh(box(10,10,10),1),p={mode:'printed',wallThickness:1,topThickness:1,bottomThickness:1,infill:25},a=printStructure(mesh,p,identity),b=printStructure(mesh,{...p,infill:0},identity);
 near(a.summary.shellVolume,488);near(a.summary.materialVolume,488+512*.25);near(a.summary.coreRatio,.25**2);assert.equal(b.mesh.active.length,488);assert.ok(b.factors.every(v=>v>0));assert.equal(b.summary.removedVoidElements,512);
});
test('fractional thin shell bands preserve sub-cell material volume instead of rounding every boundary voxel solid',()=>{
 const {mesh}=voxelMesh(box(10,10,10),1),s=printStructure(mesh,{mode:'printed',wallThickness:.2,topThickness:.2,bottomThickness:.2,infill:0},identity);
 near(s.summary.materialVolume,1000-9.6**3,1e-4);assert.equal(s.summary.thinBands,true);
});
test('100% infill matches the solid solution; reducing core stiffness increases compliance while preserving force/moment balance',()=>{
 const p=box(20,10,10),s=scheme(p),o={positions:p,scheme:s,material:iso,step:2.5},solid=runFEM(o),full=runFEM({...o,structure:{mode:'printed',wallThickness:1,topThickness:1,bottomThickness:1,infill:100}}),partial=runFEM({...o,structure:{mode:'printed',wallThickness:1,topThickness:1,bottomThickness:1,infill:25}});
 near(full.summary.maxDisplacement,solid.summary.maxDisplacement,1e-9);assert.ok(partial.summary.maxDisplacement>solid.summary.maxDisplacement);assert.ok(partial.quality.forceBalanceRelative<1e-5);assert.equal(partial.fullSolid,false);
});
test('rotating print axis changes the skin/core placement rather than just renaming the result',()=>{
 const {mesh}=voxelMesh(box(20,10,10),1),p={mode:'printed',wallThickness:1,topThickness:3,bottomThickness:3,infill:25},a=printStructure(mesh,p,identity),b=printStructure(mesh,p,basis([1,0,0]));assert.notEqual(a.summary.materialVolume,b.summary.materialVolume);
});
test('saved shell/core fields round-trip with sliding supports and export explicit material fractions',()=>{
 const p=box(20,10,10),s=scheme(p);s.fixtures=[[-1,0,0],[0,-1,0],[0,0,-1]].map(n=>({type:'fixed',support:'roller',target:face(p,n)}));
 const options={material:iso,step:2.5,structure:{mode:'printed',wallThickness:1,topThickness:1,bottomThickness:1,infill:25},caseIndex:null},r=runFEM({positions:p,scheme:s,...options}),key=femContext('g',s,options,identity),restored=unpackFEM(JSON.parse(JSON.stringify(packFEM(r,key))),key,p,restoreScheme(s));
 assert.deepEqual(restored.displacement,r.displacement);assert.deepEqual(restored.structure.factors,r.structure.factors);assert.equal(restored.fullSolid,false);assert.match(vtkText(restored),/Material_fraction/);assert.match(vtkText(restored),/Constrained_translations/);
 const changed=structuredClone(s);changed.fixtures[0].support='fixed';assert.notEqual(femContext('g',changed,options,identity),key);assert.notEqual(femContext('g',s,{...options,structure:{...options.structure,infill:50}},identity),key);
});
test('zero-infill shell snapshots preserve the empty interior and rebuild their actual topology',()=>{
 const p=box(12,10,10),s=scheme(p),options={material:iso,step:1,structure:{mode:'printed',wallThickness:2,topThickness:2,bottomThickness:2,infill:0},caseIndex:null},r=runFEM({positions:p,scheme:s,...options}),key=femContext('g',s,options,identity),restored=unpackFEM(packFEM(r,key),key,p,s);
 assert.equal(restored.mesh.active.length,r.mesh.active.length);assert.deepEqual(restored.mesh.lookup,r.mesh.lookup);assert.deepEqual(restored.structure.density,r.structure.density);
});
test('quality assessment separates numerical convergence, mesh sensitivity, model applicability and missing strength data',()=>{
 const p=box(20,10,10),s=scheme(p),coarse=runFEM({positions:p,scheme:s,material:iso,step:5}),fine=runFEM({positions:p,scheme:s,material:iso,step:2.5}),a=assessResult(coarse),b=assessResult(fine,compareMeshes(coarse,fine),{displacementLimit:.005});
 assert.equal(a.checks.find(c=>c.id==='mesh').status,'pending');assert.equal(a.reserve.available,false);assert.equal(b.stable,true);assert.equal(b.displacementLimit.within,false);assert.ok(b.spots.every(p=>p.point.length===3&&p.point.every(Number.isFinite)));assert.equal(b.spots.find(p=>p.field==='displacement').value,fine.summary.maxDisplacement);
});
test('strength screening requires complete measured data and is unavailable for homogenized printed cores',()=>{
 const p=box(20,10,10),s=scheme(p),options={positions:p,scheme:s,material:iso},a=runFEM({...options,step:5}),b=runFEM({...options,step:2.5}),comparison=compareMeshes(a,b),limits={enabled:true,source:'Measured coupon, dry, 23 C',tXY:20,cXY:20,tZ:10,cZ:10,sXY:8,sZ:5};
 const reserve=reserveEstimate(b,limits,comparison);assert.equal(reserve.available,true);near(reserve.ratio,16,1e-4);assert.equal(reserve.governing.mode,'sXY');assert.match(reserve.reason,/средним/);assert.throws(()=>reserveEstimate(b,{enabled:true,tXY:10},comparison),/источник|шесть/);
 const printed=runFEM({...options,step:2.5,structure:{mode:'printed',wallThickness:1,topThickness:1,bottomThickness:1,infill:25}});assert.equal(reserveEstimate(printed,limits,comparison).available,false);
});
test('measured coupon modulus uses the linear tensile slope and rejects a large-strain sample',()=>{
 near(measuredTensileModulus({force:100,length:50,area:10,elongation:.25}),2000);assert.throws(()=>measuredTensileModulus({force:100,length:50,area:10,elongation:5}),/1%/);
});
test('the actual batch worker preserves identical forces and moments across three print orientations',async()=>{
 const messages=[];globalThis.self={postMessage:m=>messages.push(m)};await import('../renderer/fem-worker.js');const p=box(20,10,10),before=new Float32Array(p),s=scheme(p);
 self.onmessage({data:{operation:'batch',positions:p,scheme:s,material:{model:'transverse',E:4000,Ez:1000,nu:0,nuXZ:0,Gxz:500},step:5,poses:[{id:'a',basis:identity},{id:'b',basis:basis([1,0,0])},{id:'c',basis:basis([0,1,0])}]}});
 const results=messages.filter(m=>m.type==='candidate');assert.equal(results.length,3);for(const r of results)near(r.result.summary.appliedForce[0],100);near(results[1].result.summary.maxDisplacement/results[0].result.summary.maxDisplacement,4,1e-6);assert.equal(messages.at(-1).type,'batch-complete');assert.deepEqual(p,before);delete globalThis.self;
});

test('expanded budget can resolve a 4.1 mm selected circle beyond the old element cap',()=>{
 const p=box(100,100,20),s=scheme(p);s.fixtures[0].target={kind:'circle',radius:2.05,normal:[1,0,0],center:[-50,0,0],label:'C12'};
 const out=prepareFEMMesh({positions:p,scheme:s,meshMode:'auto'});assert.ok(out.mesh.active.length>45000);assert.ok(out.mesh.active.length<=100000);assert.equal(out.plan.relaxedSelected,false);assert.ok(Math.max(...out.mesh.spacing)<=4.1/2.5);assert.equal(s.fixtures[0].target.radius,2.05);
});
