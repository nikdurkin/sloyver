import * as THREE from './vendor/three.module.js';
import {schemePaths,schemeStatus,schemeSummary,SUPPORTS,supportType} from './load-scheme.js';
import {loadUnits,loadHint,loadLabel,toSI,convertLoad} from './load-units.js';
import {circlePoints} from './circular-features.js';
const axes=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],axisNames=['+X','−X','+Y','−Y','+Z','−Z'];
export function createSchemeUI(api){
 const {$,state,esc,fmt}=api;let visible=true,openLoad=null,openDirectionLoad=null;
 const scheme=()=>state.loadScheme;
 function directionName(d){const i=axes.findIndex(a=>a.every((v,j)=>Math.abs(v-d[j])<.0001));return i>=0?axisNames[i]:'по модели';}
 function methodChanged(){const using=$('taskMethod').value==='scheme';$('schemeControls').hidden=!using;$('axisControls').hidden=using;$('schemeViewBtn').hidden=!using;render();}
 function render(){
  const s=scheme();if(!s)return;const using=$('taskMethod').value==='scheme';$('schemeControls').hidden=!using;$('axisControls').hidden=using;$('schemeViewBtn').hidden=!using;$('schemeViewBtn').setAttribute('aria-pressed',String(visible));
  $('schemeFixtures').innerHTML=s.fixtures.map((f,i)=>`<div class="fixture-row"><span class="fixture-symbol">▣</span><div><strong>Крепление ${i+1}</strong><small>${esc(f.target.label)}</small><label class="fixture-kind"><span>Тип опоры</span><select data-fixture-support="${i}" aria-label="Тип опоры ${i+1}">${Object.entries(SUPPORTS).filter(([key])=>key!=='pin'||f.target.kind!=='face').filter(([key])=>key!=='roller'||f.target.kind==='face').map(([key,value])=>`<option value="${key}" ${supportType(f)===key?'selected':''}>${esc(value.name)}</option>`).join('')}</select></label><small>${esc(SUPPORTS[supportType(f)].hint)}</small></div><button class="icon-btn" data-remove-fixture="${i}" aria-label="Удалить крепление ${i+1}">×</button></div>`).join('')||'<p class="scheme-empty">Пока нет закреплений</p>';
  $('schemeLoads').innerHTML=s.loads.map((l,i)=>`<details class="load-card" data-load-card="${i}" ${i===openLoad?'open':''}><summary><span class="load-symbol ${l.type}">${l.type==='moment'?'↻':'↗'}</span><span><strong>${l.type==='moment'?'Момент':'Сила'} ${i+1} · ${esc(loadLabel(l))}</strong><small>${esc(l.target.label)} · ${directionName(l.direction)}</small></span><span class="disclosure">⌄</span></summary><div class="load-editor"><div class="row"><label class="field"><span>Величина</span><input data-load-value="${i}" type="number" min="0.0000001" max="1000000000000" step="any" value="${l.value}"></label><label class="field"><span>Единица</span><select data-load-unit="${i}">${Object.entries(loadUnits(l.type)).map(([u,v])=>`<option value="${u}" ${l.unit===u?'selected':''}>${v.label}</option>`).join('')}</select></label></div><p class="load-equivalent" data-load-hint="${i}">${esc(loadHint(l.type,l.value,l.unit,l.leverCm))}</p><p class="hint">${l.type==='moment'?'Фиолетовая стрелка показывает направление поворота. Проверьте его на модели.':'Оранжевая стрелка показывает, куда направлена сила. Проверьте её на модели.'}</p><div class="row load-direction-buttons"><button class="btn" data-reverse-load="${i}">Развернуть стрелку</button><button class="btn" data-pick-load-dir="${i}">Указать на модели</button></div><details class="compact-details" data-direction-panel="${i}" ${i===openDirectionLoad?'open':''}><summary>Точное направление и оси</summary>${l.type==='moment'?`<label class="field inline-field"><span>Плечо в подсказке, см</span><input data-load-lever="${i}" type="number" min=".01" max="100000" step="any" value="${l.leverCm}"></label>`:''}<label class="field"><span>${l.type==='moment'?'Ось вращения · правило правой руки':'Куда направлена сила'}</span><select data-load-dir="${i}"><option value="custom" ${directionName(l.direction)==='по модели'?'selected':''}>Выбрано в 3D</option>${axisNames.map((name,j)=>`<option value="${j}" ${directionName(l.direction)===name?'selected':''}>${name} исходной модели</option>`).join('')}<option value="normal-in">${l.type==='moment'?'Против нормали участка':'Внутрь грани / вдоль отверстия'}</option><option value="normal-out">По нормали наружу</option></select></label></details><div class="load-actions"><button class="text-btn" data-replace-load="${i}">Изменить место</button><button class="text-btn danger" data-remove-load="${i}">Удалить нагрузку</button></div></div></details>`).join('')||'<p class="scheme-empty">Пока нет нагрузок</p>';
  for(const details of $('schemeLoads').querySelectorAll('details[data-load-card]'))details.addEventListener('toggle',()=>{if(details.open)openLoad=Number(details.dataset.loadCard);});
  for(const details of $('schemeLoads').querySelectorAll('[data-direction-panel]'))details.addEventListener('toggle',()=>{if(details.open)openDirectionLoad=Number(details.dataset.directionPanel);else if(openDirectionLoad===Number(details.dataset.directionPanel))openDirectionLoad=null;});
  $('addFixtureBtn').disabled=s.fixtures.length>=8||state.busy;$('addForceBtn').disabled=$('addMomentBtn').disabled=s.loads.length>=8||state.busy;
  $('viewModeLabel').textContent=using?'Схема работы · исходные оси':'Положение на столе';
 }
 function add(kind,target){
  const s=scheme();if(kind==='fixture'){
   if(s.fixtures.length>=8)return api.toast('Можно добавить до восьми закреплений.');if(s.fixtures.some(f=>Math.hypot(...f.target.center.map((v,j)=>v-target.center[j]))<.001))return api.toast('Этот участок уже закреплён.');
   s.fixtures.push({id:api.uid(),type:'fixed',target});
  }else{if(s.loads.length>=8)return api.toast('Можно добавить до восьми сценариев.');const type=kind==='moment'?'moment':'force';s.loads.push({id:api.uid(),type,target,direction:target.normal.map(v=>-v),value:type==='moment'?1:100,unit:type==='moment'?'Nm':'N',leverCm:10});openLoad=s.loads.length-1;openDirectionLoad=null;}
  $('taskMethod').value='scheme';api.switchTab('task');api.changed();render();api.redraw();
  if(kind!=='fixture'){$('schemeLoads').lastElementChild?.scrollIntoView({behavior:'smooth',block:'nearest'});$('schemeLoads').lastElementChild?.querySelector('input')?.focus({preventScroll:true});}
  api.toast(kind==='fixture'?'Закрепление добавлено. Теперь задайте место нагрузки.':'Нагрузка добавлена. Укажите величину и проверьте стрелку в 3D.');
 }
 function changed(){api.changed();api.redraw();}
 function direction(index,vector){const l=scheme().loads[index];if(!l)return;const d=Math.hypot(...vector);if(d<.00001)return;l.direction=vector.map(v=>v/d);changed();render();}
 function replace(index,target){if(!scheme().loads[index])return;scheme().loads[index].target=target;openLoad=index;changed();render();}
 function bind(){
  $('taskMethod').addEventListener('change',()=>{methodChanged();api.redraw();});
  $('addFixtureBtn').onclick=()=>api.startPick('fixture');$('addForceBtn').onclick=()=>api.startPick('load-force');$('addMomentBtn').onclick=()=>api.startPick('load-moment');
  $('schemeViewBtn').onclick=()=>{visible=!visible;render();api.redraw();};
  $('schemeFixtures').onclick=e=>{const b=e.target.closest('[data-remove-fixture]');if(b){scheme().fixtures.splice(Number(b.dataset.removeFixture),1);changed();render();}};
  $('schemeFixtures').onchange=e=>{const input=e.target;if(input.dataset.fixtureSupport===undefined)return;const f=scheme().fixtures[Number(input.dataset.fixtureSupport)];if(!f||!Object.hasOwn(SUPPORTS,input.value))return;f.support=input.value;changed();render();};
  $('schemeLoads').onclick=e=>{const b=e.target.closest('button');if(!b)return;for(const [key,action] of [['reverseLoad',i=>direction(i,scheme().loads[i].direction.map(v=>-v))],['removeLoad',i=>{scheme().loads.splice(i,1);openLoad=null;openDirectionLoad=null;changed();render();}],['pickLoadDir',i=>api.startPick('load-direction',i)],['replaceLoad',i=>api.startPick('replace-load',i)]])if(b.dataset[key]!==undefined){action(Number(b.dataset[key]));return;}};
  $('schemeLoads').onchange=e=>{const t=e.target;let i,l;try{
   if(t.dataset.loadValue!==undefined){i=Number(t.dataset.loadValue);l=scheme().loads[i];toSI(t.valueAsNumber,l.unit,l.type);l.value=t.valueAsNumber;}
   else if(t.dataset.loadUnit!==undefined){i=Number(t.dataset.loadUnit);l=scheme().loads[i];l.value=convertLoad(l.value,l.unit,t.value,l.type);l.unit=t.value;}
   else if(t.dataset.loadLever!==undefined){i=Number(t.dataset.loadLever);l=scheme().loads[i];if(!Number.isFinite(t.valueAsNumber)||t.valueAsNumber<=0||t.valueAsNumber>100000)throw new Error('Укажите плечо от 0 до 100 000 см.');l.leverCm=t.valueAsNumber;}
   else if(t.dataset.loadDir!==undefined){i=Number(t.dataset.loadDir);l=scheme().loads[i];if(t.value==='custom')return api.startPick('load-direction',i);l.direction=t.value==='normal-in'?l.target.normal.map(v=>-v):t.value==='normal-out'?[...l.target.normal]:axes[Number(t.value)];}
   else return;openLoad=i;changed();render();
  }catch(error){api.toast(error.message,true);render();}};
  $('schemeLoads').oninput=e=>{const t=e.target,isValue=t.dataset.loadValue!==undefined,isLever=t.dataset.loadLever!==undefined;if(!isValue&&!isLever)return;const i=Number(isValue?t.dataset.loadValue:t.dataset.loadLever),l=scheme().loads[i],hint=$('schemeLoads').querySelector(`[data-load-hint="${i}"]`);try{if(isValue){toSI(t.valueAsNumber,l.unit,l.type);l.value=t.valueAsNumber;}else{if(!Number.isFinite(t.valueAsNumber)||t.valueAsNumber<=0||t.valueAsNumber>100000)throw new Error('Укажите положительное плечо.');l.leverCm=t.valueAsNumber;}hint.textContent=loadHint(l.type,l.value,l.unit,l.leverCm);hint.classList.remove('invalid');t.removeAttribute('aria-invalid');const title=t.closest('.load-card').querySelector('summary strong');title.textContent=(l.type==='moment'?'Момент':'Сила')+' '+(i+1)+' · '+loadLabel(l);api.changed();api.redraw();}catch{hint.textContent=isValue?'Введите положительную величину.':'Введите положительное плечо.';hint.classList.add('invalid');t.setAttribute('aria-invalid','true');}};

 }
 const world=p=>new THREE.Vector3(...p).applyMatrix4(api.matrix());
 function drawCPU(ctx,project){if(!visible||$('taskMethod').value!=='scheme')return;const s=scheme(),size=api.size(),arrowLength=Math.max(...size)*.24,screen=p=>project(world(p).toArray());
  const line=(a,b,color,dash=[])=>{const x=screen(a),y=screen(b);ctx.beginPath();ctx.setLineDash(dash);ctx.moveTo(x[0],x[1]);ctx.lineTo(y[0],y[1]);ctx.strokeStyle=color;ctx.lineWidth=1.6;ctx.stroke();ctx.setLineDash([]);};
  const arrow=(a,b,color)=>{line(a,b,color);const x=screen(a),y=screen(b),angle=Math.atan2(y[1]-x[1],y[0]-x[0]);ctx.beginPath();ctx.moveTo(y[0],y[1]);ctx.lineTo(y[0]-9*Math.cos(angle-.4),y[1]-9*Math.sin(angle-.4));ctx.lineTo(y[0]-9*Math.cos(angle+.4),y[1]-9*Math.sin(angle+.4));ctx.closePath();ctx.fillStyle=color;ctx.fill();};
  const text=(p,label,color)=>{const [x,y,z]=screen(p);if(z< -1||z>1)return;ctx.font='600 11px Segoe UI, Arial';ctx.fillStyle='rgba(255,255,255,.9)';ctx.fillRect(x+7,y-18,ctx.measureText(label).width+10,19);ctx.fillStyle=color;ctx.fillText(label,x+12,y-5);};
  for(const p of schemePaths(s)){line(p.fixture,p.point,'#438db980',[4,5]);}
  for(const [t,color] of [...s.fixtures.map(f=>[f.target,'#278bb3']),...s.loads.map(l=>[l.target,l.type==='moment'?'#a469dc':'#dc8b31'])])if(t.radius){for(const sign of t.length?[-1,1]:[0]){const center=t.center.map((v,j)=>v+sign*(t.length||0)*t.normal[j]/2),ps=circlePoints({center,normal:t.normal,radius:t.radius});for(let i=0;i<ps.length;i++)line(ps[i],ps[(i+1)%ps.length],color);}}
  for(const [i,f] of s.fixtures.entries()){const p=screen(f.target.center);ctx.fillStyle='#278bb3';ctx.fillRect(p[0]-5,p[1]-5,10,10);text(f.target.center,'К'+(i+1),'#17799e');}
  for(const [i,l] of s.loads.entries()){
   const color=l.type==='moment'?'#a469dc':'#dc8b31',o=l.target.center;
   if(l.type==='force'){const end=o.map((v,j)=>v+l.direction[j]*arrowLength);arrow(o,end,color);text(end,'F'+(i+1)+' · '+loadLabel(l),color);}
   else{const c={center:o,normal:l.direction,radius:arrowLength*.34},ps=circlePoints(c,40).slice(0,34);for(let j=1;j<ps.length-1;j++)line(ps[j-1],ps[j],color);arrow(ps.at(-2),ps.at(-1),color);text(o,'M'+(i+1)+' · '+loadLabel(l),color);}
  }
 }
 function addHelpers(group){if(!visible||$('taskMethod').value!=='scheme')return;const s=scheme(),length=Math.max(...api.size())*.24;
  for(const p of schemePaths(s)){const g=new THREE.BufferGeometry().setFromPoints([world(p.fixture),world(p.point)]),line=new THREE.Line(g,new THREE.LineDashedMaterial({color:0x438db9,dashSize:length*.08,gapSize:length*.05,transparent:true,opacity:.5,depthTest:false}));line.computeLineDistances();group.add(line);}
  for(const [t,color] of [...s.fixtures.map(f=>[f.target,0x278bb3]),...s.loads.map(l=>[l.target,l.type==='moment'?0xa469dc:0xdc8b31])])if(t.radius){for(const sign of t.length?[-1,1]:[0]){const center=t.center.map((v,j)=>v+sign*(t.length||0)*t.normal[j]/2),points=circlePoints({center,normal:t.normal,radius:t.radius}).map(world);group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,depthTest:false})));}}
  for(const f of s.fixtures){const m=new THREE.Mesh(new THREE.BoxGeometry(length*.08,length*.08,length*.08),new THREE.MeshBasicMaterial({color:0x278bb3,depthTest:false}));m.position.copy(world(f.target.center));group.add(m);}
  for(const l of s.loads){const color=l.type==='moment'?0xa469dc:0xdc8b31,o=world(l.target.center),d=new THREE.Vector3(...l.direction).transformDirection(api.matrix());
   if(l.type==='force')group.add(new THREE.ArrowHelper(d,o,length,color,length*.12,length*.06));
   else{const points=circlePoints({center:l.target.center,normal:l.direction,radius:length*.34},40).slice(0,34).map(world);group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,depthTest:false})));const end=points.at(-1),start=points.at(-2);group.add(new THREE.ArrowHelper(end.clone().sub(start).normalize(),start,end.distanceTo(start),color,length*.09,length*.045));}
  }
 }
 function text(){const s=scheme();return `Схема опор и нагрузок: ${schemeSummary(s)}\n${s.fixtures.map((f,i)=>`Закрепление ${i+1}: ${f.target.label}; центр ${f.target.center.map(v=>fmt(v,3)).join('; ')} мм; ${SUPPORTS[supportType(f)].name}`).join('\n')}\n${s.loads.map((l,i)=>`${l.type==='moment'?'Момент':'Сила'} ${i+1}: ${loadLabel(l)}; ${l.target.label}; направление ${l.direction.map(v=>fmt(v,3)).join('; ')}. ${loadHint(l.type,l.value,l.unit,l.leverCm)}`).join('\n')}\nВ быстром подборе используются прямые условные пути и отдельные сценарии. Поля напряжений и перемещений находятся в разделе «Проверить деталь».`;}
 function validate(){for(const input of $('schemeLoads').querySelectorAll('[data-load-value],[data-load-lever]'))if(input.getAttribute('aria-invalid')==='true')throw new Error('Проверьте положительные величины нагрузок и плечо в подсказке.');}
 return {validate,bind,render,methodChanged,add,direction,replace,drawCPU,addHelpers,text,get visible(){return visible;}};
}
