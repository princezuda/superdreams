// The Hollow Crown — static batching builder + hand-placed prop kit.
// Everything static in a scene is vertex-coloured and merged per material (1–4 draw calls per scene).
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, RNG } from './paint.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

export class Batch {
  constructor(seed = 1) { this.parts = {}; this.stack = [new THREE.Matrix4()]; this.r = RNG(seed); this.hotProxies = []; }
  get top() { return this.stack[this.stack.length - 1]; }
  push(x = 0, y = 0, z = 0, ry = 0, s = 1, rx = 0, rz = 0) {
    _e.set(rx, ry, rz); _q.setFromEuler(_e); _m.compose(_v.set(x, y, z), _q, _s.set(s, s, s));
    this.stack.push(this.top.clone().multiply(_m)); return this;
  }
  pop() { this.stack.pop(); return this; }
  // add a geometry (consumed) with a base colour. opts: x,y,z, rx,ry,rz, sx,sy,sz, mat, jit (colour jitter), blob (vec3 local centre → soft normals), ao
  add(geo, color, o = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    g.deleteAttribute('uv'); if (g.attributes.uv1) g.deleteAttribute('uv1');
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0); _q.setFromEuler(_e);
    _m.compose(_v.set(o.x || 0, o.y || 0, o.z || 0), _q, _s.set(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.s ?? 1));
    const local = _m.clone();
    if (o.blob) {
      // soft, cloud-like normals for foliage clumps: point away from the clump centre (in geometry space)
      const P = g.attributes.position, N = g.attributes.normal, c = o.blob === true ? new THREE.Vector3() : o.blob;
      for (let i = 0; i < P.count; i++) {
        _v.set(P.getX(i) - c.x, P.getY(i) - c.y, P.getZ(i) - c.z).normalize();
        const k = o.blobK ?? 0.75;
        N.setXYZ(i, _v.x * k + N.getX(i) * (1 - k), _v.y * k + N.getY(i) * (1 - k), _v.z * k + N.getZ(i) * (1 - k));
      }
    }
    g.applyMatrix4(this.top.clone().multiply(local));
    g.normalizeNormals?.();
    const P = g.attributes.position, n = P.count, col = new Float32Array(n * 3);
    const base = _c.set(color), jit = o.jit ?? 0.07, ao = o.ao ?? true, r = this.r;
    // per-face jitter (painted facets) + low "contact" darkening near the ground
    for (let i = 0; i < n; i += 3) {
      const f = 1 + (r() - 0.5) * jit * 2, hue = (r() - 0.5) * jit * 0.5;
      for (let k = 0; k < 3 && i + k < n; k++) {
        const y = P.getY(i + k);
        const a = ao ? 0.62 + 0.38 * Math.min(1, Math.max(0, (y - (o.aoBase ?? 0)) / (o.aoH ?? 0.7))) : 1;
        col[(i + k) * 3] = base.r * f * a * (1 + hue); col[(i + k) * 3 + 1] = base.g * f * a; col[(i + k) * 3 + 2] = base.b * f * a * (1 - hue);
      }
    }
    if (o.colors) o.colors(P, col); // custom gradient painter
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const key = this.forceMat || o.mat || 'paint';
    (this.parts[key] ||= []).push(g);
    return g;
  }
  finish(parent, { shadows = true } = {}) {
    const out = [];
    for (const [key, list] of Object.entries(this.parts)) {
      if (!list.length) continue;
      const g = mergeGeometries(list, false);
      list.forEach((x) => x.dispose());
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, M[key]);
      const lit = key === 'paint' || key === 'paintDS';
      mesh.castShadow = shadows && lit; mesh.receiveShadow = lit;
      mesh.name = 'batch-' + key;
      parent.add(mesh); out.push(mesh);
    }
    this.parts = {};
    return out;
  }
}

// ------------------------------------------------------------------ primitive shorthands (local to the current frame)
export const box = (B, w, h, d, c, x, y, z, o = {}) => B.add(new THREE.BoxGeometry(w, h, d), c, { x, y, z, ...o });
export const cyl = (B, rt, rb, h, c, x, y, z, o = {}) => B.add(new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 12, o.hs ?? 1, o.open ?? false), c, { x, y, z, ...o });
export const cone = (B, r, h, c, x, y, z, o = {}) => B.add(new THREE.ConeGeometry(r, h, o.seg ?? 10), c, { x, y, z, ...o });
export const sph = (B, r, c, x, y, z, o = {}) => B.add(new THREE.SphereGeometry(r, o.ws ?? 14, o.hs ?? 10), c, { x, y, z, ...o });
export const ico = (B, r, c, x, y, z, o = {}) => B.add(jit(new THREE.IcosahedronGeometry(r, o.detail ?? 1), r * (o.j ?? 0.18), o.seed ?? 1), c, { x, y, z, ...o });
export const tor = (B, r, t, c, x, y, z, o = {}) => B.add(new THREE.TorusGeometry(r, t, o.rs ?? 6, o.ts ?? 16, o.arc ?? Math.PI * 2), c, { x, y, z, ...o });

