import * as THREE from './vendor/three.module.js';
import {detectCircularEdges,circlePoints,circleThroughPoints,restoreManualCircles} from './circular-features.js';
export function createCirclePicker(api){
 const {$,state,esc,fmt}=api;let detected=[],hovered=null,selected=null,revision=0,lastMove=0;
 const all=()=>[...detected,...(state.manualCircles||[])];
 function rebuild(){detected=detectCircularEdges(state.positions);hovered=selected=null;revision++;renderList();renderSelection();}
 function clear(){hovered=selected=null;revision++;$('circleTooltip').hidden=true;renderSelection();api.redraw();}
 function renderSelection(){const p=$('featureActions');p.hidden=!selected;for(const details of p.querySelectorAll('details'))details.open=false;if(selected)$('featureSelectedLabel').textContent=`${selected.label} · Ø ${fmt(selected.radius*2,2)} мм`;}
 function renderList(){$('manualCircleList').innerHTML=(state.manualCircles||[]).map((c,i)=>`<div class="manual-circle-row"><button class="text-btn" data-manual-circle="${i}">${esc(c.label)} · Ø ${fmt(c.radius*2,2)} мм</button><button class="icon-btn" data-remove-circle="${i}" aria-label="Удалить ручную окружность">×</button></div>`).join('');}
 function select(c){selected=c;hovered=null;revision++;$('circleTooltip').hidden=true;renderSelection();api.redraw();}
 function circleAt(event){
  if(!api.model()||!api.camera())return null;const rect=api.canvas().getBoundingClientRect(),mouse=[event.clientX-rect.left,event.clientY-rect.top],camera=api.camera(),matrix=api.model().matrixWorld;
  camera.updateMatrixWorld();let best=null;
  const project=p=>{const world=new THREE.Vector3(...p).applyMatrix4(matrix),v=world.clone().project(camera);return {x:(v.x+1)*rect.width/2,y:(1-v.y)*rect.height/2,z:v.z,world};};
  for(const c of all()){
   const center=project(c.center);if(center.z< -1||center.z>1)continue;
   const ps=circlePoints(c,32).map(project),radius=Math.max(...ps.map(p=>Math.hypot(p.x-center.x,p.y-center.y)));if(radius<4)continue;
   let distance=Math.hypot(center.x-mouse[0],center.y-mouse[1]),closest=ps[0];
   if(distance>9){distance=Infinity;for(let i=0;i<ps.length;i++){const a=ps[i],b=ps[(i+1)%ps.length],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((mouse[0]-a.x)*dx+(mouse[1]-a.y)*dy)/(dx*dx+dy*dy||1))),d=Math.hypot(mouse[0]-a.x-t*dx,mouse[1]-a.y-t*dy);if(d<distance){distance=d;closest=a;}}}
   if(distance>9)continue;
   // A back rim must not snap through an opaque face. Test visible rim samples;
   // the center itself may be empty (a through hole).
   const samples=[closest,...ps.filter((_,i)=>i%8===0)],ray=new THREE.Raycaster();let visible=false;
   for(const p of samples){ray.setFromCamera(new THREE.Vector2(p.x/rect.width*2-1,-p.y/rect.height*2+1),camera);const hit=ray.intersectObject(api.model())[0],targetDistance=p.world.clone().sub(ray.ray.origin).dot(ray.ray.direction);if(!hit||hit.distance>=targetDistance-Math.max(c.radius*.03,.02)){visible=true;break;}}
   if(!visible)continue;const score=distance+center.z*.25;if(!best||score<best.score)best={c,score};
  }
  return best?.c||null;
 }
 function move(e){if(performance.now()-lastMove<60)return;lastMove=performance.now();if(api.busy()||!api.allowHover()){if(hovered){hovered=null;revision++;api.redraw();}$('circleTooltip').hidden=true;return;}
  const c=circleAt(e);if(hovered?.id!==c?.id){hovered=c;revision++;api.redraw();}const tip=$('circleTooltip');tip.hidden=!c;if(!c)return;
  const r=$('viewport').getBoundingClientRect();tip.style.left=Math.min(e.clientX-r.left+16,Math.max(8,r.width-246))+'px';tip.style.top=Math.min(e.clientY-r.top+12,Math.max(50,r.height-102))+'px';
  tip.innerHTML=`<strong>${esc(c.label)} · Ø ${fmt(c.radius*2,2)} мм</strong><span>Центр: ${c.center.map(v=>fmt(v,2)).join('; ')} мм</span><small>Щёлкните, чтобы выбрать окружность</small>`;
 }
 function leave(){if(hovered){hovered=null;revision++;api.redraw();}$('circleTooltip').hidden=true;}
 function target(c){
  const holes=state.analysis?.holeDetection?.holes||[];const h=holes.find(h=>Math.abs(new THREE.Vector3(...h.axis).dot(new THREE.Vector3(...c.normal)))>.995&&Math.abs(h.radius-c.radius)<Math.max(.08,c.radius*.04)&&new THREE.Vector3(...c.center).sub(new THREE.Vector3(...h.center)).cross(new THREE.Vector3(...h.axis)).length()<Math.max(.08,c.radius*.04));
  if(h)return {kind:'hole',center:[...h.center],normal:[...h.axis],radius:h.radius,length:h.length,label:`${h.label} · Ø ${fmt(h.diameter,2)} мм`,featureId:c.id};
  return {kind:'circle',center:[...c.center],normal:[...c.normal],radius:c.radius,label:`${c.label} · Ø ${fmt(c.radius*2,2)} мм`,featureId:c.id};
 }
 function addThree(points){const circle=circleThroughPoints(...points);const restored=restoreManualCircles([...(state.manualCircles||[]),circle]);state.manualCircles=restored;renderList();select(restored.at(-1));api.changed();api.toast('Ручная окружность выделена. Проверьте диаметр и назначьте её роль.');}
 function drawCPU(ctx,project,matrix){
  for(const [c,color] of [[hovered,'#29b9e7'],[selected,'#e0a124']]){if(!c)continue;const ps=circlePoints(c).map(p=>project(new THREE.Vector3(...p).applyMatrix4(matrix).toArray()));ctx.beginPath();ps.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p[0],p[1]));ctx.closePath();ctx.strokeStyle=color;ctx.lineWidth=2.5;ctx.stroke();const p=project(new THREE.Vector3(...c.center).applyMatrix4(matrix).toArray());ctx.beginPath();ctx.moveTo(p[0]-6,p[1]);ctx.lineTo(p[0]+6,p[1]);ctx.moveTo(p[0],p[1]-6);ctx.lineTo(p[0],p[1]+6);ctx.stroke();}
 }
 function addHelpers(group,matrix){for(const [c,color] of [[hovered,0x29b9e7],[selected,0xe0a124]]){if(!c)continue;const points=circlePoints(c).map(p=>new THREE.Vector3(...p).applyMatrix4(matrix));group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,depthTest:false})));const r=c.radius*.06,center=new THREE.Vector3(...c.center).applyMatrix4(matrix),s=new THREE.Mesh(new THREE.SphereGeometry(r,10,8),new THREE.MeshBasicMaterial({color,depthTest:false}));s.position.copy(center);group.add(s);}}
 function bind(){
  $('selectCircleBtn').onclick=()=>api.startPick('circle');$('circleThreeBtn').onclick=()=>api.startPick('circle-three');
  $('featureActions').onclick=e=>{const action=e.target.closest('[data-feature-action]')?.dataset.featureAction;if(!action)return;if(action==='clear')return clear();if(!selected)return;api.action(action,target(selected),selected);if(['fixture','force','moment'].includes(action))clear();};
  $('manualCircleList').onclick=e=>{const pick=e.target.closest('[data-manual-circle]'),remove=e.target.closest('[data-remove-circle]');if(pick)select(state.manualCircles[Number(pick.dataset.manualCircle)]);if(remove){const i=Number(remove.dataset.removeCircle);state.manualCircles.splice(i,1);clear();renderList();api.changed();}};
 }
 return {bind,rebuild,clear,select,circleAt,move,leave,target,addThree,renderList,drawCPU,addHelpers,get revision(){return revision;},get selected(){return selected;}};
}
