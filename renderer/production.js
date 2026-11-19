export function geometryFingerprint(positions){
 const bytes=new Uint8Array(positions.buffer,positions.byteOffset,positions.byteLength);let a=2166136261;
 for(const n of bytes){a^=n;a=Math.imul(a,16777619);}return bytes.length.toString(36)+'-'+(a>>>0).toString(36);
}
export function recipeKey({geometry,material,nozzle,pose,profile,printer='',process='',drying=''}={}){
 return JSON.stringify([geometry,material,Number(nozzle),pose?.normal?.map(v=>Math.round(v*1e5)/1e5),Number(pose?.yaw||0),profile?.layer,profile?.walls,profile?.infill,profile?.top,profile?.bottom,profile?.outerSpeed,profile?.innerSpeed,profile?.plate,profile?.chamber,profile?.overhang,profile?.supportSetting,profile?.pattern,profile?.sourceFingerprint,printer.trim(),process.trim(),drying.trim()]);
}
export function measurementsSummary(records){
 const groups=new Map();
 for(const r of records){for(const m of r.measurements||[]){if(!Number.isFinite(m.actual)||!Number.isFinite(m.nominal))continue;const key=JSON.stringify([m.name,m.nominal,m.tolerance]);const list=groups.get(key)||[];list.push(m);groups.set(key,list);}}
 return [...groups].map(([key,ms])=>{const [name,nominal,tolerance]=JSON.parse(key),values=ms.map(x=>x.actual),mean=values.reduce((a,b)=>a+b,0)/values.length,variance=values.length>1?values.reduce((s,x)=>s+(x-mean)**2,0)/(values.length-1):null;
 return {name,nominal,tolerance,count:values.length,mean,error:mean-nominal,range:Math.max(...values)-Math.min(...values),stddev:variance===null?null:Math.sqrt(variance),within:ms.filter(m=>Math.abs(m.actual-m.nominal)<=(Number.isFinite(m.tolerance)?m.tolerance:Infinity)).length};});
}
export function validatePrintRecord(r){
 if(!r||!r.id||!r.recipeKey||!['success','partial','failed'].includes(r.result))throw new Error('Некорректная запись печати.');
 if(!String(r.printer||'').trim()||!String(r.process||'').trim())throw new Error('Укажите принтер и название/версию профиля.');
 if(!Array.isArray(r.measurements)||r.measurements.length>20)throw new Error('Допускается до 20 замеров.');
 for(const m of r.measurements)if(!m.name||!Number.isFinite(m.nominal)||!Number.isFinite(m.actual)||m.nominal<=0||m.actual<=0||!Number.isFinite(m.tolerance)||m.tolerance<0)throw new Error('Проверьте название, номинал, фактический размер и допуск замера.');
 const measureKeys=r.measurements.map(m=>JSON.stringify([m.name,m.nominal,m.tolerance]));if(new Set(measureKeys).size!==measureKeys.length)throw new Error('В одной записи указывайте один замер каждого размера. Повторные печати сохраняйте отдельными записями.');
 if((r.photos||[]).length>3||(r.photos||[]).some(p=>!/^data:image\/(jpeg|png|webp);base64,/.test(p)||p.length>3000000))throw new Error('Можно сохранить до трёх фотографий размером до 2 МБ.');
 return r;
}
