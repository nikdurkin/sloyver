export function restoreBedFace(raw){
 if(!raw||!Array.isArray(raw.point)||raw.point.length!==3||!raw.point.every(Number.isFinite)||!Array.isArray(raw.normal)||raw.normal.length!==3||!raw.normal.every(Number.isFinite))return null;
 const length=Math.hypot(...raw.normal);if(length<1e-8)return null;
 return {point:[...raw.point],normal:raw.normal.map(v=>v/length),rule:'bed'};
}
export function setBedFace(faces,raw){
 const bedFace=restoreBedFace(raw);if(!bedFace)throw new Error('Не удалось определить плоскость выбранной грани.');
 return {faces:faces.filter(f=>f.rule!=='bed'),bedFace};
}
