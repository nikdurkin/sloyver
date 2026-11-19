'use strict';
const nativeI18n=require('./i18n.cjs');
const {currentRates}=require('./currency.cjs');
const {app,BrowserWindow,protocol,dialog,Menu,shell,ipcMain,clipboard,screen,session}=require('electron');
const fs=require('node:fs/promises');
const fsSync=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {SlicerService}=require('./slicer.cjs');
const {APP_ORIGIN,MAX_OPEN_BYTES,MIME,FORMATS,isAppUrl,externalUrl,assetPath,safeFileName,fileData,contentPolicy}=require('./policy.cjs');
const ROOT=path.join(__dirname,'..','renderer');
app.setName('Слойвер');
app.setAppUserModelId('com.sloy.desktop');
const userDataDirectory=path.join(app.getPath('appData'),'SloyDesktop');
fsSync.mkdirSync(userDataDirectory,{recursive:true});
app.setPath('userData',userDataDirectory);
try{nativeI18n.setLanguage(JSON.parse(fsSync.readFileSync(path.join(userDataDirectory,'language.json'),'utf8')).language);}catch{}
const openDialog=(win,opts)=>dialog.showOpenDialog(win,nativeI18n.options(opts)),saveDialog=(win,opts)=>dialog.showSaveDialog(win,nativeI18n.options(opts)),messageDialog=(win,opts)=>dialog.showMessageBox(win,nativeI18n.options(opts)),errorBox=(title,detail)=>dialog.showErrorBox(nativeI18n.t(title),nativeI18n.t(detail));
protocol.registerSchemesAsPrivileged([{scheme:'sloy',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true,codeCache:true}}]);
let mainWindow,closeAllowed=false,closeTimer,rendererReady=false,pendingFiles=[],lastSaveDirectory,slicer;
const lock=app.requestSingleInstanceLock();
if(!lock)app.quit();
else{
 app.on('second-instance',(_e,argv)=>{for(const file of argv.slice(1))if(/\.(stl|obj|3mf|step|stp|sloy|json)$/i.test(file)&&!file.startsWith('-'))queueFile(file);if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus();}});
 app.on('open-file',(e,file)=>{e.preventDefault();queueFile(file);});
 app.whenReady().then(start).catch(e=>{errorBox('Слойвер — ошибка запуска',e.message);app.quit();});
}
function trusted(event){return !!mainWindow&&event.sender.id===mainWindow.webContents.id&&isAppUrl(event.senderFrame?.url||'');}
function requireTrusted(event){if(!trusted(event))throw new Error('Недоступный источник команды.');}
async function readModelFile(file){const stat=await fs.stat(file);if(!stat.isFile()||stat.size>MAX_OPEN_BYTES)throw new Error('Нужен файл модели или проекта размером до 45 МБ.');if(!/\.(stl|obj|3mf|step|stp|sloy|json)$/i.test(file))throw new Error('Этот формат не поддерживается.');const data=await fs.readFile(file);return {name:path.basename(file),data:new Uint8Array(data)};}
function queueFile(file){if(!rendererReady)pendingFiles.push(file);else readModelFile(file).then(data=>mainWindow?.webContents.send('sloy:open-file',data)).catch(e=>messageDialog(mainWindow,{type:'error',title:'Открытие файла',message:e.message}));}
async function chooseSave(format,name){const f=FORMATS[format];if(!f)throw new Error('Неизвестный формат.');const suggested=safeFileName(name,format);const res=await saveDialog(mainWindow,{title:'Сохранить '+f.label.toLowerCase(),defaultPath:path.join(lastSaveDirectory||app.getPath('documents'),suggested),filters:[{name:f.label,extensions:[f.extension]}],properties:['showOverwriteConfirmation','createDirectory']});if(res.canceled||!res.filePath)return null;lastSaveDirectory=path.dirname(res.filePath);return res.filePath;}
async function writeAtomic(file,bytes){const temp=path.join(path.dirname(file),'.sloy-'+randomUUID()+'.tmp');try{await fs.writeFile(temp,bytes);await fs.rename(temp,file);}catch(e){await fs.rm(temp,{force:true}).catch(()=>{});throw e;}}
function setupIpc(){
 slicer=new SlicerService(app.getPath('userData'),{onProgress:message=>mainWindow?.webContents.send('sloy:slicer-progress',message)});
 ipcMain.handle('sloy:slicer-status',async event=>{requireTrusted(event);return slicer.status();});
 ipcMain.handle('sloy:slicer-configure',async(event,kind)=>{requireTrusted(event);try{if(!['executable','machine','process','filament'].includes(kind))throw new Error('Неизвестная настройка.');const res=await openDialog(mainWindow,{title:kind==='executable'?'Выберите установленный OrcaSlicer / Bambu Studio':'Выберите полный профиль '+({machine:'принтера',process:'процесса',filament:'материала'}[kind]),properties:['openFile'],filters:kind==='executable'?[{name:'Слайсер',extensions:['exe']}]:[{name:'Полный профиль JSON',extensions:['json']}]});if(res.canceled)return {canceled:true};return {ok:true,status:await slicer.configure(kind,res.filePaths[0])};}catch(e){return {ok:false,error:e.message};}});
 ipcMain.handle('sloy:slicer-slice',async(event,payload)=>{requireTrusted(event);try{return await slicer.slice(payload);}catch(e){return {ok:false,error:e.message};}});
 ipcMain.handle('sloy:slicer-cancel',event=>{requireTrusted(event);return slicer.cancel();});
 ipcMain.handle('sloy:slicer-open-result',async(event,id)=>{requireTrusted(event);try{return await slicer.openResult(id);}catch(e){return {ok:false,error:e.message};}});
 ipcMain.handle('sloy:slicer-save-result',async(event,id)=>{requireTrusted(event);try{const dest=await chooseSave('3mf','Слойвер_нарезка.3mf');if(!dest)return {canceled:true};await writeAtomic(dest,await slicer.resultBytes(id));return {ok:true};}catch(e){return {ok:false,error:e.message};}});
 ipcMain.handle('sloy:set-language',(event,language)=>{requireTrusted(event);if(!['ru','en'].includes(language))throw new Error('Invalid language.');nativeI18n.setLanguage(language);fsSync.writeFileSync(path.join(userDataDirectory,'language.json'),JSON.stringify({language}));setupMenu();return {ok:true};});
 ipcMain.handle('sloy:exchange-rates',async event=>{requireTrusted(event);try{return {ok:true,data:await currentRates()};}catch(e){return {ok:false,error:e.message};}});
 ipcMain.handle('sloy:open-statistics',async event=>{requireTrusted(event);const res=await openDialog(mainWindow,{title:'Статистика / G-code / нарезанный 3MF',properties:['openFile'],filters:[{name:'Данные слайсера',extensions:['json','gcode','3mf']}]});if(res.canceled)return {canceled:true};try{const name=res.filePaths[0],stat=await fs.stat(name);if(!stat.isFile()||stat.size>80*1024*1024)throw new Error('Нужен файл до 80 МБ.');return {ok:true,name:path.basename(name),data:new Uint8Array(await fs.readFile(name))};}catch(e){return {ok:false,error:e.message};}});
 ipcMain.handle('sloy:open-file',async(event,kind)=>{requireTrusted(event);if(!['model','project'].includes(kind))throw new Error('Некорректный тип файла.');const res=await openDialog(mainWindow,{title:kind==='project'?'Открыть проект Слойвер':'Открыть 3D-модель',properties:['openFile'],filters:kind==='project'?[{name:'Проект Слойвер',extensions:['sloy','json']}]:[{name:'3D-модели',extensions:['step','stp','stl','3mf','obj']},{name:'Все поддерживаемые файлы',extensions:['step','stp','stl','3mf','obj','sloy','json']}]});if(res.canceled||!res.filePaths.length)return {canceled:true};try{return {canceled:false,file:await readModelFile(res.filePaths[0])};}catch(e){return {canceled:false,error:e.message};}});
 ipcMain.handle('sloy:save-file',async(event,payload)=>{requireTrusted(event);try{const {format,name,data}=payload||{};if(!['stl','project','html','txt','3mf','csv','vtk'].includes(format))throw new Error('Некорректный формат.');const bytes=fileData(data),dest=await chooseSave(format,name);if(!dest)return {canceled:true};await writeAtomic(dest,bytes);return {ok:true,name:path.basename(dest)};}catch(e){return {ok:false,error:'Не удалось сохранить файл: '+e.message};}});
 ipcMain.handle('sloy:save-pdf',async(event,payload)=>{requireTrusted(event);let pdfWindow;try{if(typeof payload?.html!=='string'||Buffer.byteLength(payload.html)>2*1024*1024)throw new Error('Некорректный отчёт.');const dest=await chooseSave('pdf',payload.name);if(!dest)return {canceled:true};pdfWindow=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,javascript:false,webSecurity:true}});pdfWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));pdfWindow.webContents.on('will-navigate',e=>e.preventDefault());const csp='<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:">';await pdfWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(payload.html.replace('<html lang="ru">','<html lang="ru"><head>'+csp+'</head>')));const bytes=await pdfWindow.webContents.printToPDF({pageSize:'A4',printBackground:true,preferCSSPageSize:true,margins:{top:.4,bottom:.4,left:.4,right:.4}});await writeAtomic(dest,bytes);return {ok:true,name:path.basename(dest)};}catch(e){return {ok:false,error:'Не удалось сформировать PDF: '+e.message};}finally{if(pdfWindow&&!pdfWindow.isDestroyed())pdfWindow.destroy();}});
 ipcMain.handle('sloy:copy-text',(event,text)=>{requireTrusted(event);if(typeof text!=='string'||text.length>100000)throw new Error('Некорректный текст.');clipboard.writeText(text);return {ok:true};});
 ipcMain.on('sloy:close-ready',(event,saved)=>{if(trusted(event)){clearTimeout(closeTimer);if(saved===false){confirmUnsavedClose('Автосохранение не завершилось. Можно остаться в программе и сохранить проект в файл.');return;}closeAllowed=true;mainWindow?.close();}});
 ipcMain.on('sloy:ready',event=>{if(trusted(event)){rendererReady=true;const queued=pendingFiles;pendingFiles=[];for(const f of queued)queueFile(f);}});
}
function command(name){mainWindow?.webContents.send('sloy:command',name);}
async function confirmUnsavedClose(message){if(!mainWindow)return;const r=await messageDialog(mainWindow,{type:'warning',title:'Проект не сохранён',message,buttons:['Остаться в программе','Закрыть без последнего сохранения'],defaultId:0,cancelId:0});if(r.response===1){closeAllowed=true;mainWindow?.close();}}
function setupMenu(){Menu.setApplicationMenu(Menu.buildFromTemplate(nativeI18n.options([
 {label:'Файл',submenu:[{label:'Открыть модель…',accelerator:'CmdOrCtrl+O',click:()=>command('open-model')},{label:'Открыть проект…',accelerator:'CmdOrCtrl+Shift+O',click:()=>command('open-project')},{label:'Мои проекты',click:()=>command('projects')},{type:'separator'},{label:'Сохранить проект…',accelerator:'CmdOrCtrl+S',click:()=>command('save-project')},{label:'Экспорт STL в выбранной ориентации…',accelerator:'CmdOrCtrl+E',click:()=>command('export-stl')},{label:'Сохранить отчёт HTML…',click:()=>command('report-html')},{label:'Сохранить отчёт PDF…',accelerator:'CmdOrCtrl+P',click:()=>command('report-pdf')},{label:'Копировать настройки',click:()=>command('copy-settings')},{type:'separator'},{role:'quit',label:'Выход'}]},
 {label:'Производство',submenu:[{label:'Подбор материала',click:()=>command('materials')},{label:'Сравнить ориентации',click:()=>command('compare')},{label:'Локальный слайсер и импорт статистики',click:()=>command('slicer')},{label:'История печатей и замеры',click:()=>command('history')}]},
 {label:'Правка',submenu:[{role:'undo',label:'Отменить'},{role:'redo',label:'Повторить'},{type:'separator'},{role:'cut',label:'Вырезать'},{role:'copy',label:'Копировать'},{role:'paste',label:'Вставить'},{role:'selectAll',label:'Выделить всё'}]},
 {label:'Вид',submenu:[{role:'resetZoom',label:'Масштаб 100%'},{role:'zoomIn',label:'Увеличить'},{role:'zoomOut',label:'Уменьшить'},{type:'separator'},{role:'togglefullscreen',label:'Полный экран'}]},
 {label:'Помощь',submenu:[{label:'Как работает подбор',click:()=>command('method')},{label:'О программе',click:()=>messageDialog(mainWindow,{type:'info',title:'Слойвер Desktop',message:'СЛОЙВЕР · Desktop '+app.getVersion(),detail:'Ориентация моделей и параметры FDM-печати.\nРаботает локально, без входа в ChatGPT.\nОфициальные цены Bambu Lab: снимок на 28.10.2026; курс ЦБ РФ можно обновить или задать вручную.\n\nДля переноса из веб-версии сохраните файл проекта и откройте его здесь.\n\nРекомендации и стоимость ориентировочные. Уточняйте массу и время по слайсеру.'})}]}
 ])));}
