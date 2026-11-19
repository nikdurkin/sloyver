'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const COMMANDS=new Set(['open-model','open-project','save-project','export-stl','report-html','report-pdf','copy-settings','projects','method','materials','compare','slicer','history','flush']);
contextBridge.exposeInMainWorld('sloyDesktop',{
 version:'1.8.0',
 ready:()=>ipcRenderer.send('sloy:ready'),
 openFile:kind=>ipcRenderer.invoke('sloy:open-file',kind),
 saveFile:payload=>ipcRenderer.invoke('sloy:save-file',payload),
 savePdf:payload=>ipcRenderer.invoke('sloy:save-pdf',payload),
 copyText:text=>ipcRenderer.invoke('sloy:copy-text',String(text)),
 setLanguage:language=>ipcRenderer.invoke('sloy:set-language',language),
 exchangeRates:()=>ipcRenderer.invoke('sloy:exchange-rates'),
 openStatistics:()=>ipcRenderer.invoke('sloy:open-statistics'),
 slicerStatus:()=>ipcRenderer.invoke('sloy:slicer-status'),
 configureSlicer:kind=>ipcRenderer.invoke('sloy:slicer-configure',kind),
 slice:payload=>ipcRenderer.invoke('sloy:slicer-slice',payload),
 cancelSlice:()=>ipcRenderer.invoke('sloy:slicer-cancel'),
 openSlicerResult:id=>ipcRenderer.invoke('sloy:slicer-open-result',id),
 saveSlicerResult:id=>ipcRenderer.invoke('sloy:slicer-save-result',id),
 onSlicerProgress:callback=>{const listener=(_e,message)=>callback(String(message));ipcRenderer.on('sloy:slicer-progress',listener);return()=>ipcRenderer.removeListener('sloy:slicer-progress',listener);},
 finishClose:(saved=true)=>ipcRenderer.send('sloy:close-ready',saved===true),
 onCommand:callback=>{const listener=(_e,command)=>{if(COMMANDS.has(command))callback(command);};ipcRenderer.on('sloy:command',listener);return()=>ipcRenderer.removeListener('sloy:command',listener);},
 onOpenFile:callback=>{const listener=(_e,file)=>callback(file);ipcRenderer.on('sloy:open-file',listener);return()=>ipcRenderer.removeListener('sloy:open-file',listener);}
});
