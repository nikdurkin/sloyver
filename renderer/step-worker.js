importScripts('./vendor/occt/occt-import-js.js');
let kernel;
self.onmessage=async e=>{
  try{
    kernel=kernel||await occtimportjs({locateFile:path=>new URL('./vendor/occt/'+path,self.location.href).href});
    const r=kernel.ReadStepFile(new Uint8Array(e.data),{linearUnit:'millimeter',linearDeflectionType:'bounding_box_ratio',linearDeflection:.0015,angularDeflection:.4});
    if(!r.success||!r.meshes?.length)throw new Error('Не удалось прочитать STEP. Экспортируйте одну твердотельную деталь или STL.');
    const parts=r.meshes.map((m,i)=>({name:m.name||'Тело '+(i+1),positions:new Float32Array(m.index.array.flatMap(index=>m.attributes.position.array.slice(index*3,index*3+3)))}));
    self.postMessage({type:'result',parts},parts.map(p=>p.positions.buffer));
  }catch(error){self.postMessage({type:'error',message:error.message||String(error)});}
};
