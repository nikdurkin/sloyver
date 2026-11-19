import * as THREE from './vendor/three.module.js';

// Display-only normals. The original face normals remain available to geometry
// classification and picking; smoothing never changes the imported mesh.
export function previewNormals(positions, creaseDegrees = 35) {
  const face = new Float32Array(positions.length), smooth = new Float32Array(positions.length);
  const groups = new Map(), indices = new Uint32Array(positions.length / 3), lists = [];
  let maximum = 1;
  for (const value of positions) maximum = Math.max(maximum, Math.abs(value));
  const tolerance = Math.max(1e-7, maximum * 1e-8);
  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i + 3] - positions[i], ay = positions[i + 4] - positions[i + 1], az = positions[i + 5] - positions[i + 2];
    const bx = positions[i + 6] - positions[i], by = positions[i + 7] - positions[i + 1], bz = positions[i + 8] - positions[i + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length; ny /= length; nz /= length;
    for (let j = 0; j < 9; j += 3) {
      const k = i + j;
      face[k] = nx; face[k + 1] = ny; face[k + 2] = nz;
      const key = [positions[k], positions[k + 1], positions[k + 2]].map(v => Math.round(v / tolerance)).join(',');
      let id = groups.get(key);
      if (id === undefined) { id = lists.length; groups.set(key, id); lists.push([]); }
      indices[k / 3] = id;
      lists[id].push(i);
    }
  }
  const cutoff = Math.cos(creaseDegrees * Math.PI / 180);
  for (let i = 0; i < positions.length; i += 3) {
    const adjacent = lists[indices[i / 3]];
    if (adjacent.length > 256) { smooth.set(face.subarray(i, i + 3), i); continue; }
    let x = 0, y = 0, z = 0;
    for (const k of adjacent) {
      if (face[i] * face[k] + face[i + 1] * face[k + 1] + face[i + 2] * face[k + 2] < cutoff) continue;
      x += face[k]; y += face[k + 1]; z += face[k + 2];
    }
    const length = Math.hypot(x, y, z) || 1;
    smooth[i] = x / length; smooth[i + 1] = y / length; smooth[i + 2] = z / length;
  }
  return {face, smooth};
}

// Fit all eight corners using one uniform scale, including a narrow viewport.
export function fitPreviewCamera(camera, target, size, width, height, direction = [1.9, -2.45, 1.8], margin = 1.22) {
  const aspect = Math.max(.01, width / Math.max(1, height)), center = new THREE.Vector3(0, 0, size[2] / 2);
  const backward = new THREE.Vector3(...direction).normalize();
  if (Math.abs(backward.dot(camera.up)) > .999999) backward.x += .00001;
  backward.normalize();
  camera.position.copy(center).add(backward); camera.lookAt(center); camera.updateMatrixWorld(true);
  const right = new THREE.Vector3(), up = new THREE.Vector3(), back = new THREE.Vector3();
  camera.matrixWorld.extractBasis(right, up, back);
  const radius = Math.max(.1, Math.hypot(...size) / 2);
  let distance = radius * 4;
  camera.zoom = 1;
  if (camera.isOrthographicCamera) {
    const extent = axis => Math.abs(axis.x) * size[0] + Math.abs(axis.y) * size[1] + Math.abs(axis.z) * size[2];
    const span = Math.max(.1, extent(up), extent(right) / aspect) * margin;
    camera.userData.span = span;
    camera.left = -span * aspect / 2; camera.right = span * aspect / 2;
    camera.top = span / 2; camera.bottom = -span / 2;
  } else {
    camera.aspect = aspect;
    const tanY = Math.tan(camera.fov * Math.PI / 360), tanX = tanY * aspect;
    distance = radius;
    for (const x of [-size[0] / 2, size[0] / 2]) for (const y of [-size[1] / 2, size[1] / 2]) for (const z of [-size[2] / 2, size[2] / 2]) {
      const point = new THREE.Vector3(x, y, z), depth = point.dot(back);
      distance = Math.max(distance, depth + Math.abs(point.dot(right)) * margin / tanX, depth + Math.abs(point.dot(up)) * margin / tanY);
    }
  }
  camera.position.copy(center).addScaledVector(back, distance);
  camera.near = Math.max(.001, radius / 500); camera.far = Math.max(1000, distance + radius * 100);
  camera.lookAt(center); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  target.copy(center);
  return {radius, distance};
}

const gamma = Uint8ClampedArray.from({length: 4096}, (_, i) => {
  const c = i / 4095;
  return 255 * (c <= .0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - .055);
});
const toByte = c => gamma[Math.min(4095, Math.max(0, Math.round(c * 4095)))];
const clipDistances = [v => v[3] + v[0], v => v[3] - v[0], v => v[3] + v[1], v => v[3] - v[1], v => v[3] + v[2], v => v[3] - v[2]];
const keyLight = new THREE.Vector3(-.4, -.65, .85).normalize();
const fillLight = new THREE.Vector3(.7, .25, .45).normalize();