async function start(){
 const index=await fs.readFile(path.join(ROOT,'index.html'),'utf8'),csp=contentPolicy(index),stepCsp=contentPolicy(index,true);
 protocol.handle('sloy',async request=>{const target=assetPath(request.url,ROOT);if(!target||!['GET','HEAD'].includes(request.method))return new Response('Not found',{status:404});try{const data=await fs.readFile(target);return new Response(request.method==='HEAD'?null:data,{headers:{'content-type':MIME[path.extname(target).toLowerCase()]||'application/octet-stream','content-length':String(data.length),'content-security-policy':target===path.join(ROOT,'step-worker.js')?stepCsp:csp,'x-content-type-options':'nosniff','cache-control':'no-cache'}});}catch{return new Response('Not found',{status:404});}});
 session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_d,callback)=>callback({cancel:true}));
 session.defaultSession.setPermissionRequestHandler((_wc,permission,callback)=>callback(permission==='clipboard-sanitized-write'));
 session.defaultSession.setPermissionCheckHandler((_wc,permission)=>permission==='clipboard-sanitized-write');
 setupIpc();setupMenu();
 const area=screen.getPrimaryDisplay().workAreaSize;let previous={};try{previous=JSON.parse(await fs.readFile(path.join(app.getPath('userData'),'window.json'),'utf8'));}catch{}
 const width=Math.min(area.width,Number.isFinite(previous.width)?Math.max(1050,previous.width):1440),height=Math.min(area.height,Number.isFinite(previous.height)?Math.max(700,previous.height):960);
 mainWindow=new BrowserWindow({title:'СЛОЙВЕР · Desktop',width,height,minWidth:Math.min(1000,area.width),minHeight:Math.min(680,area.height),backgroundColor:'#f4f4f4',icon:path.join(__dirname,'..','assets','icon.png'),show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,spellcheck:false}});
 mainWindow.webContents.setWindowOpenHandler(({url})=>{const safe=externalUrl(url);if(safe)shell.openExternal(safe);return {action:'deny'};});
 mainWindow.webContents.on('will-navigate',(e,url)=>{if(!isAppUrl(url)){e.preventDefault();const safe=externalUrl(url);if(safe)shell.openExternal(safe);}});
 mainWindow.webContents.on('will-attach-webview',e=>e.preventDefault());
 mainWindow.webContents.on('did-fail-load',(_e,code,description)=>{if(code!==-3)errorBox('Не удалось открыть Слойвер',description);});
 mainWindow.webContents.on('render-process-gone',()=>{errorBox('Слойвер','Окно приложения завершило работу. Перезапустите программу. Сохранённые проекты останутся на компьютере.');closeAllowed=true;mainWindow.close();});
 mainWindow.on('ready-to-show',()=>{if(previous.maximized)mainWindow.maximize();mainWindow.show();});
 mainWindow.on('close',e=>{if(!closeAllowed){e.preventDefault();const bounds=mainWindow.getNormalBounds();fs.mkdir(app.getPath('userData'),{recursive:true}).then(()=>fs.writeFile(path.join(app.getPath('userData'),'window.json'),JSON.stringify({width:bounds.width,height:bounds.height,maximized:mainWindow.isMaximized()}))).catch(()=>{});command('flush');clearTimeout(closeTimer);closeTimer=setTimeout(()=>confirmUnsavedClose('Сохранение занимает больше 10 секунд. Дождитесь его завершения или сохраните проект в файл.'),10000);}});
 mainWindow.on('closed',()=>{mainWindow=null;});
 for(const arg of process.argv.slice(app.isPackaged?1:2))if(/\.(stl|obj|3mf|step|stp|sloy|json)$/i.test(arg)&&!arg.startsWith('-'))pendingFiles.push(arg);
 await mainWindow.loadURL(APP_ORIGIN+'/');
}
app.on('window-all-closed',()=>{slicer?.cancel();app.quit();});
