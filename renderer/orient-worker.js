import {analyze} from './geometry.js?v=20261028-170';
self.onmessage=e=>{
  try{const {positions,settings,material}=e.data;const result=analyze(new Float32Array(positions),settings,material,(p,label)=>self.postMessage({type:'progress',p,label}));self.postMessage({type:'result',result});}
  catch(error){self.postMessage({type:'error',message:error.message||String(error)});}
};