// weld-safe jitter (hash of position so shared corners move together)
export function jit(g, amp, seed = 1) {
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 53.7) * 43758.5453;
    const r = (a) => ((((Math.sin(h + a) * 1e4) % 1) + 1) % 1) - 0.5;
    P.setXYZ(i, x + r(1) * amp, y + r(2) * amp * 0.7, z + r(3) * amp);
  }
  g.computeVertexNormals(); return g;
}

// house profile: walls + gables in one extrusion (ridge along x). Origin = ground centre, front = +z.
export function houseGeo(w, d, h, rh) {
  const s = new THREE.Shape();
  s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(d / 2, h); s.lineTo(0, h + rh); s.lineTo(-d / 2, h); s.lineTo(-d / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
  // rotateY(-90°): shape-x → +z (front), extrusion z → -x; then centre on x. No mirroring (keeps winding).
  g.rotateY(-Math.PI / 2); g.translate(w / 2, 0, 0); g.computeVertexNormals();
  return g;
}

// roof slabs over a houseGeo (ridge along x)
export function roof(B, w, d, h, rh, c, o = {}) {
  const ov = o.over ?? 0.28, t = o.t ?? 0.2, ex = o.ex ?? 0.3;
  const hd = d / 2 + ov, a = Math.atan2(rh, d / 2), L = hd / Math.cos(a);
  for (const sgn of [1, -1]) {
    // slab centre: half-way down the slope, lifted by half thickness along the slab normal
    const cz = sgn * (hd / 2), cy = h + rh - (hd / 2) * Math.tan(a);
    const nz = sgn * Math.sin(a), ny = Math.cos(a);
    B.add(new THREE.BoxGeometry(w + ex * 2, t, L + 0.04), c, { x: 0, y: cy + ny * t / 2, z: cz + nz * t / 2, rx: sgn * a, jit: 0.1, ao: false });
    if (o.snow) B.add(new THREE.BoxGeometry(w + ex * 2 - 0.05, t * 0.6, L * 0.9), '#f4f8ff', { x: 0, y: cy + ny * (t + 0.05), z: cz + nz * (t + 0.05) - sgn * L * 0.04, rx: sgn * a, jit: 0.03, ao: false });
  }
  // ridge cap
  cyl(B, t * 0.7, t * 0.7, w + ex * 2, c, 0, h + rh + t * 0.55, 0, { rz: Math.PI / 2, seg: 6, ao: false });
}

// ------------------------------------------------------------------ season palettes
export const SEASONS = {
  spring: {
    leaf: ['#5f9a3a', '#7fb348', '#4b7f32', '#9cc85a', '#6aa640'], dark: '#3f6b2c', blossom: ['#f7c6d6', '#fbe2ea', '#f2a9c2'],
    grass: '#7bab48', grass2: '#94bf55', grassDark: '#557f35', dirt: '#b79466', dirt2: '#9c7a52', stone: '#b8b0a2', roofSnow: false,
    flowers: ['#ffe27a', '#f59ab5', '#ffffff', '#b9a0f5', '#ff8f6b'], particles: 'petals', water: ['#3d7fa0', '#6fb4c8'],
    sky: { zenith: '#4f86d4', mid: '#94c0ec', horizon: '#f7e2bd', cloudLit: '#fffaf0', cloudShade: '#a8a9cf', sunCol: '#fff2cc', rimCol: '#ffe0a8' },
    hemiSky: '#cfe3ff', hemiGround: '#6b7a3a', key: '#fff0d6',
  },
  autumn: {
    leaf: ['#d98a2b', '#c4572a', '#e6b13e', '#a8402a', '#cf6f2e'], dark: '#7a3a22', blossom: ['#e6a440', '#d4682c', '#f0c45a'],
    grass: '#a39a4a', grass2: '#b8a858', grassDark: '#7a6e36', dirt: '#a8805a', dirt2: '#8a6646', stone: '#aea494', roofSnow: false,
    flowers: ['#f0b13c', '#d9572e', '#f7e6b0', '#a2563a', '#e88c3a'], particles: 'leaves', water: ['#3a6e88', '#7aa6b0'],
    sky: { zenith: '#5f7fbf', mid: '#d3b9b5', horizon: '#f6c58f', cloudLit: '#fff0dc', cloudShade: '#b79aa8', sunCol: '#ffd59a', rimCol: '#ffc27a' },
    hemiSky: '#ffe0c0', hemiGround: '#6e4e2e', key: '#ffd8a8',
  },
  winter: {
    leaf: ['#e9f0f6', '#d5e1ec', '#c3d3e2', '#f4f8fb', '#dde7f0'], dark: '#7d8fa3', blossom: ['#ffffff', '#e8f0ff', '#d0e0f5'],
    grass: '#e8eef4', grass2: '#f6f9fc', grassDark: '#b9c6d4', dirt: '#b9b0a8', dirt2: '#9c948c', stone: '#a8aab2', roofSnow: true,
    flowers: ['#c8302e', '#ffffff', '#e0e8f0', '#2f6b3e', '#d04040'], particles: 'snow', water: ['#4a7088', '#a6c4d4'],
    sky: { zenith: '#6b8bbf', mid: '#b8cbe2', horizon: '#f1e3d8', cloudLit: '#ffffff', cloudShade: '#a9b2cc', sunCol: '#ffe8d0', rimCol: '#d8e6ff' },
    hemiSky: '#e0ecff', hemiGround: '#9aa4b4', key: '#fff2e6',
  },
};
export let S = SEASONS.spring;
export const setSeason = (k) => { S = SEASONS[k] || SEASONS.spring; return S; };
const pick = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];

