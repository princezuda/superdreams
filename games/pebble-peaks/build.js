// Pebble Peaks — turns level data into meshes. Static terrain is merged into ONE mesh with a TSL "grass-drip" shader
// (top colour creeps over rounded edges with a noisy lip, strata + depth darkening on the sides); decor is instanced.
import { THREE, canvasTexture } from '/shared/sd-kit.js';
import { Fn, uniform, attribute, positionLocal, positionWorld, positionWorldDirection, normalWorld, normalLocal, mix, smoothstep, step, sin, max, min, float, vec3, vec2, mx_noise_float, mx_fractal_noise_float, time, clamp, uv, length, abs, pow, fract, floor, dot, atan } from 'three/tsl';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { topAt as physTopAt } from './physics.js';
const topAt = (s, x, z) => physTopAt(s.hx !== undefined ? s : { ...s, hx: s.w / 2, hz: s.d / 2 }, x, z);

// ------------------------------------------------------------------ themes (palette per level; colorblind variants shift hazard hues)
const C = (h) => new THREE.Color(h);
export const THEMES = {
  hub: { sky: ['#5ab0ff', '#d8f0ff', '#fff4d0'], sunDir: [0.45, 0.75, 0.5], cloudsAmt: 1, stars: 0, fog: ['#d4ecff', 80, 330], hemi: ['#d8ecff', '#6a8a4a', 1.05], key: ['#fff1d6', 2.7], rim: ['#b0d0ff', 0.8], amb: 0.16, sea: 'water', exposure: 1.0,
    seaCol: ['#2c86c8', '#63cdea'], shard: '#ffcf4a',
    mats: { ground: ['#7fd04a', '#b07a4c'], stone: ['#d6d2c8', '#a39d92'], plank: ['#d6a061', '#98653c'], crack: ['#b4a596', '#9a8b7d'], shroom: ['#ff5d5d', '#f6ead8'] },
    tree: ['#5c3d24', '#5fbf3f', '#7fd655'], flowers: ['#ff6f91', '#ffd84a', '#ffffff', '#8fb8ff', '#ff9e4a'], tuft: '#5fb83a', rock: '#a6a39a' },
  meadow: { sky: ['#4ea6ff', '#d2edff', '#fff2c8'], sunDir: [0.5, 0.72, 0.48], cloudsAmt: 1, stars: 0, fog: ['#cfe8ff', 80, 340], hemi: ['#d2eaff', '#5f7d3a', 1.0], key: ['#fff1d6', 2.7], rim: ['#a8c8ff', 0.9], amb: 0.15, sea: 'water', exposure: 1.0,
    seaCol: ['#2a7fc0', '#5cc6e8'], shard: '#ffcf4a',
    mats: { ground: ['#79cd45', '#b07a4c'], stone: ['#cfcac0', '#9b958c'], plank: ['#d39a5a', '#94603a'], crumble: ['#f2d58c', '#d0a866'], crack: ['#b0a294', '#968779'], shroom: ['#ff5d5d', '#f6ead8'] },
    tree: ['#5c3d24', '#4fb43a', '#79d34e'], flowers: ['#ff6f91', '#ffd84a', '#ffffff', '#8fb8ff', '#c38bff'], tuft: '#5aae36', rock: '#a29e94' },
  caves: { sky: ['#0b0618', '#2a1646', '#9a6cff'], sunDir: [-0.35, 0.8, 0.45], cloudsAmt: 0, stars: 1, fog: ['#1d1033', 30, 130], hemi: ['#a89cff', '#2a1a48', 1.15], key: ['#d8ccff', 2.1], rim: ['#46e3ff', 1.5], amb: 0.32, sea: 'abyss', exposure: 1.2,
    seaCol: ['#12081f', '#7b3cff'], shard: '#5ff0ff',
    mats: { ground: ['#4fd1b8', '#4a3e70'], stone: ['#8d86c4', '#4b4370'], wall: ['#5a4f8a', '#3e3566'], crystalwall: ['#c2a0ff', '#8a64ff'], plank: ['#8b78c0', '#5a4a86'], crumble: ['#8fe8ff', '#5ab0d8'], crack: ['#7a6fa6', '#5d5288'], shroom: ['#45e0c8', '#e8e0ff'] },
    tree: ['#4a3a6a', '#6a54b8', '#8a70e0'], flowers: ['#5ff0ff', '#ff7ae0', '#b9a4ff'], tuft: '#3fb8a0', rock: '#5d557f', crystal: ['#58f0ff', '#ff6ae6'] },
  sky: { sky: ['#4a6ef0', '#ffc9de', '#fff0c4'], sunDir: [0.55, 0.55, 0.6], cloudsAmt: 1.4, stars: 0, fog: ['#f3c6dc', 110, 360], hemi: ['#ffe6f2', '#6a5a9a', 0.95], key: ['#fff0d8', 2.6], rim: ['#c8b0ff', 1.0], amb: 0.12, sea: 'clouds', exposure: 0.95,
    seaCol: ['#a99ad8', '#f6ecff'], shard: '#ffcf4a',
    mats: { ground: ['#9be86b', '#e6b98e'], stone: ['#f4f0e8', '#d7cdbf'], plank: ['#f6cf86', '#c99654'], crumblecloud: ['#ffffff', '#ffe8f4'], crumble: ['#ffffff', '#ffe8f4'], crack: ['#d8cbbd', '#bfb0a2'], shroom: ['#ffa94d', '#fff3e0'], cloud: ['#ffffff', '#f4ecff'] },
    tree: ['#8a5a3c', '#ff9ec7', '#ffc2dc'], flowers: ['#ffffff', '#ffd84a', '#8fb8ff', '#ff8fb8'], tuft: '#7fd655', rock: '#d6cfc4' },
  forge: { sky: ['#1a0606', '#7a2010', '#ffb060'], sunDir: [0.35, 0.6, 0.7], cloudsAmt: 0.5, stars: 0.3, fog: ['#3a1208', 50, 190], hemi: ['#ffb08a', '#3a140c', 0.95], key: ['#ffd8b8', 2.3], rim: ['#ff5a2a', 1.6], amb: 0.22, sea: 'lava', exposure: 1.05,
    seaCol: ['#ff3a00', '#ffd040'], shard: '#ffe27a',
    mats: { ground: ['#8c7478', '#4e3e42'], metal: ['#b4bac4', '#6f7480'], arena: ['#9a7c72', '#4e3a36'], plank: ['#a8aeb8', '#686e78'], basalt: ['#6a5a5e', '#3a2e32'], crumble: ['#a87a5c', '#6a4634'], crack: ['#7a6a64', '#5a4a44'], shroom: ['#c0c6d0', '#7a808a'], spring: ['#ffcc4a', '#8a8f99'] },
    tree: ['#3a2a24', '#5a4a40', '#6a5a50'], flowers: ['#ff7a3a', '#ffcf4a'], tuft: '#6a4a3a', rock: '#4f4246' },
};

