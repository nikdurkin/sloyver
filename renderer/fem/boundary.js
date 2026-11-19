import {faceData} from './mesh.js';
import {dot,cross,sub,unit,inverseSPD} from './material.js';
import {restoreScheme} from '../load-scheme.js';
import {toSI} from '../load-units.js';
import {nodalConstraints,rigidRestraintRank,projectVector} from './constraints.js';
function planeMatcher(t,positions,h){
 const n=unit(t.normal),drop=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs))),u=(drop+1)%3,v=(drop+2)%3,bins=new Map(),all=[];const origin=t.min;
 for(const [start,count] of t.facetRanges){if((start+count)*9>positions.length)throw new Error('Выбранная грань не соответствует текущей геометрии. Выберите её заново.');for(let i=start;i<start+count;i++){const ps=[0,3,6].map(o=>Array.from(positions.subarray(i*9+o,i*9+o+3))),tri=ps.map(p=>[p[u]-origin[u],p[v]-origin[v]]),id=all.length;all.push(tri);const lo=[0,1].map(j=>Math.floor(Math.min(...tri.map(p=>p[j]))/h)),hi=[0,1].map(j=>Math.floor(Math.max(...tri.map(p=>p[j]))/h));for(let y=lo[1];y<=hi[1];y++)for(let x=lo[0];x<=hi[0];x++){const key=x+','+y,ids=bins.get(key)||[];ids.push(id);bins.set(key,ids);}}}
 return face=>{if(dot(n,face.normal)<.2)return false;const distance=dot(sub(face.center,t.point),n);if(Math.abs(distance)>h*.9)return false;const point=face.center.map((p,j)=>p-distance*n[j]),pu=point[u]-origin[u],pv=point[v]-origin[v];
  for(const id of bins.get(Math.floor(pu/h)+','+Math.floor(pv/h))||[]){const [a,b,c]=all[id],den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-15)continue;const wa=((b[1]-c[1])*(pu-c[0])+(c[0]-b[0])*(pv-c[1]))/den,wb=((c[1]-a[1])*(pu-c[0])+(a[0]-c[0])*(pv-c[1]))/den;if(wa>=-1e-7&&wb>=-1e-7&&wa+wb<=1.0000001)return true;}return false;};
}
function approximateNodes(mesh,target,n,h){
 // A coarse hole may have no voxel wall. Keep its nominal position by using
 // nearby material nodes as an idealised support/load patch, never a remote
 // surface or an automatically added support. The result is marked approximate.
 let pool;
 if(target.kind==='hole')pool=Array.from({length:mesh.nodes.length/3},(_,i)=>i);
 else{const ids=new Set();for(let i=0;i<mesh.surface.length/2;i++){const f=faceData(mesh,i);if(Math.abs(dot(f.normal,n))>.2&&Math.abs(dot(sub(f.center,target.center),n))<=h*.9)for(const id of f.ids)ids.add(id);}pool=[...ids];}
 for(const reach of [1.25,1.75]){
  const weights=new Map();
  for(const node of pool){const r=sub(Array.from(mesh.nodes.subarray(node*3,node*3+3)),target.center),along=dot(r,n),radial=Math.hypot(...r.map((v,j)=>v-along*n[j]));if(radial<1e-8)continue;
   const axial=target.kind==='hole'?Math.max(0,Math.abs(along)-(target.length||0)/2):Math.abs(along),distance=Math.hypot(Math.abs(radial-target.radius),axial);
   if(distance<=h*reach)weights.set(node,h*h/(1+distance/h));
  }
  if(weights.size>=3)return weights;
 }
 return new Map();
}
export function mapTarget(mesh,target,positions,{allowApproximate=false}={}){
 const h=Math.max(...mesh.spacing),n=unit(target.normal),approximate=target.kind!=='face'&&target.radius*2<h*2.5;
 if(approximate&&!allowApproximate)throw new Error(target.label+': для диаметра '+(target.radius*2).toFixed(2)+' мм нужен шаг не больше '+(target.radius*2/2.5).toFixed(3)+' мм. Выберите автоматическую сетку или примените предложенный шаг.');
 let match;
 if(target.kind==='face')match=planeMatcher(target,positions,h);
 else match=face=>{const r=sub(face.center,target.center),along=dot(r,n),radial=r.map((v,j)=>v-along*n[j]),radius=Math.hypot(...radial);if(Math.abs(radius-target.radius)>h*.8)return false;if(target.kind==='hole')return Math.abs(along)<=(target.length||0)/2+h*.6&&radius>1e-9&&dot(face.normal,radial.map(v=>-v/radius))>.15;return Math.abs(along)<=h*.8&&Math.abs(dot(face.normal,n))>.2;};
 let weights=new Map(),area=0,faces=0;
 for(let i=0;i<mesh.surface.length/2;i++){const f=faceData(mesh,i);if(!match(f))continue;area+=f.area;faces++;for(const node of f.ids)weights.set(node,(weights.get(node)||0)+f.area/4);}
 if(weights.size<3&&approximate&&allowApproximate){weights=approximateNodes(mesh,target,n,h);area=[...weights.values()].reduce((a,b)=>a+b,0);}
 if(weights.size<3)throw new Error(target.label+': на сетке найдено меньше трёх узлов. Уменьшите шаг или уточните выбранный участок.');
 const nodes=Int32Array.from(weights.keys()),values=Float64Array.from(weights.values()),sum=values.reduce((s,w)=>s+w,0),center=[0,0,0];for(let i=0;i<nodes.length;i++)for(let j=0;j<3;j++)center[j]+=values[i]/sum*mesh.nodes[nodes[i]*3+j];
 return {nodes,weights:values,area,faces,center,label:target.label,approximate};
}
export function distributeWrench(mesh,patch,force,moment,reference){
 const {nodes,weights,center}=patch,sum=weights.reduce((s,w)=>s+w,0),inertia=new Float64Array(9),r=[];
 for(let i=0;i<nodes.length;i++){const q=sub(Array.from(mesh.nodes.subarray(nodes[i]*3,nodes[i]*3+3)),center);r.push(q);const r2=dot(q,q),w=weights[i]/sum;for(let a=0;a<3;a++)for(let b=0;b<3;b++)inertia[a*3+b]+=w*((a===b?r2:0)-q[a]*q[b]);}
 const inv=inverseSPD(inertia,3),extra=cross(sub(reference,center),force),total=moment.map((v,j)=>v+extra[j]),omega=[0,1,2].map(i=>total.reduce((s,v,j)=>s+inv[i*3+j]*v,0)),forces=new Float64Array(nodes.length*3);
 for(let i=0;i<nodes.length;i++){const couple=cross(omega,r[i]),w=weights[i]/sum;for(let j=0;j<3;j++)forces[i*3+j]=w*(force[j]+couple[j]);}
 return forces;
}
export function boundaryConditions(mesh,positions,raw,caseIndex=null,{allowApproximate=false}={}){
 const scheme=restoreScheme(raw);if(!scheme.fixtures.length||!scheme.loads.length)throw new Error('Для проверки под нагрузкой задайте хотя бы одну опору и одну нагрузку.');if(caseIndex!==null&&(!Number.isInteger(caseIndex)||caseIndex<0||caseIndex>=scheme.loads.length))throw new Error('Выбранная нагрузка не существует.');
 const rhs=new Float64Array(mesh.nodes.length),fixtures=[],loads=[],warnings=[];
 for(let i=0;i<scheme.fixtures.length;i++){const f=scheme.fixtures[i],patch=mapTarget(mesh,f.target,positions,{allowApproximate});distributeWrench(mesh,patch,[0,0,0],[0,0,0],patch.center);patch.reference=[...f.target.center];patch.support=f.support;fixtures.push(patch);if(patch.approximate)warnings.push('Опора '+(i+1)+': малое отверстие или окружность передано приближённым участком узлов. Локальные напряжения здесь ненадёжны.');}
 const constraints=nodalConstraints(mesh,scheme.fixtures,fixtures),{fixed,owner,projectors}=constraints,restraintRank=rigidRestraintRank(mesh,constraints);warnings.push(...constraints.warnings);
 if(restraintRank<6)throw new Error('Деталь может свободно сдвигаться или вращаться: опоры удерживают '+restraintRank+' из 6 общих движений. Добавьте опору в недостающем направлении. Программа не закрепляет деталь автоматически.');
 for(let i=0;i<scheme.loads.length;i++){if(caseIndex!==null&&i!==caseIndex)continue;const load=scheme.loads[i],patch=mapTarget(mesh,load.target,positions,{allowApproximate}),magnitude=toSI(load.value,load.unit,load.type),force=load.type==='force'?load.direction.map(v=>v*magnitude):[0,0,0],moment=load.type==='moment'?load.direction.map(v=>v*magnitude*1000):[0,0,0],distributed=distributeWrench(mesh,patch,force,moment,load.target.center);
  if(patch.approximate)warnings.push('Нагрузка '+(i+1)+': малое отверстие или окружность передано приближённым участком узлов. Сила и момент сохранены; локальные напряжения здесь ненадёжны.');
  let freeForce2=0,fullForce2=0;for(let j=0;j<patch.nodes.length;j++){const node=patch.nodes[j];for(let d=0;d<3;d++){const value=distributed[j*3+d];rhs[node*3+d]+=value;fullForce2+=value*value;let allowed=0;for(let k=0;k<3;k++)allowed+=projectors[node*9+d*3+k]*distributed[j*3+k];freeForce2+=allowed*allowed;}}
  if(freeForce2<fullForce2*1e-10)throw new Error('Нагрузка '+(i+1)+' целиком попала на закреплённые узлы. Выберите другое место нагрузки.');if(freeForce2<fullForce2*.95)warnings.push('Часть нагрузки '+(i+1)+' приходится на закреплённые узлы. Проверьте пересечение участков.');
  loads.push({...patch,type:load.type,value:load.value,unit:load.unit,direction:load.direction,reference:load.target.center,force,moment,index:i});
 }
 return {...constraints,restraintRank,rhs,freeRhs:projectVector(projectors,rhs),fixtures,loads,warnings,approximate:fixtures.some(p=>p.approximate)||loads.some(p=>p.approximate)};
}