// ------------------------------------------------------------------ nature
export function tree(B, x, z, o = {}) {
  const r = B.r, s = o.s ?? (0.85 + r() * 0.4), y0 = o.y ?? 0;
  const th = (o.h ?? 2.2) * s, tr = 0.17 * s * (o.girth ?? 1);
  const lean = (r() - 0.5) * 0.12;
  cyl(B, tr * 0.65, tr * 1.15, th, o.bark ?? '#6b4a32', x, y0 + th / 2, z, { rz: lean, seg: 8, jit: 0.1 });
  // root flare
  cone(B, tr * 2.1, tr * 2.2, o.bark ?? '#6b4a32', x, y0 + tr * 1.0, z, { seg: 8, jit: 0.1 });
  const bare = o.bare ?? false;
  const cx = x - Math.sin(lean) * th, cy = y0 + th + 0.55 * s;
  if (bare) {
    for (let i = 0; i < 6; i++) {
      const a = r() * Math.PI * 2, l = (0.9 + r() * 0.7) * s;
      cyl(B, 0.03 * s, 0.07 * s, l, o.bark ?? '#5a3e2a', cx + Math.cos(a) * l * 0.35, cy - 0.2 + l * 0.3, z + Math.sin(a) * l * 0.35, { rz: Math.cos(a) * 0.9, rx: -Math.sin(a) * 0.9, seg: 5 });
    }
    return;
  }
  const leaves = o.leaf ?? S.leaf;
  const n = o.clumps ?? 7, R = (o.r ?? 1.15) * s;
  const centre = new THREE.Vector3(0, 0, 0);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.6, rr = i === 0 ? 0 : R * (0.45 + r() * 0.3);
    const lx = Math.cos(a) * rr, lz = Math.sin(a) * rr * 0.8, ly = (i === 0 ? 0.35 : (r() - 0.35) * R * 0.7);
    const cr = R * (i === 0 ? 0.85 : 0.5 + r() * 0.25);
    const g = jit(new THREE.IcosahedronGeometry(cr, 2), cr * 0.16, x * 7 + i);
    // normals relative to the whole canopy centre → one big soft painted mass
    const off = new THREE.Vector3(-lx, -ly, -lz);
    B.add(g, pick(leaves, r), { x: cx + lx, y: cy + ly, z: z + lz, blob: off, blobK: 0.8, jit: 0.08, ao: false });
  }
  if (o.blossom) for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2, rr = R * (0.6 + r() * 0.45);
    sph(B, 0.09 * s, pick(o.blossom, r), cx + Math.cos(a) * rr, cy + (r() - 0.3) * R * 0.9, z + Math.sin(a) * rr * 0.8 + 0.2, { ws: 5, hs: 4, ao: false });
  }
}
export function pine(B, x, z, o = {}) {
  const r = B.r, s = o.s ?? (0.8 + r() * 0.5), y0 = o.y ?? 0, h = (o.h ?? 3.6) * s;
  cyl(B, 0.09 * s, 0.16 * s, h * 0.35, '#5b3d28', x, y0 + h * 0.175, z, { seg: 7 });
  const tiers = o.tiers ?? 4, col = o.col ?? (S === SEASONS.winter ? '#3d6b52' : '#2f5d3e');
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers, rr = (1.05 - t * 0.7) * s * (o.w ?? 1), hh = h * 0.42;
    const yy = y0 + h * 0.25 + t * h * 0.62 + hh / 2;
    const g = jit(new THREE.ConeGeometry(rr, hh, 9, 2), rr * 0.1, x * 3 + i);
    B.add(g, i % 2 ? col : new THREE.Color(col).offsetHSL(0.01, 0, 0.04).getStyle(), { x, y: yy, z, ry: r() * 3, jit: 0.08, ao: false, blob: new THREE.Vector3(0, -hh * 0.2, 0), blobK: 0.45 });
    if (S.roofSnow) B.add(jit(new THREE.ConeGeometry(rr * 0.82, hh * 0.35, 9), rr * 0.06, i), '#f2f6fb', { x, y: yy + hh * 0.28, z, ao: false, jit: 0.03 });
  }
}
export function bush(B, x, z, o = {}) {
  const r = B.r, s = o.s ?? (0.5 + r() * 0.4), y0 = o.y ?? 0, cols = o.col ? [o.col] : S.leaf;
  const n = o.n ?? 4;
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28, rr = i ? s * 0.5 : 0, cr = s * (0.55 + r() * 0.3);
    B.add(jit(new THREE.IcosahedronGeometry(cr, 1), cr * 0.2, x + i), pick(cols, r), { x: x + Math.cos(a) * rr, y: y0 + cr * 0.6, z: z + Math.sin(a) * rr * 0.7, blob: new THREE.Vector3(-Math.cos(a) * rr, -cr * 0.3, -Math.sin(a) * rr * 0.7), jit: 0.1, ao: false });
  }
  if (o.flowers) for (let i = 0; i < 8; i++) { const a = r() * 6.28; sph(B, 0.06, pick(o.flowers === true ? S.flowers : o.flowers, r), x + Math.cos(a) * s * 0.7, y0 + s * (0.5 + r() * 0.5), z + Math.sin(a) * s * 0.5 + 0.15, { ws: 5, hs: 4, ao: false }); }
}
export function rock(B, x, z, o = {}) {
  const r = B.r, s = o.s ?? (0.3 + r() * 0.4);
  B.add(jit(new THREE.IcosahedronGeometry(s, 1), s * 0.3, x * 13 + z), o.col ?? S.stone, { x, y: (o.y ?? 0) + s * 0.35, z, sy: o.sy ?? 0.7, ry: r() * 6, jit: 0.12 });
  if (S.roofSnow && o.snow !== false) B.add(jit(new THREE.IcosahedronGeometry(s * 0.8, 1), s * 0.2, x), '#f2f6fb', { x, y: (o.y ?? 0) + s * 0.62, z, sy: 0.35, jit: 0.03, ao: false });
}
export function grass(B, x, z, o = {}) {
  const r = B.r, n = o.n ?? 6, s = o.s ?? 1;
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28, d = r() * 0.25 * s, h = (0.22 + r() * 0.25) * s;
    cone(B, 0.035 * s, h, r() < 0.5 ? S.grassDark : S.grass2, x + Math.cos(a) * d, (o.y ?? 0) + h / 2, z + Math.sin(a) * d, { seg: 3, rz: (r() - 0.5) * 0.6, rx: (r() - 0.5) * 0.6, ao: false, jit: 0.1 });
  }
}
export function flowers(B, x, z, o = {}) {
  const r = B.r, n = o.n ?? 8, rad = o.r ?? 0.6;
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28, d = Math.sqrt(r()) * rad, h = 0.12 + r() * 0.18;
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d * 0.7;
    cyl(B, 0.01, 0.012, h, S.grassDark, px, (o.y ?? 0) + h / 2, pz, { seg: 3, ao: false });
    sph(B, 0.045 + r() * 0.03, pick(o.cols ?? S.flowers, r), px, (o.y ?? 0) + h + 0.02, pz, { ws: 5, hs: 4, ao: false, jit: 0.05 });
  }
}
export function mushroom(B, x, z, o = {}) {
  const s = o.s ?? 0.3, y0 = o.y ?? 0, cap = o.cap ?? '#c8403a';
  cyl(B, s * 0.18, s * 0.26, s * 0.9, '#f1e6d2', x, y0 + s * 0.45, z, { seg: 8 });
  B.add(new THREE.SphereGeometry(s * 0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), cap, { x, y: y0 + s * 0.82, z, sy: 0.7, ao: false, mat: o.mat });
  if (o.spots !== false) for (let i = 0; i < 5; i++) { const a = i * 1.3 + x; sph(B, s * 0.07, '#fff6e6', x + Math.cos(a) * s * 0.3, y0 + s * 1.0, z + Math.sin(a) * s * 0.3, { ws: 4, hs: 3, ao: false }); }
}