// ------------------------------------------------------------------ shared materials
function terrainMaterial(theme) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.86, metalness: 0 });
  const cTop = attribute('cTop', 'vec3'), cSide = attribute('cSide', 'vec3'), topY = attribute('topY', 'float');
  const p = positionLocal;
  const n = mx_noise_float(p.mul(0.85));
  const lip = topY.sub(0.2).sub(sin(p.x.mul(3.3).add(p.z.mul(1.7))).mul(sin(p.z.mul(2.9).sub(p.x))).mul(0.09)).sub(n.mul(0.1));
  const topMask = max(smoothstep(0.42, 0.78, normalLocal.y), step(lip, p.y));
  const depth = clamp(topY.sub(p.y).mul(0.055), 0, 0.5);
  const strata = sin(p.y.mul(4.2).add(n.mul(1.6))).mul(0.08).add(mx_noise_float(p.mul(2.4)).mul(0.06)).add(mx_noise_float(p.mul(0.35)).mul(0.12)) // sediment bands + big blotches
    .sub(smoothstep(0.35, 0.5, abs(mx_noise_float(p.mul(vec3(1.6, 0.35, 1.6))))).mul(0.12)); // vertical cracks
  const side = cSide.mul(float(0.95).add(strata).sub(depth));
  const g = mx_noise_float(p.xz.mul(0.32)).mul(0.11).add(mx_noise_float(p.xz.mul(1.9)).mul(0.07));
  const topC = cTop.mul(float(0.96).add(g));
  const lipDark = smoothstep(0.0, 0.08, p.y.sub(lip)).mul(0.12).oneMinus(); // soft shadowed band under the lip
  m.colorNode = mix(side.mul(mix(float(1), lipDark, float(1).sub(topMask))), topC, topMask);
  if (theme === 'caves') m.emissiveNode = cTop.mul(topMask).mul(0.12);
  if (theme === 'forge') m.emissiveNode = vec3(0.9, 0.2, 0.02).mul(smoothstep(-0.2, -1.4, p.y)).mul(0.6); // lava glow licking the bases
  return m;
}
function setAttrs(geo, top, side, topY) {
  const n = geo.attributes.position.count; const a = new Float32Array(n * 3), b = new Float32Array(n * 3), t = new Float32Array(n);
  for (let i = 0; i < n; i++) { a.set([top.r, top.g, top.b], i * 3); b.set([side.r, side.g, side.b], i * 3); t[i] = typeof topY === 'function' ? topY(geo.attributes.position.getX(i), geo.attributes.position.getZ(i)) : topY; }
  geo.setAttribute('cTop', new THREE.BufferAttribute(a, 3)); geo.setAttribute('cSide', new THREE.BufferAttribute(b, 3)); geo.setAttribute('topY', new THREE.BufferAttribute(t, 1));
  geo.deleteAttribute('uv'); return geo;
}
function roundedCyl(r, h, bev = 0.22, seg = 36) {
  bev = Math.min(bev, r * 0.4, h * 0.45); const pts = [new THREE.Vector2(0, -h), new THREE.Vector2(r * 0.94, -h), new THREE.Vector2(r, -h + bev * 0.5)];
  for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI / 2; pts.push(new THREE.Vector2(r - bev + Math.cos(a) * bev, -bev + Math.sin(a) * bev)); }
  pts.push(new THREE.Vector2(0, 0)); const g = new THREE.LatheGeometry(pts, seg); return g;
}
function islandGeo(r, seed) { // floating island: grassy cap over a jagged rock cone
  const depth = r * 1.5 + 1.5; const pts = [new THREE.Vector2(0, -depth), new THREE.Vector2(r * 0.22, -depth * 0.86), new THREE.Vector2(r * 0.5, -depth * 0.6), new THREE.Vector2(r * 0.78, -depth * 0.32), new THREE.Vector2(r * 0.96, -0.75), new THREE.Vector2(r, -0.3)];
  for (let i = 1; i <= 4; i++) { const a = i / 4 * Math.PI / 2; pts.push(new THREE.Vector2(r - 0.25 + Math.cos(a) * 0.25, -0.25 + Math.sin(a) * 0.25)); } pts.push(new THREE.Vector2(0, 0));
  const g = new THREE.LatheGeometry(pts, 28); const p = g.attributes.position; let k = seed || 1; const h = (n) => { const x = Math.sin(n * 12.9898 + k) * 43758.5453; return x - Math.floor(x); };
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > -0.7) continue; const x = p.getX(i), z = p.getZ(i); const a = Math.atan2(z, x); const ai = Math.round(Math.cos(a) * 9) * 19 + Math.round(Math.sin(a) * 9); const j = 1 + (h(ai + Math.round(y * 2) * 31) - 0.5) * 0.35; p.setX(i, x * j); p.setZ(i, z * j); p.setY(i, y + (h(ai * 7) - 0.5) * 0.4 * (y < -1.5 ? 1 : 0)); }
  g.computeVertexNormals(); return g;
}
/** Geometry for one solid with its top at local y=0 (or world-placed when world=true). */
export function solidGeometry(s, pal, world = true) {
  const [ct, cs] = (pal.mats[s.m] || pal.mats.ground).map(C);
  let g; const top = s.kind === 'ramp' ? Math.max(s.top0, s.top1) : s.top; s = { ...s, top };
  if (s.kind === 'cyl' && s.island) g = islandGeo(s.r, Math.round(s.x * 7 + s.z * 3));
  else if (s.kind === 'cyl') g = roundedCyl(s.r, s.h, s.m === 'arena' ? 0.35 : 0.24);
  else if (s.kind === 'ramp') {
    g = new THREE.BoxGeometry(s.w, 1, s.d, 2, 1, 4); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); const tp = topAt(s, s.x + x, s.z + z); p.setY(i, p.getY(i) > 0 ? tp - s.top : (Math.min(s.top0, s.top1) - s.h) - s.top); }
    g.computeVertexNormals();
  } else { const r = Math.min(0.3, s.h / 2.2, s.w / 4, s.d / 4); g = new RoundedBoxGeometry(s.w, s.h, s.d, 3, r); g.translate(0, -s.h / 2, 0); }
  if (g.index) g = g.toNonIndexed();
  if (world) { g.translate(s.x, s.top, s.z); setAttrs(g, ct, cs, s.kind === 'ramp' ? (x, z) => topAt(s, x, z) : s.top); }
  else setAttrs(g, ct, cs, s.kind === 'ramp' ? (x, z) => topAt(s, s.x + x, s.z + z) - s.top : 0);
  return g;
}

