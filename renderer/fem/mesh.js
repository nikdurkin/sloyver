import {prepareMesh} from '../geometry.js';
import {CORNERS} from './material.js';
export const LIMITS={cells:4000000,elements:100000,nodes:160000};
export const FACES=[{axis:0,sign:-1,corners:[0,4,7,3]},{axis:0,sign:1,corners:[1,2,6,5]},{axis:1,sign:-1,corners:[0,1,5,4]},{axis:1,sign:1,corners:[3,7,6,2]},{axis:2,sign:-1,corners:[0,3,2,1]},{axis:2,sign:1,corners:[4,5,6,7]}];
export function meshTopology({min,size,dims,active}){
 const [nx,ny,nz]=dims,volume=nx*ny*nz;if(!dims.every(v=>Number.isInteger(v)&&v>=1&&v<=1500)||volume>LIMITS.cells||active.length>LIMITS.elements||active.length<1)throw new Error('Сетка слишком велика или пуста. Увеличьте шаг сетки; максимум 100 000 объёмных элементов.');
 const spacing=size.map((v,i)=>v/dims[i]),lookup=new Int32Array(volume).fill(-1),nnx=nx+1,nny=ny+1,nodeLookup=new Int32Array(nnx*nny*(nz+1)).fill(-1),elements=new Int32Array(active.length*8),points=[],surface=[],keys=[];
 for(let e=0;e<active.length;e++){const key=active[e];if(!Number.isInteger(key)||key<0||key>=volume||lookup[key]!==-1)throw new Error('Некорректные элементы сетки.');lookup[key]=e;}
 const coord=key=>[key%nx,Math.floor(key/nx)%ny,Math.floor(key/(nx*ny))];
 for(let e=0;e<active.length;e++){const [x,y,z]=coord(active[e]);for(let a=0;a<8;a++){const c=CORNERS[a],p=[x+c[0],y+c[1],z+c[2]],key=p[0]+nnx*(p[1]+nny*p[2]);let node=nodeLookup[key];if(node<0){node=points.length/3;nodeLookup[key]=node;keys.push(key);points.push(...p.map((v,i)=>min[i]+v*spacing[i]));}elements[e*8+a]=node;}
  for(let f=0;f<6;f++){const {axis,sign}=FACES[f],p=[x,y,z];p[axis]+=sign;if(p[axis]<0||p[axis]>=dims[axis]||lookup[p[0]+nx*(p[1]+ny*p[2])]<0)surface.push(e,f);}
 }
 if(points.length/3>LIMITS.nodes)throw new Error('Слишком много узлов. Увеличьте шаг сетки.');
 return {min:[...min],size:[...size],dims:[...dims],spacing,active:new Int32Array(active),lookup,elements,nodes:new Float64Array(points),nodeKeys:new Int32Array(keys),nodeLookup,surface:new Int32Array(surface),volume:active.length*spacing.reduce((a,b)=>a*b,1)};
}
export function checkConnected(mesh){const {active,lookup,dims:[nx,ny,nz]}=mesh,seen=new Uint8Array(active.length),queue=new Int32Array(active.length);queue[0]=0;seen[0]=1;let tail=1;for(let head=0;head<tail;head++){const key=active[queue[head]],x=key%nx,y=Math.floor(key/nx)%ny,z=Math.floor(key/(nx*ny));for(const [valid,k] of [[x>0,key-1],[x<nx-1,key+1],[y>0,key-nx],[y<ny-1,key+nx],[z>0,key-nx*ny],[z<nz-1,key+nx*ny]]){if(!valid)continue;const e=lookup[k];if(e>=0&&!seen[e]){seen[e]=1;queue[tail++]=e;}}}if(tail!==active.length)throw new Error('Объёмная сетка распалась на несвязанные части. Уменьшите шаг сетки и проверьте тонкие перемычки либо выберите одно тело.');}
export function voxelMesh(positions,step,onProgress=()=>{},prepared=null){
 if(!Number.isFinite(step)||step<=0)throw new Error('Укажите положительный шаг сетки в мм.');const source=prepared||prepareMesh(positions);if(!source.closed)throw new Error('Для проверки под нагрузкой нужна замкнутая согласованная сетка. Исправьте открытые, пересекающиеся или несогласованные поверхности.');
 const dims=source.size.map(v=>Math.max(1,Math.ceil(v/step-1e-9)));if(dims.reduce((a,b)=>a*b,1)>LIMITS.cells||dims.some(v=>v>1500))throw new Error('Область сетки слишком велика. Увеличьте шаг; максимум 4 000 000 ячеек области.');
 const spacing=source.size.map((v,i)=>v/dims[i]);const ax=source.size.indexOf(Math.max(...source.size)),u=(ax+1)%3,v=(ax+2)%3,lines=Array.from({length:dims[u]*dims[v]},()=>[]),eps=Math.max(...source.size)*1e-8;
 let count=0;
 for(const t of source.triangles){const p=t.p.map(p=>p.map((v,j)=>v-source.min[j])),a=p[0],b=p[1],c=p[2],den=(b[v]-c[v])*(a[u]-c[u])+(c[u]-b[u])*(a[v]-c[v]);if(Math.abs(den)<1e-15)continue;
  const loU=Math.max(0,Math.ceil(Math.min(...p.map(p=>p[u]))/spacing[u]-.500001)),hiU=Math.min(dims[u]-1,Math.floor(Math.max(...p.map(p=>p[u]))/spacing[u]-.499999)),loV=Math.max(0,Math.ceil(Math.min(...p.map(p=>p[v]))/spacing[v]-.500001)),hiV=Math.min(dims[v]-1,Math.floor(Math.max(...p.map(p=>p[v]))/spacing[v]-.499999));
  for(let j=loV;j<=hiV;j++)for(let i=loU;i<=hiU;i++){const pu=(i+.5+3.718e-7)*spacing[u],pv=(j+.5+1.732e-7)*spacing[v],wa=((b[v]-c[v])*(pu-c[u])+(c[u]-b[u])*(pv-c[v]))/den,wb=((c[v]-a[v])*(pu-c[u])+(a[u]-c[u])*(pv-c[v]))/den,wc=1-wa-wb;if(Math.min(wa,wb,wc)>=-1e-10)lines[i+dims[u]*j].push(wa*a[ax]+wb*b[ax]+wc*c[ax]);}
  if(++count%15000===0)onProgress(.04+.12*count/source.triangles.length,'Пересекаем поверхность');
 }
 const occupied=new Uint8Array(dims[0]*dims[1]*dims[2]);let odd=0;
 for(let j=0;j<dims[v];j++)for(let i=0;i<dims[u];i++){const xs=lines[i+dims[u]*j].sort((a,b)=>a-b).filter((x,k,a)=>!k||x-a[k-1]>eps);if(xs.length%2){odd++;continue;}for(let k=0;k<xs.length;k+=2){const a=Math.max(0,Math.ceil(xs[k]/spacing[ax]-.5)),b=Math.min(dims[ax]-1,Math.floor(xs[k+1]/spacing[ax]-.5));for(let l=a;l<=b;l++){const p=[];p[ax]=l;p[u]=i;p[v]=j;occupied[p[0]+dims[0]*(p[1]+dims[1]*p[2])]=1;}}}
 if(odd)throw new Error('Не удалось однозначно определить внутренний объём по поверхности. Проверьте самопересечения и экспорт сетки.');
 const active=[];for(let i=0;i<occupied.length;i++)if(occupied[i])active.push(i);const mesh=meshTopology({min:source.min,size:source.size,dims,active});checkConnected(mesh);
 const volumeError=source.volume>0?Math.abs(mesh.volume-source.volume)/source.volume:null;if(volumeError!==null&&volumeError>.3)throw new Error('Сетка слишком грубо передаёт объём детали (расхождение больше 30%). Уменьшите шаг.');
 mesh.sourceVolume=source.volume;mesh.volumeError=volumeError;return {mesh,source};
}
export function faceData(mesh,index){const e=mesh.surface[index*2],side=mesh.surface[index*2+1],f=FACES[side],ids=f.corners.map(a=>mesh.elements[e*8+a]),center=[0,0,0],normal=[0,0,0];normal[f.axis]=f.sign;for(const id of ids)for(let j=0;j<3;j++)center[j]+=mesh.nodes[id*3+j]/4;return {element:e,side,ids,center,normal,area:mesh.spacing.reduce((s,v,i)=>i===f.axis?s:s*v,1)};}
