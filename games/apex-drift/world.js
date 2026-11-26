// Apex Drift — per-track world: heightfield terrain blended into the road, road/curb/shoulder ribbons with TSL
// markings, barriers, start gantry, corner chevrons and instanced theme props (coast / city / alpine).
// Everything static is merged or instanced: a whole track is ~40 draw calls.
import { THREE, settings } from '/shared/sd-kit.js';
import { Fn, uniform, vec2, vec3, vec4, float, attribute, texture, normalMap, positionWorld, normalWorld, mix, smoothstep, step, fract, floor, abs, max, min, exp, sin, dot, mod, mx_noise_float, positionGeometry, normalGeometry, instancedBufferAttribute, vertexColor, fwidth, time, length, cameraPosition, pow, clamp } from 'three/tsl';
import { tex, makeWater, makeSnow } from './env.js';
import { SHOULDER } from './physics.js';

// ---------------------------------------------------------------- helpers
export function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const P = new Uint8Array(512); { const r = rng(7); const p = Array.from({ length: 256 }, (_, i) => i); for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) P[i] = p[i & 255]; }
function grad(h, x, y) { const a = (h & 7) * 0.7853981; return Math.cos(a) * x + Math.sin(a) * y; }
export function noise2(x, y) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255; x -= Math.floor(x); y -= Math.floor(y);
  const u = x * x * (3 - 2 * x), v = y * y * (3 - 2 * y);
  const a = P[X] + Y, b = P[X + 1] + Y;
  const l1 = grad(P[a], x, y) + u * (grad(P[b], x - 1, y) - grad(P[a], x, y));
  const l2 = grad(P[a + 1], x, y - 1) + u * (grad(P[b + 1], x - 1, y - 1) - grad(P[a + 1], x, y - 1));
  return (l1 + v * (l2 - l1)) * 1.4;
}
export function fbm(x, y, o = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += noise2(x * f, y * f) * a; f *= 2.03; a *= 0.5; } return s; }
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function jitter(geo, amt, r) { const p = geo.attributes.position; const key = new Map(); for (let i = 0; i < p.count; i++) { const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`; if (!key.has(k)) key.set(k, [(r() - 0.5) * amt, (r() - 0.5) * amt, (r() - 0.5) * amt]); const o = key.get(k); p.setXYZ(i, p.getX(i) + o[0], p.getY(i) + o[1], p.getZ(i) + o[2]); } geo.computeVertexNormals(); return geo; }

/** Bucketed nearest-sample lookup over the track (2D). */
export class TrackGrid {
  constructor(T, cell = 40) {
    this.T = T; this.cell = cell; this.map = new Map();
    for (let i = 0; i < T.n; i++) { const k = this.key(Math.floor(T.x[i] / cell), Math.floor(T.z[i] / cell)); (this.map.get(k) || this.map.set(k, []).get(k)).push(i); }
  }
  key(a, b) { return a * 73856093 ^ b * 19349663; }
  nearest(x, z, r = 1) {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell), T = this.T; let best = -1, bd = Infinity;
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) { const l = this.map.get(this.key(cx + a, cz + b)); if (!l) continue; for (const i of l) { const dx = x - T.x[i], dz = z - T.z[i], d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } } }
    return { i: best, d: Math.sqrt(bd) };
  }
}

// ---------------------------------------------------------------- natural terrain per theme
const coastLine = (z) => -505 + 16 * Math.sin(z / 70) + 9 * Math.sin(z / 23 + 1.3) + 26 * Math.sin(z / 260);
function natural(theme, x, z, ctr) {
  if (theme === 'coast') {
    const xc = coastLine(z);
    const land = 25 + (x - xc) * 0.075 + fbm(x / 230, z / 230) * 16 + fbm(x / 60, z / 60, 3) * 3 + Math.max(0, x - 80) * 0.22 + Math.max(0, Math.abs(z - 40) - 650) * 0.2;
    return -16 + (land + 16) * sstep(xc - 34, xc + 10, x + fbm(z / 40, x / 40, 2) * 10);
  }
  if (theme === 'alpine') {
    const r = Math.hypot(x - ctr[0], z - ctr[1]);
    const ridge = 1 - Math.abs(fbm(x / 420, z / 420, 4)); const base = 30 + fbm(x / 260, z / 260) * 30 + fbm(x / 70, z / 70, 3) * 5;
    return base + sstep(330, 900, r) * (170 + ridge * ridge * 260);
  }
  return 0;
}

// ---------------------------------------------------------------- world
export function buildWorld(T, theme, { seed = 1, colors = {} } = {}) {
  const group = new THREE.Group(); const R = rng(seed); const low = settings.quality === 'low';
  const grid = new TrackGrid(T);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, cx = 0, cz = 0;
  for (let i = 0; i < T.n; i++) { minX = Math.min(minX, T.x[i]); maxX = Math.max(maxX, T.x[i]); minZ = Math.min(minZ, T.z[i]); maxZ = Math.max(maxZ, T.z[i]); cx += T.x[i]; cz += T.z[i]; }
  const ctr = [cx / T.n, cz / T.n];
  const M = theme === 'coast' ? 650 : theme === 'alpine' ? 720 : 380;
  const B = { minX: minX - M, maxX: maxX + M, minZ: minZ - M, maxZ: maxZ + M };
  const disposables = [];
  const add = (o) => { group.add(o); o.traverse?.((m) => { if (m.geometry) disposables.push(m.geometry); if (m.material) disposables.push(m.material); }); return o; };

  // ---------------- terrain heightfield (road cut/fill blended in)
  const RES = low ? 140 : 210, W = B.maxX - B.minX, D = B.maxZ - B.minZ, sx = W / (RES - 1), sz = D / (RES - 1);
  const H = new Float32Array(RES * RES);
  const edge = (i) => T.w[i] + SHOULDER + 2.5;
  const blendR = theme === 'alpine' ? 34 : 46;
  for (let iz = 0; iz < RES; iz++) for (let ix = 0; ix < RES; ix++) {
    const x = B.minX + ix * sx, z = B.minZ + iz * sz; let h = natural(theme, x, z, ctr);
    if (theme !== 'city') { const nb = grid.nearest(x, z, 2); if (nb.i >= 0) { const k = sstep(0, blendR, nb.d - edge(nb.i)); h = (T.y[nb.i] - 0.55) * (1 - k) + h * k; } }
    H[iz * RES + ix] = h;
  }
  const heightAt = (x, z) => {
    const fx = Math.min(RES - 1.001, Math.max(0, (x - B.minX) / sx)), fz = Math.min(RES - 1.001, Math.max(0, (z - B.minZ) / sz));
    const ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz, i = iz * RES + ix;
    return (H[i] * (1 - u) + H[i + 1] * u) * (1 - v) + (H[i + RES] * (1 - u) + H[i + RES + 1] * u) * v;
  };
  if (theme !== 'city') {
    const g = new THREE.PlaneGeometry(W, D, RES - 1, RES - 1); g.rotateX(-Math.PI / 2); g.translate(B.minX + W / 2, 0, B.minZ + D / 2);
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, H[i]);
    g.computeVertexNormals();
    const t = add(new THREE.Mesh(g, terrainMaterial(theme))); t.receiveShadow = true;
  } else {
    const g = new THREE.PlaneGeometry(W + 1400, D + 1400); g.rotateX(-Math.PI / 2); g.translate(B.minX + W / 2, -0.06, B.minZ + D / 2);
    const t = add(new THREE.Mesh(g, cityGroundMaterial())); t.receiveShadow = true;
  }
  if (theme === 'coast') { const wtr = add(makeWater(9000, 0)); wtr.position.x = B.minX; }

  // ---------------- road + curbs + shoulders (+ deck skirts on elevated sections)
  const n = T.n, N1 = n + 1;
  const ribbon = (inner, outer, yo, attrFn, { skirt = false } = {}) => {
    // two ribbons, left and right of the centreline, each from |inner| to |outer| metres
    const pos = [], at = [], idx = [], uvs = []; let base = 0;
    for (const side of [-1, 1]) {
      for (let j = 0; j <= n; j++) {
        const i = j % n, s = j * T.ds, w = T.w[i];
        const a = inner(w, i) * side, b = outer(w, i) * side, y = T.y[i] + yo;
        const ya = skirt ? y : y, yb = skirt ? Math.min(y - 0.1, Math.max(-0.5, y - 1.6)) : y;
        pos.push(T.x[i] + T.nx[i] * a, ya, T.z[i] + T.nz[i] * a, T.x[i] + T.nx[i] * (skirt ? a : b), yb, T.z[i] + T.nz[i] * (skirt ? a : b));
        at.push(...attrFn(a, s, w, i), ...attrFn(b, s, w, i)); uvs.push(a / 7, s / 7, (skirt ? a + 1.6 : b) / 7, s / 7); // uv drives the normal-map tangent frame
        if (j < n) { const k = base + j * 2; if (side < 0) idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); else idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      base += N1 * 2;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('rd', new THREE.Float32BufferAttribute(at, 4)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  // road: one ribbon from -w..+w (built as two halves meeting at the centreline)
  const kw = new Float32Array(n); { const r = Math.round(14 / T.ds); for (let i = 0; i < n; i++) { let a = 0; for (let o = -r; o <= r; o++) a = Math.max(a, Math.abs(T.k[(i + o + n) % n])); kw[i] = a; } }
  const curbAmt = (i) => sstep(1 / 180, 1 / 95, kw[i]);
  const roadG = ribbon(() => 0, (w) => w, 0.03, (lat, s, w, i) => [lat, s, w, T.line[i]]);
  const road = add(new THREE.Mesh(roadG, roadMaterial(theme, T.L))); road.receiveShadow = true;
  const curbG = ribbon((w) => w - 0.02, (w) => w + 1.05, 0.05, (lat, s, w, i) => [lat, s, w, curbAmt(i)]);
  const curb = add(new THREE.Mesh(curbG, curbMaterial(theme))); curb.receiveShadow = true;
  const shG = ribbon((w) => w + 1.0, (w) => w + SHOULDER + 0.9, 0.0, (lat, s, w, i) => [lat, s, w, 0]);
  const sh = add(new THREE.Mesh(shG, shoulderMaterial(theme))); sh.receiveShadow = true;
  if (theme === 'city') {
    const sk = ribbon((w) => w + SHOULDER + 0.9, (w) => w + SHOULDER + 0.9, 0.0, (lat, s, w, i) => [lat, s, w, 0], { skirt: true });
    add(new THREE.Mesh(sk, new THREE.MeshStandardNodeMaterial({ color: 0x3a3a46, roughness: 0.8, side: THREE.DoubleSide })));
  }

  // ---------------- barriers
  const bOff = (w) => w + SHOULDER + 0.18;
  const strip = (off, y0, y1, double = false) => {
    const pos = [], idx = [];
    for (const side of [-1, 1]) { const base = pos.length / 3; for (let j = 0; j <= n; j++) { const i = j % n, o = off(T.w[i], i) * side; pos.push(T.x[i] + T.nx[i] * o, T.y[i] + y0, T.z[i] + T.nz[i] * o, T.x[i] + T.nx[i] * o, T.y[i] + y1, T.z[i] + T.nz[i] * o); if (j < n) { const k = base + j * 2; if (side < 0) idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); else idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); } } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  const flat = (o0, o1, y) => { // horizontal strip between offsets o0..o1 at height y (top of a wall)
    const pos = [], idx = [];
    for (const side of [-1, 1]) { const base = pos.length / 3; for (let j = 0; j <= n; j++) { const i = j % n, a = o0(T.w[i]) * side, b = o1(T.w[i]) * side; pos.push(T.x[i] + T.nx[i] * a, T.y[i] + y, T.z[i] + T.nz[i] * a, T.x[i] + T.nx[i] * b, T.y[i] + y, T.z[i] + T.nz[i] * b); if (j < n) { const k = base + j * 2; if (side < 0) idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); else idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  const merge = (gs) => { const o = mergeAll(gs); return o; };
  if (theme === 'city') {
    const wall = merge([strip(bOff, -0.4, 1.0), flat(bOff, (w) => bOff(w) + 0.45, 1.0), strip((w) => bOff(w) + 0.45, 1.0, -0.4)]);
    const wm = add(new THREE.Mesh(wall, new THREE.MeshStandardNodeMaterial({ color: 0x4a4c58, roughness: 0.75, side: THREE.DoubleSide }))); wm.castShadow = false; wm.receiveShadow = true;
    // neon strip on the inner top edge: cyan on the left, magenta on the right — the track reads from far away at night
    const neon = strip((w) => bOff(w) - 0.02, 0.86, 0.98);
    const nm = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, fog: false });
    nm.colorNode = mix(vec3(0.1, 2.2, 3.2), vec3(3.4, 0.25, 2.4), attribute('side', 'float')).mul(float(0.85).add(sin(attribute('sd', 'float').mul(0.05).sub(time.mul(6))).mul(0.15)));
    neon.setAttribute('side', new THREE.Float32BufferAttribute(sideAttr(n), 1)); neon.setAttribute('sd', new THREE.Float32BufferAttribute(sAttr(n, T.ds), 1));
    add(new THREE.Mesh(neon, nm));
  } else {
    const rail = merge([strip(bOff, 0.48, 0.86)]);
    const rm = add(new THREE.Mesh(rail, new THREE.MeshStandardNodeMaterial({ color: 0xb8bec8, roughness: 0.38, metalness: 0.65, side: THREE.DoubleSide }))); rm.castShadow = true;
    // posts every 4 m
    const cnt = Math.floor(T.L / 4) * 2, posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 1.1, 0.14), new THREE.MeshStandardNodeMaterial({ color: 0x6c707a, roughness: 0.6, metalness: 0.3 }), cnt);
    const m4 = new THREE.Matrix4(); let k = 0;
    for (let s = 0; s < T.L - 2 && k < cnt; s += 4) { const i = Math.floor(s / T.ds) % n; for (const sd of [-1, 1]) { const o = (bOff(T.w[i]) + 0.12) * sd; m4.makeTranslation(T.x[i] + T.nx[i] * o, T.y[i] + 0.35, T.z[i] + T.nz[i] * o); posts.setMatrixAt(k++, m4); } }
    posts.count = k; posts.castShadow = true; add(posts);
    if (theme === 'alpine') { // snowbank mound outside the rail
      const bank = ribbonMound(T, (w) => bOff(w) + 0.25, (w) => bOff(w) + 4.5, 0.9);
      const bm = add(new THREE.Mesh(bank, terrainMaterial('alpine'))); bm.receiveShadow = true;
    }
  }

  // ---------------- corner chevrons (outside of every corner tighter than ~R75)
  {
    const tx = chevronTexture(theme); const mat = new THREE.MeshStandardNodeMaterial({ map: tx, side: THREE.DoubleSide, roughness: 0.6 });
    if (theme === 'city') mat.emissiveNode = texture(tx).rgb.mul(1.1);
    const list = []; let last = -99;
    for (let i = 0; i < n; i++) { const s = i * T.ds; if (Math.abs(T.k[i]) > 1 / 75 && s - last > 9) { last = s; list.push(i); } }
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.2, 1.1), mat, Math.max(1, list.length)); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    list.forEach((i, k) => { const sd = -Math.sign(T.k[i]); const o = (bOff(T.w[i]) + 0.5) * sd; ps.set(T.x[i] + T.nx[i] * o, T.y[i] + 1.55, T.z[i] + T.nz[i] * o);
      e.set(0, Math.atan2(T.tx[i], T.tz[i]) + Math.PI, 0); q.setFromEuler(e); sc.set(T.k[i] > 0 ? -1 : 1, 1, 1); m4.compose(ps, q, sc); im.setMatrixAt(k, m4); });
    im.count = list.length; add(im);
    const postsG = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), new THREE.MeshStandardNodeMaterial({ color: 0x555a66, roughness: 0.6 }), Math.max(1, list.length));
    list.forEach((i, k) => { const sd = -Math.sign(T.k[i]); const o = (bOff(T.w[i]) + 0.55) * sd; postsG.setMatrixAt(k, new THREE.Matrix4().makeTranslation(T.x[i] + T.nx[i] * o, T.y[i] + 0.9, T.z[i] + T.nz[i] * o)); });
    postsG.count = list.length; add(postsG);
  }

  // ---------------- start / finish gantry with start lights
  const gantry = buildGantry(T, theme, colors); add(gantry.group);

  // ---------------- props
  const blocked = (x, z, margin) => { const nb = grid.nearest(x, z, 2); return nb.i >= 0 && nb.d < T.w[nb.i] + SHOULDER + margin; };
  const roadside = (count, near, far, ok) => { const out = []; for (let t = 0; t < count * 6 && out.length < count; t++) { const i = Math.floor(R() * T.n), sd = R() < 0.5 ? -1 : 1, o = (T.w[i] + SHOULDER + near + R() * (far - near)) * sd; const x = T.x[i] + T.nx[i] * o, z = T.z[i] + T.nz[i] * o; if (blocked(x, z, near - 1) || (ok && !ok(x, z))) continue; out.push([x, z]); } return out; };
  const scatter = (count, margin, ok, tries = 8) => { const out = []; for (let t = 0; t < count * tries && out.length < count; t++) { const x = B.minX + R() * W, z = B.minZ + R() * D; if (blocked(x, z, margin) || (ok && !ok(x, z))) continue; out.push([x, z]); } return out; };
  const props = { update: () => {} };
  if (theme === 'coast') buildCoastProps(add, scatter, heightAt, R, low, T, grid, props, roadside);
  if (theme === 'city') buildCityProps(add, scatter, R, low, T, grid, B, props, bOff);
  if (theme === 'alpine') buildAlpineProps(add, scatter, heightAt, R, low, T, ctr, props, bOff, roadside);
  let snow = null; if (theme === 'alpine') { snow = makeSnow(low ? 1200 : 2600); add(snow); }

  return {
    group, heightAt, grid, gantry, bounds: B, snow,
    groundAt: (x, z) => (theme === 'city' ? 0 : heightAt(x, z)),
    update(dt, t) { gantry.update(dt, t); props.update(dt, t); },
    dispose() { group.removeFromParent(); for (const d of new Set(disposables)) d.dispose?.(); },
  };
}

function sideAttr(n) { const a = []; for (const s of [0, 1]) for (let j = 0; j <= n; j++) a.push(s, s); return a; }
function sAttr(n, ds) { const a = []; for (let side = 0; side < 2; side++) for (let j = 0; j <= n; j++) a.push(j * ds, j * ds); return a; }
function mergeAll(gs) {
  if (gs.length === 1) return gs[0];
  const pos = [], idx = []; let off = 0;
  for (const g of gs) { const p = g.attributes.position.array; for (let i = 0; i < p.length; i++) pos.push(p[i]); const ix = g.index.array; for (let i = 0; i < ix.length; i++) idx.push(ix[i] + off); off += p.length / 3; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function ribbonMound(T, o0, o1, h) {
  const n = T.n, pos = [], idx = [], X = 5;
  for (const side of [-1, 1]) { const base = pos.length / 3; for (let j = 0; j <= n; j++) { const i = j % n; for (let k = 0; k <= X; k++) { const f = k / X, o = (o0(T.w[i]) + (o1(T.w[i]) - o0(T.w[i])) * f) * side, y = T.y[i] - 0.4 + Math.sin(f * Math.PI) * h * (0.8 + 0.4 * Math.sin(j * 0.37 + side)) + (f < 0.2 ? 0.4 * f / 0.2 : 0.4); pos.push(T.x[i] + T.nx[i] * o, y, T.z[i] + T.nz[i] * o); }
    if (j < n) for (let k = 0; k < X; k++) { const a = base + j * (X + 1) + k, b = a + X + 1; if (side < 0) idx.push(a, b, a + 1, a + 1, b, b + 1); else idx.push(a, a + 1, b, a + 1, b + 1, b); } } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const uv = []; for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] / 11, pos[i + 2] / 11); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); return g;
}

// ---------------------------------------------------------------- materials
function triplanar(t, scale) {
  const p = positionWorld.div(scale); const nw = abs(normalWorld); const wgt = pow(nw, vec3(4)); const ws = wgt.div(wgt.x.add(wgt.y).add(wgt.z));
  return texture(t, p.zy).mul(ws.x).add(texture(t, p.xz).mul(ws.y)).add(texture(t, p.xy).mul(ws.z));
}
function terrainMaterial(theme) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
  const xz = positionWorld.xz; const slope = normalWorld.y;
  const macro = mx_noise_float(vec3(xz.div(140), 0.5)).mul(0.5).add(mx_noise_float(vec3(xz.div(31), 2.5)).mul(0.25));
  if (theme === 'coast') {
    const grass = texture(tex('grass_c'), xz.div(22)).rgb.mul(vec3(0.82, 0.98, 0.62)).mul(float(1).add(macro.mul(0.35)));
    const rock = triplanar(tex('rock_c'), 16).rgb.mul(vec3(1.05, 0.92, 0.82));
    const sand = texture(tex('rock_c'), xz.div(9)).rgb.mul(vec3(1.25, 1.1, 0.85)).mul(0.6).add(vec3(0.35, 0.28, 0.2));
    const rockMask = smoothstep(0.86, 0.66, slope.add(macro.mul(0.08)));
    let c = mix(grass, rock, rockMask);
    c = mix(sand, c, smoothstep(2.5, 6.0, positionWorld.y));
    m.colorNode = c;
    m.normalNode = normalMap(mix(texture(tex('grass_n'), xz.div(22)), triplanar(tex('rock_n'), 16), rockMask).rgb, vec2(0.8, 0.8));
  } else if (theme === 'alpine') {
    const snow = texture(tex('snow_c'), xz.div(11)).rgb.mul(0.2).add(vec3(0.6, 0.65, 0.74)).mul(float(1).add(macro.mul(0.1)));
    const rock = triplanar(tex('rock_c'), 14).rgb.mul(vec3(0.62, 0.64, 0.7));
    const rockMask = smoothstep(0.76, 0.56, slope.add(macro.mul(0.14)));
    m.colorNode = mix(snow, rock, rockMask);
    m.roughnessNode = mix(float(0.78), float(0.92), rockMask);
    m.normalNode = normalMap(mix(texture(tex('snow_n'), xz.div(11)), triplanar(tex('rock_n'), 14), rockMask).rgb, vec2(0.7, 0.7));
  }
  return m;
}
function cityGroundMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.5, metalness: 0.0 });
  const xz = positionWorld.xz; const blk = fract(xz.div(64)); const street = max(smoothstep(0.1, 0.08, abs(blk.x.sub(0.5)).sub(0.4)), smoothstep(0.1, 0.08, abs(blk.y.sub(0.5)).sub(0.4)));
  const n = mx_noise_float(vec3(xz.div(9), 1)).mul(0.5).add(0.5);
  const base = texture(tex('asphalt_c'), xz.div(7)).rgb.mul(1.4);
  m.colorNode = mix(vec3(0.08, 0.08, 0.1), base, street).mul(float(0.85).add(n.mul(0.3)));
  m.roughnessNode = mix(float(0.75), float(0.25), smoothstep(0.55, 0.75, n));
  return m;
}
function roadMaterial(theme, L) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0.0 });
  const rd = attribute('rd', 'vec4'); const lat = rd.x, s = rd.y, w = rd.z, line = rd.w, al = abs(lat);
  const uvA = vec2(lat.div(7), s.div(7));
  const macro = mx_noise_float(vec3(positionWorld.xz.div(36), 3.3));
  const tint = theme === 'coast' ? vec3(1.15, 1.05, 0.98) : theme === 'alpine' ? vec3(1.05, 1.08, 1.15) : vec3(0.85, 0.85, 0.95);
  let col = texture(tex('asphalt_c'), uvA).rgb.mul(tint).mul(theme === 'city' ? 1.4 : 2.0).mul(float(1).add(macro.mul(0.18)));
  col = col.mul(float(1).sub(exp(lat.sub(line).mul(lat.sub(line)).div(-5)).mul(0.28))); // rubbered racing line
  const lw = fwidth(lat).add(0.02);
  const edgeL = smoothstep(w.sub(0.8).sub(lw), w.sub(0.8), al).mul(smoothstep(w.sub(0.42), w.sub(0.42).sub(lw), al));
  const dash = smoothstep(0.42, 0.4, fract(s.div(10)));
  let lanes;
  if (theme === 'city') { const lo = w.div(3); lanes = smoothstep(lw.add(0.1), 0.1, abs(al.sub(lo))).mul(dash); }
  else lanes = smoothstep(lw.add(0.12), 0.12, al).mul(dash);
  const paint = theme === 'alpine' ? vec3(0.95, 0.75, 0.2) : vec3(0.92, 0.92, 0.9);
  col = mix(col, vec3(0.9, 0.9, 0.88), edgeL);
  col = mix(col, paint, lanes.mul(0.9));
  // start/finish checker band (s ∈ [0, 3]) and grid slots
  const sf = step(s, 3.0).add(step(L - 0.01, s)).min(1);
  const chk = mod(floor(lat.div(0.75)).add(floor(s.div(0.75))), 2);
  col = mix(col, mix(vec3(0.05), vec3(0.95), chk), sf);
  const gs = s.sub(L).add(10).negate(); // metres behind the line
  const slot = step(0.0, gs).mul(step(gs, 34)).mul(smoothstep(0.18, 0.1, abs(fract(gs.div(8)).sub(0.03)).mul(8))).mul(smoothstep(4.8, 4.6, abs(al.sub(3.5)).add(1.2)));
  col = mix(col, vec3(0.9), slot.mul(0.8));
  m.colorNode = col;
  m.normalNode = normalMap(texture(tex('asphalt_n'), uvA).rgb, vec2(0.7, 0.7));
  if (theme === 'city') {
    // wet asphalt: puddle mask lowers roughness; lamp pools from street lights every 32 m (alternating sides)
    const pud = smoothstep(0.15, 0.45, mx_noise_float(vec3(positionWorld.xz.div(9), 7.7)).add(macro.mul(0.4)));
    m.roughnessNode = mix(float(0.42), float(0.08), pud);
    m.colorNode = col.mul(mix(float(1), float(0.6), pud));
    const j = floor(s.div(32).add(0.5)), sideL = mod(j, 2).mul(2).sub(1).mul(w.add(SHOULDER - 1.4));
    const dd = s.sub(j.mul(32)), dl = lat.sub(sideL);
    const pool = exp(dd.mul(dd).add(dl.mul(dl).mul(0.7)).div(-70));
    m.emissiveNode = vec3(1.0, 0.62, 0.3).mul(pool.mul(0.55)).mul(texture(tex('asphalt_c'), uvA).r.mul(3).add(0.5));
  } else m.roughnessNode = float(0.78).sub(lanes.mul(0.2)).sub(edgeL.mul(0.2));
  return m;
}
function curbMaterial(theme) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.6 });
  const rd = attribute('rd', 'vec4'); const s = rd.y, amt = rd.w;
  const stripe = step(0.5, fract(s.div(2.4)));
  const A = theme === 'city' ? vec3(0.95, 0.15, 0.6) : vec3(0.85, 0.07, 0.06), Bc = vec3(0.92, 0.92, 0.92);
  const concrete = theme === 'alpine' ? vec3(0.75, 0.76, 0.8) : vec3(0.5, 0.49, 0.47);
  m.colorNode = mix(concrete, mix(A, Bc, stripe), amt);
  if (theme === 'city') m.emissiveNode = mix(A, Bc, stripe).mul(amt).mul(0.25);
  return m;
}
function shoulderMaterial(theme) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
  const xz = positionWorld.xz;
  if (theme === 'coast') { m.colorNode = texture(tex('rock_c'), xz.div(5)).rgb.mul(vec3(0.95, 0.82, 0.66)).mul(0.9).add(vec3(0.14, 0.1, 0.06)); m.normalNode = normalMap(texture(tex('rock_n'), xz.div(5)).rgb); }
  else if (theme === 'alpine') { m.colorNode = texture(tex('snow_c'), xz.div(6)).rgb.mul(0.22).add(vec3(0.56, 0.6, 0.68)); m.normalNode = normalMap(texture(tex('snow_n'), xz.div(6)).rgb); }
  else { const t = fract(xz.div(1.6)); const seam = max(smoothstep(0.04, 0.0, t.x), smoothstep(0.04, 0.0, t.y)); m.colorNode = mix(vec3(0.22, 0.22, 0.25), vec3(0.1), seam); m.roughnessNode = float(0.55); }
  return m;
}
function chevronTexture(theme) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  const [bg, fg] = theme === 'coast' ? ['#c8141c', '#ffffff'] : theme === 'city' ? ['#0a0a14', '#25e6ff'] : ['#111111', '#ffc61a'];
  g.fillStyle = bg; g.fillRect(0, 0, 256, 128); g.fillStyle = fg;
  for (let k = 0; k < 3; k++) { const x = 30 + k * 72; g.beginPath(); g.moveTo(x, 14); g.lineTo(x + 36, 14); g.lineTo(x + 72, 64); g.lineTo(x + 36, 114); g.lineTo(x, 114); g.lineTo(x + 36, 64); g.closePath(); g.fill(); }
  g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(3, 3, 250, 122);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ---------------------------------------------------------------- start gantry
function buildGantry(T, theme, colors) {
  const g = new THREE.Group(); const i = 0, w = T.w[i] + SHOULDER + 1.0;
  const yaw = Math.atan2(T.tx[i], T.tz[i]); g.position.set(T.x[i], T.y[i], T.z[i]); g.rotation.y = yaw;
  const metal = new THREE.MeshStandardNodeMaterial({ color: theme === 'city' ? 0x1a1c28 : 0x2a2e38, roughness: 0.4, metalness: 0.6 });
  for (const sd of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 8, 0.9), metal); p.position.set(sd * w, 4, 1.2); p.castShadow = true; g.add(p); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(w * 2 + 0.9, 1.5, 1.1), metal); beam.position.set(0, 7.4, 1.2); beam.castShadow = true; g.add(beam);
  // banner (both faces)
  const c = document.createElement('canvas'); c.width = 2048; c.height = 120; const x = c.getContext('2d');
  const gr = x.createLinearGradient(0, 0, 2048, 0); gr.addColorStop(0, '#ff5a1f'); gr.addColorStop(0.5, '#ff2d8a'); gr.addColorStop(1, '#6b5bff'); x.fillStyle = gr; x.fillRect(0, 0, 2048, 120);
  x.fillStyle = '#fff'; x.font = 'italic 900 84px Inter, system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('APEX  DRIFT', 1024, 64);
  for (let k = 0; k < 4; k++) for (let j = 0; j < 8; j++) { x.fillStyle = (j % 2) ^ (k % 2) ? '#fff' : '#111'; x.fillRect(j * 30, k * 30, 30, 30); x.fillRect(2048 - 240 + j * 30, k * 30, 30, 30); }
  const bt = new THREE.CanvasTexture(c); bt.colorSpace = THREE.SRGBColorSpace;
  const bm = new THREE.MeshStandardNodeMaterial({ map: bt, roughness: 0.5, side: THREE.FrontSide }); bm.emissiveNode = texture(bt).rgb.mul(theme === 'city' ? 0.9 : 0.25);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(w * 2 - 0.6, 1.45), bm); banner.position.set(0, 7.4, 0.6); banner.rotation.y = Math.PI; g.add(banner);
  const banner2 = banner.clone(); banner2.position.z = 1.8; banner2.rotation.set(0, 0, 0); g.add(banner2); // set(): clone() re-derives Euler (π,0,π) from the quaternion
  // 5 start lights hanging under the beam, facing the grid (behind the line = -z local)
  const lampCol = new THREE.InstancedBufferAttribute(new Float32Array(15), 3);
  const lm = new THREE.MeshBasicNodeMaterial(); lm.colorNode = instancedBufferAttribute(lampCol);
  const lamps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 18).rotateX(Math.PI / 2), lm, 5);
  for (let k = 0; k < 5; k++) lamps.setMatrixAt(k, new THREE.Matrix4().makeTranslation((k - 2) * 1.05, 6.1, 0.55));
  const housing = new THREE.Mesh(new THREE.BoxGeometry(5.8, 1.0, 0.5), metal); housing.position.set(0, 6.1, 0.85); g.add(housing, lamps);
  const state = { lit: 0, green: false };
  const setLights = (lit, green) => { state.lit = lit; state.green = green; for (let k = 0; k < 5; k++) { const on = green ? [0.2, 3.2, 0.6] : k < lit ? [4, 0.15, 0.1] : [0.08, 0.02, 0.02]; lampCol.setXYZ(k, ...on); } lampCol.needsUpdate = true; };
  setLights(0, false);
  return { group: g, setLights, update() {} };
}

// ---------------------------------------------------------------- theme props
function instanced(add, geo, mat, list, place, { shadow = true, colors = null } = {}) {
  if (!list.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, list.length); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  list.forEach((it, k) => { place(it, p, e, s, c, k); q.setFromEuler(e); m4.compose(p, q, s); im.setMatrixAt(k, m4); if (colors) im.setColorAt(k, c); });
  im.castShadow = shadow; im.receiveShadow = true; add(im); return im;
}
function buildCoastProps(add, scatter, hAt, R, low, T, grid, props, roadside) {
  const land = (x, z) => x > coastLine(z) + 22 && hAt(x, z) > 6;
  // stone pines (umbrella crowns) + cypresses; a share hug the road to frame it
  const pines = scatter(low ? 200 : 380, 7, land).concat(roadside(low ? 60 : 140, 5, 40, land));
  const trunkG = new THREE.CylinderGeometry(0.22, 0.38, 7, 6); trunkG.translate(0, 3.5, 0);
  const trunkM = new THREE.MeshStandardNodeMaterial({ color: 0x5a4434, roughness: 0.9 });
  instanced(add, trunkG, trunkM, pines, ([x, z], p, e, s) => { const k = 0.7 + R() * 0.6; p.set(x, hAt(x, z) - 0.3, z); e.set((R() - 0.5) * 0.25, R() * 6, (R() - 0.5) * 0.25); s.set(k, k, k); });
  const crownG = jitter(new THREE.IcosahedronGeometry(3.6, 1), 1.0, R); crownG.scale(1, 0.42, 1); crownG.translate(0, 7.2, 0);
  const crownM = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, flatShading: true });
  crownM.colorNode = vec3(1, 1, 1).mul(float(0.8).add(normalWorld.y.mul(0.35)));
  instanced(add, crownG, crownM, pines, ([x, z], p, e, s, c) => { const k = 0.7 + R() * 0.6; p.set(x, hAt(x, z) - 0.3, z); e.set(0, R() * 6, 0); s.set(k * (0.9 + R() * 0.3), k, k * (0.9 + R() * 0.3)); c.setHSL(0.24 + R() * 0.06, 0.45, 0.22 + R() * 0.08); }, { colors: true });
  const cyp = scatter(low ? 80 : 150, 6, land).concat(roadside(low ? 30 : 70, 4, 22, land));
  const cypG = jitter(new THREE.ConeGeometry(1.3, 10, 7, 3), 0.35, R); cypG.translate(0, 5.6, 0);
  instanced(add, cypG, new THREE.MeshStandardNodeMaterial({ color: 0x23361e, roughness: 0.9, flatShading: true }), cyp, ([x, z], p, e, s) => { const k = 0.7 + R() * 0.7; p.set(x, hAt(x, z) - 0.3, z); e.set(0, R() * 6, 0); s.set(k, k * (0.9 + R() * 0.4), k); });
  // rocks: on the cliffs and scattered on the hills
  const rocks = scatter(low ? 90 : 180, 5, (x, z) => hAt(x, z) > -4);
  const rockG = jitter(new THREE.IcosahedronGeometry(1, 1), 0.45, R);
  const rockM = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 }); rockM.colorNode = triplanar(tex('rock_c'), 6).rgb.mul(vec3(1.0, 0.9, 0.8));
  instanced(add, rockG, rockM, rocks, ([x, z], p, e, s) => { const k = 1 + R() * R() * 5; p.set(x, hAt(x, z) - k * 0.3, z); e.set(R() * 3, R() * 6, R() * 3); s.set(k * (1 + R()), k, k * (1 + R() * 0.6)); });
  // villas: white stucco, terracotta hip roofs, warm windows at sunset
  const villas = scatter(low ? 16 : 30, 18, (x, z) => land(x, z) && x < coastLine(z) + 260);
  const vg = new THREE.BoxGeometry(1, 1, 1); vg.translate(0, 0.5, 0);
  const vm = new THREE.MeshStandardNodeMaterial({ roughness: 0.8 });
  { const f = positionGeometry; const side = smoothstep(0.5, 0.3, abs(normalGeometry.y)); const u = mix(f.x, f.z, abs(normalGeometry.x)); const win = smoothstep(0.1, 0.06, abs(fract(u.mul(3).add(0.5)).sub(0.5))).mul(smoothstep(0.12, 0.08, abs(f.y.sub(0.55)))).mul(side);
    vm.colorNode = mix(vec3(0.92, 0.86, 0.76), vec3(0.15, 0.1, 0.08), win); vm.emissiveNode = vec3(1.6, 0.9, 0.4).mul(win); }
  const roofG = new THREE.ConeGeometry(0.78, 0.5, 4); roofG.rotateY(Math.PI / 4); roofG.translate(0, 1.25, 0);
  const roofM = new THREE.MeshStandardNodeMaterial({ color: 0xb2512e, roughness: 0.75, flatShading: true });
  const vdata = villas.map(([x, z]) => ({ x, z, w: 9 + R() * 7, d: 8 + R() * 6, h: 5 + R() * 3, r: R() * 6 }));
  instanced(add, vg, vm, vdata, (v, p, e, s) => { p.set(v.x, hAt(v.x, v.z) - 0.5, v.z); e.set(0, v.r, 0); s.set(v.w, v.h, v.d); });
  instanced(add, roofG, roofM, vdata, (v, p, e, s) => { p.set(v.x, hAt(v.x, v.z) - 0.5 + v.h - v.h, v.z); e.set(0, v.r, 0); s.set(v.w * 1.12, v.h, v.d * 1.12); });
  // lighthouse on the northern headland, beam sweeping the sea
  const lz = 700, lx = coastLine(lz) + 40; const ly = hAt(lx, lz);
  const lh = new THREE.Group(); lh.position.set(lx, ly - 1, lz);
  const towerM = new THREE.MeshStandardNodeMaterial({ roughness: 0.6 }); towerM.colorNode = mix(vec3(0.92, 0.9, 0.86), vec3(0.75, 0.08, 0.06), step(0.5, fract(positionGeometry.y.div(6))));
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.9, 24, 20), towerM); tower.position.y = 12; tower.castShadow = true;
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.4, 16), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(5, 3.6, 1.8) })); lamp.position.y = 25.4;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.2, 16), new THREE.MeshStandardNodeMaterial({ color: 0x2a2a30, roughness: 0.5, metalness: 0.4 })); cap.position.y = 27.7;
  const beamM = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  beamM.colorNode = vec3(1.0, 0.8, 0.5); beamM.opacityNode = smoothstep(1.0, 0.0, positionGeometry.y.div(-160).add(0.5)).mul(0.12);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(9, 160, 16, 1, true), beamM); beam.rotation.z = Math.PI / 2; beam.position.set(80, 0, 0);
  const pivot = new THREE.Group(); pivot.position.y = 25.4; pivot.add(beam);
  lh.add(tower, lamp, cap, pivot); add(lh);
  props.update = (dt, t) => { pivot.rotation.y = t * 0.6; }; // FABLE: animation — gulls, sailboats, waves breaking at the cliff foot
  props.landmark = lh;
}

function buildCityProps(add, scatter, R, low, T, grid, B, props, bOff) {
  // buildings on a 64 m street grid; taller toward downtown; world-space TSL window grid (no per-building textures)
  const lots = []; const LOT = 64;
  for (let x = Math.floor(B.minX / LOT) * LOT - 320; x < B.maxX + 320; x += LOT) for (let z = Math.floor(B.minZ / LOT) * LOT - 320; z < B.maxZ + 320; z += LOT) {
    const bx = x + LOT / 2 + (R() - 0.5) * 6, bz = z + LOT / 2 + (R() - 0.5) * 6;
    const fw = 22 + R() * 22, fd = 22 + R() * 22; const nb = grid.nearest(bx, bz, 2);
    const clear = nb.i < 0 ? 999 : nb.d - (T.w[nb.i] + SHOULDER + 6);
    if (clear < Math.max(fw, fd) * 0.72) continue;
    const dC = Math.hypot(bx - (B.minX + B.maxX) / 2, bz - (B.minZ + B.maxZ) / 2);
    const h = 14 + Math.pow(R(), 1.6) * (150 - Math.min(110, dC * 0.12)) + (nb.d < 90 ? 10 : 0);
    lots.push({ x: bx, z: bz, w: fw, d: fd, h, r: (R() < 0.15 ? 0.4 * (R() - 0.5) : 0) });
    if (low && lots.length > 160) break;
  }
  const bg = new THREE.BoxGeometry(1, 1, 1); bg.translate(0, 0.5, 0);
  const bm = new THREE.MeshStandardNodeMaterial({ roughness: 0.35, metalness: 0.2 });
  {
    const pw = positionWorld; const nw = normalWorld; const side = smoothstep(0.5, 0.2, abs(nw.y));
    const u = mix(pw.x, pw.z, smoothstep(0.4, 0.6, abs(nw.x))).div(3.4), v = pw.y.div(3.8);
    const cell = vec2(floor(u), floor(v)); const fu = fract(u), fv = fract(v);
    const aa = fwidth(u).add(fwidth(v)).mul(0.8).add(0.02);
    const win = smoothstep(0.16, aa.add(0.16), fu).mul(smoothstep(0.84, aa.negate().add(0.84), fu)).mul(smoothstep(0.2, aa.add(0.2), fv)).mul(smoothstep(0.78, aa.negate().add(0.78), fv)).mul(side).mul(step(2.0, pw.y));
    const h1 = fract(sin(dot(cell, vec2(12.9898, 78.233))).mul(43758.5453)), h2 = fract(sin(dot(cell, vec2(39.3468, 11.135))).mul(24634.6345));
    const lit = step(0.52, h1);
    const warm = mix(vec3(1.0, 0.72, 0.42), vec3(0.55, 0.8, 1.0), step(0.7, h2)).mul(float(1.4).add(h2.mul(1.6)));
    const facade = mix(vec3(0.05, 0.055, 0.07), vec3(0.08, 0.07, 0.1), h2);
    bm.colorNode = mix(facade, vec3(0.02, 0.03, 0.05), win);
    bm.emissiveNode = warm.mul(win).mul(lit).mul(smoothstep(5, 30, length(pw.xz.sub(cameraPosition.xz))).mul(0.5).add(0.5));
  }
  instanced(add, bg, bm, lots, (b, p, e, s) => { p.set(b.x, -0.1, b.z); e.set(0, b.r, 0); s.set(b.w, b.h, b.d); });
  // neon signs on the faces that look at the track + rooftop beacons
  const signs = [];
  for (const b of lots) {
    const nb = grid.nearest(b.x, b.z, 3); if (nb.i < 0 || nb.d > 120 || R() < 0.35) continue;
    const dx = T.x[nb.i] - b.x, dz = T.z[nb.i] - b.z; const toX = Math.abs(dx) > Math.abs(dz);
    const fx = toX ? Math.sign(dx) * (b.w / 2 + 0.3) : (R() - 0.5) * b.w * 0.5, fz = toX ? (R() - 0.5) * b.d * 0.5 : Math.sign(dz) * (b.d / 2 + 0.3);
    const vert = R() < 0.5; const y = 8 + R() * Math.min(40, b.h - 14);
    signs.push({ x: b.x + fx, z: b.z + fz, y, rot: toX ? Math.PI / 2 : 0, w: vert ? 2.4 : 10 + R() * 8, h: vert ? 10 + R() * 10 : 2.6, hue: [0.9, 0.52, 0.08, 0.75, 0.33][Math.floor(R() * 5)] });
  }
  const sm = new THREE.MeshBasicNodeMaterial(); sm.colorNode = instancedColor().mul(float(2.2).add(sin(time.mul(2.0).add(positionWorld.y.mul(0.3))).mul(0.25)));
  instanced(add, new THREE.BoxGeometry(1, 1, 0.3), sm, signs, (g, p, e, s, c) => { p.set(g.x, g.y, g.z); e.set(0, g.rot, 0); s.set(g.w, g.h, 1); c.setHSL(g.hue, 1, 0.55); }, { shadow: false, colors: true });
  // street lamps every 32 m, alternating sides (pools are painted by the road shader)
  const lamps = []; for (let s = 16, j = 0; s < T.L - 10; s += 32, j++) { const i = Math.floor(s / T.ds) % T.n; lamps.push({ i, sd: (j % 2) * 2 - 1 }); }
  const poleG = new THREE.CylinderGeometry(0.1, 0.16, 8.5, 6); poleG.translate(0, 4.25, 0); const armG = new THREE.BoxGeometry(0.12, 0.12, 2.4); armG.translate(0, 8.4, -1.1);
  const poleGeo = mergeAll([toIndexed(poleG), toIndexed(armG)]);
  const lampPlace = (L, p, e, s) => { const i = L.i, o = (bOff(T.w[i]) + 0.6) * L.sd; p.set(T.x[i] + T.nx[i] * o, T.y[i], T.z[i] + T.nz[i] * o); e.set(0, Math.atan2(T.nx[i] * L.sd, T.nz[i] * L.sd), 0); s.set(1, 1, 1); };
  instanced(add, poleGeo, new THREE.MeshStandardNodeMaterial({ color: 0x30323c, roughness: 0.5, metalness: 0.5 }), lamps, lampPlace);
  const headG = new THREE.BoxGeometry(0.5, 0.18, 1.0); headG.translate(0, 8.3, -2.1);
  instanced(add, headG, new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(5, 3.2, 1.6) }), lamps, lampPlace, { shadow: false });
  // neon arches over the track
  const arches = []; for (let k = 1; k < 8; k++) { const s = (k / 8) * T.L; const i = Math.floor(s / T.ds) % T.n; if (Math.abs(T.k[i]) < 1 / 90) arches.push({ i, k }); }
  const am = new THREE.MeshBasicNodeMaterial(); am.colorNode = instancedColor().mul(2.6);
  instanced(add, new THREE.TorusGeometry(1, 0.035, 6, 40, Math.PI), am, arches, (a, p, e, s, c) => { const i = a.i, r = T.w[i] + SHOULDER + 1.0; p.set(T.x[i], T.y[i] - 0.5, T.z[i]); e.set(0, Math.atan2(T.tx[i], T.tz[i]), 0); s.set(r, r * 0.85, r); c.setHSL([0.9, 0.52, 0.75][a.k % 3], 1, 0.55); }, { shadow: false, colors: true });
  // elevated sections: pillars every 14 m under the deck
  const pil = []; for (let s = 0; s < T.L; s += 14) { const i = Math.floor(s / T.ds) % T.n; if (T.y[i] > 2.2) pil.push(i); }
  const pg = new THREE.CylinderGeometry(1, 1, 1, 12); pg.translate(0, 0.5, 0);
  instanced(add, pg, new THREE.MeshStandardNodeMaterial({ color: 0x4a4c58, roughness: 0.8 }), pil, (i, p, e, s) => { p.set(T.x[i], -0.1, T.z[i]); e.set(0, 0, 0); s.set(1.6, T.y[i] - 1.2, 1.6); });
  const deck = []; for (let s = 0; s < T.L; s += 3) { const i = Math.floor(s / T.ds) % T.n; if (T.y[i] > 1.2) deck.push(i); }
  instanced(add, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardNodeMaterial({ color: 0x3a3c48, roughness: 0.85 }), deck, (i, p, e, s) => { p.set(T.x[i], T.y[i] - 0.75, T.z[i]); e.set(0, Math.atan2(T.tx[i], T.tz[i]), 0); s.set((T.w[i] + SHOULDER + 1.4) * 2, 1.4, 3.3); }, { shadow: false });
  props.update = () => {}; // FABLE: animation — traffic lights, billboard loops, drones over the elevated sweeper
}
// InstancedMesh.instanceColor is multiplied into colorNode by the node material itself (setupDiffuseColor)
function instancedColor() { return vec3(1, 1, 1); }
function toIndexed(g) { if (!g.index) { const idx = []; for (let i = 0; i < g.attributes.position.count; i++) idx.push(i); g.setIndex(idx); } return g; }

function buildAlpineProps(add, scatter, hAt, R, low, T, ctr, props, bOff, roadside) {
  // snowy pines: trunk + three cone tiers merged, snow on the upper faces by vertex colour
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.18, 0.3, 2.4, 6); trunk.translate(0, 1.2, 0); parts.push([trunk, 0]);
  for (let k = 0; k < 3; k++) { const c = new THREE.ConeGeometry(2.4 - k * 0.6, 3.6 - k * 0.5, 8); c.translate(0, 2.6 + k * 2.1, 0); parts.push([c, 1]); }
  const pos = [], col = [], idx = []; let off = 0;
  for (const [g0, isLeaf] of parts) {
    const g = toIndexed(g0.toNonIndexed()); const p = g.attributes.position; g.computeVertexNormals(); const nn = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); const snowy = isLeaf && (nn.getY(i) > 0.35 || p.getY(i) > 7.5) ? 1 : 0; if (!isLeaf) col.push(0.25, 0.17, 0.12); else if (snowy) col.push(0.88, 0.9, 0.95); else col.push(0.07, 0.17, 0.11); }
    for (let i = 0; i < p.count; i++) idx.push(off + i); off += p.count;
  }
  const pineG = new THREE.BufferGeometry(); pineG.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); pineG.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); pineG.setIndex(idx); pineG.computeVertexNormals();
  const pm = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
  const trees = scatter(low ? 450 : 950, 5, (x, z) => { const h = hAt(x, z); return h < 260 && Math.hypot(x - ctr[0], z - ctr[1]) < 1000; }, 6).concat(roadside(low ? 200 : 520, 6, 45));
  instanced(add, pineG, pm, trees, ([x, z], p, e, s) => { const k = 0.8 + R() * 0.9; p.set(x, hAt(x, z) - 0.4, z); e.set(0, R() * 6, 0); s.set(k, k * (0.9 + R() * 0.35), k); });
  // rocks with snow caps
  const rocks = scatter(low ? 80 : 170, 5, null);
  const rockM = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 }); rockM.colorNode = mix(triplanar(tex('rock_c'), 6).rgb.mul(0.6), vec3(0.86, 0.9, 0.96), smoothstep(0.5, 0.75, normalWorld.y));
  instanced(add, jitter(new THREE.IcosahedronGeometry(1, 1), 0.45, R), rockM, rocks, ([x, z], p, e, s) => { const k = 1 + R() * R() * 5; p.set(x, hAt(x, z) - k * 0.35, z); e.set(R() * 3, R() * 6, R() * 3); s.set(k * (1 + R()), k, k * (1 + R() * 0.6)); });
  // chalets with warm windows
  const ch = scatter(low ? 8 : 16, 16, (x, z) => hAt(x, z) < 120);
  const cg = new THREE.BoxGeometry(1, 1, 1); cg.translate(0, 0.5, 0); const cm = new THREE.MeshStandardNodeMaterial({ roughness: 0.85 });
  { const f = positionGeometry; const side = smoothstep(0.5, 0.3, abs(normalGeometry.y)); const u = mix(f.x, f.z, abs(normalGeometry.x)); const win = smoothstep(0.1, 0.06, abs(fract(u.mul(2.5).add(0.5)).sub(0.5))).mul(smoothstep(0.14, 0.1, abs(f.y.sub(0.5)))).mul(side);
    cm.colorNode = mix(vec3(0.36, 0.22, 0.13), vec3(0.1, 0.06, 0.03), win); cm.emissiveNode = vec3(2.0, 1.1, 0.45).mul(win); }
  const cdat = ch.map(([x, z]) => ({ x, z, w: 8 + R() * 4, d: 7 + R() * 3, h: 4.5 + R() * 1.5, r: R() * 6 }));
  instanced(add, cg, cm, cdat, (v, p, e, s) => { p.set(v.x, hAt(v.x, v.z) - 0.6, v.z); e.set(0, v.r, 0); s.set(v.w, v.h, v.d); });
  const roof = new THREE.CylinderGeometry(0.01, 0.75, 0.45, 4, 1); roof.rotateY(Math.PI / 4); roof.scale(1.2, 1, 1.2); roof.translate(0, 1.2, 0);
  instanced(add, roof, new THREE.MeshStandardNodeMaterial({ color: 0xe8eef6, roughness: 0.7, flatShading: true }), cdat, (v, p, e, s) => { p.set(v.x, hAt(v.x, v.z) - 0.6, v.z); e.set(0, v.r, 0); s.set(v.w, v.h, v.d); });
  // orange snow poles along both road edges — reads the road at speed
  const poles = []; for (let s = 0; s < T.L; s += 18) { const i = Math.floor(s / T.ds) % T.n; poles.push([i, -1], [i, 1]); }
  const pmat = new THREE.MeshStandardNodeMaterial({ roughness: 0.5 }); pmat.colorNode = mix(vec3(1.0, 0.32, 0.05), vec3(0.05), step(0.5, fract(positionGeometry.y.div(0.6).add(0.5))));
  pmat.emissiveNode = vec3(0.35, 0.08, 0.0).mul(step(0.5, fract(positionGeometry.y.div(0.6).add(0.5))).oneMinus());
  const pg = new THREE.CylinderGeometry(0.05, 0.05, 2.0, 5); pg.translate(0, 1.0, 0);
  // FABLE: animation — chairlift cables over the crest, a snow plough parked at the hairpin, smoking chalet chimneys
  instanced(add, pg, pmat, poles, ([i, sd], p, e, s) => { const o = (bOff(T.w[i]) + 0.7) * sd; p.set(T.x[i] + T.nx[i] * o, T.y[i] + 0.2, T.z[i] + T.nz[i] * o); e.set(0, 0, 0); s.set(1, 1, 1); }, { shadow: false });
  props.update = () => {};
}
export { mergeAll, toIndexed, clamp, min, vec4, Fn, uniform };
