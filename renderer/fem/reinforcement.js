export function validateRegions(raw){
 if(raw==null)return [];
 if(!Array.isArray(raw)||raw.length>8)throw new Error('Допускается до восьми локальных зон усиления.');
 const ids=new Set();
 return raw.map((r,i)=>{
  if(!r||!Array.isArray(r.center)||!Array.isArray(r.size)||r.center.length!==3||r.size.length!==3||r.center.some(v=>!Number.isFinite(v)||Math.abs(v)>1e7)||r.size.some(v=>!Number.isFinite(v)||v<=0||v>1e6))throw new Error('Некорректные размеры локального усиления.');
  const id=String(r.id||'zone-'+i).slice(0,80);if(ids.has(id))throw new Error('Повторяющийся идентификатор усиления.');ids.add(id);
  // Legacy projects may contain a wall override. Ignore it: changing wall
  // loops on a modifier makes Bambu create perimeters along the box boundary.
  return {id,name:String(r.name||'Усиление '+(i+1)).slice(0,100),shape:'box',center:[...r.center],size:[...r.size],infill:100,enabled:r.enabled!==false,reason:String(r.reason||'').slice(0,500)};
 });
}
export function elementCenter(mesh,e){const k=mesh.active[e],p=[k%mesh.dims[0],Math.floor(k/mesh.dims[0])%mesh.dims[1],Math.floor(k/(mesh.dims[0]*mesh.dims[1]))];return p.map((v,j)=>mesh.min[j]+(v+.5)*mesh.spacing[j]);}

// Exact union of axis-aligned modifier boxes clipped to one voxel. Empty CAD
// space stays empty: this function is evaluated only for existing CAD voxels.
export function regionCoverage(center,spacing,raw){
 const lo=center.map((v,j)=>v-spacing[j]/2),hi=center.map((v,j)=>v+spacing[j]/2),boxes=[];
 for(const r of raw){if(!r.enabled)continue;const a=r.center.map((v,j)=>Math.max(lo[j],v-r.size[j]/2)),b=r.center.map((v,j)=>Math.min(hi[j],v+r.size[j]/2));if(a.some((v,j)=>v>=b[j]))continue;if(a.every((v,j)=>v===lo[j]&&b[j]===hi[j]))return 1;boxes.push({a,b});}
 if(!boxes.length)return 0;
 const cuts=[0,1,2].map(j=>[...new Set([lo[j],hi[j],...boxes.flatMap(b=>[b.a[j],b.b[j]])])].sort((a,b)=>a-b));let volume=0;
 for(let x=1;x<cuts[0].length;x++)for(let y=1;y<cuts[1].length;y++)for(let z=1;z<cuts[2].length;z++){
  const indices=[x,y,z],p=indices.map((n,j)=>(cuts[j][n]+cuts[j][n-1])/2);
  if(boxes.some(b=>p.every((v,j)=>v>b.a[j]&&v<b.b[j])))volume+=indices.reduce((product,n,j)=>product*(cuts[j][n]-cuts[j][n-1]),1);
 }
 return Math.min(1,Math.max(0,volume/spacing.reduce((a,b)=>a*b,1)));
}

const edges=r=>({lo:r.center.map((v,j)=>v-r.size[j]/2),hi:r.center.map((v,j)=>v+r.size[j]/2)});
function boxFromBounds(region,lo,hi){return {...region,center:lo.map((v,j)=>(v+hi[j])/2),size:hi.map((v,j)=>v-lo[j])};}
function clippedBox(region,bounds){
 if(!bounds)return region;
 const {lo,hi}=edges(region),padding=bounds.spacing||[0,0,0];
 if(lo.some((v,j)=>v>bounds.min[j]+bounds.size[j]+padding[j]/2||hi[j]<bounds.min[j]-padding[j]/2))return region;
 for(let j=0;j<3;j++){
  const minimum=bounds.min[j]-padding[j]/2,maximum=bounds.min[j]+bounds.size[j]+padding[j]/2,width=Math.min(hi[j]-lo[j],maximum-minimum);
  // Shift edge-centred regions inward to retain the requested width. Simply
  // intersecting the bounds could make an enlarged old box appear smaller.
  lo[j]=Math.max(minimum,Math.min(lo[j],maximum-width));hi[j]=lo[j]+width;
 }
 return boxFromBounds(region,lo,hi);
}

export function mergeRegions(raw,{gap=0}={}){
 // Work in batches so an old project plus new proposals can be merged before
 // enforcing the final eight-region limit. Disabled regions remain untouched.
 if(!Array.isArray(raw)||raw.length>16)throw new Error('Слишком много зон усиления.');
 const zones=raw.flatMap((r,i)=>validateRegions([{...r,id:r?.id||'zone-'+i}]));
 if(new Set(zones.map(r=>r.id)).size!==zones.length)throw new Error('Повторяющийся идентификатор усиления.');
 for(let i=0;i<zones.length;i++)for(let j=i+1;j<zones.length;j++){
  if(!zones[i].enabled||!zones[j].enabled)continue;
  const a=edges(zones[i]),b=edges(zones[j]);
  if(a.lo.every((v,k)=>v<=b.hi[k]+gap&&b.lo[k]<=a.hi[k]+gap)){
   zones[i]=boxFromBounds(zones[i],a.lo.map((v,k)=>Math.min(v,b.lo[k])),a.hi.map((v,k)=>Math.max(v,b.hi[k])));zones.splice(j,1);i=-1;break;
  }
 }
 return validateRegions(zones);
}

