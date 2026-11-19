import {nextGuideAction,guideTaskHint} from './guided-state.js';

export function createGuidedUI(api){
 const {$,state,toast}=api;let step='model';
 const inputs=document.querySelector('.inputs'),result=$('recommendation');
 const copy={model:['Ваша деталь','Загрузите модель и расскажите, для чего нужна деталь.'],task:['Как работает деталь','Покажите на модели, где она держится и что на неё действует.'],print:['Рекомендации','Проверьте результат и сохраните файл для печати.']};
 function hasModel(){return !!state.positions?.length;}
 function sync(){
  const has=hasModel(),s=state.loadScheme||{fixtures:[],loads:[]};
  document.body.dataset.guideStep=step;document.body.dataset.hasModel=String(has);document.body.dataset.guideBusy=String(!!state.busy);inputs.inert=!!state.busy;$('guideResultScroll').inert=!!state.busy;result.setAttribute('aria-busy',String(!!state.busy));
  inputs.hidden=step==='print';result.hidden=step!=='print';
  for(const b of document.querySelectorAll('[data-tab]')){
   const active=b.dataset.tab===step;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));if(active)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');b.disabled=state.busy||(!has&&b.dataset.tab!=='model');
  }
  for(const t of ['model','task','print'])$('tab-'+t).hidden=t!==step;
  $('inputPanelTitle').textContent=copy[step][0];$('guideStepDescription').textContent=copy[step][1];
  $('guideNext').hidden=step!=='model';$('analyzeBtn').hidden=step!=='task';$('guideSkip').hidden=step!=='task';$('guideBack').hidden=step!=='task';
  for(const id of ['guideNext','analyzeBtn','guideSkip','guideBack','guideRefresh','guideEditTask','guideEditModel'])$(id).disabled=state.busy||!has;
  $('guideExample').disabled=state.busy;$('guideEmptyExample').disabled=state.busy;$('guideEmptyOpen').disabled=state.busy;
  $('guideTaskHint').textContent=guideTaskHint(s.fixtures.length,s.loads.length);
  $('guideViewerHint').textContent=!has?'Загрузите файл или попробуйте готовый пример.':step==='model'?'Проверьте форму и размеры. Модель можно вращать мышью.':step==='task'?guideTaskHint(s.fixtures.length,s.loads.length):api.femActive()?'Цвет показывает нагруженные участки. Нажмите «Показать возможное слабое место», чтобы приблизить его.':'Так деталь предлагается расположить на столе принтера.';
  $('guideRefreshBox').hidden=!has||!state.dirty;
  $('guideEmpty').hidden=has;$('guidePrintSettings').hidden=false;$('guideMaterialRecheck').hidden=!api.femActive();if(step==='task'&&$('taskMethod').value==='axis')document.querySelector('.guide-task-method').open=true;
  const printer=$('printerProfile').selectedOptions[0]?.textContent||'General',material=api.material()?.name||'';
  $('guideSettingsSummary').textContent=printer+' · '+material;
  $('guideNext').textContent='Далее: как работает деталь';
  const action=nextGuideAction({hasModel:has,busy:state.busy,fixtures:s.fixtures.length,loads:s.loads.length,method:$('taskMethod').value});
  $('analyzeBtn').textContent=$('taskMethod').value==='scheme'?'Проверить и получить рекомендации':'Получить рекомендации';$('analyzeBtn').disabled=state.busy||!has||['fixture','load'].includes(action.action);$('guideTaskProgress').hidden=step!=='task';
  $('guideTaskProgress').textContent=s.fixtures.length&&s.loads.length?'Закрепления и нагрузки заданы':s.fixtures.length?'Закрепление задано · добавьте нагрузку':s.loads.length?'Нагрузка задана · добавьте закрепление':'Можно задать нагрузку или пропустить этот шаг';
  $('guideHelpBtn').disabled=state.busy;$('exportProjectBtn').disabled=state.busy||!has;
  $('viewModeLabel').textContent=step==='task'?'Закрепления и нагрузки':api.femActive()?'Проверка под нагрузкой':step==='model'?'Предпросмотр детали':'Положение для печати';
  const legend=document.querySelector('.viewer-bottom .legend');if(legend)legend.innerHTML=step==='task'?'<span><i class="blue"></i>Крепление</span><span><i class="orange"></i>Нагрузка</span>':'<span><i class="green"></i>Первый слой</span><span><i class="orange"></i>Нависания</span><span><i class="blue"></i>Важная грань</span>';
 }
 function go(next,{focus=true}={}){
  if(!['model','task','print'].includes(next))return;
  if(state.busy)return toast('Дождитесь завершения текущей операции.');
  if(next!=='model'&&!hasModel())return toast('Сначала загрузите модель или откройте пример.');
  if(next!=='print')api.hideResult();
  api.cancelPick();step=next;
  if(next==='task'&&$('taskMethod').value!=='scheme'&&state.loadScheme?.fixtures.length===0&&state.loadScheme?.loads.length===0){
   // Preserve an explicitly configured legacy working-axis scenario.
   if(!$('directionConfirmed').checked){$('taskMethod').value='scheme';api.changed?.();api.schemeRender();}
  }
  sync();api.redraw?.();if(focus){const target=next==='print'?$('resultPanelTitle'):$('inputPanelTitle');target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}
 }
 async function finish(skip=false){
  const s=state.loadScheme||{fixtures:[],loads:[]},decision=nextGuideAction({hasModel:hasModel(),busy:state.busy,fixtures:s.fixtures.length,loads:s.loads.length,method:$('taskMethod').value,skip});
  if(decision.action==='wait')return;
  if(decision.action==='model')return toast('Сначала загрузите модель или откройте пример.');
  if(['fixture','load'].includes(decision.action)){
   const el=$(decision.action==='fixture'?'addFixtureBtn':'addForceBtn');el.focus();el.scrollIntoView({block:'nearest'});
   return toast(decision.action==='fixture'?'Покажите, где деталь закреплена.':'Добавьте нагрузку или выберите «Пока без проверки нагрузки».');
  }
  if(!api.current()){const ok=await api.analyze();if(!ok)return;}
  go('print');
  if(decision.action==='check')api.setupCheck();
 }
 async function openPrint(){if(state.busy)return;if(!api.current()){if(!hasModel())return;const ok=await api.analyze();if(!ok)return;}go('print');}
 function showHelp(){
  api.modal('Первые шаги',`<div class="first-steps"><p class="guide-intro">Слойвер помогает выбрать, как печатать деталь. Начните с готовой 3D-модели.</p><section><b>1</b><div><h3>Загрузите деталь</h3><p>Подойдёт файл STEP, STL, 3MF или OBJ. Его можно получить из программы для проектирования или скачать у автора модели.</p></div></section><section><b>2</b><div><h3>Покажите, как она работает</h3><p>Закрепление — место, которое удерживает деталь. Нагрузка — то, что давит, тянет или поворачивает её. Если пока не знаете нагрузку, этот шаг можно пропустить.</p><svg viewBox="0 0 340 140" role="img" aria-label="Пример: кронштейн закреплён слева, груз давит вниз справа"><path d="M35 25v85" stroke="#278bb3" stroke-width="12"/><path d="M49 31v64h225v-14H63V31z" fill="#00ae65"/><path d="M250 20v45m-9-10 9 10 9-10" fill="none" stroke="#d58329" stroke-width="5"/><text x="10" y="132" fill="currentColor" font-size="14">Здесь держится</text><text x="190" y="132" fill="currentColor" font-size="14">Сюда давит груз</text></svg></div></section><section><b>3</b><div><h3>Получите файл для печати</h3><p>Сохраните 3MF и откройте его в слайсере — программе, которая готовит команды для вашего 3D-принтера. Проверьте настройки, выполните нарезку и отправьте результат на принтер.</p></div></section><details class="compact-details"><summary>Что означают настройки печати</summary><p><strong>Материал</strong> — пластик, из которого будет сделана деталь.</p><p><strong>Стенки</strong> — наружная оболочка детали.</p><p><strong>Заполнение</strong> — сколько пластика находится внутри оболочки.</p><p><strong>Высота слоя</strong> — толщина одного печатаемого слоя.</p><p><strong>Поддержки</strong> — временные опоры для нависающих участков. После печати их удаляют.</p></details><p class="hint">Рекомендации — отправная точка. Вывод о нагрузке зависит от введённых условий, свойств материала и качества расчёта.</p></div>`);
 }
 function bind(){
  $('guideNext').onclick=()=>go('task');$('analyzeBtn').onclick=()=>finish(false);$('guideSkip').onclick=()=>finish(true);$('guideBack').onclick=()=>go('model');
  $('guideRefresh').onclick=async()=>{if(await api.analyze())go('print',{focus:false});};
  $('guideEditTask').onclick=()=>go('task');$('guideEditModel').onclick=()=>go('model');
  $('guideNewProject').onclick=api.newProject;$('guideHelpBtn').onclick=showHelp;$('guideTaskHelp').onclick=showHelp;$('guideEmptyHelp').onclick=showHelp;
  $('guideExample').onclick=$('guideEmptyExample').onclick=()=>api.example('bracket');
  $('guideEmptyOpen').onclick=()=>$('fileInput').click();
  for(const b of document.querySelectorAll('[data-tab]')){
   b.onclick=()=>b.dataset.tab==='print'?openPrint():go(b.dataset.tab);
   b.addEventListener('keydown',e=>{const buttons=[...document.querySelectorAll('[data-tab]')].filter(b=>!b.disabled),i=buttons.indexOf(b);let target;if(e.key==='ArrowRight')target=buttons[(i+1)%buttons.length];if(e.key==='ArrowLeft')target=buttons[(i+buttons.length-1)%buttons.length];if(e.key==='Home')target=buttons[0];if(e.key==='End')target=buttons.at(-1);if(target){e.preventDefault();target.focus();if(target.dataset.tab==='print')openPrint();else go(target.dataset.tab,{focus:false});}});
  }
  document.querySelector('.brand').onclick=e=>{e.preventDefault();go('model');};
  document.addEventListener('sloy-language-change',()=>sync());
  $('guidePrintSettings').addEventListener('toggle',()=>{if($('guidePrintSettings').open)$('printerProfile').focus({preventScroll:true});});
 }
 function modelLoaded(){step='model';sync();}
 function start(restored=false){bind();step=restored?'print':'model';sync();}
 return {start,sync,go,modelLoaded,showResult:()=>go('print',{focus:false}),help:showHelp,get step(){return step;}};
}
