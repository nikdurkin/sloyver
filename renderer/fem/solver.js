import {blockIC,coarseRigid} from './preconditioner.js';
import {CORNERS,hexElement,constitutive,worldConstitutive,validateMaterial,stressInBasis,vonMises,principalStress,cross,dot,sub} from './material.js';
import {voxelMesh,checkConnected} from './mesh.js';
import {boundaryConditions} from './boundary.js';
import {constrainedMatrix,projectVector} from './constraints.js';
import {printStructure} from './print-structure.js';
import {prepareFEMMesh} from './planning.js';
const IDENTITY=[[1,0,0],[0,1,0],[0,0,1]];
function vecDot(a,b){let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s;}
export function stiffnessMatrix(mesh,k,onProgress=()=>{},factors=null){
 const count=mesh.nodes.length/3,[nx,ny,nz]=mesh.dims,nnx=nx+1,nny=ny+1,neighbors=new Int32Array(count*27).fill(-1),blocks=new Float64Array(count*243),slots=Array.from({length:8},(_,a)=>CORNERS.map(b=>(b[0]-CORNERS[a][0]+1)+3*(b[1]-CORNERS[a][1]+1)+9*(b[2]-CORNERS[a][2]+1)));
 for(let i=0;i<count;i++){const key=mesh.nodeKeys[i],x=key%nnx,y=Math.floor(key/nnx)%nny,z=Math.floor(key/(nnx*nny));for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(x+dx<0||x+dx>nx||y+dy<0||y+dy>ny||z+dz<0||z+dz>nz)continue;neighbors[i*27+(dx+1)+3*(dy+1)+9*(dz+1)]=mesh.nodeLookup[key+dx+nnx*(dy+nny*dz)];}}
 for(let e=0;e<mesh.active.length;e++){for(let a=0;a<8;a++){const node=mesh.elements[e*8+a];for(let b=0;b<8;b++){const off=(node*27+slots[a][b])*9;for(let i=0;i<3;i++)for(let j=0;j<3;j++)blocks[off+i*3+j]+=k[(a*3+i)*24+b*3+j]*(factors?factors[e]:1);}}if(e%10000===0)onProgress(.3+.09*e/mesh.active.length,'Собираем матрицу жёсткости');}
 const rowPtr=new Int32Array(count+1);let total=0;for(let i=0;i<count;i++){rowPtr[i]=total;for(let s=0;s<27;s++){const off=(i*27+s)*9;if(neighbors[i*27+s]>=0&&blocks.subarray(off,off+9).some(v=>v!==0))total++;}}rowPtr[count]=total;
 const col=new Int32Array(total),data=new Float64Array(total*9),diagonal=new Float64Array(count*9);let at=0;
 for(let i=0;i<count;i++)for(let s=0;s<27;s++){const off=(i*27+s)*9,j=neighbors[i*27+s];if(j<0||!blocks.subarray(off,off+9).some(v=>v!==0))continue;col[at]=j;data.set(blocks.subarray(off,off+9),at*9);if(j===i)diagonal.set(blocks.subarray(off,off+9),i*9);at++;}
 function apply(x,out,fixed=null){out.fill(0);for(let i=0;i<count;i++){const o=i*3;if(fixed?.[i]){out[o]=x[o];out[o+1]=x[o+1];out[o+2]=x[o+2];continue;}let a=0,b=0,c=0;for(let p=rowPtr[i];p<rowPtr[i+1];p++){const j=col[p];if(fixed?.[j])continue;const o=j*3,k=p*9,u=x[o],v=x[o+1],w=x[o+2];a+=data[k]*u+data[k+1]*v+data[k+2]*w;b+=data[k+3]*u+data[k+4]*v+data[k+5]*w;c+=data[k+6]*u+data[k+7]*v+data[k+8]*w;}out[o]=a;out[o+1]=b;out[o+2]=c;}}
 return {apply,diagonal,rowPtr,col,data};
}
export function solveLinear(matrix,rhs,fixed,{tolerance=1e-7,maxIterations=2000,onProgress=()=>{},mesh=null}={}){
 const size=rhs.length,x=new Float64Array(size),r=new Float64Array(rhs),p=new Float64Array(size),z=new Float64Array(size),ap=new Float64Array(size);for(let i=0;i<fixed.length;i++)if(fixed[i])r.fill(0,i*3,i*3+3);
 const ic=blockIC(matrix,fixed,onProgress),coarse=coarseRigid(matrix,fixed,mesh);
 const precondition=()=>{ic.apply(r,z);coarse?.apply(r,z);};
 const normB=Math.sqrt(vecDot(r,r));if(!(normB>1e-14))return {displacement:x,iterations:0,relativeResidual:0};precondition();p.set(z);let rz=vecDot(r,z),relativeResidual=1;
 for(let iteration=1;iteration<=maxIterations;iteration++){
  matrix.apply(p,ap,fixed);const pap=vecDot(p,ap);if(!(pap>0&&Number.isFinite(pap)))throw new Error('Матрица не даёт устойчивого решения. Проверьте незакреплённые движения и сетку.');const alpha=rz/pap;for(let i=0;i<size;i++){x[i]+=alpha*p[i];r[i]-=alpha*ap[i];}
  relativeResidual=Math.sqrt(vecDot(r,r))/normB;
  if(relativeResidual<tolerance){matrix.apply(x,ap,fixed);for(let i=0;i<size;i++)r[i]=fixed[Math.floor(i/3)]?0:rhs[i]-ap[i];relativeResidual=Math.sqrt(vecDot(r,r))/normB;if(relativeResidual<tolerance)return {displacement:x,iterations:iteration,relativeResidual,preconditioner:ic.name,preconditionerShift:ic.shift};precondition();p.set(z);rz=vecDot(r,z);continue;}
  precondition();const next=vecDot(r,z),beta=next/rz;for(let i=0;i<size;i++)p[i]=z[i]+beta*p[i];rz=next;if(iteration%10===0)onProgress(.42+.43*Math.min(.99,Math.max(0,-Math.log10(relativeResidual)/7)),'Решаем систему · итерация '+iteration+' · невязка '+relativeResidual.toExponential(1));
 }
 throw new Error('Решение не сошлось за '+maxIterations+' итераций (невязка '+relativeResidual.toExponential(2)+'). Результат не принят. Проверьте закрепления, форму и шаг сетки.');
}
export function solveMesh(mesh,boundary,material,basis=IDENTITY,onProgress=()=>{},structure=null){
 checkConnected(mesh);for(let i=0;i<3;i++)for(let j=0;j<3;j++)if(Math.abs(dot(basis[i],basis[j])-(i===j?1:0))>1e-5)throw new Error('Неправильные оси материала.');
 const parameters=validateMaterial(material),localD=constitutive(parameters),d=worldConstitutive(localD,basis),element=hexElement(mesh.spacing,d),matrix=stiffnessMatrix(mesh,element.k,onProgress,structure?.factors),system=boundary.partial?constrainedMatrix(matrix,boundary.projectors):matrix,solved=solveLinear(system,boundary.partial?boundary.freeRhs:boundary.rhs,boundary.fixed,{onProgress,mesh}),u=boundary.partial?projectVector(boundary.projectors,solved.displacement):solved.displacement,internal=new Float64Array(u.length);matrix.apply(u,internal);
 const physicalResidual=Float64Array.from(internal,(v,i)=>v-boundary.rhs[i]),freeResidual=boundary.projectors?projectVector(boundary.projectors,physicalResidual):Float64Array.from(physicalResidual,(v,i)=>boundary.fixed[Math.floor(i/3)]?0:v),loadNorm=Math.sqrt(vecDot(boundary.freeRhs||boundary.rhs,boundary.freeRhs||boundary.rhs)),physicalRelativeResidual=Math.sqrt(vecDot(freeResidual,freeResidual))/Math.max(loadNorm,1e-20);
 if(physicalRelativeResidual>2e-7)throw new Error('Результат не прошёл проверку равновесия в свободных направлениях. Проверьте опоры и сетку.');
 const origin=mesh.min.map((v,i)=>v+mesh.size[i]/2),appliedForce=[0,0,0],reactionForce=[0,0,0],appliedMoment=[0,0,0],reactionMoment=[0,0,0],reactions=boundary.fixtures.map(f=>({label:f.label,nodes:0,reference:f.reference||f.center,force:[0,0,0],moment:[0,0,0]}));let forceScale=0,momentScale=0,maxDisplacement=0;
 for(let i=0;i<mesh.nodes.length/3;i++){
  const point=Array.from(mesh.nodes.subarray(i*3,i*3+3)),force=Array.from(boundary.rhs.subarray(i*3,i*3+3)),r=sub(point,origin),fm=cross(r,force);
  forceScale+=Math.hypot(...force);momentScale+=Math.hypot(...fm);
  for(let j=0;j<3;j++){appliedForce[j]+=force[j];appliedMoment[j]+=fm[j];}
  maxDisplacement=Math.max(maxDisplacement,Math.hypot(u[i*3],u[i*3+1],u[i*3+2]));
  if(!(boundary.constrained?.[i]??boundary.fixed[i]))continue;
  const residual=force.map((v,j)=>internal[i*3+j]-v),rf=boundary.projectors?residual.map((v,j)=>v-freeResidual[i*3+j]):residual,rm=cross(r,rf);
  for(let j=0;j<3;j++){reactionForce[j]+=rf[j];reactionMoment[j]+=rm[j];}
  if(boundary.normalBasis){
   const touched=new Set();
   for(let a=0;a<boundary.rank[i];a++){
    const owner=boundary.normalOwner[i*3+a],n=boundary.normalBasis.subarray(i*9+a*3,i*9+a*3+3),value=dot(rf,n),part=Array.from(n,v=>v*value),moment=cross(sub(point,reactions[owner].reference),part);touched.add(owner);
    for(let j=0;j<3;j++){reactions[owner].force[j]+=part[j];reactions[owner].moment[j]+=moment[j];}
   }
   for(const owner of touched)reactions[owner].nodes++;
  }else{
   const owner=boundary.owner[i];if(owner>=0){reactions[owner].nodes++;const moment=cross(sub(point,reactions[owner].reference),rf);for(let j=0;j<3;j++){reactions[owner].force[j]+=rf[j];reactions[owner].moment[j]+=moment[j];}}
  }
 }
 const forceBalanceRelative=Math.hypot(...appliedForce.map((v,j)=>v+reactionForce[j]))/Math.max(forceScale,1e-20),momentBalanceRelative=Math.hypot(...appliedMoment.map((v,j)=>v+reactionMoment[j]))/Math.max(momentScale,forceScale*Math.max(...mesh.size)*1e-6,1e-20);
 if(forceBalanceRelative>1e-4||momentBalanceRelative>1e-4)throw new Error('Результат не прошёл проверку равновесия сил или моментов. Уменьшите шаг и проверьте закрепления.');
 const stress=new Float32Array(mesh.active.length*6),fields={vonMises:new Float32Array(mesh.active.length),layerNormal:new Float32Array(mesh.active.length),layerShear:new Float32Array(mesh.active.length),principal:new Float32Array(mesh.active.length)},ue=new Float64Array(24);let maxGaussVM=0,maxStrain=0;
 for(let e=0;e<mesh.active.length;e++){for(let a=0;a<8;a++)for(let j=0;j<3;j++)ue[a*3+j]=u[mesh.elements[e*8+a]*3+j];const mean=new Float64Array(6);
  for(const g of element.gauss){const strain=new Float64Array(6),sig=new Float64Array(6);for(let i=0;i<6;i++)for(let j=0;j<24;j++){sig[i]+=g.db[i*24+j]*ue[j]*(structure?.factors?structure.factors[e]:1);strain[i]+=g.b[i*24+j]*ue[j];}maxGaussVM=Math.max(maxGaussVM,vonMises(sig));maxStrain=Math.max(maxStrain,Math.sqrt(strain[0]**2+strain[1]**2+strain[2]**2+.5*(strain[3]**2+strain[4]**2+strain[5]**2)));for(let j=0;j<6;j++)mean[j]+=sig[j]/8;}
  stress.set(mean,e*6);const layer=stressInBasis(mean,basis);fields.vonMises[e]=vonMises(mean);fields.layerNormal[e]=Math.abs(layer[2]);fields.layerShear[e]=Math.hypot(layer[4],layer[5]);fields.principal[e]=Math.max(0,principalStress(mean)[0]);if(e%10000===0)onProgress(.88+.09*e/mesh.active.length,'Вычисляем напряжения');
 }
 const stats={};for(const [name,field] of Object.entries(fields)){const sorted=Float32Array.from(field).sort();stats[name]={max:sorted.at(-1),p95:sorted[Math.floor((sorted.length-1)*.95)]};}
 const warnings=[...boundary.warnings];if(structure?.parameters.mode==='printed'){warnings.push('Оболочка и однородное заполнение приближены по ступенчатой поверхности объёмной сетки. Напряжения заполнения — средние по эквивалентному объёму; напряжения отдельных нитей не получены.');if(structure.summary.assumed)warnings.push('Жёсткость заполнения принята равной квадрату его объёмной доли. Это допущение, не проверенный закон для выбранного рисунка печати.');if(structure.summary.thinBands)warnings.push('Толщина части оболочки меньше шага: она учтена объёмными долями, локальный изгиб оболочки требует более подробной сетки.');}if(!maxDisplacement)warnings.push('Нагрузки на сетке взаимно компенсировались: получено нулевое поле перемещений.');if(mesh.volumeError>.05)warnings.push('Объём сетки отличается от исходной модели на '+(mesh.volumeError*100).toFixed(1)+'%. Уточните сетку.');if(Math.min(...mesh.dims)<3)warnings.push('По одному из габаритов меньше трёх элементов. Изгиб и локальные напряжения могут быть неточными.');if(maxStrain>.01||maxDisplacement/Math.hypot(...mesh.size)>.05)warnings.push('Получены большие перемещения или деформации. Линейное приближение малых деформаций может быть неприменимо.');warnings.push('Максимум у заделки, ступенчатой границы или острой кромки может зависеть от сетки; сравните уточнение.');
 return {mesh,displacement:u,stress,fields,basis,material:parameters,quality:{converged:true,iterations:solved.iterations,relativeResidual:physicalRelativeResidual,restraintRank:boundary.restraintRank??6,preconditioner:solved.preconditioner||'none',preconditionerShift:solved.preconditionerShift??0,forceBalanceRelative,momentBalanceRelative},summary:{nodes:mesh.nodes.length/3,elements:mesh.active.length,step:[...mesh.spacing],volume:mesh.volume,volumeError:mesh.volumeError??null,maxDisplacement,maxGaussVM,maxStrain,strainEnergy:vecDot(u,internal)/2,stats,reactions,appliedForce,reactionForce,appliedMoment,reactionMoment,momentOrigin:origin,warnings},boundary:{approximate:!!boundary.approximate,fixed:boundary.fixed,constrained:boundary.constrained,rank:boundary.rank,fixtures:boundary.fixtures.map(f=>({nodes:f.nodes,area:f.area,label:f.label,support:f.support})),loads:boundary.loads.map(l=>({nodes:l.nodes,area:l.area,label:l.label,type:l.type,value:l.value,unit:l.unit,direction:l.direction,reference:l.reference})),rhs:boundary.rhs},structure:structure?{parameters:structure.parameters,summary:structure.summary,factors:structure.factors,density:structure.density,shell:structure.shell}:null,method:'hex8-full-2x2x2-linear-static-v2',fullSolid:!structure||structure.parameters.mode==='solid'};
}
export function runFEM(options,onProgress=()=>{}){
 const {positions,scheme,material,basis=IDENTITY,caseIndex=null}=options;
 onProgress(.01,'Проверяем геометрию');
 const {mesh:outerMesh,plan}=prepareFEMMesh(options,onProgress),structure=printStructure(outerMesh,options.structure,basis),mesh=structure.mesh;
 onProgress(.22,'Переносим опоры и нагрузки на сетку');
 const boundary=boundaryConditions(mesh,positions,scheme,caseIndex,{allowApproximate:plan.relaxedSelected}),result=solveMesh(mesh,boundary,material,basis,onProgress,structure);
 result.caseIndex=caseIndex;result.meshPlan=plan;return result;
}
