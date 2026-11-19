// Detect inward cylindrical surface patches in a triangle mesh. STEP is
// tessellated by OCCT first; dimensions below are fitted mesh dimensions.
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const n=Math.hypot(...a);return n>1e-12?a.map(v=>v/n):[0,0,1];};
const canonical=a=>{a=unit(a);const first=a.find(v=>Math.abs(v)>.00001);return first<0?a.map(v=>-v):a;};
function eigenAxis(ts){
 const a=Array.from({length:3},()=>[0,0,0]),v=[[1,0,0],[0,1,0],[0,0,1]];
 for(const t of ts)for(let i=0;i<3;i++)for(let j=0;j<3;j++)a[i][j]+=t.normal[i]*t.normal[j]*t.area;
 for(let iteration=0;iteration<20;iteration++){let p=0,q=1;for(const [i,j] of [[0,2],[1,2]])if(Math.abs(a[i][j])>Math.abs(a[p][q])){p=i;q=j;}if(Math.abs(a[p][q])<1e-12)break;const angle=.5*Math.atan2(2*a[p][q],a[q][q]-a[p][p]),c=Math.cos(angle),s=Math.sin(angle),app=a[p][p],aqq=a[q][q],apq=a[p][q];a[p][p]=c*c*app-2*s*c*apq+s*s*aqq;a[q][q]=s*s*app+2*s*c*apq+c*c*aqq;a[p][q]=a[q][p]=0;
  for(let k=0;k<3;k++)if(k!==p&&k!==q){const x=a[k][p],y=a[k][q];a[k][p]=a[p][k]=c*x-s*y;a[k][q]=a[q][k]=s*x+c*y;}for(let k=0;k<3;k++){const x=v[k][p],y=v[k][q];v[k][p]=c*x-s*y;v[k][q]=s*x+c*y;}}
 const k=[0,1,2].sort((i,j)=>a[i][i]-a[j][j])[0];return canonical(v.map(row=>row[k]));
}
function frame(axis){const u=unit(cross(Math.abs(axis[2])<.9?[0,0,1]:[0,1,0],axis));return [u,cross(axis,u)];}
function fitPatch(triangles,mesh){
 if(triangles.length<12)return null;const axis=eigenAxis(triangles),[u,v]=frame(axis),vertices=[];
 const step=Math.max(1,Math.ceil(triangles.length/1500));for(let i=0;i<triangles.length;i+=step)vertices.push(...triangles[i].p);
 const xy=vertices.map(p=>[dot(p,u),dot(p,v)]),mx=xy.reduce((s,p)=>s+p[0],0)/xy.length,my=xy.reduce((s,p)=>s+p[1],0)/xy.length;
 let xx=0,xySum=0,yy=0,xr=0,yr=0;
 for(const p of xy){const x=p[0]-mx,y=p[1]-my,r=x*x+y*y;xx+=x*x;xySum+=x*y;yy+=y*y;xr+=x*r;yr+=y*r;}
 const det=xx*yy-xySum*xySum;if(det<=Math.max(1e-12,xx*yy*1e-8))return null;
 const cx=mx+.5*(xr*yy-yr*xySum)/det,cy=my+.5*(yr*xx-xr*xySum)/det;
 const distances=xy.map(p=>Math.hypot(p[0]-cx,p[1]-cy)),radius=distances.reduce((s,r)=>s+r,0)/distances.length;
 if(radius<.05||radius>mesh.diagonal*.5)return null;
 const residual=Math.sqrt(distances.reduce((s,r)=>s+(r-radius)**2,0)/distances.length)/radius;if(residual>.025)return null;
 let inward=0,area=0,axisResidual=0;const normals=new Set(),angles=[];
 for(const t of triangles){const x=dot(t.center,u)-cx,y=dot(t.center,v)-cy,l=Math.hypot(x,y);if(l<1e-8)continue;const radial=u.map((n,j)=>(n*x+v[j]*y)/l);inward+=dot(t.normal,radial)*t.area;axisResidual+=Math.abs(dot(t.normal,axis))*t.area;area+=t.area;const angle=Math.atan2(dot(t.normal,v),dot(t.normal,u));normals.add(Math.round(angle*1000));angles.push((Math.atan2(y,x)+2*Math.PI)%(2*Math.PI));}
 if(!area||inward/area>-.9||axisResidual/area>.025||normals.size<6)return null;
 angles.sort((a,b)=>a-b);let gap=angles[0]+2*Math.PI-angles.at(-1);for(let i=1;i<angles.length;i++)gap=Math.max(gap,angles[i]-angles[i-1]);if(gap>Math.PI*.6)return null;
 const levels=vertices.map(p=>dot(p,axis)),lo=Math.min(...levels),hi=Math.max(...levels),length=hi-lo;if(length<.05)return null;
 const center=u.map((n,j)=>n*cx+v[j]*cy+axis[j]*(lo+hi)/2),start=center.map((x,j)=>x-axis[j]*length/2),end=center.map((x,j)=>x+axis[j]*length/2);
 const confident=mesh.closed&&normals.size>=8&&residual<.012&&gap<=Math.PI*.45&&length>=Math.max(.1,radius*.1);
 return {axis,center,start,end,diameter:radius*2,length,radius,residual,facets:normals.size,confidence:confident?'high':'review',triangles:triangles.length};
}
function capAtEnd(mesh,hole){
 const origin=hole.center.map((v,i)=>v-hole.axis[i]*(hole.length/2+Math.max(.05,hole.radius*.01))),direction=hole.axis,nearEnds=[false,false],eps=Math.max(.05,hole.radius*.02),startLevel=dot(origin,direction);
 for(const t of mesh.triangles){if(Math.abs(dot(t.normal,direction))<.85)continue;const e1=sub(t.p[1],t.p[0]),e2=sub(t.p[2],t.p[0]),h=cross(direction,e2),det=dot(e1,h);if(Math.abs(det)<1e-10)continue;const s=sub(origin,t.p[0]),u=dot(s,h)/det;if(u< -1e-7||u>1+1e-7)continue;const q=cross(s,e1),v=dot(direction,q)/det;if(v< -1e-7||u+v>1+1e-7)continue;const level=startLevel+dot(e2,q)/det;for(const [i,end] of [hole.start,hole.end].entries())if(Math.abs(level-dot(end,direction))<=eps)nearEnds[i]=true;
 }
 return nearEnds.every(Boolean)?'closed':nearEnds.some(Boolean)?'blind':'through';
}
export function detectHoles(mesh){
 const triangles=mesh.triangles,eps=Math.max(mesh.diagonal*1e-6,1e-6),key=p=>p.map(x=>Math.round(x/eps)).join(','),edgeMap=new Map(),pairs=[],axisBins=new Map();
 for(let i=0;i<triangles.length;i++){const t=triangles[i],ks=t.p.map(key);for(let k=0;k<3;k++){const a=ks[k],b=ks[(k+1)%3],edge=a<b?a+'|'+b:b+'|'+a,j=edgeMap.get(edge);if(j===undefined){edgeMap.set(edge,i);continue;}edgeMap.delete(edge);const other=triangles[j],alignment=dot(t.normal,other.normal);if(alignment<.3)continue;pairs.push([i,j]);if(alignment>.99999)continue;const axis=canonical(cross(t.normal,other.normal)),bin=axis.map(x=>Math.round(x*30)).join(','),g=axisBins.get(bin)||{axis,score:0};g.score+=Math.min(t.area,other.area);axisBins.set(bin,g);}}
 edgeMap.clear();const axes=[[1,0,0],[0,1,0],[0,0,1]];for(const b of [...axisBins.values()].sort((a,b)=>b.score-a.score).slice(0,18))if(!axes.some(a=>Math.abs(dot(a,b.axis))>.9998))axes.push(b.axis);
 const found=[];
 for(const axis of axes){const parents=new Int32Array(triangles.length),active=new Uint8Array(triangles.length);for(let i=0;i<parents.length;i++){parents[i]=i;active[i]=Math.abs(dot(triangles[i].normal,axis))<.025?1:0;}
  const root=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};for(const [i,j] of pairs)if(active[i]&&active[j]){const a=root(i),b=root(j);if(a!==b)parents[b]=a;}
  const groups=new Map();for(let i=0;i<triangles.length;i++)if(active[i]){const r=root(i),list=groups.get(r)||[];list.push(triangles[i]);groups.set(r,list);}
  for(const ts of groups.values()){const h=fitPatch(ts,mesh);if(!h)continue;const duplicate=found.find(q=>Math.abs(dot(q.axis,h.axis))>.999&&Math.abs(q.radius-h.radius)<Math.max(.05,h.radius*.03)&&Math.hypot(...cross(sub(q.center,h.center),h.axis))<Math.max(.05,h.radius*.03)&&Math.abs(dot(sub(q.center,h.center),h.axis))<(q.length+h.length)/2);
   if(duplicate){if(h.triangles>duplicate.triangles)Object.assign(duplicate,h);}else found.push(h);
  }
 }
 found.sort((a,b)=>a.center[0]-b.center[0]||a.center[1]-b.center[1]||a.center[2]-b.center[2]||a.diameter-b.diameter);
 const holes=found.slice(0,100).map((h,i)=>{let hash=2166136261;const s=JSON.stringify([...h.center,...h.axis,h.diameter,h.length].map(v=>Math.round(v*100)/100));for(const c of s){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619);}return {...h,id:'hole-'+(hash>>>0).toString(36),label:'H'+(i+1),kind:capAtEnd(mesh,h)};});
 return {holes,checkedAxes:axes.length,limited:found.length>100,note:'Распознавание цилиндрических участков по сетке. Ступени могут определяться отдельно; резьба, сложные пересечения и грубая сетка требуют проверки.'};
}
export function activeHoles(holes,edits={}){return holes.map(h=>({...h,...(edits[h.id]?.axis?{axis:unit(edits[h.id].axis)}:{}),required:edits[h.id]?.rule==='vertical'})).filter(h=>edits[h.id]?.rule==='ignore'?false:edits[h.id]?.rule==='soft'||h.required||(h.confidence==='high'&&h.kind!=='closed'));}