// ------------------------------------------------------------------ sky + sea
export function makeSky(scene) {
  const U = { top: uniform(C('#4ea6ff')), hor: uniform(C('#d2edff')), sun: uniform(C('#fff2c8')), sunDir: uniform(new THREE.Vector3(0.4, 0.5, -0.7).normalize()), clouds: uniform(1), stars: uniform(0) };
  scene.backgroundNode = Fn(() => {
    const d = positionWorldDirection.normalize(); const up = d.y;
    let col = mix(U.hor, U.top, smoothstep(-0.05, 0.6, up).pow(0.75));
    col = mix(col, U.hor.mul(0.8), smoothstep(0.0, -0.4, up)); // below the horizon: haze
    const sd = max(dot(d, U.sunDir), 0);
    col = col.add(U.sun.mul(pow(sd, 400).mul(3.2).add(pow(sd, 12).mul(0.35))));
    // soft painted cloud bands
    const cp = d.xz.div(max(up, 0.12)).mul(0.55);
    const cn = mx_fractal_noise_float(vec3(cp.x, cp.y, time.mul(0.008)), 4, 2.0, 0.5);
    const cm = smoothstep(0.02, 0.3, cn).mul(smoothstep(0.07, 0.3, up)).mul(smoothstep(0.75, 0.25, up)).mul(U.clouds);
    col = mix(col, mix(U.hor, vec3(1.0, 1.0, 1.0), 0.75).add(U.sun.mul(0.1)), cm.mul(0.8));
    // stars / glow-worms
    const sp = d.mul(90); const cell = floor(sp); const h = fract(sin(dot(cell, vec3(127.1, 311.7, 74.7))).mul(43758.5453));
    const r = length(fract(sp).sub(0.5)); const tw = sin(time.mul(h.mul(3).add(1)).add(h.mul(40))).mul(0.35).add(0.65);
    col = col.add(vec3(0.7, 0.85, 1.0).mul(smoothstep(0.965, 1.0, h).mul(smoothstep(0.35, 0.0, r)).mul(tw).mul(U.stars).mul(1.8)));
    return col;
  })();
  return U;
}
export function seaMaterial(kind, cols) {
  const a = C(cols[0]), b = C(cols[1]);
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.25, metalness: 0 });
  const p = positionWorld.xz;
  if (kind === 'water') {
    const n = mx_fractal_noise_float(vec3(p.mul(0.12), time.mul(0.15)), 3, 2, 0.5);
    const glint = smoothstep(0.5, 0.56, mx_noise_float(vec3(p.mul(1.7), time.mul(0.7))));
    m.colorNode = mix(vec3(a.r, a.g, a.b), vec3(b.r, b.g, b.b), smoothstep(-0.8, 0.8, n));
    m.emissiveNode = vec3(0.9, 1.0, 1.0).mul(glint.mul(0.18));
    m.roughness = 0.12;
  } else if (kind === 'lava') {
    const flow = vec3(p.mul(0.18), time.mul(0.12));
    const n = mx_fractal_noise_float(flow, 4, 2, 0.55); const cn = mx_fractal_noise_float(vec3(p.mul(0.32), time.mul(0.04)), 3, 2, 0.5);
    const crust = smoothstep(-0.12, 0.06, cn); // cooled plates; glowing rivers between them
    const hot = mix(vec3(0.9, 0.16, 0.02), vec3(1.0, 0.48, 0.06), smoothstep(-0.2, 0.5, n));
    m.colorNode = mix(hot.mul(0.5), vec3(0.09, 0.05, 0.05), crust);
    m.emissiveNode = hot.mul(float(1).sub(crust.mul(0.93))).mul(1.05);
    m.roughness = 0.6;
  } else if (kind === 'abyss') {
    const n = mx_fractal_noise_float(vec3(p.mul(0.06), time.mul(0.05)), 4, 2, 0.5);
    m.colorNode = vec3(a.r, a.g, a.b); m.emissiveNode = vec3(b.r, b.g, b.b).mul(smoothstep(-0.1, 0.5, n).mul(0.55));
    m.roughness = 1;
  } else { // clouds
    const n = mx_fractal_noise_float(vec3(p.mul(0.05), time.mul(0.02)), 4, 2, 0.5);
    m.colorNode = mix(vec3(a.r, a.g, a.b), vec3(b.r, b.g, b.b), smoothstep(-0.25, 0.45, n)); m.roughness = 1;
    m.emissiveNode = vec3(a.r, a.g, a.b).mul(0.08);
  }
  return m;
}

