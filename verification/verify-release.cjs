// Run after build: node verification/verify-release.cjs /absolute/path/to/7zz
// Verifies the actual portable payload; it does not launch Windows software.
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const asar=require('@electron/asar'),pe=require('pe-library'),resedit=require('resedit');
const root=path.resolve(__dirname,'..'),meta=require('../package.json');
const packed=path.join(root,'release/win-unpacked/resources/app.asar');
const portable=path.join(root,`release/Sloyver-Desktop-${meta.version}-Windows-x64.exe`);
const seven=process.argv[2];assert.ok(seven,'Pass the absolute path to 7zz.');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const sources=[...['desktop','renderer','assets'].flatMap(d=>walk(path.join(root,d))),...['README-RU.html','README-EN.html','THIRD-PARTY-NOTICES.txt'].map(f=>path.join(root,f))];
for(const file of sources){const relative=path.relative(root,file).split(path.sep).join('/');assert.deepEqual(asar.extractFile(packed,relative),fs.readFileSync(file),relative);}
const packagedMeta=JSON.parse(asar.extractFile(packed,'package.json'));
for(const key of ['name','productName','version','main','author'])assert.equal(packagedMeta[key],meta[key],key);
const executableBytes=fs.readFileSync(path.join(root,'release/win-unpacked/Sloyver.exe'));
assert.equal(executableBytes.readUInt16LE(executableBytes.readUInt32LE(0x3c)+4),0x8664);
const executable=pe.NtExecutable.from(executableBytes),resources=pe.NtExecutableResource.from(executable);
const versions=resedit.Resource.VersionInfo.fromEntries(resources.entries).flatMap(v=>v.getAllLanguagesForStringValues().map(l=>v.getStringValues(l)));
assert.ok(versions.some(v=>v.ProductName===meta.productName&&v.InternalName==='Sloyver'&&v.FileVersion.startsWith(meta.version)),JSON.stringify(versions));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sloyver-portable-'));
function run(args){const p=spawnSync(seven,args,{encoding:'utf8',maxBuffer:8*1024*1024});assert.equal(p.status,0,(p.stdout||'')+(p.stderr||'')+(p.error||''));return p.stdout;}
try{
 run(['t',portable]);
 run(['e',portable,'$PLUGINSDIR/app-64.7z',`-o${temp}`,'-y']);
 const payload=path.join(temp,'app-64.7z');assert.ok(fs.existsSync(payload));
 run(['t',payload]);
 run(['x',payload,'resources/app.asar',`-o${temp}`,'-y']);
 assert.equal(hash(fs.readFileSync(path.join(temp,'resources/app.asar'))),hash(fs.readFileSync(packed)));
 const result={application:meta.productName,version:meta.version,date:'2026-10-28',sourceByteMatches:true,packagedFiles:sources.length+1,machine:'0x8664',portableContainerTest:'passed',embeddedPayloadCrcTest:'passed',portableAsarMatchesUnpacked:true,windowsProductName:meta.productName,windowsExecutableName:'Sloyver.exe',windowsVersionInfo:versions,asarSha256:hash(fs.readFileSync(packed)),portableSha256:hash(fs.readFileSync(portable)),portableBytes:fs.statSync(portable).size,nativeWindowsLaunch:false};
 fs.writeFileSync(path.join(__dirname,`package-checks-${meta.version}.json`),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result,null,2));
}finally{fs.rmSync(temp,{recursive:true,force:true});}
