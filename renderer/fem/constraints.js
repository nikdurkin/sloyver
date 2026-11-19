import {dot,cross,sub,unit} from './material.js';
import {supportType} from '../load-scheme.js';

export function supportNormals(fixture,point){
 const kind=supportType(fixture),n=unit(fixture.target.normal);
 if(kind==='fixed')return [[1,0,0],[0,1,0],[0,0,1]];
 if(kind==='roller')return [n];
 if(kind==='pin'){
  const r=sub(point,fixture.target.center),a=dot(r,n),v=r.map((x,j)=>x-a*n[j]);
  if(Math.hypot(...v)<1e-8)throw new Error('Узел опоры оказался на оси отверстия. Уточните сетку и выбранную окружность.');
  return [unit(v)];
 }
 const seed=Math.abs(n[0])<.8?[1,0,0]:[0,1,0],a=unit(cross(n,seed));
 return [a,unit(cross(n,a))];
}

export function nodalConstraints(mesh,fixtures,patches){
 const count=mesh.nodes.length/3,rank=new Uint8Array(count),normalBasis=new Float64Array(count*9),normalOwner=new Int32Array(count*3).fill(-1),owner=new Int32Array(count).fill(-1),warnings=[];
 for(let f=0;f<fixtures.length;f++){
  let redundant=0;
  for(const node of patches[f].nodes){
   const point=Array.from(mesh.nodes.subarray(node*3,node*3+3));
   for(const normal of supportNormals(fixtures[f],point)){
    const v=[...normal];
    for(let a=0;a<rank[node];a++){const off=node*9+a*3,b=normalBasis.subarray(off,off+3),q=dot(v,b);for(let j=0;j<3;j++)v[j]-=q*b[j];}
    const length=Math.hypot(...v);if(length<1e-8){redundant++;continue;}
    const at=rank[node]++;for(let j=0;j<3;j++)normalBasis[node*9+at*3+j]=v[j]/length;
    normalOwner[node*3+at]=f;if(owner[node]<0)owner[node]=f;
   }
  }
  if(redundant)warnings.push('Опора '+(f+1)+': часть направлений уже удерживается другой опорой. Реакции общих направлений отнесены к первой опоре.');
 }
 const fixed=new Uint8Array(count),constrained=new Uint8Array(count),projectors=new Float64Array(count*9);let partial=false;
 for(let node=0;node<count;node++){
  fixed[node]=rank[node]===3?1:0;constrained[node]=rank[node]?1:0;if(rank[node]>0&&rank[node]<3)partial=true;
  for(let i=0;i<3;i++)for(let j=0;j<3;j++){let p=i===j?1:0;for(let a=0;a<rank[node];a++)p-=normalBasis[node*9+a*3+i]*normalBasis[node*9+a*3+j];projectors[node*9+i*3+j]=Math.abs(p)<1e-14?0:p;}
 }
 return {rank,normalBasis,normalOwner,owner,fixed,constrained,projectors,partial,warnings};
}

export function projectVector(projectors,vector,out=new Float64Array(vector.length)){
 for(let n=0;n<vector.length/3;n++)for(let i=0;i<3;i++){let value=0;for(let j=0;j<3;j++)value+=projectors[n*9+i*3+j]*vector[n*3+j];out[n*3+i]=value;}
 return out;
}

export function rigidRestraintRank(mesh,constraints){
 const center=mesh.min.map((v,j)=>v+mesh.size[j]/2),length=Math.max(...mesh.size),g=new Float64Array(36);
 for(let node=0;node<constraints.rank.length;node++){
  const r=sub(Array.from(mesh.nodes.subarray(node*3,node*3+3)),center).map(v=>v/length);
  for(let a=0;a<constraints.rank[node];a++){
   const n=Array.from(constraints.normalBasis.subarray(node*9+a*3,node*9+a*3+3)),row=[...n,...cross(r,n)];
   for(let i=0;i<6;i++)for(let j=0;j<6;j++)g[i*6+j]+=row[i]*row[j];
  }
 }
 const scale=Math.max(...g.map(Math.abs));let rank=0;
 for(let col=0;col<6;col++){
  let pivot=rank;for(let i=rank;i<6;i++)if(Math.abs(g[i*6+col])>Math.abs(g[pivot*6+col]))pivot=i;
  if(Math.abs(g[pivot*6+col])<=scale*1e-9)continue;
  for(let j=0;j<6;j++){const v=g[rank*6+j];g[rank*6+j]=g[pivot*6+j];g[pivot*6+j]=v;}
  for(let i=rank+1;i<6;i++){const factor=g[i*6+col]/g[rank*6+col];for(let j=col;j<6;j++)g[i*6+j]-=factor*g[rank*6+j];}
  rank++;
 }
 return rank;
}

// Exact homogeneous displacement constraints: A = P K P + alpha (I-P).
// The second term only acts on forbidden directions. It does not stiffen any
// admissible movement, and reactions are recovered using the original K.
export function constrainedMatrix(matrix,projectors){
 const {rowPtr,col}=matrix,count=rowPtr.length-1,data=new Float64Array(matrix.data.length),diagonal=new Float64Array(count*9);
 for(let n=0;n<count;n++)for(let at=rowPtr[n];at<rowPtr[n+1];at++){
  const other=col[at],o=at*9,tmp=new Float64Array(9);
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)for(let a=0;a<3;a++)tmp[i*3+j]+=projectors[n*9+i*3+a]*matrix.data[o+a*3+j];
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)for(let a=0;a<3;a++)data[o+i*3+j]+=tmp[i*3+a]*projectors[other*9+a*3+j];
  if(other===n){
   const alpha=Math.max(matrix.diagonal[n*9],matrix.diagonal[n*9+4],matrix.diagonal[n*9+8],1e-12);
   for(let i=0;i<3;i++)for(let j=0;j<3;j++){data[o+i*3+j]+=alpha*((i===j?1:0)-projectors[n*9+i*3+j]);diagonal[n*9+i*3+j]=data[o+i*3+j];}
  }
 }
 function apply(x,out,fixed=null){
  out.fill(0);for(let n=0;n<count;n++){
   if(fixed?.[n]){out.set(x.subarray(n*3,n*3+3),n*3);continue;}
   for(let at=rowPtr[n];at<rowPtr[n+1];at++){const m=col[at];if(fixed?.[m])continue;for(let i=0;i<3;i++)for(let j=0;j<3;j++)out[n*3+i]+=data[at*9+i*3+j]*x[m*3+j];}
  }
 }
 return {rowPtr,col,data,diagonal,apply};
}
