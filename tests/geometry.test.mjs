import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../renderer/vendor/three.module.js';
import {prepareMesh,scoreOrientation,analyze,orientPositions,basis,dot,parseDescription} from '../renderer/geometry.js';
const box=(x,y,z)=>new Float32Array(new THREE.BoxGeometry(x,y,z).toNonIndexed().attributes.position.array);
const material={tensile_xy:[34,4],tensile_z:[23,4]};
const settings={bed:[256,256,256],layer:.2,overhang:45,workAxis:[1,0,0],holeAxis:null,faces:[],directionConfirmed:true,loadType:'tension'};
const near=(actual,expected,tol=1e-5)=>assert.ok(Math.abs(actual-expected)<tol,`${actual} != ${expected}`);
test('closed box: exact surface, volume and first-layer section',()=>{
  const m=prepareMesh(box(100,20,10));assert.equal(m.closed,true);near(m.volume,20000);near(m.surface,6400);m.centroid.forEach(v=>near(v,0));
  const p=scoreOrientation(m,[0,0,1],settings,material);near(p.contact,2000);near(p.overhang,0);near(p.size[2],10);assert.ok(p.stability>.9);
  const q=scoreOrientation(m,[1,0,0],settings,material);near(q.contact,200);near(q.size[2],100);
});
test('ring first layer excludes central hole rather than convex hull fill',()=>{
  const shape=new THREE.Shape();shape.absarc(0,0,20,0,Math.PI*2,false);const hole=new THREE.Path();hole.absarc(0,0,10,0,Math.PI*2,true);shape.holes.push(hole);
  const g=new THREE.ExtrudeGeometry(shape,{depth:30,bevelEnabled:false,curveSegments:48});const m=prepareMesh(new Float32Array(g.attributes.position.array));assert.equal(m.closed,true);
  const p=scoreOrientation(m,[0,0,1],settings,material);near(p.contact,m.volume/30,.001);assert.ok(p.hullArea>p.contact*1.2);
});
test('in-plane load path outranks build-normal tensile path',()=>{
  const m=prepareMesh(box(100,20,10));const a=scoreOrientation(m,[0,0,1],settings,material),b=scoreOrientation(m,[1,0,0],settings,material);
  assert.ok(a.scores.strength>b.scores.strength+30);near(a.layerAlignment,1);near(b.layerAlignment,0);
});
test('precision hole direction changes geometry score',()=>{
  const m=prepareMesh(box(30,30,30)),s={...settings,holeAxis:[0,0,1]};const a=scoreOrientation(m,[0,0,1],s,material),b=scoreOrientation(m,[1,0,0],s,material);assert.ok(a.scores.accuracy>b.scores.accuracy+20);
});
test('missing load direction never grants directional strength applicability',()=>{
  const m=prepareMesh(box(30,30,30));const p=scoreOrientation(m,[0,0,1],{...settings,directionConfirmed:false},material);near(p.applicability,0);
});
test('support-critical face below the model scores worse than face above',()=>{
  const m=prepareMesh(box(30,30,30)),s={...settings,faces:[{normal:[0,0,1],point:[0,0,15]}]};const a=scoreOrientation(m,[0,0,1],s,material),b=scoreOrientation(m,[0,0,-1],s,material);assert.ok(a.faceQuality>b.faceQuality);assert.ok(a.scores.accuracy>b.scores.accuracy);
});
test('rotated export preserves volume, bounds and right-handed orientation',()=>{
  const src=box(80,20,12),p=scoreOrientation(prepareMesh(src),[1,1,0],settings,material),dst=orientPositions(src,p),m=prepareMesh(dst);near(m.volume,19200,.1);near(m.min[2],0,1e-5);for(let i=0;i<3;i++)near(m.size[i],p.size[i],1e-4);near(dot(p.basis[0],p.basis[1]),0);const det=new THREE.Matrix3().set(...p.basis.flat()).determinant();near(det,1);
});
test('undersized printer yields no selectable candidate',()=>{const a=analyze(box(100,100,100),{...settings,bed:[20,20,20]},material);assert.equal(a.rankings.balanced.length,0);});
test('open or inconsistent mesh is not called a closed volume',()=>{const m=prepareMesh(box(30,30,30).slice(9));assert.equal(m.closed,false);assert.equal(m.volume,null);assert.ok(m.boundaryEdges>0);});
test('reversed consistent winding keeps volume and contact valid',()=>{const p=box(20,30,40);for(let i=0;i<p.length;i+=9)for(let k=0;k<3;k++)[p[i+3+k],p[i+6+k]]=[p[i+6+k],p[i+3+k]];const m=prepareMesh(p);assert.equal(m.closed,true);near(m.volume,24000);near(scoreOrientation(m,[0,0,1],settings,material).contact,600);});
test('basis produces orthonormal rows even for negative and tilted axes',()=>{for(const n of [[0,0,-1],[1,2,3],[-1,0,0]]){const b=basis(n,.7);for(let i=0;i<3;i++){near(dot(b[i],b[i]),1);for(let j=0;j<i;j++)near(dot(b[i],b[j]),0);}}});
test('description parser identifies directions and ambiguity without inventing magnitudes',()=>{const p=parseDescription('Деталь работает на изгиб и растяжение вдоль X. На улице, с винтами и точными посадками.');assert.deepEqual(p.loads,['bending','tension']);assert.deepEqual(p.workAxis,[1,0,0]);assert.ok(p.tags.includes('fastener'));assert.ok(p.tags.includes('outdoor'));assert.equal('force' in p,false);});
test('hole axis does not replace the load path in the comment',()=>{const p=parseDescription('Кронштейн. Изгиб вдоль длинного плеча X. Точные отверстия вдоль Z.');assert.deepEqual(p.workAxis,[1,0,0]);assert.deepEqual(p.holeAxis,[0,0,1]);});
test('English part descriptions identify loads, independent hole direction and conditions',()=>{const p=parseDescription('Bracket bending along X. Holes along Z with accurate fits and screws. Outdoors in rain near a hot motor.');assert.ok(p.loads.includes('bending'));assert.deepEqual(p.workAxis,[1,0,0]);assert.deepEqual(p.holeAxis,[0,0,1]);for(const tag of ['outdoor','moisture','fit','fastener','heat'])assert.ok(p.tags.includes(tag));assert.equal('force' in p,false);});
