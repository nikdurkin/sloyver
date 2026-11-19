// Units throughout the solver: mm, N, MPa (= N/mm²), radians.
export const CORNERS=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
export const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const unit=a=>{const n=Math.hypot(...a);if(n<1e-12)throw new Error('Нулевое направление в расчёте.');return a.map(v=>v/n);};
export function inverseSPD(a,n){
 const l=new Float64Array(n*n),scale=Math.max(...Array.from({length:n},(_,i)=>a[i*n+i]));
 for(let i=0;i<n;i++)for(let j=0;j<=i;j++){let sum=a[i*n+j];for(let k=0;k<j;k++)sum-=l[i*n+k]*l[j*n+k];if(i===j){if(!(sum>scale*1e-12))throw new Error('Упругие свойства не дают положительно определённую матрицу. Проверьте E, ν и G.');l[i*n+j]=Math.sqrt(sum);}else l[i*n+j]=sum/l[j*n+j];}
 const inv=new Float64Array(n*n),v=new Float64Array(n),x=new Float64Array(n);
 for(let c=0;c<n;c++){for(let i=0;i<n;i++){let sum=i===c?1:0;for(let j=0;j<i;j++)sum-=l[i*n+j]*v[j];v[i]=sum/l[i*n+i];}for(let i=n-1;i>=0;i--){let sum=v[i];for(let j=i+1;j<n;j++)sum-=l[j*n+i]*x[j];x[i]=sum/l[i*n+i];inv[i*n+c]=x[i];}}
 return inv;
}
export function validateMaterial(raw={}){
 const model=raw.model==='transverse'?'transverse':'isotropic',p={model,E:Number(raw.E),nu:Number(raw.nu)};
 const positive=(v,name)=>{if(!Number.isFinite(v)||v<=0||v>1e7)throw new Error(name+': укажите положительное значение в МПа (до 10⁷).');};
 positive(p.E,'E / E в слоях');if(!Number.isFinite(p.nu)||p.nu<=-.9||p.nu>=.49)throw new Error('ν в слоях должен быть больше −0,9 и меньше 0,49.');
 if(model==='transverse'){p.Ez=Number(raw.Ez);p.nuXZ=Number(raw.nuXZ);p.Gxz=Number(raw.Gxz);positive(p.Ez,'E поперёк слоёв');positive(p.Gxz,'G межслойного сдвига');if(!Number.isFinite(p.nuXZ)||p.nuXZ<=-.9||p.nuXZ>=.49)throw new Error('ν XZ должен быть больше −0,9 и меньше 0,49.');}
 return p;
}
export function constitutive(raw){
 const p=validateMaterial(raw),s=new Float64Array(36),Ez=p.model==='transverse'?p.Ez:p.E,nuXZ=p.model==='transverse'?p.nuXZ:p.nu,Gxy=p.E/(2*(1+p.nu)),Gxz=p.model==='transverse'?p.Gxz:Gxy;
 s[0]=s[7]=1/p.E;s[14]=1/Ez;s[1]=s[6]=-p.nu/p.E;s[2]=s[12]=s[8]=s[13]=-nuXZ/p.E;s[21]=1/Gxy;s[28]=s[35]=1/Gxz;
 return inverseSPD(s,6);
}
// Engineering-strain Voigt order: xx, yy, zz, xy, yz, xz.
export function strainTransform(basis){
 const t=new Float64Array(36);
 for(let c=0;c<6;c++){const e=new Float64Array(9);if(c<3)e[c*3+c]=1;else{const [i,j]=[[0,1],[1,2],[0,2]][c-3];e[i*3+j]=e[j*3+i]=.5;}
  const m=new Float64Array(9);for(let i=0;i<3;i++)for(let j=0;j<3;j++)for(let k=0;k<3;k++)for(let l=0;l<3;l++)m[i*3+j]+=basis[i][k]*e[k*3+l]*basis[j][l];
  const v=[m[0],m[4],m[8],2*m[1],2*m[5],2*m[2]];for(let r=0;r<6;r++)t[r*6+c]=v[r];
 }
 return t;
}
export function worldConstitutive(local,basis){const t=strainTransform(basis),out=new Float64Array(36);for(let i=0;i<6;i++)for(let j=0;j<6;j++)for(let k=0;k<6;k++)for(let l=0;l<6;l++)out[i*6+j]+=t[k*6+i]*local[k*6+l]*t[l*6+j];return out;}
export function stressInBasis(s,b){const m=[[s[0],s[3],s[5]],[s[3],s[1],s[4]],[s[5],s[4],s[2]]],out=[];for(const [i,j] of [[0,0],[1,1],[2,2],[0,1],[1,2],[0,2]]){let v=0;for(let k=0;k<3;k++)for(let l=0;l<3;l++)v+=b[i][k]*m[k][l]*b[j][l];out.push(v);}return out;}
export function vonMises(s){return Math.sqrt(Math.max(0,((s[0]-s[1])**2+(s[1]-s[2])**2+(s[2]-s[0])**2)/2+3*(s[3]**2+s[4]**2+s[5]**2)));}
export function principalStress(s){
 const mean=(s[0]+s[1]+s[2])/3,dev=[s[0]-mean,s[1]-mean,s[2]-mean],p=Math.sqrt((dot(dev,dev)+2*(s[3]**2+s[4]**2+s[5]**2))/6);if(p<1e-14)return [mean,mean,mean];
 const a=dev.map(v=>v/p),xy=s[3]/p,yz=s[4]/p,xz=s[5]/p,det=a[0]*a[1]*a[2]+2*xy*yz*xz-a[0]*yz*yz-a[1]*xz*xz-a[2]*xy*xy,phi=Math.acos(Math.max(-1,Math.min(1,det/2)))/3;
 const v1=mean+2*p*Math.cos(phi),v3=mean+2*p*Math.cos(phi+2*Math.PI/3);return [v1,3*mean-v1-v3,v3];
}
export function strainMatrix(size,xi=0,eta=0,zeta=0){const b=new Float64Array(6*24);for(let i=0;i<8;i++){const [sx,sy,sz]=CORNERS[i].map(v=>v*2-1),dx=sx*(1+sy*eta)*(1+sz*zeta)/(4*size[0]),dy=sy*(1+sx*xi)*(1+sz*zeta)/(4*size[1]),dz=sz*(1+sx*xi)*(1+sy*eta)/(4*size[2]),o=i*3;b[o]=dx;b[24+o+1]=dy;b[48+o+2]=dz;b[72+o]=dy;b[72+o+1]=dx;b[96+o+1]=dz;b[96+o+2]=dy;b[120+o]=dz;b[120+o+2]=dx;}return b;}
export function hexElement(size,d){
 const k=new Float64Array(576),gauss=[],w=size[0]*size[1]*size[2]/8,q=1/Math.sqrt(3);
 for(const xi of [-q,q])for(const eta of [-q,q])for(const zeta of [-q,q]){const b=strainMatrix(size,xi,eta,zeta),db=new Float64Array(144);for(let i=0;i<6;i++)for(let j=0;j<24;j++)for(let a=0;a<6;a++)db[i*24+j]+=d[i*6+a]*b[a*24+j];for(let i=0;i<24;i++)for(let j=0;j<24;j++)for(let a=0;a<6;a++)k[i*24+j]+=b[a*24+i]*db[a*24+j]*w;gauss.push({b,db});}
 return {k,gauss};
}