export function createPreviewTarget(width, height) {
  width = Math.max(1, Math.round(width)); height = Math.max(1, Math.round(height));
  return {width, height, pixels: new Uint8ClampedArray(width * height * 4), depth: new Float32Array(width * height)};
}

// A depth buffer draws every triangle. Sorting triangle centres or dropping
// triangles creates false holes in CAD parts with bores and thin walls.
export function renderMeshPreview({positions, normals, colors, modelMatrix = new THREE.Matrix4(), viewProjection, target, width = 320, height = 200, layerSpacing = 0, edgePositions, edgeColor = [24, 72, 52], edgeWidth = 1}) {
  target ||= createPreviewTarget(width, height);
  const {pixels, depth} = target; ({width, height} = target);
  pixels.fill(0); depth.fill(Infinity);
  const matrix = new THREE.Matrix4().multiplyMatrices(viewProjection, modelMatrix).elements;
  const world = modelMatrix.elements, normalMatrix = new THREE.Matrix3().getNormalMatrix(modelMatrix).elements;
  const a = new Float64Array(8), b = new Float64Array(8), c = new Float64Array(8), vertices = [a, b, c];
  let rasterized = 0;
  function drawTriangle(v0, v1, v2) {
    if (v0[3] <= 0 || v1[3] <= 0 || v2[3] <= 0) return;
    const iw0 = 1 / v0[3], iw1 = 1 / v1[3], iw2 = 1 / v2[3];
    const x0 = (v0[0] * iw0 + 1) * width / 2, y0 = (1 - v0[1] * iw0) * height / 2;
    const x1 = (v1[0] * iw1 + 1) * width / 2, y1 = (1 - v1[1] * iw1) * height / 2;
    const x2 = (v2[0] * iw2 + 1) * width / 2, y2 = (1 - v2[1] * iw2) * height / 2;
    const area = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
    if (Math.abs(area) < 1e-10) return;
    const minX = Math.max(0, Math.ceil(Math.min(x0, x1, x2) - .5)), maxX = Math.min(width - 1, Math.floor(Math.max(x0, x1, x2) - .5));
    const minY = Math.max(0, Math.ceil(Math.min(y0, y1, y2) - .5)), maxY = Math.min(height - 1, Math.floor(Math.max(y0, y1, y2) - .5));
    if (minX > maxX || minY > maxY) return;
    rasterized++;
    const sign = area > 0 ? 1 : -1, inverseArea = 1 / area;
    const dx0 = y1 - y2, dy0 = x2 - x1, dx1 = y2 - y0, dy1 = x0 - x2, dx2 = y0 - y1, dy2 = x1 - x0;
    let e0Row = (x2 - x1) * (minY + .5 - y1) - (y2 - y1) * (minX + .5 - x1);
    let e1Row = (x0 - x2) * (minY + .5 - y2) - (y0 - y2) * (minX + .5 - x2);
    let e2Row = (x1 - x0) * (minY + .5 - y0) - (y1 - y0) * (minX + .5 - x0);
    const z0 = v0[2] * iw0, z1 = v1[2] * iw1, z2 = v2[2] * iw2;
    for (let y = minY; y <= maxY; y++, e0Row += dy0, e1Row += dy1, e2Row += dy2) {
      let e0 = e0Row, e1 = e1Row, e2 = e2Row;
      for (let x = minX; x <= maxX; x++, e0 += dx0, e1 += dx1, e2 += dx2) {
        if (e0 * sign < -1e-7 || e1 * sign < -1e-7 || e2 * sign < -1e-7) continue;
        const p = y * width + x, u = e0 * inverseArea, v = e1 * inverseArea, w = e2 * inverseArea;
        const z = u * z0 + v * z1 + w * z2;
        if (z < -1.00001 || z > 1.00001 || z >= depth[p]) continue;
        depth[p] = z;
        const d = u * iw0 + v * iw1 + w * iw2, q0 = u * iw0 / d, q1 = v * iw1 / d, q2 = w * iw2 / d;
        let shade = 1;
        if (layerSpacing > 0) {
          const fraction = (q0 * v0[7] + q1 * v1[7] + q2 * v2[7]) / layerSpacing;
          if (fraction - Math.floor(fraction) > .83) shade = .80;
        }
        const i = p * 4;
        pixels[i] = toByte((q0 * v0[4] + q1 * v1[4] + q2 * v2[4]) * shade);
        pixels[i + 1] = toByte((q0 * v0[5] + q1 * v1[5] + q2 * v2[5]) * shade);
        pixels[i + 2] = toByte((q0 * v0[6] + q1 * v1[6] + q2 * v2[6]) * shade);
        pixels[i + 3] = 255;
      }
    }
  }
  for (let triangle = 0; triangle < positions.length; triangle += 9) {
    for (let j = 0; j < 3; j++) {
      const i = triangle + j * 3, v = vertices[j], x = positions[i], y = positions[i + 1], z = positions[i + 2];
      v[0] = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
      v[1] = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
      v[2] = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
      v[3] = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
      v[7] = world[2] * x + world[6] * y + world[10] * z + world[14];
    }
    if (clipDistances.some(distance => vertices.every(v => distance(v) < 0))) continue;
    const turn = (b[0] / b[3] - a[0] / a[3]) * (c[1] / c[3] - a[1] / a[3]) - (b[1] / b[3] - a[1] / a[3]) * (c[0] / c[3] - a[0] / a[3]);
    const side = turn >= 0 ? 1 : -1;
    for (let j = 0; j < 3; j++) {
      const i = triangle + j * 3, v = vertices[j];
      let nx = normals?.[i] ?? 0, ny = normals?.[i + 1] ?? 0, nz = normals?.[i + 2] ?? 1;
      const tx = normalMatrix[0] * nx + normalMatrix[3] * ny + normalMatrix[6] * nz;
      const ty = normalMatrix[1] * nx + normalMatrix[4] * ny + normalMatrix[7] * nz;
      const tz = normalMatrix[2] * nx + normalMatrix[5] * ny + normalMatrix[8] * nz;
      const length = Math.hypot(tx, ty, tz) || 1;
      nx = tx / length * side; ny = ty / length * side; nz = tz / length * side;
      const light = .26 + .61 * Math.max(0, nx * keyLight.x + ny * keyLight.y + nz * keyLight.z) + .13 * Math.max(0, nx * fillLight.x + ny * fillLight.y + nz * fillLight.z);
      v[4] = (colors?.[i] ?? .0865) * light; v[5] = (colors?.[i + 1] ?? .485) * light; v[6] = (colors?.[i + 2] ?? .262) * light;
    }
    if (vertices.every(v => clipDistances.every(distance => distance(v) >= 0))) { drawTriangle(a, b, c); continue; }
    let polygon = [a, b, c];
    for (const distance of clipDistances) {
      const next = [];
      for (let i = 0; i < polygon.length; i++) {
        const from = polygon[i], to = polygon[(i + 1) % polygon.length], d0 = distance(from), d1 = distance(to);
        if (d0 >= 0) next.push(from);
        if ((d0 >= 0) !== (d1 >= 0)) {
          const t = d0 / (d0 - d1), intersection = new Float64Array(8);
          for (let k = 0; k < 8; k++) intersection[k] = from[k] + t * (to[k] - from[k]);
          next.push(intersection);
        }
      }
      polygon = next;
      if (polygon.length < 3) break;
    }
    for (let i = 1; i + 1 < polygon.length; i++) drawTriangle(polygon[0], polygon[i], polygon[i + 1]);
  }
  if (edgePositions) {
    const project = i => {
      const x = edgePositions[i], y = edgePositions[i + 1], z = edgePositions[i + 2];
      return [matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12], matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13], matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14], matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15]];
    };
    for (let i = 0; i < edgePositions.length; i += 6) {
      const a = project(i), b = project(i + 3); let lo = 0, hi = 1;
      for (const distance of clipDistances) {
        const d0 = distance(a), d1 = distance(b);
        if (d0 < 0 && d1 < 0) { hi = -1; break; }
        if ((d0 < 0) !== (d1 < 0)) { const t = d0 / (d0 - d1); if (d0 < 0) lo = Math.max(lo, t); else hi = Math.min(hi, t); }
      }
      if (lo > hi) continue;
      const start = a.map((v, k) => v + lo * (b[k] - v)), end = a.map((v, k) => v + hi * (b[k] - v));
      if (start[3] <= 0 || end[3] <= 0) continue;
      const x0 = (start[0] / start[3] + 1) * width / 2, y0 = (1 - start[1] / start[3]) * height / 2, z0 = start[2] / start[3];
      const x1 = (end[0] / end[3] + 1) * width / 2, y1 = (1 - end[1] / end[3]) * height / 2, z1 = end[2] / end[3];
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))), radius = Math.max(0, Math.ceil(edgeWidth / 2) - 1);
      for (let j = 0; j <= steps; j++) {
        const t = j / steps, x = Math.floor(x0 + (x1 - x0) * t), y = Math.floor(y0 + (y1 - y0) * t), z = z0 + (z1 - z0) * t;
        for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          const p = yy * width + xx;
          if (z > depth[p] + .00002) continue;
          for (let k = 0; k < 3; k++) pixels[p * 4 + k] = pixels[p * 4 + 3] ? pixels[p * 4 + k] * .35 + edgeColor[k] * .65 : edgeColor[k];
          pixels[p * 4 + 3] = 255;
        }
      }
    }
  }
  return {...target, trianglesSubmitted: positions.length / 9, trianglesRasterized: rasterized};
}