// ------------------------------------------------------------------ village architecture
export function cottage(B, x, z, ry, o = {}) {
  const r = B.r, w = o.w ?? 2.6, d = o.d ?? 2.2, h = o.h ?? 1.9, rh = o.rh ?? 1.5;
  const plaster = o.plaster ?? pick(['#efe2c4', '#f3e9d2', '#e9d6b6', '#f0dcc8'], r), timber = o.timber ?? '#5a3b26';
  const roofC = o.roof ?? pick(['#a8553a', '#8c4a34', '#b8865a', '#7d5a3e'], r);
  B.push(x, o.y ?? 0, z, ry);
  B.add(houseGeo(w, d, h, rh * 0.98), plaster, { jit: 0.05, aoH: 1.2 });
  // stone footing
  box(B, w + 0.08, 0.35, d + 0.08, o.stone ?? S.stone, 0, 0.17, 0, { jit: 0.12 });
  // timber frame on the front (+z) and sides
  const fz = d / 2 + 0.025, tt = 0.09;
  for (const px of [-w / 2 + 0.05, w / 2 - 0.05, -w / 6, w / 6]) box(B, tt, h, 0.05, timber, px, h / 2, fz);
  box(B, w, tt, 0.05, timber, 0, h - 0.04, fz); box(B, w, tt, 0.05, timber, 0, h * 0.52, fz);
  const bl = Math.hypot(w / 3, h * 0.48);
  box(B, tt * 0.8, bl, 0.04, timber, -w / 3, h * 0.27 + 0.02, fz + 0.005, { rz: Math.atan2(w / 3, h * 0.48) });
  box(B, tt * 0.8, bl, 0.04, timber, w / 3, h * 0.27 + 0.02, fz + 0.005, { rz: -Math.atan2(w / 3, h * 0.48) });
  for (const sx of [-1, 1]) { box(B, 0.05, h, tt, timber, sx * (w / 2 + 0.025), h / 2, d / 2 - 0.06); box(B, 0.05, h, tt, timber, sx * (w / 2 + 0.025), h / 2, -d / 2 + 0.06); box(B, 0.05, tt, d, timber, sx * (w / 2 + 0.025), h - 0.04, 0); }
  roof(B, w, d, h, rh, roofC, { snow: S.roofSnow, t: o.thatch ? 0.32 : 0.18 });
  // door (recess + warm crack) and windows (glow)
  const dx = o.doorX ?? 0;
  box(B, 0.78, 1.32, 0.06, timber, dx, 0.66 + 0.3, fz + 0.03);
  box(B, 0.62, 1.18, 0.05, o.doorC ?? '#7a4a2c', dx, 0.6 + 0.3, fz + 0.06);
  sph(B, 0.04, '#d8b060', dx + 0.2, 0.95, fz + 0.1, { ws: 5, hs: 4 });
  const wins = o.windows ?? [[-w / 3, h * 0.72], [w / 3, h * 0.72]];
  for (const [wx, wy] of wins) {
    box(B, 0.5, 0.46, 0.04, o.glow ? '#ffcc66' : '#ffd98a', wx, wy, fz + 0.02, { mat: 'glow', jit: 0.02, ao: false });
    box(B, 0.05, 0.46, 0.03, timber, wx, wy, fz + 0.05); box(B, 0.5, 0.05, 0.03, timber, wx, wy, fz + 0.05);
    box(B, 0.62, 0.08, 0.1, timber, wx, wy - 0.27, fz + 0.06);
    if (o.flowers !== false) { box(B, 0.56, 0.14, 0.16, '#7a4f30', wx, wy - 0.36, fz + 0.1); for (let i = 0; i < 5; i++) sph(B, 0.06, pick(S.flowers, r), wx - 0.22 + i * 0.11, wy - 0.24, fz + 0.12, { ws: 5, hs: 4, ao: false }); }
  }
  if (o.chimney !== false) {
    const cxp = (o.chimneyX ?? (w * 0.28)), ch = rh + 0.9;
    box(B, 0.42, ch, 0.42, o.stone ?? '#9a8b7c', cxp, h + ch / 2 - 0.1, -d * 0.12, { jit: 0.14 });
    box(B, 0.5, 0.12, 0.5, '#7d6e62', cxp, h + ch - 0.08, -d * 0.12);
  }
  B.pop();
}

