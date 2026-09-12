/**
 * Guyuan minimal asset builder: replaces the Blender-authored Shenzhen GLBs
 * with geometry generated straight from public/city/city.json, plus flat/empty
 * stubs for the Shenzhen-specific terrain systems (mountains, ground relief,
 * coastal, facade tiles, signage, lamps). Run: node scripts/build_city_glb.mjs
 *
 * v1 conventions (must match runtime expectations):
 *  - buildings.glb: prism per footprint; materials named office/residential
 *    (city-architecture-materials ORDINARY map re-profiles them by name).
 *  - roads.glb: flat y=.10 ribbons, material 'asphalt', mesh names *_asphalt
 *    (city-mountains.drapePaths regex), UV world east/north / 14.
 *  - terrain.glb: mesh names terrain_land / terrain_park / terrain_water
 *    (applyLandscapeSurfaces + GroundCoverPlugin regex), grass UV world / 8.
 *  - landmarks.glb: placeholder boxes named landmark_<id>, material 'stone'.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import earcut from 'earcut';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/city');
const city = JSON.parse(fs.readFileSync(path.join(OUT, 'city.json'), 'utf8'));

/* ---------- minimal GLB writer ---------- */
class GLB {
  constructor() {
    this.json = {asset: {version: '2.0', generator: 'guyuan-city-build'}, scene: 0,
      scenes: [{nodes: [0]}], nodes: [{mesh: 0}], meshes: [], materials: [],
      accessors: [], bufferViews: [], buffers: []};
    this.bins = [];
    this.binLen = 0;
  }
  material(name, base = [1, 1, 1], rough = .8, metal = 0) {
    const i = this.json.materials.length;
    this.json.materials.push({name, pbrMetallicRoughness: {
      baseColorFactor: base, roughnessFactor: rough, metallicFactor: metal}});
    return i;
  }
  #view(data, target) {
    const pad = (4 - (this.binLen % 4)) % 4;
    if (pad) { this.bins.push(Buffer.alloc(pad)); this.binLen += pad; }
    const bv = {buffer: 0, byteOffset: this.binLen, byteLength: data.length};
    if (target) bv.target = target;
    this.json.bufferViews.push(bv); this.bins.push(data); this.binLen += data.length;
    return this.json.bufferViews.length - 1;
  }
  mesh(name, mat, {positions, normals, uvs, colors, indices}) {
    const mi = this.json.meshes.length;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) {
      if (positions[i + k] < min[k]) min[k] = positions[i + k];
      if (positions[i + k] > max[k]) max[k] = positions[i + k];
    }
    const pr = {attributes: {}, indices: 0, material: mat};
    pr.attributes.POSITION = this.#view(Buffer.from(new Float32Array(positions).buffer), 34962);
    this.json.accessors.push({bufferView: pr.attributes.POSITION, componentType: 5126,
      count: positions.length / 3, type: 'VEC3', min, max});
    pr.attributes.NORMAL = this.#view(Buffer.from(new Float32Array(normals).buffer), 34962);
    this.json.accessors.push({bufferView: pr.attributes.NORMAL, componentType: 5126,
      count: normals.length / 3, type: 'VEC3'});
    if (uvs) {
      pr.attributes.TEXCOORD_0 = this.#view(Buffer.from(new Float32Array(uvs).buffer), 34962);
      this.json.accessors.push({bufferView: pr.attributes.TEXCOORD_0, componentType: 5126,
        count: uvs.length / 2, type: 'VEC2'});
    }
    if (colors) {
      pr.attributes.COLOR_0 = this.#view(Buffer.from(new Float32Array(colors).buffer), 34962);
      this.json.accessors.push({bufferView: pr.attributes.COLOR_0, componentType: 5126,
        count: colors.length / 4, type: 'VEC4'});
    }
    pr.indices = this.#view(Buffer.from(new Uint32Array(indices).buffer), 34963);
    this.json.accessors.push({bufferView: pr.indices, componentType: 5125,
      count: indices.length, type: 'SCALAR'});
    this.json.meshes.push({name, primitives: [pr]});
    return mi;
  }
  addMeshNode(name, mat, geom) {
    const mi = this.mesh(name, mat, geom);
    this.json.nodes.push({mesh: mi, name});
    return this.json.nodes.length - 1;
  }
  build(name) {
    // root node children
    const children = this.json.nodes.slice(1).map((_, i) => i + 1);
    this.json.scenes[0].nodes = [0];
    this.json.nodes[0] = {children};
    this.json.buffers = [{byteLength: this.binLen}];
    const enc = new TextEncoder();
    let jsonBuf = enc.encode(JSON.stringify(this.json));
    const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
    if (jsonPad) { const b = new Uint8Array(jsonBuf.length + jsonPad).fill(0x20); b.set(jsonBuf); jsonBuf = b; }
    const bin = Buffer.concat(this.bins);
    const head = Buffer.alloc(12);
    head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + bin.length, 8);
    const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length, 0); jh.writeUInt32LE(0x4E4F534A, 4);
    const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004E4942, 4);
    fs.writeFileSync(path.join(OUT, name), Buffer.concat([head, jh, jsonBuf, bh, bin]));
    console.log(name, (bin.length / 1024).toFixed(0) + 'KiB', this.json.meshes.length, 'meshes');
  }
}

