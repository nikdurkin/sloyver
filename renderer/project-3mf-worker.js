import {makeProject3MF} from './project-3mf.js';
self.onmessage=e=>{try{const {bytes}=makeProject3MF(e.data);self.postMessage({bytes},[bytes.buffer]);}catch(error){self.postMessage({error:error.message});}};