export function tower(B, x, z, o = {}) {
  const r = o.r ?? 1.2, h = o.h ?? 6, stone = o.stone ?? '#cfc6b6', y0 = o.y ?? 0;
  B.push(x, y0, z, o.ry ?? 0);
  cyl(B, r, r * 1.06, h, stone, 0, h / 2, 0, { seg: 18, jit: 0.06, aoH: 2 });
  for (let i = 0; i < 3; i++) cyl(B, r * 1.02, r * 1.02, 0.08, '#b3a998', 0, h * (0.3 + i * 0.25), 0, { seg: 18 });
  // corbelled crown + merlons
  cyl(B, r * 1.18, r * 1.0, 0.4, stone, 0, h + 0.2, 0, { seg: 18 });
  const n = o.merlons ?? 10;
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; box(B, 0.34, 0.42, 0.24, stone, Math.sin(a) * r * 1.08, h + 0.6, Math.cos(a) * r * 1.08, { ry: a }); }
  if (o.roof !== false) {
    cone(B, r * 1.3, o.roofH ?? r * 2.4, o.roofC ?? '#5a6aa8', 0, h + 0.4 + (o.roofH ?? r * 2.4) / 2, 0, { seg: 16, ao: false, jit: 0.05 });
    if (S.roofSnow) cone(B, r * 0.75, (o.roofH ?? r * 2.4) * 0.45, '#f4f8ff', 0, h + 0.4 + (o.roofH ?? r * 2.4) * 0.8, 0, { seg: 16, ao: false });
  }
  // arrow-slit windows (glow, warm)
  for (const [a, yy] of o.windows ?? [[0, h * 0.55], [0, h * 0.8]]) box(B, 0.16, 0.5, 0.06, '#ffc66a', Math.sin(a) * r * 1.01, yy, Math.cos(a) * r * 1.01, { ry: a, mat: 'glow', ao: false });
  B.pop();
}

