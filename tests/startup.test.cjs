const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
test('first launch creates a new profile before overriding Electron userData',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sloy-startup-'));
 try{
  const file=path.resolve(__dirname,'../desktop/main.cjs'),hostRequire=createRequire(file);let configured,quit=false;
  const fakeElectron={app:{setName(){},setAppUserModelId(){},getPath(name){assert.equal(name,'appData');return temp;},setPath(name,dir){assert.equal(name,'userData');assert.ok(fs.statSync(dir).isDirectory(),'Electron requires an existing profile directory');configured=dir;},requestSingleInstanceLock(){return false;},quit(){quit=true;},on(){}},protocol:{registerSchemesAsPrivileged(schemes){assert.equal(schemes[0].privileges.secure,true);assert.equal(schemes[0].privileges.standard,true);}}};
  const context={require:name=>name==='electron'?fakeElectron:hostRequire(name),__dirname:path.dirname(file),process,Buffer,URL,console,setTimeout,clearTimeout};
  new vm.Script(fs.readFileSync(file,'utf8'),{filename:file}).runInNewContext(context);
  assert.equal(configured,path.join(temp,'SloyDesktop'));assert.equal(quit,true);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
