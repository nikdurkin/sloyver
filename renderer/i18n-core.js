const clean=s=>String(s).replace(/\s+/g,' ').trim(),escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function makeTranslator(catalog){
 const patterns=Object.entries(catalog).filter(([ru])=>/\{\d+\}/.test(ru)).sort((a,b)=>b[0].length-a[0].length).map(([ru,en])=>({regex:new RegExp('^'+escape(ru).replace(/\\\{\d+\\\}/g,'([\\s\\S]*?)')+'$','u'),ids:[...ru.matchAll(/\{(\d+)\}/g)].map(m=>m[1]),en}));
 const phrases=Object.keys(catalog).filter(k=>!/[{}]/.test(k)&&/[А-Яа-яЁё]/.test(k)).sort((a,b)=>b.length-a.length),regex=phrases.length?new RegExp('(?<![А-Яа-яЁё])(?:'+phrases.map(escape).join('|')+')(?![А-Яа-яЁё])','gu'):null;
 const convert=(text,depth=0)=>{if(typeof text!=='string'||!/[А-Яа-яЁё]/.test(text))return text;const key=clean(text);let out=catalog[key];if(out==null){for(const p of patterns){const m=p.regex.exec(key);if(m){const args={};p.ids.forEach((id,index)=>{if(args[id]===undefined)args[id]=depth<3?convert(m[index+1],depth+1):m[index+1];});out=p.en.replace(/\{(\d+)\}/g,(_,id)=>args[id]??'');break;}}}if(out==null)out=regex?key.replace(regex,m=>catalog[m]??m):key;return (text.match(/^\s*/)?.[0]||'')+out+(text.match(/\s*$/)?.[0]||'');};return convert;
}