export function wall(B, x1, z1, x2, z2, o = {}) {
  const h = o.h ?? 3, t = o.t ?? 0.8, stone = o.stone ?? '#c8bfae', y0 = o.y ?? 0;
  const L = Math.hypot(x2 - x1, z2 - z1), a = Math.atan2(x2 - x1, z2 - z1) - Math.PI / 2;
  B.push((x1 + x2) / 2, y0, (z1 + z2) / 2, a);
  box(B, L, h, t, stone, 0, h / 2, 0, { jit: 0.08, aoH: 1.5 });
  // stone course lines
  for (let i = 1; i < 4; i++) box(B, L + 0.02, 0.05, t + 0.02, '#a89e8e', 0, h * i / 4, 0, { jit: 0.05 });
  const n = Math.max(2, Math.floor(L / 0.7));
  if (o.crenel !== false) for (let i = 0; i < n; i++) if (i % 2 === 0) box(B, L / n * 0.95, 0.45, t, stone, -L / 2 + (i + 0.5) * L / n, h + 0.22, 0, { jit: 0.08 });
  if (S.roofSnow) box(B, L, 0.1, t + 0.05, '#f4f8ff', 0, h + 0.05, 0, { ao: false });
  B.pop();
}

export function fence(B, pts, o = {}) {
  const c = o.col ?? '#8a6a48', h = o.h ?? 0.7;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
    const L = Math.hypot(x2 - x1, z2 - z1), a = Math.atan2(z2 - z1, x2 - x1);
    const n = Math.max(1, Math.round(L / 1.1));
    for (let k = 0; k <= n; k++) { if (k === n && i < pts.length - 2) continue; const t = k / n; box(B, 0.1, h, 0.1, c, x1 + (x2 - x1) * t, h / 2, z1 + (z2 - z1) * t, { ry: B.r() * 0.3 }); }
    for (const yy of [h * 0.45, h * 0.85]) box(B, L, 0.07, 0.05, c, (x1 + x2) / 2, yy, (z1 + z2) / 2, { ry: -a, rz: (B.r() - 0.5) * 0.04 });
  }
}

