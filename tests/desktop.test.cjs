const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {assetPath,isAppUrl,externalUrl,safeFileName,fileData,contentPolicy}=require('../desktop/policy.cjs');
const root=path.resolve(__dirname,'../renderer');
test('offline scheme resolves JS, workers, wasm and query versions inside application root',()=>{
 for(const resource of ['/','/app.js?v=1','/orient-worker.js','/step-worker.js','/vendor/occt/occt-import-js.wasm']){const target=assetPath('sloy://app'+resource,root);assert.ok(target);assert.ok(fs.statSync(target).isFile());}
});
test('asset handler never exposes arbitrary local or remote paths',()=>{
 for(const url of ['https://example.com/a','file:///etc/passwd','sloy://elsewhere/app.js','sloy://user:password@app/app.js','sloy://app/%2e%2e%2fdesktop/main.cjs','sloy://app/..%5cdesktop%5cmain.cjs','sloy://app/a%00.js'])assert.equal(assetPath(url,root),null,url);
 assert.equal(isAppUrl('sloy://app/index.html'),true);
});
test('only HTTPS source links are opened in the system browser',()=>{assert.equal(externalUrl('https://bambulab.com/en/filament/guide'),'https://bambulab.com/en/filament/guide');for(const url of ['javascript:alert(1)','file:///c:/secret','http://example.com','ms-settings:','https://a:b@example.com'])assert.equal(externalUrl(url),null);});
test('native export keeps requested bytes and does not include adjacent typed-array data',()=>{const a=new Uint8Array([9,1,2,9]);assert.deepEqual([...fileData(a.subarray(1,3))],[1,2]);assert.deepEqual([...fileData(new Uint8Array([7,8]).buffer)],[7,8]);assert.throws(()=>fileData({buffer:[]}));assert.throws(()=>fileData(new Uint8Array()));});
test('native suggested filenames reject paths and Windows device names',()=>{assert.equal(safeFileName('Кронштейн.stl','stl'),'Кронштейн.stl');assert.equal(safeFileName('CON.txt','txt'),'_CON.txt');assert.equal(safeFileName('заказ.sloy','project'),'заказ.sloy');assert.ok(!safeFileName('../../other.exe','stl').includes('/'));assert.throws(()=>safeFileName('other.exe','exe'));});
test('offline CSP admits only the bundled import map and WebAssembly compilation',()=>{const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),csp=contentPolicy(html),map=html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1],hash=crypto.createHash('sha256').update(map).digest('base64');assert.ok(csp.includes('sha256-'+hash));assert.ok(csp.includes("'wasm-unsafe-eval'"));assert.ok(!csp.includes("'unsafe-eval'"));assert.ok(csp.includes("connect-src 'self'"));});
test('all static module paths required for offline viewing are present',()=>{for(const name of ['materials.json','prices.json','geometry.js','pricing.js','vendor/three.module.js','vendor/three.core.js','vendor/controls/OrbitControls.js','vendor/loaders/STLLoader.js','vendor/loaders/OBJLoader.js','vendor/loaders/3MFLoader.js','vendor/libs/fflate.module.js','vendor/exporters/STLExporter.js','vendor/occt/occt-import-js.js'])assert.ok(fs.existsSync(path.join(root,name)),name);});
