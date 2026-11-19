'use strict';
const path=require('node:path');
const crypto=require('node:crypto');
const APP_ORIGIN='sloy://app';
const MAX_OPEN_BYTES=45*1024*1024;
const MAX_SAVE_BYTES=80*1024*1024;
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8','.wasm':'application/wasm'};
const FORMATS={vtk:{extension:'vtk',label:'Расчётная сетка и поля VTK'},stl:{extension:'stl',label:'3D-модель STL'},'3mf':{extension:'3mf',label:'Проект печати 3MF'},csv:{extension:'csv',label:'Таблица CSV'},project:{extension:'sloy',label:'Проект Слойвер'},html:{extension:'html',label:'HTML-отчёт'},txt:{extension:'txt',label:'Текст'},pdf:{extension:'pdf',label:'PDF-отчёт'}};
function isAppUrl(raw){try{const u=new URL(raw);return u.protocol==='sloy:'&&u.hostname==='app'&&!u.username&&!u.password&&!u.port;}catch{return false;}}
function externalUrl(raw){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
function assetPath(raw,root){
 if(!isAppUrl(raw))return null;
 try{const u=new URL(raw),decoded=decodeURIComponent(u.pathname||'/');if(decoded.includes('\0')||decoded.includes('\\'))return null;
 const relative=decoded==='/'?'index.html':decoded.replace(/^\/+/,''),full=path.resolve(root,relative),back=path.relative(root,full);
 if(!back||back.startsWith('..'+path.sep)||back==='..'||path.isAbsolute(back))return null;
 return full;
 }catch{return null;}
}
function safeFileName(raw,format){const f=FORMATS[format];if(!f)throw new Error('Неизвестный формат сохранения.');let s=String(raw||'Слойвер').replace(/[\x00-\x1f<>:"/\\|?*]/g,'_').trim().replace(/[. ]+$/,'').slice(0,120);if(!s)s='Слойвер';s=s.replace(/\.(?:vtk|stl|3mf|csv|sloy|json|html|txt|pdf)$/i,'');if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s))s='_'+s;return s+'.'+f.extension;}
function fileData(raw){let bytes;if(raw instanceof ArrayBuffer)bytes=Buffer.from(raw);else if(ArrayBuffer.isView(raw))bytes=Buffer.from(raw.buffer,raw.byteOffset,raw.byteLength);else throw new Error('Некорректные данные файла.');if(!bytes.length||bytes.length>MAX_SAVE_BYTES)throw new Error('Некорректный размер файла.');return bytes;}
function contentPolicy(indexHtml,embindWorker=false){const map=indexHtml.match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1]||'';const hash=crypto.createHash('sha256').update(map).digest('base64');return `default-src 'self'; script-src 'self' 'wasm-unsafe-eval' ${embindWorker?"'unsafe-eval' ":''}'sha256-${hash}'; worker-src 'self' blob:; connect-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-src 'none'`;}
module.exports={APP_ORIGIN,MAX_OPEN_BYTES,MAX_SAVE_BYTES,MIME,FORMATS,isAppUrl,externalUrl,assetPath,safeFileName,fileData,contentPolicy};