export function enlargeRegions(raw,factor=1.5,bounds=null){
 if(!Number.isFinite(factor)||factor<1||factor>4)throw new Error('Коэффициент увеличения должен быть от 1 до 4.');
 return mergeRegions(validateRegions(raw).map(r=>r.enabled?clippedBox({...r,size:r.size.map(v=>v*factor)},bounds):r));
}

export function suggestReinforcement(result,values,{maxZones=3}={}){
 if(maxZones<1)return {zones:[],reason:'Достигнут предел восьми зон. Измените существующие зоны.'};
 if(!values?.length||!values.some(v=>v>0))return {zones:[],reason:'Нет нагруженных элементов для выбора усиления.'};
 if(result.fullSolid||result.structure?.parameters?.infill===100)return {zones:[],reason:'Сечение уже рассчитывается сплошным. Заполнение 100% его не усилит: рассмотрите большее сечение, ребро, скругление, другую ориентацию или материал.'};
 const factors=result.structure?.factors;if(!factors)return {zones:[],reason:'Для локального заполнения выберите расчёт оболочки и заполнения.'};
 const {mesh}=result,count=mesh.active.length;let peak=0;for(const value of values)if(Number.isFinite(value))peak=Math.max(peak,value);
 if(!peak)return {zones:[],reason:'Нет нагруженных элементов для выбора усиления.'};
 const threshold=peak*.35,seen=new Uint8Array(count),queue=new Int32Array(count),clusters=[],strides=[1,mesh.dims[0],mesh.dims[0]*mesh.dims[1]];
 // Enclose connected loaded regions rather than placing small boxes at three
 // isolated peak elements. This covers the loaded section and its transition.
 for(let seed=0;seed<count;seed++){
  if(seen[seed]||!Number.isFinite(values[seed])||values[seed]<threshold)continue;
  let head=0,tail=1,weight=0;queue[0]=seed;seen[seed]=1;const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  while(head<tail){
   const e=queue[head++],key=mesh.active[e],p=elementCenter(mesh,e),cell=[key%mesh.dims[0],Math.floor(key/mesh.dims[0])%mesh.dims[1],Math.floor(key/(mesh.dims[0]*mesh.dims[1]))];
   weight+=values[e];for(let j=0;j<3;j++){lo[j]=Math.min(lo[j],p[j]-mesh.spacing[j]/2);hi[j]=Math.max(hi[j],p[j]+mesh.spacing[j]/2);}
   for(let j=0;j<3;j++)for(const sign of [-1,1]){if(cell[j]+sign<0||cell[j]+sign>=mesh.dims[j])continue;const next=mesh.lookup[key+sign*strides[j]];if(next<0||seen[next]||!Number.isFinite(values[next])||values[next]<threshold)continue;seen[next]=1;queue[tail++]=next;}
  }
  clusters.push({seed,lo,hi,weight});
 }
 clusters.sort((a,b)=>b.weight-a.weight);const candidates=[],shell=Math.max(result.structure.parameters.wallThickness,result.structure.parameters.topThickness,result.structure.parameters.bottomThickness);
 for(const cluster of clusters.slice(0,Math.max(12,maxZones*4))){
  const lo=[],hi=[];
  for(let j=0;j<3;j++){
   const padding=Math.max(mesh.spacing[j]*3,shell*2,mesh.size[j]*.06,2),center=(cluster.lo[j]+cluster.hi[j])/2,width=Math.max(cluster.hi[j]-cluster.lo[j]+2*padding,mesh.spacing[j]*10,mesh.size[j]*.22,8);
   lo[j]=center-width/2;hi[j]=center+width/2;
   if(width>=mesh.size[j]*.65){lo[j]=mesh.min[j]-mesh.spacing[j]/2;hi[j]=mesh.min[j]+mesh.size[j]+mesh.spacing[j]/2;}
  }
  const zone=clippedBox(boxFromBounds({id:'reinforce-'+cluster.seed,name:'Локальное усиление '+(candidates.length+1),shape:'box',infill:100,enabled:true,reason:'Нагруженная область охвачена с запасом. Меняется только заполнение до 100%; эффект нужно проверить повторным расчётом.'},lo,hi),mesh);
  let soft=0,total=0;
  for(let e=0;e<count;e++){const p=elementCenter(mesh,e);if(p.every((v,j)=>Math.abs(v-zone.center[j])<=zone.size[j]/2)){total++;if(factors[e]<.98)soft++;}}
  if(total&&soft/total>=.04)candidates.push(zone);
 }
 const zones=mergeRegions(candidates.slice(0,8),{gap:Math.max(...mesh.spacing)*2}).slice(0,maxZones);
 return zones.length?{zones,reason:'Усиление охватывает нагруженную область с запасом. Близкие зоны объединены; внутри меняется только заполнение до 100%.'}:{zones:[],reason:'Нагруженный участок уже почти сплошной. Увеличение заполнения здесь мало поможет: сравните ориентации, переходы сечений и материал.'};
}

export function boxTriangles(region){
 const c=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]],faces=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[3,7,6],[3,6,2],[0,4,7],[0,7,3],[1,2,6],[1,6,5]];
 return new Float32Array(faces.flatMap(f=>f.flatMap(i=>c[i].map((v,j)=>region.center[j]+(v-.5)*region.size[j]))));
}