// ------------------------------------------------------------------ decor geometry (vertex-coloured, merged once, instanced per level)
function colored(geo, col) { const n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3); geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); geo.deleteAttribute('uv'); return geo.index ? geo.toNonIndexed() : geo; }
function jitter(geo, amt, seed = 1) { let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5); const p = geo.attributes.position; const map = new Map();
  for (let i = 0; i < p.count; i++) { const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`; if (!map.has(k)) map.set(k, [r() * amt, r() * amt, r() * amt]); const d = map.get(k); p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]); } geo.computeVertexNormals(); return geo; }
function treeGeo(pal) {
  const [tr, f1, f2] = pal.tree.map(C); const parts = [];
  const trunk = new THREE.CylinderGeometry(0.16, 0.26, 1.7, 7); trunk.translate(0, 0.85, 0); parts.push(colored(trunk, tr));
  for (const [x, y, z, r, c] of [[0, 2.1, 0, 0.95, f1], [0.45, 2.55, 0.15, 0.68, f2], [-0.4, 2.65, -0.2, 0.6, f2], [0.05, 3.0, 0, 0.55, f1]]) { const g = jitter(new THREE.IcosahedronGeometry(r, 1), 0.12, Math.round(r * 100)); g.translate(x, y, z); parts.push(colored(g, c)); }
  return mergeGeometries(parts);
}
function flowerGeo() { const st = new THREE.CylinderGeometry(0.02, 0.025, 0.32, 4); st.translate(0, 0.16, 0); const parts = [colored(st, C('#3f8f2f'))];
  for (let i = 0; i < 5; i++) { const pg = new THREE.SphereGeometry(0.07, 6, 4); pg.scale(1, 0.35, 0.6); pg.translate(0.075, 0.33, 0); pg.rotateY(i / 5 * Math.PI * 2); parts.push(colored(pg, C('#ffffff'))); }
  const c = new THREE.SphereGeometry(0.045, 6, 4); c.translate(0, 0.35, 0); parts.push(colored(c, C('#ffd23a'))); return mergeGeometries(parts); }
function tuftGeo(col) { const parts = []; for (let i = 0; i < 4; i++) { const g = new THREE.ConeGeometry(0.05, 0.42 + i * 0.05, 3); g.translate(0, 0.21, 0); g.rotateZ((i - 1.5) * 0.25); g.rotateY(i * 1.4); parts.push(colored(g, C(col).offsetHSL(0, 0, i * 0.03))); } return mergeGeometries(parts); }
function rockGeo(col) { return colored(jitter(new THREE.DodecahedronGeometry(0.45, 0), 0.12, 7).translate(0, 0.2, 0), C(col)); }
function crystalGeo() { const parts = []; for (const [x, z, h, r, a] of [[0, 0, 1.3, 0.2, 0], [0.22, 0.1, 0.8, 0.14, 0.4], [-0.18, 0.12, 0.95, 0.15, -0.35], [0.05, -0.2, 0.7, 0.12, 0.25]]) { const g = new THREE.OctahedronGeometry(1, 0); g.scale(r, h / 2, r); g.translate(0, h / 2 - 0.1, 0); g.rotateZ(a); g.translate(x, 0, z); parts.push(colored(g, C('#ffffff'))); } return mergeGeometries(parts); }
function chimneyGeo() { const a = new THREE.CylinderGeometry(0.9, 1.3, 14, 10); a.translate(0, 7, 0); const b = new THREE.CylinderGeometry(1.05, 0.95, 0.6, 10); b.translate(0, 14, 0); return mergeGeometries([colored(a, C('#3a2c2c')), colored(b, C('#5a4440'))]); }

const instM = new THREE.Matrix4(), instQ = new THREE.Quaternion(), instS = new THREE.Vector3(), instP = new THREE.Vector3(), YAX = new THREE.Vector3(0, 1, 0);
function instanced(geo, mat, items, colors) {
  if (!items.length) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  items.forEach((d, i) => { instQ.setFromAxisAngle(YAX, d.rot || 0); instS.setScalar(d.s || 1); instP.set(d.x, d.y, d.z); instM.compose(instP, instQ, instS); mesh.setMatrixAt(i, instM); if (colors) mesh.setColorAt(i, C(colors[i % colors.length])); });
  mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}

// ------------------------------------------------------------------ textures
let TEX = null;
function textures() {
  if (TEX) return TEX;
  TEX = {
    crack: canvasTexture(128, 128, (x, w, h) => { x.fillStyle = '#d8d0c8'; x.fillRect(0, 0, w, h); x.strokeStyle = '#3a302a'; x.lineWidth = 4; x.lineCap = 'round'; for (let i = 0; i < 5; i++) { x.beginPath(); let px = w / 2 + (Math.random() - 0.5) * 30, py = h / 2 + (Math.random() - 0.5) * 30; x.moveTo(px, py); for (let k = 0; k < 5; k++) { px += (Math.random() - 0.5) * 50; py += (Math.random() - 0.5) * 50; x.lineTo(px, py); } x.stroke(); } x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 2; x.strokeRect(6, 6, w - 12, h - 12); }),
    blob: canvasTexture(128, 128, (x, w, h) => { const g = x.createRadialGradient(64, 64, 0, 64, 64, 62); g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.55, 'rgba(0,0,0,0.38)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }),
    glow: canvasTexture(128, 128, (x, w, h) => { const g = x.createRadialGradient(64, 64, 0, 64, 64, 62); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }),
  };
  return TEX;
}

// ------------------------------------------------------------------ pickups + props
export function shardGeometry() { const g = new THREE.OctahedronGeometry(0.24, 0); g.scale(0.85, 1.35, 0.85); return g; }
export function makeRelic() {
  // a spiral "star fossil" (ammonite) — the hidden collectible
  const g = new THREE.Group();
  const pts = []; for (let i = 0; i <= 80; i++) { const a = i / 80 * Math.PI * 4.2, r = 0.06 + 0.42 * Math.pow(i / 80, 1.15); pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0)); }
  const curve = new THREE.CatmullRomCurve3(pts); const tube = new THREE.TubeGeometry(curve, 120, 0.075, 8, false);
  const mat = new THREE.MeshStandardNodeMaterial({ color: '#ffcf6a', roughness: 0.25, metalness: 0.2, emissive: new THREE.Color('#ff9a2a'), emissiveIntensity: 0.55 });
  const shell = new THREE.Mesh(tube, mat); shell.castShadow = true; g.add(shell);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(3.2, 2.2, 0.8) })); g.add(core);
  const halo = new THREE.Sprite(new THREE.SpriteNodeMaterial({ map: textures().glow, color: new THREE.Color(1.6, 1.1, 0.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.setScalar(2.2); g.add(halo);
  return g;
}
export function makeCheckpoint(pal) {
  const g = new THREE.Group(); const stoneM = new THREE.MeshStandardNodeMaterial({ color: pal.mats.stone ? pal.mats.stone[0] : '#cfcac0', roughness: 0.9 });
  [[0.55, 0.32, 0], [0.42, 0.28, 0.6], [0.3, 0.24, 1.08]].forEach(([r, hh, y], i) => { const m = new THREE.Mesh(jitter(new THREE.SphereGeometry(r, 10, 8), 0.05, i + 3), stoneM); m.scale.y = hh / r * 1.3; m.position.y = y + hh * 0.7; m.rotation.y = i; m.castShadow = true; g.add(m); });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.4, 6), new THREE.MeshStandardNodeMaterial({ color: '#7a5a3a' })); pole.position.set(0, 2.0, 0); g.add(pole);
  const flagM = new THREE.MeshStandardNodeMaterial({ color: '#9a9a9a', side: THREE.DoubleSide, roughness: 0.7 });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.42, 6, 1), flagM); flag.position.set(0.37, 2.45, 0); g.add(flag);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0.5, 0.5, 0.5) })); gem.position.y = 2.82; g.add(gem);
  return { g, flag, flagM, gem };
}
export function makeGoal() {
  const g = new THREE.Group();
  const ped = new THREE.Mesh(roundedCyl(1.1, 0.6, 0.18), new THREE.MeshStandardNodeMaterial({ color: '#e8e2d4', roughness: 0.6 })); ped.position.y = 0.6; ped.castShadow = true; ped.receiveShadow = true; g.add(ped);
  const gemM = new THREE.MeshStandardNodeMaterial({ color: '#ff6fae', roughness: 0.1, metalness: 0.1, emissive: new THREE.Color('#ff4f9a'), emissiveIntensity: 1.6, flatShading: true });
  const gem = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), gemM); gem.scale.y = 1.3; gem.position.y = 2.2; gem.castShadow = true; g.add(gem);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.0, 40, 20, 1, true), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(1.2, 0.5, 0.9), transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); beam.position.y = 20; g.add(beam);
  const halo = new THREE.Sprite(new THREE.SpriteNodeMaterial({ map: textures().glow, color: new THREE.Color(2, 0.8, 1.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.setScalar(4); halo.position.y = 2.2; g.add(halo);
  return { g, gem, beam };
}
export function makeShroom(s, pal) {
  const g = new THREE.Group(); const [capC, stemC] = (pal.mats[s.m] || pal.mats.shroom).map(C);
  if (s.m === 'spring') {
    const coilM = new THREE.MeshStandardNodeMaterial({ color: '#9aa0ab', roughness: 0.35, metalness: 0.3 });
    for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(s.r * 0.6, 0.07, 6, 18), coilM); t.rotation.x = Math.PI / 2; t.position.y = -0.5 + i * 0.13; g.add(t); }
    const plate = new THREE.Mesh(roundedCyl(s.r, 0.16, 0.06), new THREE.MeshStandardNodeMaterial({ color: capC, roughness: 0.4, emissive: capC, emissiveIntensity: 0.3 })); g.add(plate);
    return { g, cap: plate };
  }
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(s.r * 0.36, s.r * 0.46, s.h + 0.4, 12), new THREE.MeshStandardNodeMaterial({ color: stemC, roughness: 0.8 })); stem.position.y = -(s.h + 0.4) / 2 - 0.1; stem.castShadow = true; g.add(stem);
  const capGeo = new THREE.SphereGeometry(s.r * 1.04, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2); capGeo.scale(1, 0.62, 1);
  const capM = new THREE.MeshStandardNodeMaterial({ roughness: 0.55 });
  { // round polka dots on a lat/long grid (jittered per cell)
    const g2 = uv().mul(vec2(9, 3.2)); const cell = floor(g2); const hsh = fract(sin(dot(cell, vec2(12.9898, 78.233))).mul(43758.5453));
    const loc = fract(g2).sub(vec2(0.5, 0.5)).add(vec2(hsh.sub(0.5).mul(0.3), hsh.mul(0.2).sub(0.1))); const d = length(loc.mul(vec2(1.0, 1.15)));
    const dotM = smoothstep(0.3, 0.24, d).mul(step(0.25, hsh)).mul(smoothstep(0.92, 0.75, uv().y));
    capM.colorNode = mix(vec3(capC.r, capC.g, capC.b), vec3(1, 0.97, 0.92), dotM);
  }
  if (pal === THEMES.caves) capM.emissiveNode = vec3(capC.r, capC.g, capC.b).mul(0.8);
  const cap = new THREE.Mesh(capGeo, capM); cap.position.y = -s.r * 0.62 + 0.02; cap.castShadow = true; g.add(cap);
  const under = new THREE.Mesh(new THREE.CircleGeometry(s.r * 1.02, 24), new THREE.MeshStandardNodeMaterial({ color: stemC.clone().multiplyScalar(0.85), side: THREE.DoubleSide })); under.rotation.x = Math.PI / 2; under.position.y = cap.position.y; g.add(under);
  return { g, cap };
}
export function makePortal(color, locked) {
  const g = new THREE.Group(); const stoneM = new THREE.MeshStandardNodeMaterial({ color: '#d8d2c6', roughness: 0.85 });
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new RoundedBoxGeometry(0.5, 3.0, 0.6, 2, 0.12), stoneM); p.position.set(s * 1.25, 1.8, 0); p.castShadow = true; g.add(p); }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.28, 8, 20, Math.PI), stoneM); arch.position.y = 3.3; arch.castShadow = true; g.add(arch);
  const col = new THREE.Color(color);
  const swirlM = new THREE.MeshBasicNodeMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const u = uv().sub(0.5); const r = length(u); const a = atan(u.y, u.x);
  const sw = sin(a.mul(3).add(r.mul(16)).sub(time.mul(locked ? 0.4 : 2.2))).mul(0.5).add(0.5);
  const base = locked ? vec3(0.35, 0.35, 0.4) : vec3(col.r, col.g, col.b);
  swirlM.colorNode = base.mul(sw.mul(0.6).add(0.7)).mul(locked ? 0.8 : 1.8);
  swirlM.opacityNode = smoothstep(0.5, 0.42, r).mul(locked ? 0.55 : 0.92);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.05, 32), swirlM); disc.position.y = 2.25; disc.scale.y = 1.45; g.add(disc);
  return { g, disc };
}
export function signTexture(lines, accent = '#ffcf4a') {
  return canvasTexture(512, 256, (x, w, h) => {
    x.fillStyle = 'rgba(30,24,40,0.82)'; x.beginPath(); x.roundRect(8, 8, w - 16, h - 16, 36); x.fill();
    x.strokeStyle = accent; x.lineWidth = 6; x.stroke(); x.textAlign = 'center'; x.fillStyle = '#fff';
    x.font = '800 58px Inter, system-ui, sans-serif'; x.fillText(lines[0], w / 2, 90);
    x.font = '700 38px Inter, system-ui, sans-serif'; x.fillStyle = '#ffe9b0'; x.fillText(lines[1] || '', w / 2, 152);
    x.font = '600 32px Inter, system-ui, sans-serif'; x.fillStyle = '#cfd6ff'; x.fillText(lines[2] || '', w / 2, 206);
  });
}

// ------------------------------------------------------------------ enemies
const EM = (o) => new THREE.MeshStandardNodeMaterial({ roughness: 0.6, ...o });
function eyesOn(g, y, z, sep = 0.14, size = 0.09) {
  const w = EM({ color: '#fff', roughness: 0.3 }), b = EM({ color: '#1a1424', roughness: 0.2 });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 8), w); e.scale.set(1, 1.2, 0.6); e.position.set(s * sep, y, z); g.add(e); const p = new THREE.Mesh(new THREE.SphereGeometry(size * 0.55, 10, 8), b); p.position.set(s * sep, y - 0.01, z + size * 0.45); g.add(p); }
}
export function makeEnemy(type, pal) {
  const g = new THREE.Group(); const body = new THREE.Group(); g.add(body); const legs = [];
  if (type === 'bug') { // Mossbug: domed shell beetle
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), EM({ color: '#e0563a', roughness: 0.35 })); shell.scale.y = 0.78; shell.position.y = 0.28; shell.castShadow = true; body.add(shell);
    for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), EM({ color: '#2a1a18' })); const a = i / 5 * 6.28; sp.position.set(Math.cos(a) * 0.34, 0.66, Math.sin(a) * 0.34); sp.scale.y = 0.4; body.add(sp); }
    for (const [x, z] of [[0.15, -0.05], [-0.2, 0.12], [0.05, 0.25]]) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), EM({ color: '#6fbf3a', roughness: 0.95 })); m.position.set(x, 0.74, z); m.scale.y = 0.6; body.add(m); } // the moss on a Mossbug
    const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.55, 0.16, 18), EM({ color: '#3a2a22' })); belly.position.y = 0.22; body.add(belly);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), EM({ color: '#3a2a22' })); head.position.set(0, 0.34, 0.5); body.add(head); eyesOn(body, 0.42, 0.7, 0.11, 0.075);
    for (const s of [-1, 1]) for (const z of [-0.25, 0.15]) { const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.18, 3, 6), EM({ color: '#2a1a18' })); l.position.set(s * 0.5, 0.12, z); l.rotation.z = s * 0.7; body.add(l); legs.push(l); }
    return { g, body, legs, r: 0.62, h: 0.9 };
  }
  if (type === 'mite') { // Gloomite: violet crawler with glowing crystal back
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 12), EM({ color: '#5b3d9a', roughness: 0.5 })); b.scale.set(1, 0.72, 1.15); b.position.y = 0.42; b.castShadow = true; body.add(b);
    const cm = new THREE.MeshStandardNodeMaterial({ color: '#7ff6ff', emissive: new THREE.Color('#3fe8ff'), emissiveIntensity: 1.4, roughness: 0.15, flatShading: true });
    for (const [x, z, h, a] of [[0, -0.1, 0.6, 0], [0.22, -0.2, 0.42, 0.4], [-0.22, -0.2, 0.42, -0.4], [0, 0.18, 0.36, 0.2]]) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), cm); c.scale.set(0.12, h / 2, 0.12); c.position.set(x, 0.75 + h * 0.3, z); c.rotation.z = a; body.add(c); }
    eyesOn(body, 0.5, 0.55, 0.16, 0.1);
    for (const s of [-1, 1]) for (const z of [-0.3, 0, 0.3]) { const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.2, 3, 6), EM({ color: '#2a1a48' })); l.position.set(s * 0.52, 0.16, z); l.rotation.z = s * 0.9; body.add(l); legs.push(l); }
    return { g, body, legs, r: 0.6, h: 1.0 };
  }
  if (type === 'puff') { // Puffling: a cloud puff with a grumpy face and tiny wings
    const pm = EM({ color: '#ffffff', roughness: 0.9, emissive: new THREE.Color('#ffe8f4'), emissiveIntensity: 0.25 });
    for (const [x, y, z, r] of [[0, 0, 0, 0.55], [0.38, -0.08, 0, 0.36], [-0.38, -0.08, 0, 0.36], [0, 0.28, -0.1, 0.38], [0, -0.1, -0.3, 0.38]]) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), pm); m.position.set(x, y, z); m.castShadow = true; body.add(m); }
    eyesOn(body, 0.06, 0.48, 0.15, 0.085);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.04), EM({ color: '#4a3a5a' })); brow.position.set(0, 0.2, 0.52); body.add(brow);
    for (const s of [-1, 1]) { const wg = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 6), pm); wg.scale.set(1, 0.3, 0.6); wg.position.set(s * 0.68, 0.1, -0.05); body.add(wg); legs.push(wg); }
    return { g, body, legs, r: 0.62, h: 0.9, fly: true };
  }
  if (type === 'blob') { // Cinderblob: molten hopper with a cooling crust
    const lm = new THREE.MeshStandardNodeMaterial({ roughness: 0.5 });
    const crust = smoothstep(0.0, 0.25, mx_noise_float(positionLocal.mul(4.0).add(time.mul(0.3))));
    lm.colorNode = mix(vec3(1.0, 0.45, 0.05), vec3(0.16, 0.08, 0.07), crust);
    lm.emissiveNode = mix(vec3(1.4, 0.36, 0.04), vec3(0, 0, 0), crust);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14), lm); b.scale.y = 0.85; b.position.y = 0.47; b.castShadow = true; body.add(b);
    eyesOn(body, 0.6, 0.44, 0.17, 0.1);
    return { g, body, legs, r: 0.58, h: 0.95 };
  }
  return { g, body, legs, r: 0.5, h: 1 };
}
export function makeBoss() {
  const g = new THREE.Group(); const body = new THREE.Group(); g.add(body);
  const rockM = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, flatShading: true });
  const uHeat = uniform(1);
  const cr = mx_noise_float(positionLocal.mul(1.6)); const crack = smoothstep(0.08, 0.0, abs(cr));
  rockM.colorNode = mix(vec3(0.2, 0.15, 0.15), vec3(0.32, 0.25, 0.23), smoothstep(-0.4, 0.4, mx_noise_float(positionLocal.mul(3.0))));
  rockM.emissiveNode = mix(vec3(0.25, 0.45, 1.1), vec3(1.5, 0.38, 0.04), uHeat).mul(crack).mul(1.3);
  const torso = new THREE.Mesh(jitter(new THREE.IcosahedronGeometry(2.0, 2), 0.18, 9), rockM); torso.scale.set(1.05, 0.85, 1); torso.position.y = 1.75; torso.castShadow = true; body.add(torso);
  const head = new THREE.Mesh(jitter(new THREE.IcosahedronGeometry(1.1, 1), 0.12, 4), rockM); head.position.set(0, 3.2, 0.2); head.castShadow = true; body.add(head);
  const eyeM = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(3.5, 2.6, 0.6) });
  const eyes = []; for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), eyeM); e.scale.set(1.2, 0.7, 0.5); e.position.set(s * 0.45, 3.35, 1.2); body.add(e); eyes.push(e); }
  const arms = []; for (const s of [-1, 1]) { const a = new THREE.Mesh(jitter(new THREE.IcosahedronGeometry(0.75, 1), 0.12, 5 + s), rockM); a.position.set(s * 2.3, 1.3, 0.3); a.castShadow = true; body.add(a); arms.push(a); }
  const crownM = new THREE.MeshStandardNodeMaterial({ color: '#ffcf6a', emissive: new THREE.Color('#ff7a1a'), emissiveIntensity: 1.2, roughness: 0.3 });
  const crown = new THREE.Group(); for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 5), crownM); const a = i / 5 * Math.PI * 2; c.position.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55); crown.add(c); } crown.position.set(0, 4.15, 0.2); body.add(crown);
  return { g, body, torso, head, arms, eyes, crown, crownM, uHeat };
}
export function makeJet() {
  const g = new THREE.Group();
  const noz = new THREE.Mesh(roundedCyl(0.55, 0.3, 0.1), new THREE.MeshStandardNodeMaterial({ color: '#4a4448', roughness: 0.5, metalness: 0.3 })); noz.position.y = 0.3; g.add(noz);
  const fm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const v = uv(); const n = mx_noise_float(vec3(v.x.mul(6), v.y.mul(3).sub(time.mul(6)), 0));
  fm.colorNode = mix(vec3(3.0, 1.6, 0.3), vec3(2.2, 0.35, 0.05), v.y).mul(n.mul(0.4).add(0.8));
  fm.opacityNode = smoothstep(1.0, 0.3, v.y).mul(0.85);
  const flame = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.6, 1, 14, 1, true), fm); flame.position.y = 0.8; g.add(flame);
  const warn = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.72, 24), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(2, 0.6, 0.1), transparent: true, opacity: 0.6, depthWrite: false })); warn.rotation.x = -Math.PI / 2; warn.position.y = 0.32; g.add(warn);
  return { g, flame, warn };
}

// ------------------------------------------------------------------ build everything static for a level
export function buildLevel(L, scene, opts = {}) {
  const pal = THEMES[L.theme]; const group = new THREE.Group(); scene.add(group);
  const tmat = terrainMaterial(L.theme);
  const statics = [], dyn = [];
  for (const [i, s] of L.solids.entries()) {
    if (s.m === 'shroom' || s.m === 'spring' || s.m === 'cloud') continue;
    if (s.m === 'crystalwall') { // a giant faceted crystal column
      const cm = new THREE.MeshStandardNodeMaterial({ roughness: 0.12, metalness: 0.1, flatShading: true });
      cm.colorNode = mix(vec3(0.45, 0.3, 0.85), vec3(0.75, 0.6, 1.0), smoothstep(-0.3, 0.5, mx_noise_float(positionLocal.mul(vec3(0.6, 0.15, 0.6))))); cm.emissiveNode = cm.colorNode.mul(0.35);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r * 1.08, s.h, 6, 3), cm); col.position.set(s.x, s.top - s.h / 2, s.z); col.castShadow = col.receiveShadow = true; group.add(col);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(s.r * 0.98, s.r, 0.3, 6), new THREE.MeshStandardNodeMaterial({ color: '#4fd1b8', roughness: 0.8 })); cap.position.set(s.x, s.top - 0.15, s.z); group.add(cap);
      continue;
    }
    if (s.path || s.crumble || s.breakable) dyn.push(i); else statics.push(solidGeometry(s, pal, true));
  }
  const terrain = new THREE.Mesh(mergeGeometries(statics), tmat); terrain.castShadow = true; terrain.receiveShadow = true; group.add(terrain);
  // dynamic solids get their own meshes (local geometry, top at y=0)
  const solidMeshes = new Map();
  const crackMat = new THREE.MeshStandardNodeMaterial({ map: textures().crack, roughness: 0.9 });
  for (const i of dyn) {
    const s = L.solids[i]; let mesh;
    if (s.breakable) { const c = (pal.mats.crack || pal.mats.stone).map(C)[0]; const m = crackMat.clone(); m.color = c; mesh = new THREE.Mesh(new RoundedBoxGeometry(s.w, s.h, s.d, 2, 0.12), m); mesh.geometry.translate(0, -s.h / 2, 0); }
    else if (s.m === 'crumblecloud') mesh = cloudPuffs(s, true);
    else mesh = new THREE.Mesh(solidGeometry(s, pal, false), tmat);
    mesh.position.set(s.x, s.top, s.z); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); solidMeshes.set(i, mesh);
  }
  // mushrooms / springs
  for (const [i, s] of L.solids.entries()) if (s.m === 'shroom' || s.m === 'spring') { const sh = makeShroom(s, pal); sh.g.position.set(s.x, s.top, s.z); group.add(sh.g); solidMeshes.set(i, sh.g); sh.g.userData.cap = sh.cap; }
  // static clouds: instanced puffs
  const cloudItems = []; L.solids.forEach((s) => { if (s.m === 'cloud' && !s.path) cloudItems.push(...cloudPuffItems(s)); });
  if (cloudItems.length) { const cm = new THREE.MeshStandardNodeMaterial({ color: '#ffffff', roughness: 0.95, emissive: new THREE.Color(pal.mats.cloud ? pal.mats.cloud[1] : '#fff'), emissiveIntensity: 0.25 }); const im = instanced(new THREE.IcosahedronGeometry(1, 2), cm, cloudItems); im.castShadow = true; group.add(im); }
  // sea
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900, 1, 1), seaMaterial(pal.sea, pal.seaCol)); sea.rotation.x = -Math.PI / 2; sea.position.y = L.seaY; sea.receiveShadow = pal.sea === 'water'; group.add(sea);
  if (pal.sea === 'clouds') { const lowM = new THREE.MeshStandardNodeMaterial({ color: '#f4ecff', roughness: 1, emissive: new THREE.Color('#ffd6ea'), emissiveIntensity: 0.08 }); const items = []; let s = 5; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647); for (let i = 0; i < 60; i++) items.push({ x: (r() - 0.5) * 140, y: L.seaY - 2 + r() * 1.2, z: 30 - r() * 190, s: 2.5 + r() * 4.5 }); group.add(instanced(new THREE.IcosahedronGeometry(1, 2), lowM, items)); }
  // decor
  const vc = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
  const byType = (t) => L.decor.filter((d) => d.type === t);
  const add = (m) => { if (m) group.add(m); return m; };
  add(instanced(treeGeo(pal), vc, byType('tree')));
  const fl = add(instanced(flowerGeo(), new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.7 }), byType('flower'), pal.flowers)); if (fl) fl.castShadow = false;
  const tf = add(instanced(tuftGeo(pal.tuft), vc, byType('tuft'))); if (tf) tf.castShadow = false;
  add(instanced(rockGeo(pal.rock), vc, byType('rock')));
  const cryst = [...byType('crystal'), ...byType('bigcrystal')];
  if (cryst.length) { const cc = pal.crystal || ['#58f0ff', '#ff6ae6']; const cmA = new THREE.MeshStandardNodeMaterial({ color: cc[0], emissive: new THREE.Color(cc[0]), emissiveIntensity: 1.3, roughness: 0.15, flatShading: true }); const cmB = new THREE.MeshStandardNodeMaterial({ color: cc[1], emissive: new THREE.Color(cc[1]), emissiveIntensity: 1.3, roughness: 0.15, flatShading: true });
    add(instanced(crystalGeo(), cmA, cryst.filter((_, i) => i % 3 !== 2))); add(instanced(crystalGeo(), cmB, cryst.filter((_, i) => i % 3 === 2))); }
  const ch = byType('chimney').map((d) => ({ ...d, s: d.s * 1.3 })); if (ch.length) { add(instanced(chimneyGeo(), vc, ch)); const glowM = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(3, 0.8, 0.15) }); add(instanced(new THREE.CylinderGeometry(0.85, 0.85, 0.2, 10), glowM, ch.map((d) => ({ ...d, y: d.y + 14.25 * d.s })))); }
  backdrop(L, pal, group, vc);
  return { group, terrain, solidMeshes, pal, sea, tmat };
}
// far scenery (no collision): mountains, cave spires, distant isles, a volcano — gives every world a horizon
function backdrop(L, pal, group, vc) {
  let k = 99; const r = () => ((k = (k * 16807) % 2147483647) / 2147483647);
  const xs = L.solids.map((s) => s.x), zs = L.solids.map((s) => s.z); const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const ring = (n, r0, r1) => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2 + r() * 0.4, d = r0 + r() * (r1 - r0); return { x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d * 1.2, a }; });
  if (L.theme === 'meadow' || L.theme === 'hub') {
    const mg = mountainGeo('#5fa84a', '#8f8a80', '#ffffff'); const items = ring(L.theme === 'hub' ? 12 : 18, 210, 290).map((p) => ({ x: p.x, y: L.seaY - 2, z: p.z, s: 16 + r() * 22, rot: r() * 6 }));
    items.push({ x: cx + 40, y: L.seaY - 2, z: cz - 300, s: 62, rot: 1 }); // the great Pebble Peak
    group.add(instanced(mg, vc, items));
  } else if (L.theme === 'caves') {
    const sg = colored(jitter(new THREE.ConeGeometry(1, 4, 7, 3), 0.12, 5), C('#3a2f5e'));
    const up = ring(26, 28, 70).map((p) => ({ x: p.x, y: -8, z: p.z, s: 4 + r() * 6, rot: r() * 6 }));
    group.add(instanced(sg, vc, up));
    const dg = sg.clone(); dg.rotateX(Math.PI); const down = ring(30, 14, 60).map((p) => ({ x: p.x, y: 30 + r() * 6, z: p.z, s: 3 + r() * 5, rot: r() * 6 }));
    group.add(instanced(dg, vc, down));
  } else if (L.theme === 'sky') {
    const ig = mergeGeometries([colored(islandGeo(1, 3).toNonIndexed(), C('#e0b48a')), colored(new THREE.CylinderGeometry(1.02, 1.02, 0.12, 28).translate(0, -0.06, 0), C('#9be86b'))]);
    const items = ring(18, 70, 160).map((p) => ({ x: p.x, y: -10 + r() * 40, z: p.z, s: 3 + r() * 7, rot: r() * 6 }));
    group.add(instanced(ig, vc, items));
  } else if (L.theme === 'forge') {
    const vg = mountainGeo('#3a2a2c', '#2a1e20', '#ff6a1a'); group.add(instanced(vg, vc, [{ x: 20, y: -6, z: -260, s: 110, rot: 0.4 }, ...ring(8, 160, 230).map((p) => ({ x: p.x, y: -6, z: p.z, s: 35 + r() * 30, rot: r() * 6 }))]));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(4, 1.2, 0.2) })); glow.position.set(20, -6 + 110 * 1.45, -260); glow.scale.set(24, 8, 24); group.add(glow);
  }
}
function mountainGeo(base, rock, cap) {
  const g = jitter(new THREE.ConeGeometry(1, 1.6, 9, 5), 0.06, 11); g.translate(0, 0.8, 0); const p = g.attributes.position;
  const col = new Float32Array(p.count * 3); const cb = C(base), cr = C(rock), cc = C(cap);
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); const c = y > 1.25 ? cc : y > 0.6 ? cr : cb; col.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv'); return g.toNonIndexed();
}
function cloudPuffItems(s) {
  const items = []; let k = Math.round(Math.abs(s.x * 13 + s.z * 7)) + 1; const r = () => ((k = (k * 16807) % 2147483647) / 2147483647);
  const n = Math.max(4, Math.round(s.w * s.d / 2.2));
  for (let i = 0; i < n; i++) { const x = s.x + (r() - 0.5) * (s.w - 0.6), z = s.z + (r() - 0.5) * (s.d - 0.6); const sc = 0.55 + r() * 0.45; items.push({ x, y: s.top - sc * 0.55, z, s: sc }); }
  return items;
}
function cloudPuffs(s) {
  const g = new THREE.Group(); const m = new THREE.MeshStandardNodeMaterial({ color: '#ffffff', roughness: 0.95, emissive: new THREE.Color('#ffe8f4'), emissiveIntensity: 0.3 });
  for (const it of cloudPuffItems({ ...s, x: 0, z: 0, top: 0 })) { const p = new THREE.Mesh(new THREE.IcosahedronGeometry(it.s, 2), m); p.position.set(it.x, it.y, it.z); p.castShadow = true; g.add(p); }
  return g;
}
export { textures };
