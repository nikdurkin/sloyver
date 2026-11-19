// Incomplete block LDL^T preconditioning only: the physical stiffness matrix
// is never shifted, regularized or given artificial restraints.
import {inverseSPD} from './material.js';
function product(a,ao,b,bo,out,transpose=false){for(let i=0;i<3;i++)for(let j=0;j<3;j++){let s=0;for(let k=0;k<3;k++)s+=a[ao+i*3+k]*b[bo+(transpose?j*3+k:k*3+j)];out[i*3+j]=s;}}
function inverse3(a,out,o){const a0=a[0],b=(a[1]+a[3])/2,c=(a[2]+a[6])/2,d=a[4],e=(a[5]+a[7])/2,f=a[8],det=a0*(d*f-e*e)-b*(b*f-c*e)+c*(b*e-c*d),scale=Math.max(a0,d,f);if(!(a0>scale*1e-12&&a0*d-b*b>scale*scale*1e-12&&det>scale**3*1e-13))return false;out.set([(d*f-e*e)/det,(c*e-b*f)/det,(b*e-c*d)/det,(c*e-b*f)/det,(a0*f-c*c)/det,(b*c-a0*e)/det,(b*e-c*d)/det,(b*c-a0*e)/det,(a0*d-b*b)/det],o);return true;}
export function blockIC(matrix,fixed,onProgress=()=>{}){
 const n=fixed.length,rows=new Int32Array(n+1),cols=[],source=[];
 for(let i=0;i<n;i++){rows[i]=cols.length;if(fixed[i])continue;const entries=[];for(let p=matrix.rowPtr[i];p<matrix.rowPtr[i+1];p++){const j=matrix.col[p];if(j<i&&!fixed[j])entries.push({j,p});}entries.sort((a,b)=>a.j-b.j);for(const e of entries){cols.push(e.j);source.push(e.p);}}rows[n]=cols.length;
 const values=new Float64Array(cols.length*9),d=new Float64Array(n*9),inverse=new Float64Array(n*9),tmp=new Float64Array(9),correction=new Float64Array(9),a=new Float64Array(9),output=new Float64Array(9);let usedShift=null;
 for(const shift of [0,.00001,.0001,.001,.01,.1,1]){let valid=true;onProgress(.39,'Предобуславливание · блочный IC(0)');
  for(let i=0;i<n;i++){if(fixed[i]){d[i*9]=d[i*9+4]=d[i*9+8]=inverse[i*9]=inverse[i*9+4]=inverse[i*9+8]=1;continue;}
   for(let q=rows[i];q<rows[i+1];q++){const j=cols[q];a.set(matrix.data.subarray(source[q]*9,source[q]*9+9));let x=rows[i],y=rows[j];while(x<q&&y<rows[j+1]){const cx=cols[x],cy=cols[y];if(cx<cy){x++;continue;}if(cy<cx){y++;continue;}product(values,x*9,d,cx*9,tmp);product(tmp,0,values,y*9,correction,true);for(let k=0;k<9;k++)a[k]-=correction[k];x++;y++;}product(a,0,inverse,j*9,output);values.set(output,q*9);}
   a.set(matrix.diagonal.subarray(i*9,i*9+9));for(let j=0;j<3;j++)a[j*3+j]*=1+shift;
   for(let q=rows[i];q<rows[i+1];q++){product(values,q*9,d,cols[q]*9,tmp);product(tmp,0,values,q*9,correction,true);for(let k=0;k<9;k++)a[k]-=correction[k];}
   if(!inverse3(a,inverse,i*9)){valid=false;break;}d.set(a,i*9);
  }
  if(valid){usedShift=shift;break;}
 }
 if(usedShift===null)throw new Error('Не удалось построить предобуславливатель. Проверьте свойства и сетку.');
 const y=new Float64Array(n*3);
 function apply(r,z){y.set(r);for(let i=0;i<n;i++){const o=i*3;for(let q=rows[i];q<rows[i+1];q++){const j=cols[q]*3,k=q*9,u=y[j],v=y[j+1],w=y[j+2];y[o]-=values[k]*u+values[k+1]*v+values[k+2]*w;y[o+1]-=values[k+3]*u+values[k+4]*v+values[k+5]*w;y[o+2]-=values[k+6]*u+values[k+7]*v+values[k+8]*w;}}
  for(let i=0;i<n;i++){const o=i*3,k=i*9;z[o]=inverse[k]*y[o]+inverse[k+1]*y[o+1]+inverse[k+2]*y[o+2];z[o+1]=inverse[k+3]*y[o]+inverse[k+4]*y[o+1]+inverse[k+5]*y[o+2];z[o+2]=inverse[k+6]*y[o]+inverse[k+7]*y[o+1]+inverse[k+8]*y[o+2];}
  for(let i=n-1;i>=0;i--){const o=i*3,u=z[o],v=z[o+1],w=z[o+2];for(let q=rows[i];q<rows[i+1];q++){const j=cols[q]*3,k=q*9;z[j]-=values[k]*u+values[k+3]*v+values[k+6]*w;z[j+1]-=values[k+1]*u+values[k+4]*v+values[k+7]*w;z[j+2]-=values[k+2]*u+values[k+5]*v+values[k+8]*w;}}
 }
 return {apply,shift:usedShift,name:'block-IC(0)'};
}
export function coarseRigid(matrix,fixed,mesh){if(!mesh)return null;const count=mesh.nodes.length,center=mesh.min.map((v,j)=>v+mesh.size[j]/2),length=Math.max(...mesh.size),vectors=Array.from({length:6},()=>new Float64Array(count));for(let i=0;i<count/3;i++){if(fixed[i])continue;const o=i*3,x=(mesh.nodes[o]-center[0])/length,y=(mesh.nodes[o+1]-center[1])/length,z=(mesh.nodes[o+2]-center[2])/length;vectors[0][o]=vectors[1][o+1]=vectors[2][o+2]=1;vectors[3][o+1]=-z;vectors[3][o+2]=y;vectors[4][o]=z;vectors[4][o+2]=-x;vectors[5][o]=-y;vectors[5][o+1]=x;}
 const small=new Float64Array(36),av=new Float64Array(count);for(let j=0;j<6;j++){matrix.apply(vectors[j],av,fixed);for(let i=0;i<6;i++){let sum=0;for(let k=0;k<count;k++)sum+=vectors[i][k]*av[k];small[i*6+j]=sum;}}
 let inverse;try{inverse=inverseSPD(small,6);}catch{return null;}const projection=new Float64Array(6),eta=new Float64Array(6);return {apply(r,z){for(let j=0;j<6;j++){let sum=0;for(let i=0;i<count;i++)sum+=vectors[j][i]*r[i];projection[j]=sum;}for(let j=0;j<6;j++){eta[j]=0;for(let k=0;k<6;k++)eta[j]+=inverse[j*6+k]*projection[k];}for(let j=0;j<6;j++)for(let i=0;i<count;i++)z[i]+=vectors[j][i]*eta[j];}};
}
