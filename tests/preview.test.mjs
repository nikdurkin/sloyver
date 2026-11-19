import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../renderer/vendor/three.module.js';
import {previewNormals,fitPreviewCamera,renderMeshPreview} from '../renderer/mesh-preview.js';

const identity = new THREE.Matrix4();
const pixel = (image, x, y) => [...image.pixels.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)];
const colors = (count, color) => Float32Array.from({length: count}, (_, i) => color[i % 3]);
function bounds(image) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) if (image.pixels[(y * image.width + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return {width: x1 - x0 + 1, height: y1 - y0 + 1};
}

test('a 36,000-triangle surface remains solid with no decimation holes', () => {
  const positions = [];
  for (let y = 0; y < 100; y++) for (let x = 0; x < 180; x++) {
    const a = - .9 + x / 100, b = -.8 + y * .016;
    positions.push(a,b,0,a+.01,b,0,a+.01,b+.016,0,a,b,0,a+.01,b+.016,0,a,b+.016,0);
  }
  const image = renderMeshPreview({positions:Float32Array.from(positions),viewProjection:identity,width:360,height:200});
  for (let y = 22; y < 178; y++) for (let x = 20; x < 340; x++) assert.equal(pixel(image,x,y)[3],255,`unexpected hole at ${x},${y}`);
});

test('intersecting surfaces use per-pixel depth regardless of triangle order', () => {
  const a = [-.9,-.9,-.8,.9,-.9,.8,0,.9,0], b = [-.9,-.9,0,.9,-.9,0,0,.9,0];
  for (const reverse of [false,true]) {
    const p = Float32Array.from(reverse?[...b,...a]:[...a,...b]);
    const c = Float32Array.from(reverse?[...colors(9,[0,0,1]),...colors(9,[1,0,0])]:[...colors(9,[1,0,0]),...colors(9,[0,0,1])]);
    const image = renderMeshPreview({positions:p,colors:c,viewProjection:identity,width:120,height:120});
    assert.ok(pixel(image,35,90)[0]>pixel(image,35,90)[2]);
    assert.ok(pixel(image,85,90)[2]>pixel(image,85,90)[0]);
  }
});

test('a real through-hole remains open while all of its surrounding wall is filled', () => {
  const g = new THREE.RingGeometry(.35,.9,128).toNonIndexed();
  const image = renderMeshPreview({positions:g.attributes.position.array,normals:g.attributes.normal.array,viewProjection:identity,width:240,height:240});
  assert.equal(pixel(image,120,120)[3],0);
  assert.equal(pixel(image,190,120)[3],255);
  assert.equal(pixel(image,230,120)[3],0);
});

test('triangles crossing the near plane are clipped instead of disappearing', () => {
  const image = renderMeshPreview({positions:Float32Array.from([-.9,-.9,-2,.9,-.9,0,0,.9,0]),viewProjection:identity,width:160,height:160});
  assert.equal(pixel(image,95,95)[3],255);
  assert.ok(image.pixels.filter((v,i)=>i%4===3&&v===255).length>4000);
});

test('hidden edges cannot show through a front surface', () => {
  const positions = Float32Array.from([-.9,-.9,0,.9,-.9,0,.9,.9,0,-.9,-.9,0,.9,.9,0,-.9,.9,0]);
  const image = renderMeshPreview({positions,colors:colors(positions.length,[0,1,0]),viewProjection:identity,width:120,height:120,edgePositions:Float32Array.from([-.8,0,.5,.8,0,.5]),edgeColor:[255,0,0]});
  assert.ok(pixel(image,60,60)[1]>pixel(image,60,60)[0]);
});

test('preview smoothing preserves sharp box edges and the source mesh', () => {
  const positions = new THREE.BoxGeometry(2,3,4).toNonIndexed().attributes.position.array, before = positions.slice();
  const normals = previewNormals(positions);
  assert.deepEqual(positions,before);
  for (let i=0;i<normals.face.length;i++) assert.ok(Math.abs(normals.face[i]-normals.smooth[i])<1e-6);
});

test('curved surfaces have smooth normals without smoothing across a cap', () => {
  const g = new THREE.CylinderGeometry(5,5,10,64,1,true).toNonIndexed(), p = g.attributes.position.array, n = previewNormals(p).smooth;
  for (let i=0;i<p.length;i+=3) assert.ok((p[i]*n[i]+p[i+2]*n[i+2])/5>.998);
});

test('both projection modes fit an elongated model in narrow and wide viewports', () => {
  const size=[23,147.7,76];
  for (const aspect of [.25,1,6]) for (const perspective of [false,true]) {
    const camera = perspective?new THREE.PerspectiveCamera(35,aspect,.01,10000):new THREE.OrthographicCamera(-1,1,1,-1,.01,10000);
    camera.up.set(0,0,1);fitPreviewCamera(camera,new THREE.Vector3(),size,400*aspect,400);
    for (const x of [-size[0]/2,size[0]/2]) for (const y of [-size[1]/2,size[1]/2]) for (const z of [0,size[2]]) {
      const point = new THREE.Vector3(x,y,z).project(camera);
      assert.ok(Math.abs(point.x)<.83 && Math.abs(point.y)<.83,JSON.stringify({aspect,perspective,point}));
    }
  }
});

test('uniform fitting preserves a two-to-one rectangle at different canvas ratios', () => {
  const g = new THREE.PlaneGeometry(2,1).toNonIndexed();
  for (const [width,height] of [[480,120],[160,280],[240,160]]) {
    const camera = new THREE.OrthographicCamera(-1,1,1,-1,.01,1000);
    fitPreviewCamera(camera,new THREE.Vector3(),[2,1,0],width,height,[0,0,1]);
    const image = renderMeshPreview({positions:g.attributes.position.array,normals:g.attributes.normal.array,viewProjection:new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),width,height}), box=bounds(image);
    assert.ok(Math.abs(box.width/box.height-2)<.03,JSON.stringify({width,height,box}));
  }
});