/* ---------- geometry helpers ---------- */
function normalsOf(positions, indices) {
  const n = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const o of [a, b, c]) { n[o] += nx; n[o + 1] += ny; n[o + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}

/** Extruded prism from outer ring (city.json ring = [[x,z],...]). */
function prism(ring, height, {wallUVPeriod = 3.3} = {}) {
  const flat = [];
  for (const [x, z] of ring) flat.push(x, z);
  const tri = earcut(flat, null, 2);
  const positions = [], uvs = [], indices = [];
  // roof at height, planar UV world/8
  const roofBase = 0;
  for (const [x, z] of ring) { positions.push(x, height, z); uvs.push(x / 8, z / 8); }
  for (let i = 0; i < tri.length; i += 3) indices.push(tri[i], tri[i + 1], tri[i + 2]);
  // walls: quads per edge, uv = (perimeter distance / period, height / period)
  let acc = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, z1] = ring[i], [x2, z2] = ring[i + 1];
    const len = Math.hypot(x2 - x1, z2 - z1); if (len < 1e-4) continue;
    const base = positions.length / 3;
    const u1 = acc / wallUVPeriod, u2 = (acc + len) / wallUVPeriod;
    positions.push(x1, 0, z1, x2, 0, z2, x2, height, z2, x1, height, z1);
    uvs.push(u1, 0, u2, 0, u2, height / wallUVPeriod, u1, height / wallUVPeriod);
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    acc += len;
  }
  return {positions, normals: normalsOf(positions, indices), uvs, indices};
}

/** Flat ribbon for a road polyline; UV = world/14 per city-road-surface. */
function ribbon(points, width, y = .10) {
  const half = width / 2, positions = [], uvs = [], indices = [];
  const offs = points.map((p, i) => {
    const prev = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
    const dx = next[0] - prev[0], dz = next[1] - prev[1], l = Math.hypot(dx, dz) || 1;
    return [-dz / l * half, dx / l * half];
  });
  points.forEach((p, i) => {
    positions.push(p[0] + offs[i][0], y, p[1] + offs[i][1], p[0] - offs[i][0], y, p[1] - offs[i][1]);
    uvs.push(p[0] / 14, p[1] / 14, p[0] / 14, p[1] / 14);
    if (i < points.length - 1) { const b = i * 2; indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
  });
  return {positions, normals: normalsOf(positions, indices), uvs, indices};
}

/** Flat triangulated polygon at y (green/water), UV world/8. */
function flatPoly(ring, y) {
  const flat = []; for (const [x, z] of ring) flat.push(x, z);
  const tri = earcut(flat, null, 2);
  const positions = [], uvs = [], indices = [];
  for (const [x, z] of ring) { positions.push(x, y, z); uvs.push(x / 8, z / 8); }
  for (let i = 0; i < tri.length; i += 3) indices.push(tri[i], tri[i + 1], tri[i + 2]);
  return {positions, normals: positions.map((_, i) => (i % 3 === 1 ? 1 : 0)), uvs, indices};
}

/** Big subdivided ground quad so fog/normal interpolation stays sane. */
function groundQuad(x0, z0, x1, z1, step = 64, y = 0) {
  const cols = Math.max(1, Math.ceil((x1 - x0) / step)), rows = Math.max(1, Math.ceil((z1 - z0) / step));
  const positions = [], uvs = [], indices = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const x = x0 + (x1 - x0) * i / cols, z = z0 + (z1 - z0) * j / rows;
    positions.push(x, y, z); uvs.push(x / 8, z / 8);
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = j * (cols + 1) + i, b = a + 1, d = a + cols + 1, c = d + 1;
    indices.push(a, c, b, a, d, c);
  }
  return {positions, normals: positions.map((_, i) => (i % 3 === 1 ? 1 : 0)), uvs, indices};
}

