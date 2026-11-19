'use strict';
const fs=require('node:fs'),path=require('node:path');let language='ru',catalog={};try{catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'..','renderer','i18n','en.json'),'utf8'));}catch{}
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');let regex=null;const keys=Object.keys(catalog).filter(k=>!/[{}]/.test(k)&&/[А-Яа-яЁё]/.test(k)).sort((a,b)=>b.length-a.length);if(keys.length)regex=new RegExp('(?<![А-Яа-яЁё])(?:'+keys.map(escape).join('|')+')(?![А-Яа-яЁё])','gu');
function t(s){if(language!=='en'||typeof s!=='string')return s;const key=s.replace(/\s+/g,' ').trim();return catalog[key]??(regex?key.replace(regex,m=>catalog[m]??m):s);}
function options(v){if(Array.isArray(v))return v.map(options);if(v&&typeof v==='object'){const out={};for(const [key,value] of Object.entries(v))out[key]=typeof value==='string'&&['title','message','detail','label','name','buttonLabel'].includes(key)?t(value):key==='buttons'?value.map(t):options(value);return out;}return v;}
function setLanguage(v){language=v==='en'?'en':'ru';}module.exports={t,options,setLanguage};
