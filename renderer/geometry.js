// Geometry-only orientation advisor. Scores are transparent relative heuristics,
// not strength, dimensional-tolerance, impact or failure predictions.
import {measureFeatures} from './features.js';
import {detectHoles,activeHoles} from './holes.js';
import {strengthStatus} from './strength-state.js';
import {schemeLayerRisk,schemeDirections} from './load-scheme.js';
export const AXES = [[1,0,0],[0,1,0],[0,0,1]];
export const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const sub = (a,b) => a.map((v,i)=>v-b[i]);
export const norm = a => Math.hypot(...a);
export const unit = a => {const l=norm(a);return l>1e-12?a.map(v=>v/l):[0,0,1];};
const clamp = (v,a=0,b=1) => Math.max(a,Math.min(b,v));
export function basis(n,yaw=0) {
  n=unit(n); let u=unit(cross(Math.abs(n[2])<.9?[0,0,1]:[0,1,0],n));
  let v=cross(n,u), c=Math.cos(yaw),s=Math.sin(yaw);
  return [u.map((x,i)=>c*x+s*v[i]),v.map((x,i)=>c*x-s*u[i]),n];
}
export const transform = (p,b) => b.map(a=>dot(p,a));
function hull2(points) {
  const p=points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]).filter((p,i,a)=>!i||Math.abs(p[0]-a[i-1][0])+Math.abs(p[1]-a[i-1][1])>1e-7);
  if(p.length<3)return p;
  const turn=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const lower=[],upper=[];
  for(const q of p){while(lower.length>1&&turn(lower.at(-2),lower.at(-1),q)<=0)lower.pop();lower.push(q);}
  for(let i=p.length-1;i>=0;i--){const q=p[i];while(upper.length>1&&turn(upper.at(-2),upper.at(-1),q)<=0)upper.pop();upper.push(q);}
  return lower.slice(0,-1).concat(upper.slice(0,-1));
}
function signedArea(p){let s=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];s+=a[0]*b[1]-b[0]*a[1];}return s/2;}
function clipBelow(p,z){
  const out=[];
  for(let i=0;i<p.length;i++){
    const a=p[i],b=p[(i+1)%p.length],ia=a[2]<=z,ib=b[2]<=z;
    if(ia)out.push(a);
    if(ia!==ib){const t=(z-a[2])/(b[2]-a[2]);out.push(a.map((v,j)=>v+t*(b[j]-v)));}
  }
  return out;
}
export function prepareMesh(positions){
  if(!positions?.length||positions.length%9)throw new Error('В модели нет корректных треугольников.');
  if(positions.length/9>450000)throw new Error('В модели больше 450 000 треугольников. Уменьшите точность экспорта в CAD.');
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<positions.length;i++){if(!Number.isFinite(positions[i]))throw new Error('Некорректные координаты модели.');const a=i%3;min[a]=Math.min(min[a],positions[i]);max[a]=Math.max(max[a],positions[i]);}
  const size=max.map((v,i)=>v-min[i]),diagonal=norm(size);
  if(diagonal<1e-5||size.filter(x=>x>diagonal*1e-6).length<3)throw new Error('Нужна объёмная деталь, а не плоская поверхность.');
  const triangles=[],clusters=[],clusterMap=new Map(),edges=new Map(),eps=Math.max(diagonal*1e-6,1e-6);
  let surface=0,signedVolume=0,centroid=[0,0,0],degenerate=0;
  const key=p=>p.map(v=>Math.round(v/eps)).join(',');
  for(let i=0;i<positions.length;i+=9){
    const p=[Array.from(positions.subarray(i,i+3)),Array.from(positions.subarray(i+3,i+6)),Array.from(positions.subarray(i+6,i+9))];
    const c=cross(sub(p[1],p[0]),sub(p[2],p[0])),a=norm(c)/2;
    if(a<eps*eps){degenerate++;continue;}
    const normal=unit(c),center=p[0].map((v,j)=>(v+p[1][j]+p[2][j])/3);
    triangles.push({p,normal,area:a,center});surface+=a;
    const vol=dot(p[0],cross(p[1],p[2]))/6;signedVolume+=vol;
    for(let j=0;j<3;j++)centroid[j]+=vol*(p[0][j]+p[1][j]+p[2][j])/4;
    const keys=p.map(key);
    for(let j=0;j<3;j++){const x=keys[j],y=keys[(j+1)%3],k=x<y?x+'|'+y:y+'|'+x;const e=edges.get(k)||[0,0];e[0]++;e[1]+=x<y?1:-1;edges.set(k,e);}
    // Fixed bins avoid O(N^2) work for heavily faceted imports.
    const bin=normal.map(v=>Math.round(v*10)).join(',');
    let g=clusterMap.get(bin);
    if(!g){g={bin,vector:[0,0,0],area:0};clusters.push(g);clusterMap.set(bin,g);}
    g.area+=a;for(let j=0;j<3;j++)g.vector[j]+=normal[j]*a;
  }
  let boundaryEdges=0,nonManifold=0,windingErrors=0;
  const boundary=[];
  for(const [key,[count,dir]] of edges){if(count===1){boundaryEdges++;boundary.push({key,dir});}if(count>2)nonManifold++;if(count===2&&dir!==0)windingErrors++;}
  // CAD tessellations can contain a long edge opposite two collinear short
  // edges. Check these geometric seams before calling a closed surface open.
  if(boundary.length&&boundary.length<=1500&&!nonManifold){
    const endpoints=new Map();for(const e of boundary)for(const k of e.key.split('|'))endpoints.set(k,k.split(',').map(Number));
    const pieces=new Map();
    for(const edge of boundary){const [ka,kb]=edge.key.split('|'),a=endpoints.get(ka),b=endpoints.get(kb),ab=sub(b,a),length2=dot(ab,ab);if(!length2)continue;const split=[{t:0,key:ka},{t:1,key:kb}];
      for(const [key,p] of endpoints){if(key===ka||key===kb)continue;const ap=sub(p,a),t=dot(ap,ab)/length2;if(t<=1e-8||t>=1-1e-8)continue;const d2=dot(ap,ap)-t*t*length2;if(d2<=4)split.push({t,key});}
      split.sort((a,b)=>a.t-b.t);for(let i=0;i<split.length-1;i++){const x=split[i].key,y=split[i+1].key;if(x===y)continue;const k=x<y?x+'|'+y:y+'|'+x,p=pieces.get(k)||[0,0];p[0]++;p[1]+=edge.dir*(x<y?1:-1);pieces.set(k,p);}
    }
    boundaryEdges=0;for(const [count,dir] of pieces.values()){if(count===1)boundaryEdges++;if(count>2)nonManifold++;if(count===2&&dir!==0)windingErrors++;}
  }
  const closed=!boundaryEdges&&!nonManifold&&!windingErrors&&Math.abs(signedVolume)>eps**3;
  if(signedVolume<0){for(const t of triangles){[t.p[1],t.p[2]]=[t.p[2],t.p[1]];t.normal=t.normal.map(v=>-v);}for(const g of clusters)g.vector=g.vector.map(v=>-v);}
  centroid=closed?centroid.map(v=>v/signedVolume):min.map((v,i)=>(v+max[i])/2);
  return {triangles,min,max,size,diagonal,surface,volume:closed?Math.abs(signedVolume):null,centroid,closed,boundaryEdges,nonManifold,windingErrors,degenerate,clusters:clusters.sort((a,b)=>b.area-a.area)};
}
export function candidates(mesh){
  const out=[];
  const add=(normal,label)=>{normal=unit(normal);if(!out.some(o=>dot(o.normal,normal)>.998)){out.push({normal,label});}};
  ['X','Y','Z'].forEach((a,i)=>{add(AXES[i],a+' вверх');add(AXES[i].map(v=>-v),a+' вниз');});
  for(const g of mesh.clusters){if(g.area<mesh.surface*.012||out.length>=24)continue;add(unit(g.vector).map(v=>-v),'На плоскую грань');}
  // Explicit tilted candidates help when diagonal placement is a useful compromise.
  for(const n of [[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,0],[-1,1,0]])add(n,'Под углом 45°');
  return out;
}
function evaluateGeometry(mesh,b,settings){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const t of mesh.triangles)for(const p of t.p){const r=transform(p,b);for(let j=0;j<3;j++){min[j]=Math.min(min[j],r[j]);max[j]=Math.max(max[j],r[j]);}}
  const size=max.map((v,i)=>v-min[i]),layer=Math.min(settings.layer||.2,size[2]/3),cut=min[2]+layer;
  let contactSigned=0,overhang=0,projectedOverhang=0,supportEnvelopeVolume=0,stair=0,slopedArea=0,wallSurfaceArea=0,upProjectedArea=0,downProjectedArea=0;const pts=[];
  const overhangLimit=-Math.cos((settings.overhang||45)*Math.PI/180);
  for(const t of mesh.triangles){
    const nz=dot(t.normal,b[2]),z=dot(t.center,b[2]);
    wallSurfaceArea+=t.area*Math.sqrt(Math.max(0,1-nz*nz));
    if(nz>0)upProjectedArea+=t.area*nz;else downProjectedArea-=t.area*nz;
    const levels=t.p.map(p=>dot(p,b[2]));
    if(Math.min(...levels)<=cut){
      const p=t.p.map(p=>transform(p,b)),clipped=clipBelow(p,cut);
      if(clipped.length>=3)contactSigned-=signedArea(clipped);
      if(pts.length<18000)for(const v of clipped)pts.push([v[0],v[1]]);
    }
    if(nz<overhangLimit-1e-6&&z>cut+layer){overhang+=t.area;projectedOverhang+=t.area*Math.abs(nz);supportEnvelopeVolume+=t.area*Math.abs(nz)*(z-cut);}
    const nzabs=Math.abs(nz);
    if(nzabs>.08&&nzabs<.98){slopedArea+=t.area;stair+=t.area*2*nzabs*Math.sqrt(1-nzabs*nzabs);}
  }
  const hull=hull2(pts),hullArea=Math.abs(signedArea(hull)),cm=transform(mesh.centroid,b);
  let margin=Infinity;
  for(let i=0;i<hull.length;i++){const p=hull[i],q=hull[(i+1)%hull.length],dx=q[0]-p[0],dy=q[1]-p[1];margin=Math.min(margin,(dx*(cm[1]-p[1])-dy*(cm[0]-p[0]))/Math.hypot(dx,dy));}
  if(!Number.isFinite(margin)||hull.length<3)margin=-size[2];
  const contact=mesh.closed?Math.max(0,contactSigned):null;
  const areaFraction=contact!==null?clamp(contact/(size[0]*size[1])):clamp(hullArea/(size[0]*size[1]))*.5;
  const slender=size[2]/Math.max(margin>0?margin*2:Math.min(size[0],size[1]),.01);
  const hullFill=contact!==null?clamp(contact/Math.max(hullArea,.01)):.5;
  const stability=clamp(.65*clamp(margin/Math.max(size[2]*.12,1))+.35*clamp(hullFill*2));
  const supports=clamp(projectedOverhang/Math.max(mesh.surface*.14,1));
  const stairRisk=stair/mesh.surface;
  const fit=size.every((v,i)=>v<=(settings.bed?.[i]||256)+1e-5);
  const holeAngles=(settings.detectedHoles||[]).map(h=>({id:h.id,label:h.label,angle:Math.acos(clamp(Math.abs(dot(unit(h.axis),b[2]))))*180/Math.PI}));
  const hole=settings.holeAxis?Math.abs(dot(unit(settings.holeAxis),b[2])):holeAngles.length?holeAngles.reduce((s,h)=>s+Math.cos(h.angle*Math.PI/180),0)/holeAngles.length:null;
  let faceQuality=null;
  if(settings.faces?.length){
    faceQuality=settings.faces.reduce((sum,f)=>{const nz=dot(f.normal,b[2]);return sum+(nz>.93?1:nz<-.3?.15:Math.abs(nz)<.12?.9:.72-.2*Math.abs(nz));},0)/settings.faces.length;
  }
  return {basis:b,min,max,size,contact,hullArea,margin,stability,overhang,overhangFraction:overhang/mesh.surface,projectedOverhang,supportEnvelopeVolume,slender,stairRisk,slopedArea,fit,hole,holeAngles,faceQuality,areaFraction,supports,wallSurfaceArea,upProjectedArea,downProjectedArea};
}
export function scoreOrientation(mesh,normal,settings,material){
  let g;
  for(const yaw of [0,Math.PI/4,Math.PI/2]){
    const next=evaluateGeometry(mesh,basis(normal,yaw),settings);
    // Prefer fit before an efficient rectangular footprint. Never penalize physics for yaw.
    const cost=(next.fit?yaw*.01:1e9+Math.max(next.size[0]/(settings.bed?.[0]||256),next.size[1]/(settings.bed?.[1]||256)));
    if(!g||cost<g.cost)g={...next,cost,yaw};
    if(next.fit&&yaw===0)break;
  }
  const direction=unit(settings.workAxis||[1,0,0]),align=Math.abs(dot(direction,normal));
  const anisotropy=material?.tensile_z&&material?.tensile_xy?clamp(1-material.tensile_z[0]/material.tensile_xy[0],.05,.8):.35;
  const load=settings.loadType||'unknown';
  const directionKnown=strengthStatus(settings).ready;
  const scheme=settings.taskMethod==='scheme'?schemeLayerRisk(settings.loadScheme,normal):null;
  const applicability=directionKnown?(scheme?.alignment!==undefined?1:({tension:1,bending:1,impact:.65}[load]||0)):0;
  // This is a preference score. No stress or ultimate force is inferred from the dot product.
  const layerAlignment=scheme?scheme.alignment:1-align*align;
  const strength=clamp(.32+.68*layerAlignment*(.7+.3*anisotropy));
  const manufacture=clamp(.5*(1-g.supports)+.33*g.stability+.17*(1-clamp(g.slender/6)));
  const accuracyTerms=[[1-g.supports,.30],[g.stability,.20],[1-g.stairRisk,.15],[1-clamp(g.slender/6),.10]];
  if(g.hole!==null)accuracyTerms.push([g.hole,.32]);
  if(g.faceQuality!==null)accuracyTerms.push([g.faceQuality,.27]);
  const accuracy=accuracyTerms.reduce((s,[v,w])=>s+v*w,0)/accuracyTerms.reduce((s,[,w])=>s+w,0);
  const strengthWeight=.78*applicability;
  const structural=(strength*strengthWeight+manufacture*(1-strengthWeight));
  const violations=[];
  if(!g.fit)violations.push('Не помещается в область печати');
  if(settings.holeVertical&&settings.holeAxis){const angle=Math.acos(clamp(Math.abs(dot(unit(settings.holeAxis),unit(normal)))))*180/Math.PI;if(angle>(settings.holeTolerance??10)+.001)violations.push('Ось важных отверстий отклонена от вертикали');}
  if(settings.autoHoles&&settings.holeVertical&&!settings.detectedHoles?.length)violations.push('Для вертикальности не найдены надёжные оси: задайте ось вручную');
  for(const h of settings.detectedHoles||[])if(h.required||settings.holeVertical){const angle=g.holeAngles.find(x=>x.id===h.id)?.angle;if(angle>(settings.holeTolerance??10)+.001)violations.push(h.label+': ось отверстия отклонена от вертикали');}
  if(settings.noSupports&&g.projectedOverhang>Math.max(1,mesh.surface*.001))violations.push('Найдены нависания при условии «без поддержек»');
  for(const [i,f] of (settings.faces||[]).entries()){
    const nz=dot(unit(f.normal),unit(normal)),height=dot(f.point,unit(normal))-g.min[2],onBed=nz<-.999999&&Math.abs(height)<=Math.max(.001,mesh.diagonal*1e-6);
    if(f.rule==='bed'&&!onBed)violations.push('Грань '+(i+1)+' должна лежать на столе');
    if(f.rule==='no-support'&&!onBed&&nz<-Math.cos((settings.overhang||45)*Math.PI/180)&&height>(settings.layer||.2)*2)violations.push('Поддержки могут касаться запрещённой грани '+(i+1));
    if(f.rule==='cosmetic'&&(onBed||nz<-.3))violations.push('Лицевая грань '+(i+1)+' обращена к столу или поддержкам');
  }
  return {...g,normal,align,layerAlignment,scheme,applicability,directionKnown,anisotropy,violations,eligible:violations.length===0,
    scores:{strength:100*clamp(structural),accuracy:100*clamp(accuracy),balanced:100*clamp(structural*.47+accuracy*.43+manufacture*.10)}};
}
export function analyze(positions,settings,material,onProgress=()=>{}){
  const mesh=prepareMesh(positions);onProgress(.02,'Распознаём отверстия');const holeDetection=detectHoles(mesh);
  settings={...settings,detectedHoles:settings.autoHoles?activeHoles(holeDetection.holes,settings.holeEdits):[]};
  const list=candidates(mesh),results=[];
  if(settings.taskMethod==='scheme')for(const direction of schemeDirections(settings.loadScheme))for(const sign of [1,-1]){const normal=direction.map(v=>v*sign);if(!list.some(c=>dot(c.normal,normal)>.9998))list.push({normal,label:'По схеме нагрузки'});}
  for(const f of settings.faces||[])if(f.rule==='bed')list.push({normal:unit(f.normal).map(v=>-v),label:'Заданная опорная грань'});
  if(settings.holeVertical&&settings.holeAxis)for(const sign of [1,-1])list.push({normal:unit(settings.holeAxis).map(v=>v*sign),label:'По оси отверстий'});
  for(const h of settings.detectedHoles)for(const sign of [1,-1]){const normal=h.axis.map(v=>v*sign);if(!list.some(p=>dot(p.normal,normal)>.9998))list.push({normal,label:'По оси '+h.label});}
  if(settings.manualNormal)list.push({normal:unit(settings.manualNormal),label:'Заданный наклон'});
  for(let i=0;i<list.length;i++){const c=list[i];onProgress(.7*i/list.length,c.label);results.push({...scoreOrientation(mesh,c.normal,settings,material),id:'pose-'+i,label:c.label});}
  if(settings.refine!==false){
    const maxExtra=mesh.triangles.length>50000?20:48;let extra=0;
    for(const degrees of [12,4]){
      const seeds=[];for(const mode of ['strength','accuracy','balanced']){const sorted=[...results].sort((a,b)=>(a.eligible?0:1000)-(b.eligible?0:1000)||b.scores[mode]-a.scores[mode]);const seed=sorted[0];if(seed&&!seeds.some(s=>dot(s.normal,seed.normal)>.9999))seeds.push(seed);}
      for(const seed of seeds){const b=basis(seed.normal),a=degrees*Math.PI/180;
        for(const tangent of [b[0],b[0].map(v=>-v),b[1],b[1].map(v=>-v)]){
          if(extra>=maxExtra)break;const normal=unit(seed.normal.map((v,j)=>v*Math.cos(a)+tangent[j]*Math.sin(a)));
          if(results.some(p=>dot(p.normal,normal)>.99998))continue;
          results.push({...scoreOrientation(mesh,normal,settings,material),id:'pose-'+results.length,label:'Уточнение '+degrees+'°'});extra++;
          onProgress(.72+.23*extra/maxExtra,'Уточняем наклон');
        }
      }
    }
  }
  onProgress(.96,'Проверяем толщины');const features=measureFeatures(mesh);
  const rankings={};
  for(const mode of ['strength','accuracy','balanced'])rankings[mode]=results.filter(r=>r.eligible).sort((a,b)=>b.scores[mode]-a.scores[mode]);
  return {features,holeDetection,rejected:results.filter(r=>!r.eligible).map(r=>({id:r.id,label:r.label,violations:r.violations})),mesh:{min:mesh.min,max:mesh.max,size:mesh.size,diagonal:mesh.diagonal,surface:mesh.surface,volume:mesh.volume,centroid:mesh.centroid,closed:mesh.closed,boundaryEdges:mesh.boundaryEdges,nonManifold:mesh.nonManifold,windingErrors:mesh.windingErrors,triangles:mesh.triangles.length},results,rankings,settings};
}
export function orientPositions(positions,pose){
  const result=new Float32Array(positions.length),b=pose.basis,shift=[-(pose.min[0]+pose.max[0])/2,-(pose.min[1]+pose.max[1])/2,-pose.min[2]];
  for(let i=0;i<positions.length;i+=3){const p=[positions[i],positions[i+1],positions[i+2]];for(let j=0;j<3;j++)result[i+j]=dot(p,b[j])+shift[j];}
  return result;
}
export function describePose(p){
  const n=p.normal,axes=['X','Y','Z'],i=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs)));
  return Math.abs(n[i])>.995?`${axes[i]} ${n[i]>0?'вверх':'вниз'}`:`Наклон ${Math.round(Math.acos(clamp(n[2],-1,1))*180/Math.PI)}°`;
}
export function parseDescription(text){
  const s=text.toLowerCase(),loads=[];
  if(/изгиб|сгиба|кронштейн|консоль|полк[аи]|\bbend|\bbracket|\bcantilever|\bshelf/.test(s))loads.push('bending');
  if(/растяж|тян[еу]|тяга|стяжк|\btension|\btensile|\bpull|\bclamp/.test(s))loads.push('tension');
  if(/круч|крутящ|вал\b|момент|\btorsion|\btorque|\btwist|\bshaft/.test(s))loads.push('torsion');
  if(/удар|паде|вибрац|тряск|\bimpact|\bdrop|\bvibrat|\bshock/.test(s))loads.push('impact');
  if(/сжати|сдавли|подпятник|\bcompress|\bsqueeze/.test(s))loads.push('compression');
  const segments=s.split(/[.!?;\n]+/),axisIn=part=>{
    const m=part.match(/(?:вдоль|по\s+оси|ось|along|axis)\s*(?:[а-яёa-z -]{0,45}?\s+)?([xyz])(?=[\s,.;:]|$)/i)||part.match(/(?:вдоль|по\s+оси|ось)\s*([хуз])(?=[\s,.;:]|$)/i);
    const en=part.match(/\b([xyz])\s*axis\b/i);return (m||en)?AXES[{'x':0,'х':0,'y':1,'у':1,'z':2,'з':2}[(m||en)[1].toLowerCase()]]:null;
  };
  let workAxis=null,holeAxis=null;
  for(const part of segments){if(/отверсти|\bhole|\bbore/.test(part)){holeAxis=axisIn(part)||holeAxis;continue;}if(/изгиб|растяж|напряж|работ|нагруз|сжати|круч|\bbend|\btension|\bload|\bwork|\bcompress|\btorsion|\btorque/.test(part))workAxis=axisIn(part)||workAxis;}
  const tags=[];
  if(/улиц|солнц|ультрафиолет|снаружи|\boutdoor|\bsun|\buv\b|\bweather/.test(s))tags.push('outdoor');
  if(/влаг|вод[аеуы]|мокр|сырост|\bmoist|\bwater|\bwet|\brain/.test(s))tags.push('moisture');
  if(/посад|подшипник|втулк|точност|отверсти|\bfit|\bbearing|\bbushing|\baccur|\bhole|\bbore/.test(s))tags.push('fit');
  if(/винт|резьб|втулк|болт|\bscrew|\bthread|\bbolt|\bfastener/.test(s))tags.push('fastener');
  if(/горяч|нагрев|температур|двигател|\bhot|\bheat|\btemperat|\bengine|\bmotor/.test(s))tags.push('heat');
  return {loads:[...new Set(loads)],workAxis,holeAxis,tags};
}
