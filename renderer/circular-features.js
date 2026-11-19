// Circular edge snapping in original model coordinates. Never changes the mesh.
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len=a=>Math.hypot(...a),unit=a=>a.map(v=>v/len(a));
export function circleThroughPoints(a,b,c){
 if(![a,b,c].every(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)))throw new Error('Выберите три точки на окружности.');
 const u=sub(b,a),v=sub(c,a),w=cross(u,v),w2=dot(w,w),scale=Math.max(dot(u,u),dot(v,v));
 if(!scale||w2<scale*scale*1e-8)throw new Error('Точки почти лежат на одной прямой. Выберите три разнесённые точки обода.');
 const q=cross(v,w).map((x,i)=>(x*dot(u,u)+cross(w,u)[i]*dot(v,v))/(2*w2));
 return {center:a.map((x,i)=>x+q[i]),normal:unit(w),radius:len(q),manual:true};
}
export function circleFrame(normal){const u=unit(cross(Math.abs(normal[2])<.9?[0,0,1]:[0,1,0],normal));return [u,cross(normal,u)];}
export function circlePoints(c,segments=64){const [u,v]=circleFrame(c.normal);return Array.from({length:segments},(_,i)=>c.center.map((x,j)=>x+c.radius*(u[j]*Math.cos(i*2*Math.PI/segments)+v[j]*Math.sin(i*2*Math.PI/segments))));}
export function fitCircle(points){
 if(points.length<6)return null;
 const mean=[0,1,2].map(j=>points.reduce((s,p)=>s+p[j],0)/points.length);let n=[0,0,0];
 for(let i=0;i<points.length;i++){const q=cross(sub(points[i],mean),sub(points[(i+1)%points.length],mean));n=n.map((v,j)=>v+q[j]);}
 if(len(n)<1e-9)return null;n=unit(n);const [u,v]=circleFrame(n),xy=points.map(p=>[dot(sub(p,mean),u),dot(sub(p,mean),v)]);
 let xx=0,yy=0,xySum=0,xr=0,yr=0;
 for(const [x,y] of xy){const r=x*x+y*y;xx+=x*x;yy+=y*y;xySum+=x*y;xr+=x*r;yr+=y*r;}
 const det=xx*yy-xySum*xySum;if(det<xx*yy*1e-8)return null;
 const cx=(xr*yy-yr*xySum)/(2*det),cy=(yr*xx-xr*xySum)/(2*det),center=mean.map((x,j)=>x+cx*u[j]+cy*v[j]),radii=points.map(p=>len(sub(p,center))),radius=radii.reduce((s,x)=>s+x,0)/radii.length;
 if(radius<.05||points.some((p,i)=>Math.abs(radii[i]-radius)>radius*.025||Math.abs(dot(sub(p,center),n))>Math.max(.01,radius*.01)))return null;
 const angles=points.map(p=>Math.atan2(dot(sub(p,center),v),dot(sub(p,center),u))).sort((a,b)=>a-b);let gap=angles[0]+2*Math.PI-angles.at(-1);for(let i=1;i<angles.length;i++)gap=Math.max(gap,angles[i]-angles[i-1]);if(gap>Math.PI*.65)return null;
 return {center,normal:n,radius,facets:points.length,residual:Math.sqrt(radii.reduce((s,r)=>s+(r-radius)**2,0)/radii.length)/radius};
}
export function detectCircularEdges(positions){
 if(!positions?.length)return [];
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<positions.length;i++){const j=i%3;min[j]=Math.min(min[j],positions[i]);max[j]=Math.max(max[j],positions[i]);}
 const eps=Math.max(len(sub(max,min))*1e-6,1e-6),key=p=>p.map(v=>Math.round(v/eps)).join(','),vertices=new Map(),edges=new Map();
 for(let i=0;i<positions.length;i+=9){const p=[0,3,6].map(k=>Array.from(positions.subarray(i+k,i+k+3))),n=cross(sub(p[1],p[0]),sub(p[2],p[0]));if(len(n)<eps*eps)continue;const normal=unit(n),ks=p.map(key);for(let j=0;j<3;j++){vertices.set(ks[j],p[j]);const a=ks[j],b=ks[(j+1)%3],k=a<b?a+'|'+b:b+'|'+a,e=edges.get(k);if(e){e.count++;e.sharp ||= dot(e.normal,normal)<Math.cos(Math.PI/12);}else edges.set(k,{a,b,count:1,normal,sharp:false});}}
 const adjacent=new Map();for(const e of edges.values())if(e.count===1||e.count===2&&e.sharp){for(const [a,b] of [[e.a,e.b],[e.b,e.a]]){const list=adjacent.get(a)||[];list.push(b);adjacent.set(a,list);}}
 const visited=new Set(),circles=[];
 for(const [start,ns] of adjacent){if(visited.has(start)||ns.length!==2)continue;const loop=[],seen=new Set();let current=start,previous=null,closed=false;
  while(loop.length<20000){if(seen.has(current)){closed=current===start;break;}seen.add(current);visited.add(current);const neighbors=adjacent.get(current);if(neighbors?.length!==2)break;loop.push(vertices.get(current));const next=neighbors.find(x=>x!==previous);previous=current;current=next;}
  if(!closed)continue;const c=fitCircle(loop);if(!c)continue;c.id='rim-'+circles.length;c.label='C'+(circles.length+1);circles.push(c);if(circles.length>=200)break;
 }
 return circles;
}
export function restoreManualCircles(raw){
 if(raw==null)return [];if(!Array.isArray(raw)||raw.length>50)throw new Error('В проекте допускается до 50 ручных окружностей.');
 return raw.map((c,i)=>{if(!c||![c.center,c.normal].every(v=>Array.isArray(v)&&v.length===3&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<1e7))||len(c.normal)<1e-8||!Number.isFinite(c.radius)||c.radius<.01||c.radius>1e5)throw new Error('Некорректная ручная окружность в проекте.');return {id:'manual-'+i,label:'M'+(i+1),center:[...c.center],normal:unit(c.normal),radius:c.radius,manual:true};});
}
export function planarTarget(positions,faceIndex){
 const offset=faceIndex*9;if(offset<0||offset+8>=positions.length)throw new Error('Выберите плоскую грань.');
 const p=[0,3,6].map(k=>Array.from(positions.subarray(offset+k,offset+k+3))),normal=unit(cross(sub(p[1],p[0]),sub(p[2],p[0]))),point=p[0],eps=Math.max(len(sub(p[1],point))*1e-5,.001),verts=new Map(),candidates=new Map();
 const key=p=>p.map(v=>Math.round(v/eps)).join(',');
 for(let i=0;i<positions.length;i+=9){const ps=[0,3,6].map(k=>Array.from(positions.subarray(i+k,i+k+3))),cr=cross(sub(ps[1],ps[0]),sub(ps[2],ps[0])),area=len(cr)/2;if(area<1e-12||dot(unit(cr),normal)<.9995||ps.some(v=>Math.abs(dot(sub(v,point),normal))>eps))continue;const keys=ps.map(key),index=i/9;candidates.set(index,{ps,area,keys});for(const k of keys){const set=verts.get(k)||[];set.push(index);verts.set(k,set);}}
 const found=new Set([faceIndex]),queue=[faceIndex];for(let q=0;q<queue.length;q++){for(const k of candidates.get(queue[q])?.keys||[])for(const index of verts.get(k)||[])if(!found.has(index)){found.add(index);queue.push(index);}}
 const center=[0,0,0],min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let area=0;
 for(const i of found){const t=candidates.get(i);if(!t)continue;area+=t.area;for(let j=0;j<3;j++){center[j]+=t.ps.reduce((s,p)=>s+p[j],0)*t.area/3;for(const p of t.ps){min[j]=Math.min(min[j],p[j]);max[j]=Math.max(max[j],p[j]);}}}
 if(!area)throw new Error('Этот участок не удалось определить как плоскую грань.');
 const ranges=[];for(const i of [...found].sort((a,b)=>a-b)){const r=ranges.at(-1);if(r&&r[0]+r[1]===i)r[1]++;else ranges.push([i,1]);}
 return {kind:'face',center:center.map(v=>v/area),normal,point,area,min,max,facetRanges:ranges};
}
export const targetContainsFacet=(target,i)=>target?.kind==='face'&&target.facetRanges?.some(([start,count])=>i>=start&&i<start+count);
