export function catalogEntry(raw,knownIds){
 const id=String(raw.material_id||'');if(!knownIds.includes(id))throw new Error('Неизвестный материал: '+id);
 const priceRub=Number(raw.priceRub??raw.price_rub),massGrams=Number(raw.massGrams??raw.mass_grams);
 if(!(priceRub>0&&priceRub<=1000000&&massGrams>0&&massGrams<=100000))throw new Error('Проверьте цену и массу фасовки для '+id);
 const url=String(raw.url||'');try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)throw new Error();}catch{throw new Error('Нужна HTTPS-ссылка на карточку материала.');}
 const checked=String(raw.checked_date||raw.checked||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(checked)||!Number.isFinite(Date.parse(checked))||new Date(checked).toISOString().slice(0,10)!==checked)throw new Error('Нужна существующая дата проверки в формате ГГГГ-ММ-ДД.');
 return {material_id:id,priceRub,massGrams,unitPriceRubPerKg:priceRub/massGrams*1000,shop:String(raw.shop||'Магазин').slice(0,150),url,checked_date:checked,product:String(raw.product||raw.variant||'').slice(0,200),priceKind:raw.priceKind==='from'?'from':'fixed',verified:true,origin:'user',notes:'Ориентир внесён пользователем. Проверьте наличие, цвет, фасовку и оригинальность.'};
}
function csvRows(text){const rows=[];let row=[],field='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===';'&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field='';}else field+=c;}if(quoted)throw new Error('Незакрытая кавычка в CSV.');row.push(field);if(row.some(x=>x.trim()))rows.push(row);return rows;}
export function parseCatalog(text,name,knownIds){
 if(text.length>2*1024*1024)throw new Error('Прайс должен быть меньше 2 МБ.');let raw;
 if(/\.csv$/i.test(name)){const rows=csvRows(text.replace(/^\uFEFF/,'')),head=rows.shift()?.map(s=>s.trim());if(!head?.includes('material_id'))throw new Error('Используйте шаблон CSV с колонкой material_id.');raw=rows.map(r=>Object.fromEntries(head.map((h,i)=>[h,r[i]?.trim()||''])));}
 else{const value=JSON.parse(text);raw=Array.isArray(value)?value:value.prices;}
 if(!Array.isArray(raw)||raw.length>200)throw new Error('Некорректный прайс.');raw=raw.filter(r=>(r.priceRub??r.price_rub)!==''&&(r.priceRub??r.price_rub)!=null);if(!raw.length)throw new Error('В прайсе нет заполненных цен.');const result={};for(const r of raw){const entry=catalogEntry(r,knownIds);if(result[entry.material_id])throw new Error('Материал повторяется в прайсе: '+entry.material_id);result[entry.material_id]=entry;}return result;
}