export function barrel(B, x, z, o = {}) {
  const s = o.s ?? 1, y0 = o.y ?? 0;
  const prof = []; for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push(new THREE.Vector2((0.27 + Math.sin(t * Math.PI) * 0.06) * s, t * 0.75 * s)); }
  B.add(new THREE.LatheGeometry(prof, 12), o.col ?? '#8a5a36', { x, y: y0, z });
  cyl(B, 0.27 * s, 0.27 * s, 0.02, '#6a4428', x, y0 + 0.75 * s, z, { seg: 12 });
  for (const yy of [0.12, 0.63]) cyl(B, 0.335 * s, 0.335 * s, 0.05 * s, '#4a4440', x, y0 + yy * s, z, { seg: 12 });
}
export function crate(B, x, z, o = {}) {
  const s = o.s ?? 0.6, y0 = o.y ?? 0;
  box(B, s, s, s, o.col ?? '#a5794c', x, y0 + s / 2, z, { ry: o.ry ?? B.r() * 0.5 });
  box(B, s + 0.02, 0.06, s + 0.02, '#7a5432', x, y0 + s * 0.15, z, { ry: o.ry ?? 0 }); box(B, s + 0.02, 0.06, s + 0.02, '#7a5432', x, y0 + s * 0.85, z, { ry: o.ry ?? 0 });
}
export function lampPost(B, x, z, o = {}) {
  const h = o.h ?? 2.4;
  cyl(B, 0.05, 0.07, h, '#3a3430', x, h / 2, z, { seg: 6 });
  box(B, 0.26, 0.34, 0.26, '#ffcf6e', x, h + 0.1, z, { mat: 'glow' });
  cone(B, 0.24, 0.2, '#3a3430', x, h + 0.36, z, { seg: 4, ry: Math.PI / 4 });
}
export function banner(B, x, y, z, col, o = {}) {
  const w = o.w ?? 0.6, h = o.h ?? 1.2;
  cyl(B, 0.025, 0.025, w + 0.2, '#6a4a2c', x, y, z, { rz: Math.PI / 2, seg: 5 });
  const g = new THREE.PlaneGeometry(w, h, 2, 4);
  const P = g.attributes.position; for (let i = 0; i < P.count; i++) { const yy = P.getY(i); if (yy < -h / 2 + 0.01 && Math.abs(P.getX(i)) < 0.01) P.setY(i, yy + h * 0.18); }
  B.add(g, col, { x, y: y - h / 2 - 0.02, z: z + 0.01, ry: o.ry ?? 0, mat: 'paintDS', jit: 0.05, ao: false });
}
export function bunting(B, x1, y1, z1, x2, y2, z2, o = {}) {
  const n = o.n ?? 12, sag = o.sag ?? 0.5, cols = o.cols ?? ['#d9443a', '#f2c94c', '#4f8fd0', '#f4f1e8', '#5aa55a'];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t, y = y1 + (y2 - y1) * t - Math.sin(t * Math.PI) * sag;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-0.13, 0, 0, 0.13, 0, 0, 0, -0.3, 0], 3)); g.computeVertexNormals();
    B.add(g, cols[i % cols.length], { x, y, z, ry: -Math.atan2(z2 - z1, x2 - x1), mat: 'paintDS', ao: false, jit: 0.04 });
  }
  const L = Math.hypot(x2 - x1, z2 - z1);
  cyl(B, 0.01, 0.01, L, '#4a3a2c', (x1 + x2) / 2, (y1 + y2) / 2 - sag * 0.62, (z1 + z2) / 2, { rz: Math.PI / 2, ry: -Math.atan2(z2 - z1, x2 - x1), seg: 3 });
}
export function well(B, x, z, o = {}) {
  B.push(x, 0, z, o.ry ?? 0);
  B.add(jit(new THREE.CylinderGeometry(0.75, 0.82, 0.8, 16, 2, true), 0.02, 3), '#a99d8c', { y: 0.4, mat: 'paintDS' });
  tor(B, 0.78, 0.1, '#bfb4a2', 0, 0.82, 0, { rx: Math.PI / 2, ts: 18 });
  cyl(B, 0.72, 0.72, 0.05, '#1c2a33', 0, 0.55, 0, { seg: 16, mat: 'glow', ao: false }); // dark water
  for (const sx of [-1, 1]) box(B, 0.12, 1.5, 0.12, '#6b4a30', sx * 0.72, 1.45, 0);
  B.pop();
  B.push(x, 0, z, o.ry ?? 0);
  const rw = 1.8;
  for (const sgn of [1, -1]) box(B, rw, 0.08, 0.75, o.roof ?? '#8c4a34', 0, 2.38, sgn * 0.3, { rx: sgn * 0.6 });
  cyl(B, 0.05, 0.05, 1.5, '#5a3e28', 0, 1.95, 0, { rz: Math.PI / 2, seg: 6 });
  cyl(B, 0.01, 0.01, 0.9, '#c8b48a', 0, 1.5, 0, { seg: 3 });
  B.pop();
}
export function fountain(B, x, z, o = {}) {
  B.push(x, 0, z, 0);
  B.add(new THREE.CylinderGeometry(1.5, 1.6, 0.55, 20, 1, true), '#b9ad9c', { y: 0.27, mat: 'paintDS', jit: 0.08 });
  tor(B, 1.52, 0.13, '#cfc4b2', 0, 0.56, 0, { rx: Math.PI / 2, ts: 24 });
  cyl(B, 0.25, 0.35, 1.2, '#b9ad9c', 0, 0.6, 0, { seg: 10 });
  B.add(new THREE.SphereGeometry(0.6, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), '#cfc4b2', { y: 1.25, mat: 'paintDS' });
  cyl(B, 0.1, 0.14, 0.6, '#b9ad9c', 0, 1.5, 0, { seg: 8 });
  sph(B, 0.18, '#d8cdb8', 0, 1.85, 0);
  B.pop();
}
export function stall(B, x, z, ry, o = {}) {
  B.push(x, 0, z, ry);
  const w = o.w ?? 2, d = o.d ?? 1;
  box(B, w, 0.8, d, '#9a6a42', 0, 0.4, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(B, 0.08, 2, 0.08, '#6b4a30', sx * (w / 2 - 0.05), 1, sz * (d / 2 - 0.05));
  const cols = o.cols ?? ['#c8403a', '#f3ead6'];
  for (let i = 0; i < 6; i++) box(B, w / 6 + 0.01, 0.05, d + 0.5, cols[i % 2], -w / 2 + (i + 0.5) * w / 6, 2.08, 0.15, { rx: 0.25, ao: false });
  const goods = o.goods ?? ['#e2b04a', '#c8562e', '#9cc85a', '#f0d080'];
  for (let i = 0; i < 9; i++) sph(B, 0.11, goods[i % goods.length], -w / 2 + 0.3 + (i % 5) * 0.34, 0.9, -0.15 + Math.floor(i / 5) * 0.3, { ws: 8, hs: 6 });
  B.pop();
}
export function signpost(B, x, z, arms, o = {}) {
  cyl(B, 0.07, 0.09, 2.3, '#6b4a30', x, 1.15, z, { seg: 6 });
  arms.forEach(([ry, y], i) => { B.push(x, y, z, ry); box(B, 1.0, 0.22, 0.06, '#c8a06a', 0.5, 0, 0.08); cone(B, 0.16, 0.2, '#c8a06a', 1.08, 0, 0.08, { rz: -Math.PI / 2, seg: 4, rx: Math.PI / 4 }); B.pop(); });
}

// stone/earth masses (cliffs, hills): jittered, squashed icospheres with banded colours
export function cliffMass(B, x, y, z, sx, sy, sz, o = {}) {
  const g = jit(new THREE.IcosahedronGeometry(1, o.detail ?? 2), o.j ?? 0.16, x * 3 + z);
  const top = new THREE.Color(o.top ?? S.grass), side = new THREE.Color(o.side ?? '#9a8a78'), low = new THREE.Color(o.low ?? '#6e6058');
  B.add(g, '#ffffff', {
    x, y, z, sx, sy, sz, ry: o.ry ?? 0, jit: 0.06, ao: false, colors: (P, col) => {
      for (let i = 0; i < P.count; i++) {
        const yy = P.getY(i); const t = (yy - (y - sy)) / (2 * sy);
        const c = t > (o.grassLine ?? 0.82) ? top : t > 0.35 ? side.clone().lerp(low, (0.82 - t) * 0.6) : low;
        col[i * 3] *= c.r; col[i * 3 + 1] *= c.g; col[i * 3 + 2] *= c.b;
      }
    },
  });
}

// ground: a dense plane with an optional height field; painted texture drives colour
export function groundMesh(W, D, cx, cz, hf, segX = 96, segZ = 72) {
  const g = new THREE.PlaneGeometry(W, D, segX, segZ); g.rotateX(-Math.PI / 2); g.translate(cx, 0, cz);
  if (hf) { const P = g.attributes.position; for (let i = 0; i < P.count; i++) P.setY(i, hf(P.getX(i), P.getZ(i))); g.computeVertexNormals(); }
  const m = new THREE.Mesh(g, M.ground); m.receiveShadow = true; m.name = 'ground';
  return m;
}

// a painted flat card (backdrop layer / haze / god ray)
export function card(tex, w, h, x, y, z, o = {}) {
  const mat = new THREE.MeshBasicNodeMaterial({ map: tex, transparent: true, depthWrite: o.depthWrite ?? false, fog: o.fog ?? true, side: THREE.DoubleSide, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: o.opacity ?? 1 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z); if (o.ry) m.rotation.y = o.ry; if (o.rz) m.rotation.z = o.rz; if (o.rx) m.rotation.x = o.rx;
  m.renderOrder = o.order ?? 0; return m;
}