function box(cx, cz, size, height) {
  const h = size / 2, ring = [];
  for (const [x, z] of [[cx - h, cz - h], [cx + h, cz - h], [cx + h, cz + h], [cx - h, cz + h], [cx - h, cz - h]]) ring.push([x, z]);
  return prism(ring, height);
}

/* ---------- buildings.glb (merged per 640m cell x style) ----------
 * Mesh names follow the engine's culling convention: block_<gx>_<gz>_<style>
 * matches /(?:block|roads)_(-?\d+)_(-?\d+)_/ in city-world.ts, so the 640m
 * block system registers them for distance culling / shadows / reflections.
 * Vertex colours are multiplicative in the runtime: per-building wall tint,
 * darkened roofs. */
{
  const g = new GLB();
  const mats = {office: g.material('office', [.8, .88, .94], .4, .05),
    residential: g.material('residential', [.95, .92, .86], .72, 0),
    concrete: g.material('concrete', [.72, .7, .64], .84, 0)};
  const CELL = 640;
  const buckets = new Map();
  // deterministic per-building tint
  const srand = (() => { let s = 42; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
  for (const b of city.buildings) {
    const style = (b.style === 'office') ? 'office' : 'residential';
    const ringLen = b.rings[0].length;
    const geom = prism(b.rings[0], b.height);
    // wall tint: warm/cool variation around white; roofs darker grey
    const t = .86 + srand() * .2, warm = (srand() - .5) * .12, cool = (srand() - .5) * .1;
    const wallR = Math.min(1.1, t + warm), wallG = Math.min(1.1, t), wallB = Math.min(1.1, t + cool);
    const colors = new Float32Array(geom.positions.length);
    for (let v = 0; v < geom.positions.length / 3; v++) {
      const roof = v < ringLen, o = v * 4;
      if (roof) { colors[o] = .42; colors[o + 1] = .43; colors[o + 2] = .45; }
      else { colors[o] = wallR; colors[o + 1] = wallG; colors[o + 2] = wallB; }
      colors[o + 3] = 1;
    }
    const key = Math.floor(b.rings[0][0][0] / CELL) + ',' + Math.floor(b.rings[0][0][1] / CELL) + ':' + style;
    let bucket = buckets.get(key);
    if (!bucket) { bucket = {style, positions: [], normals: [], uvs: [], colors: [], indices: []}; buckets.set(key, bucket); }
    const base = bucket.positions.length / 3;
    for (const v of geom.positions) bucket.positions.push(v);
    for (const v of geom.normals) bucket.normals.push(v);
    for (const v of geom.uvs) bucket.uvs.push(v);
    for (const v of colors) bucket.colors.push(v);
    for (const i of geom.indices) bucket.indices.push(i + base);
  }
  for (const [key, bucket] of buckets) {
    const [gx, gz] = key.split(':').join(',').split(',');
    g.addMeshNode(`block_${gx}_${gz}_${bucket.style}`, mats[bucket.style], bucket);
  }
  console.log('  buildings merged into', buckets.size, 'draw meshes');
  g.build('buildings.glb');
}

/* ---------- roads.glb (merged per 640m cell, roads_<gx>_<gz>_ naming) ---------- */
{
  const g = new GLB();
  const asphalt = g.material('asphalt', [.35, .35, .36], .75, 0);
  const CELL = 640;
  const buckets = new Map();
  for (const r of city.roads) {
    const geom = ribbon(r.points, r.width);
    const cx = r.points.reduce((s, p) => s + p[0], 0) / r.points.length;
    const cz = r.points.reduce((s, p) => s + p[1], 0) / r.points.length;
    const key = Math.floor(cx / CELL) + ',' + Math.floor(cz / CELL);
    let bucket = buckets.get(key);
    if (!bucket) { bucket = {positions: [], normals: [], uvs: [], indices: []}; buckets.set(key, bucket); }
    const base = bucket.positions.length / 3;
    for (const v of geom.positions) bucket.positions.push(v);
    for (const v of geom.normals) bucket.normals.push(v);
    for (const v of geom.uvs) bucket.uvs.push(v);
    for (const i of geom.indices) bucket.indices.push(i + base);
  }
  for (const [key, bucket] of buckets) {
    const [gx, gz] = key.split(',');
    g.addMeshNode(`roads_${gx}_${gz}_asphalt`, asphalt, bucket);
  }
  console.log('  roads merged into', buckets.size, 'draw meshes');
  g.build('roads.glb');
}

/* ---------- terrain.glb ---------- */
{
  const [x0, z0, x1, z1] = city.meta.extent;
  const g = new GLB();
  g.addMeshNode('terrain_land', g.material('land', [.82, .82, .74], .95, 0), groundQuad(x0 - 200, z0 - 200, x1 + 200, z1 + 200));
  const park = g.material('park', [.55, .68, .42], .95, 0);
  city.green.forEach((p, i) => g.addMeshNode('terrain_park_' + i, park, flatPoly(p.rings[0], .02)));
  const water = g.material('water', [.16, .35, .42], .15, .1);
  city.water.forEach((p, i) => g.addMeshNode('terrain_water_' + i, water, flatPoly(p.rings[0], .04)));
  g.build('terrain.glb');
}

/* ---------- landmarks.glb ---------- */
{
  const g = new GLB();
  const stone = g.material('stone', [.88, .86, .82], .78, 0);
  for (const m of city.landmarks) {
    if (!(m.height > 0)) continue;
    const size = Math.min(Math.max(m.excludeRadius * .9, 12), 48);
    g.addMeshNode('landmark_' + m.id, stone, box(m.x, m.z, size, m.height));
  }
  g.build('landmarks.glb');
}

/* ---------- empty stubs for Shenzhen-specific coastal meshes ---------- */
const stubGeom = {positions: [0, -500, 0, 1, -500, 0, 0, -500, 1],
  normals: [0, 1, 0, 0, 1, 0, 0, 1, 0], uvs: [0, 0, 1, 0, 0, 1], indices: [0, 1, 2]};
for (const name of ['coastal-bridges.glb', 'coastal-shoreline.glb', 'opposite-shore.glb']) {
  const g = new GLB();
  g.addMeshNode(name.replace('.glb', '') + '_stub', g.material('concrete'), stubGeom);
  g.build(name);
}

/* ---------- manifest stubs ---------- */
const w = (rel, data) => {
  fs.mkdirSync(path.dirname(path.join(OUT, rel)), {recursive: true});
  fs.writeFileSync(path.join(OUT, rel), typeof data === 'string' ? data : JSON.stringify(data));
  console.log(rel);
};
const [ex0, ez0, ex1, ez1] = city.meta.extent;
// Mountain relief: zero-delta heightfields (flat plateau city).
const mgrid = {x0: ex0 - 2000, z0: ez0 - 2000, step: 300, columns: 64, rows: 64};
const mmanifest = f => ({schemaVersion: 1, file: f, grid: mgrid,
  tiles: [{id: 'flat', column: 0, row: 0, columns: 64, rows: 64, triangles: 2 * 63 * 63}],
  surfaceOffset: 0,
  budgets: {triangles: 2 * 63 * 63, tiles: 1, bytes: 64 * 64 * 4, maxHeight: 0},
  places: [], ridgeSamples: []});
w('mountain-relief/manifest.json', mmanifest('heights-main.bin'));
w('mountain-relief/near-manifest.json', mmanifest('heights-near.bin'));
fs.writeFileSync(path.join(OUT, 'mountain-relief/heights-main.bin'), Buffer.alloc(64 * 64 * 4));
fs.writeFileSync(path.join(OUT, 'mountain-relief/heights-near.bin'), Buffer.alloc(64 * 64 * 4));
// Ground relief: geometry disabled at init; empty tiles only. All ReliefManifest
// fields must exist (GroundCoverPlugin reads extent unconditionally at bind time).
fs.copyFileSync(path.join(OUT, 'textures/grass.jpg'), path.join(OUT, 'ground-relief/cover.jpg'));
w('ground-relief/manifest.json', {schemaVersion: 1, mesh: 'mesh.bin', macroTexture: 'cover.jpg',
  extent: [ex0, ez0, ex1, ez1], textureSize: [4, 4], tiles: [],
  preservedTerrainBounds: [ex0, ez0, ex1, ez1], preservedTerrainMargin: 0, surfaceOffset: 0,
  lookupCellSize: 64,
  budgets: {triangles: 0, vertices: 0, meshBytes: 0, tiles: 0, maxAddedHeight: 0, maxSlope: 0, textureBytesWithMipmaps: 0}});
w('coastal/infrastructure.json', {schemaVersion: 1, waterHeight: 0, crossings: [], parkLights: [],
  shoreDistance: {url: '', extent: [ex0, ez0, ex1, ez1], maxDistance: 0}});
w('facade-tiles.json', {tiles: []});
w('lamps.json', []);
w('life-sites.json', {sites: [
  // Career sites need id/name/x/z/heading/arrival/yaw; coordinates are near
  // downtown Guyuan: hub by the spawn road, office by 市政府, workshop by 中医院.
  {id: 'hub', name: '固原生活驿站', x: -1420, z: -940, heading: 0, arrival: [-1447, -965], yaw: 0},
  {id: 'office', name: '固原市政府写字楼', x: -3050, z: -360, heading: 2.56, arrival: [-3058, -356], yaw: 2.56},
  {id: 'workshop', name: '老城工坊', x: -2440, z: 1160, heading: 1.0, arrival: [-2516, 1273], yaw: 1.0},
]});
w('building-signs.json', {schemaVersion: 1, noNewLights: true, signs: []});
w('landmark-signage.json', {schemaVersion: 1, noNewLights: true, artwork: [], placements: []});
fs.rmSync(path.join(OUT, 'landmark-detail.json'), {force: true});

/* ---------- navigation.json: node/edge graph snapped to a 3m grid ---------- */
{
  const lookup = new Map(), nodes = [], edges = [];
  const id = p => {
    const key = Math.round(p[0] / 3) + ',' + Math.round(p[1] / 3);
    let i = lookup.get(key);
    if (i === undefined) { i = nodes.length; lookup.set(key, i); nodes.push([p[0], p[1]]); }
    return i;
  };
  const seen = new Set();
  for (const r of city.roads) {
    let prev = id(r.points[0]);
    for (let i = 1; i < r.points.length; i++) {
      const cur = id(r.points[i]);
      if (cur !== prev) {
        const key = Math.min(prev, cur) + '-' + Math.max(prev, cur);
        if (!seen.has(key)) { seen.add(key); edges.push([Math.min(prev, cur), Math.max(prev, cur)]); }
        prev = cur;
      }
    }
  }
  w('navigation.json', {nodes, edges});
  console.log('navigation.json', nodes.length, 'nodes', edges.length, 'edges');
}
console.log('done');
