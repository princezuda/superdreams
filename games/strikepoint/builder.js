// Level construction kit: CC0 PBR material library + merged-geometry builder (one draw call per material)
// with world-space UVs, baked contact-AO vertex colours, colliders and authored cover points.
import { THREE } from '/shared/sd-kit.js';
import { texture, uv, vertexColor, mix, attribute, normalMap, float, vec3, uniform, positionWorld, mx_noise_float, smoothstep } from 'three/tsl';

const TEX_SETS = {
  concrete: ['concrete_wall_008', 3.2], asphalt: ['asphalt_02', 5], metal: ['metal_plate', 2.4], rust: ['rusty_metal_02', 3],
  corrugated: ['corrugated_iron_02', 2.6], plaster: ['plastered_wall', 3.4], cobble: ['cobblestone_floor_08', 2.6], wood: ['brown_planks_05', 2.2],
  roof: ['clay_roof_tiles', 2.6], grass: ['sparse_grass', 4.5], brick: ['brick_wall_09', 2.6],
};
export const SURF = { concrete: 'concrete', asphalt: 'concrete', metal: 'metal', rust: 'metal', corrugated: 'metal', plaster: 'concrete', cobble: 'concrete', wood: 'wood', roof: 'concrete', grass: 'dirt', brick: 'concrete', paint: 'metal', dark: 'dirt', cloth: 'cloth', glow: 'glass', glass: 'glass', rock: 'concrete', foliage: 'cloth' };

const cache = new Map();
const loader = new THREE.TextureLoader();
function loadTex(url, srgb) {
  if (cache.has(url)) return cache.get(url);
  const p = new Promise((res) => loader.load(url, (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; res(t); }, undefined, () => res(null)));
  cache.set(url, p); return p;
}
export async function loadMaterials(keys, onProgress) {
  const base = new URL('./assets/tex/', import.meta.url).href;
  const jobs = []; let done = 0; const total = keys.length * 3;
  const out = {};
  for (const k of keys) {
    const [id] = TEX_SETS[k];
    const tick = (t) => { done++; onProgress?.(done / total); return t; };
    jobs.push(Promise.all([loadTex(base + id + '_c.jpg', true).then(tick), loadTex(base + id + '_n.jpg', false).then(tick), loadTex(base + id + '_r.jpg', false).then(tick)]).then(([c, n, r]) => { out[k] = { c, n, r }; }));
  }
  await Promise.all(jobs);
  return out;
}

export const U = { glow: uniform(1.0), pool: uniform(1.0), wet: uniform(0.0) };

export function makeMaterials(tex, o = {}) {
  const M = {};
  const std = (k, rough = 1, metal = 0, extra = {}) => {
    const t = tex[k];
    const m = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: rough, metalness: metal, ...extra });
    if (t?.c) m.map = t.c; if (t?.n) { m.normalMap = t.n; m.normalScale = new THREE.Vector2(1, 1); } if (t?.r) m.roughnessMap = t.r;
    return m;
  };
  for (const k of Object.keys(tex)) M[k] = std(k, k === 'metal' ? 0.9 : 1, k === 'metal' || k === 'rust' ? 0.25 : k === 'corrugated' ? 0.3 : 0);
  // wet asphalt / cobble: roughness pulled down by U.wet with a noise mask so puddles read as glossy patches
  for (const k of ['asphalt', 'cobble', 'concrete', 'metal']) if (M[k]) {
    const t = tex[k];
    if (t?.r) {
      const wetMask = smoothstep(0.05, 0.35, mx_noise_float(positionWorld.xz.mul(0.18))).mul(U.wet);
      M[k].roughnessNode = mix(texture(t.r).r, float(0.12), wetMask.mul(k === 'asphalt' ? 1 : 0.6)).mul(k === 'metal' ? 0.85 : 1);
    }
  }
  M.paint = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 });
  if (tex.metal?.n) { M.paint.normalMap = tex.metal.n; M.paint.normalScale = new THREE.Vector2(0.15, 0.15); }
  M.dark = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  M.cloth = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
  M.foliage = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  M.rock = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true });
  if (tex.concrete?.c) { M.rock.map = tex.concrete.c; }
  M.glass = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.6 });
  // emissive: lit windows, lamp heads, signage. vertex colours are HDR, U.glow scales them by time of day
  M.glow = new THREE.MeshBasicNodeMaterial({ vertexColors: true });
  M.glow.colorNode = vertexColor().mul(U.glow).add(vec3(0.02, 0.025, 0.03));
  // additive light pools under lamps (cheap fake bounce)
  const poolTex = radialTexture();
  M.pool = new THREE.MeshBasicNodeMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 });
  M.pool.colorNode = texture(poolTex).r.mul(vertexColor()).mul(U.pool);
  M.fence = new THREE.MeshStandardNodeMaterial({ map: chainTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4, vertexColors: true });
  // splat ground: blend two PBR sets by a per-vertex mask
  if (o.ground) M.ground = splatMaterial(tex[o.ground[0]], tex[o.ground[1]], TEX_SETS[o.ground[0]][1] / TEX_SETS[o.ground[1]][1], o.groundRough ?? 1);
  return M;
}
function splatMaterial(A, B, ratio, rough) {
  const m = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: rough, metalness: 0 });
  const s = attribute('splat', 'float');
  const uvA = uv(), uvB = uv().mul(ratio);
  m.colorNode = mix(texture(A.c, uvA), texture(B.c, uvB), s).rgb.mul(vertexColor());
  m.normalNode = normalMap(mix(texture(A.n, uvA), texture(B.n, uvB), s).rgb);
  const wetMask = smoothstep(0.05, 0.35, mx_noise_float(positionWorld.xz.mul(0.18))).mul(U.wet).mul(float(1).sub(s));
  m.roughnessNode = mix(mix(texture(A.r, uvA).r, texture(B.r, uvB).r, s), float(0.1), wetMask).mul(rough);
  return m;
}
function radialTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(160,160,160,1)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); return t;
}
function chainTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64); g.strokeStyle = '#c8ccd0'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 32); g.lineTo(32, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.closePath(); g.stroke();
  g.beginPath(); g.moveTo(-32, 32); g.lineTo(0, 0); g.moveTo(64, 0); g.lineTo(96, 32); g.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------------------------------------------------------------------------------------------
class Acc { constructor() { this.p = []; this.n = []; this.u = []; this.c = []; this.s = []; } }
const _v = new THREE.Vector3(), _nn = new THREE.Vector3(), _m3 = new THREE.Matrix3();

export class Builder {
  constructor(world, mats, scene, seed = 1) {
    this.world = world; this.mats = mats; this.scene = scene; this.acc = {};
    this.texScale = Object.fromEntries(Object.entries(TEX_SETS).map(([k, v]) => [k, v[1]]));
    this.lights = []; this.maxLights = 6; this.spots = {}; this.r = mulberry(seed);
    this.instances = {}; // name -> [{m:Matrix4,c:Color}]
    this.counts = { boxes: 0, cover: 0 };
  }
  A(mat) { return this.acc[mat] || (this.acc[mat] = new Acc()); }
  ground(x, z) { return this.world.terrain(x, z); }
  // world-space UV for a vertex with given normal
  _uv(mat, x, y, z, nx, ny, nz, out) {
    const s = this.texScale[mat] || 3; const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    if (ay >= ax && ay >= az) { out[0] = x / s; out[1] = z / s; } else if (ax >= az) { out[0] = z / s; out[1] = y / s; } else { out[0] = x / s; out[1] = y / s; }
  }
  // Axis-aligned box. (x,z) centre, y = bottom. o: {col:true, surf, tint:[r,g,b]|hex, cover:'low'|'high', ao:true, noBullet, top:mat}
  box(x, y, z, w, h, d, mat, o = {}) {
    const a = this.A(mat), x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, y0 = y, y1 = y + h;
    const tint = toRGB(o.tint ?? 0xffffff), vary = o.vary ?? 0.07, k = 1 + (this.r() - 0.5) * vary;
    const g = o.groundY ?? this.ground(x, z), ao = o.ao !== false;
    const faces = [
      [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -1, 0, 0],
      [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0, -1, 0],
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, -1],
    ];
    const uvo = [0, 0];
    for (const f of faces) {
      const [p0, p1, p2, p3, nx, ny, nz] = f;
      if (o.skip && o.skip.includes(nx + ',' + ny + ',' + nz)) continue;
      const tm = ny > 0 && o.top ? this.A(o.top) : a, tmat = ny > 0 && o.top ? o.top : mat;
      for (const p of [p0, p1, p2, p0, p2, p3]) {
        tm.p.push(p[0], p[1], p[2]); tm.n.push(nx, ny, nz);
        this._uv(tmat, p[0], p[1], p[2], nx, ny, nz, uvo); tm.u.push(uvo[0], uvo[1]);
        let f2 = k;
        if (ao) { if (ny < 0) f2 *= 0.5; else if (ny === 0) f2 *= 0.55 + 0.45 * Math.min(1, Math.max(0, (p[1] - g) / 1.4)); }
        tm.c.push(tint[0] * f2, tint[1] * f2, tint[2] * f2); tm.s.push(0);
      }
    }
    this.counts.boxes++;
    let c = null;
    if (o.col !== false) c = this.world.add(x0, y0, z0, x1, y1, z1, o.surf || SURF[mat] || 'concrete', { noBullet: o.noBullet, noNav: o.noNav, hp: o.hp });
    if (o.cover) this.coverAround(x, z, w, d, o.cover, o.coverSides);
    return c;
  }
  // Generic geometry (any BufferGeometry, transformed by matrix). Triplanar world UVs + contact AO.
  geo(geom, matrix, mat, o = {}) {
    const g = geom.index ? geom.toNonIndexed() : geom; const a = this.A(mat); const tint = toRGB(o.tint ?? 0xffffff);
    const P = g.attributes.position, N = g.attributes.normal; _m3.getNormalMatrix(matrix); const uvo = [0, 0];
    const k = 1 + (this.r() - 0.5) * (o.vary ?? 0.06); const gy = o.groundY;
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(matrix); _nn.fromBufferAttribute(N, i).applyMatrix3(_m3).normalize();
      a.p.push(_v.x, _v.y, _v.z); a.n.push(_nn.x, _nn.y, _nn.z);
      if (o.uvMode === 'local') { const U0 = g.attributes.uv; a.u.push(U0.getX(i) * (o.uvScale?.[0] ?? 1), U0.getY(i) * (o.uvScale?.[1] ?? 1)); }
      else { this._uv(mat, _v.x, _v.y, _v.z, _nn.x, _nn.y, _nn.z, uvo); a.u.push(uvo[0], uvo[1]); }
      let f = k; if (gy !== undefined && o.ao !== false) f *= 0.6 + 0.4 * Math.min(1, Math.max(0, (_v.y - gy) / 1.2));
      const cc = o.colorFn ? o.colorFn(_v, _nn) : tint; a.c.push(cc[0] * f, cc[1] * f, cc[2] * f); a.s.push(0);
    }
    if (g !== geom) g.dispose();
  }
  // Instanced prop (trees, rocks) — collected and turned into InstancedMesh at finalize.
  inst(name, x, y, z, sx, sy, sz, ry = 0, color = 0xffffff) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(sx, sy, sz));
    (this.instances[name] ||= []).push({ m, c: new THREE.Color(color) });
  }
  coverAround(x, z, w, d, kind = 'low', sides = 'nsew') {
    const low = kind === 'low', off = 0.55, step = 1.6;
    const add = (px, pz, nx, nz) => { this.world.addCover(px, pz, nx, nz, low); this.counts.cover++; };
    const line = (ax, az, bx, bz, nx, nz) => { const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.floor(L / step)); for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; add(ax + (bx - ax) * t, az + (bz - az) * t, nx, nz); } };
    if (low) {
      if (sides.includes('n')) line(x - w / 2, z - d / 2 - off, x + w / 2, z - d / 2 - off, 0, 1);
      if (sides.includes('s')) line(x - w / 2, z + d / 2 + off, x + w / 2, z + d / 2 + off, 0, -1);
      if (sides.includes('w')) line(x - w / 2 - off, z - d / 2, x - w / 2 - off, z + d / 2, 1, 0);
      if (sides.includes('e')) line(x + w / 2 + off, z - d / 2, x + w / 2 + off, z + d / 2, -1, 0);
    } else { // high cover: corners only (peek around)
      const cx = [x - w / 2 + 0.3, x + w / 2 - 0.3], cz = [z - d / 2 + 0.3, z + d / 2 - 0.3];
      if (sides.includes('n')) { add(cx[0], z - d / 2 - off, 0, 1); add(cx[1], z - d / 2 - off, 0, 1); }
      if (sides.includes('s')) { add(cx[0], z + d / 2 + off, 0, -1); add(cx[1], z + d / 2 + off, 0, -1); }
      if (sides.includes('w')) { add(x - w / 2 - off, cz[0], 1, 0); add(x - w / 2 - off, cz[1], 1, 0); }
      if (sides.includes('e')) { add(x + w / 2 + off, cz[0], -1, 0); add(x + w / 2 + off, cz[1], -1, 0); }
    }
  }
  // Light budget: spot/point lights are expensive, so the builder hands out a fixed number and
  // falls back to emissive head + ground pool when the budget is spent.
  light(kind, x, y, z, color, intensity, dist, tx, ty, tz) {
    if (this.lights.length >= this.maxLights) return null;
    let L;
    if (kind === 'spot') { L = new THREE.SpotLight(color, intensity, dist, 0.75, 0.55, 1.6); L.position.set(x, y, z); L.target.position.set(tx ?? x, ty ?? 0, tz ?? z); this.scene.add(L.target); }
    else { L = new THREE.PointLight(color, intensity, dist, 1.7); L.position.set(x, y, z); }
    L.userData.base = intensity; this.scene.add(L); this.lights.push(L); return L;
  }
  pool(x, z, r, color, y = null) {
    const a = this.A('pool'), gy = (y ?? this.ground(x, z)) + 0.03, c = toRGB(color);
    const v = [[x - r, gy, z - r, 0, 0], [x + r, gy, z - r, 1, 0], [x + r, gy, z + r, 1, 1], [x - r, gy, z + r, 0, 1]];
    for (const i of [0, 2, 1, 0, 3, 2]) { const q = v[i]; a.p.push(q[0], q[1], q[2]); a.n.push(0, 1, 0); a.u.push(q[3], q[4]); a.c.push(c[0], c[1], c[2]); a.s.push(0); }
  }
  // Emissive quad facing along normal (nx,nz) — lit windows, signs.
  quad(x, y, z, w, h, nx, nz, mat, color) {
    const a = this.A(mat), c = toRGB(color), tx = -nz, tz = nx; const hw = w / 2;
    const p = [[x - tx * hw, y, z - tz * hw], [x + tx * hw, y, z + tz * hw], [x + tx * hw, y + h, z + tz * hw], [x - tx * hw, y + h, z - tz * hw]];
    const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (const i of [0, 1, 2, 0, 2, 3]) { a.p.push(...p[i]); a.n.push(nx, 0, nz); a.u.push(...uvs[i]); a.c.push(c[0], c[1], c[2]); a.s.push(0); }
  }
  finalize(o = {}) {
    const group = new THREE.Group(); group.name = 'level';
    let draws = 0;
    for (const [mat, a] of Object.entries(this.acc)) {
      if (!a.p.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(a.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(a.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(a.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(a.c, 3));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, this.mats[mat] || this.mats.concrete);
      const shadowless = ['glow', 'pool', 'glass'].includes(mat);
      m.castShadow = !shadowless; m.receiveShadow = mat !== 'glow' && mat !== 'pool';
      m.name = 'lvl-' + mat; group.add(m); draws++;
    }
    for (const [name, list] of Object.entries(this.instances)) {
      const proto = o.protos?.[name]; if (!proto) continue;
      for (const part of proto) {
        const im = new THREE.InstancedMesh(part.geo, part.mat, list.length);
        list.forEach((it, i) => { im.setMatrixAt(i, it.m); im.setColorAt(i, it.c); });
        im.castShadow = part.shadow !== false; im.receiveShadow = true; im.computeBoundingSphere(); group.add(im); draws++;
      }
    }
    this.scene.add(group); this.acc = {}; this.group = group; this.draws = draws;
    return group;
  }
  // Terrain mesh (heightfield) with splat mask. maskFn(x,z) -> 0..1 (1 = second texture).
  terrainMesh(minX, minZ, maxX, maxZ, seg, maskFn, tintFn) {
    const geo = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ, seg, seg); geo.rotateX(-Math.PI / 2); geo.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    const P = geo.attributes.position; const uvs = new Float32Array(P.count * 2), col = new Float32Array(P.count * 3), spl = new Float32Array(P.count);
    const s = this.texScale[this.groundA] || 4;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), z = P.getZ(i); P.setY(i, this.world.terrain(x, z));
      uvs[i * 2] = x / s; uvs[i * 2 + 1] = z / s; spl[i] = maskFn ? maskFn(x, z) : 0;
      const t = tintFn ? tintFn(x, z) : [1, 1, 1]; col[i * 3] = t[0]; col[i * 3 + 1] = t[1]; col[i * 3 + 2] = t[2];
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('splat', new THREE.BufferAttribute(spl, 1));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, this.mats.ground); m.receiveShadow = true; m.name = 'terrain'; this.scene.add(m); return m;
  }

  // ------------------------------------------------------------------ props
  crate(x, z, s = 1.2, o = {}) {
    const y = o.y ?? this.ground(x, z);
    this.box(x, y, z, s, s, s, 'wood', { tint: o.tint ?? 0xc8b49a, cover: o.cover ?? (s >= 0.9 ? 'low' : null) });
    // dark banding straps
    this.box(x, y + s * 0.18, z, s + 0.02, 0.06, s + 0.02, 'dark', { col: false, tint: 0x2a2622, ao: false });
    this.box(x, y + s * 0.8, z, s + 0.02, 0.06, s + 0.02, 'dark', { col: false, tint: 0x2a2622, ao: false });
  }
  barrel(x, z, color = 0x7a2b1c, o = {}) {
    const y = o.y ?? this.ground(x, z); const g = new THREE.CylinderGeometry(0.3, 0.3, 0.9, 14, 1);
    this.geo(g, new THREE.Matrix4().makeTranslation(x, y + 0.45, z), 'paint', { tint: color, groundY: y });
    for (const yy of [0.22, 0.68]) this.geo(new THREE.TorusGeometry(0.305, 0.02, 4, 16).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(x, y + yy, z), 'paint', { tint: color, ao: false });
    this.world.add(x - 0.3, y, z - 0.3, x + 0.3, y + 0.9, z + 0.3, 'metal');
  }
  container(x, z, rotZ = false, color = 0x8a3324, o = {}) {
    const L = 6.06, W = 2.44, H = 2.59, y = o.y ?? this.ground(x, z);
    const w = rotZ ? W : L, d = rotZ ? L : W;
    this.box(x, y, z, w, H, d, 'corrugated', { tint: color, cover: o.cover ?? 'high', vary: 0.12, groundY: o.groundY });
    // frame rails & corner posts (darker paint) for silhouette
    const fc = darken(color, 0.55);
    for (const yy of [y, y + H - 0.12]) { this.box(x, yy, z, w + 0.04, 0.12, d + 0.04, 'paint', { col: false, tint: fc, ao: false }); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box(x + sx * (w / 2 - 0.08), y, z + sz * (d / 2 - 0.08), 0.18, H, 0.18, 'paint', { col: false, tint: fc, ao: false });
    // door end: vertical locking bars
    const endX = rotZ ? x : x + L / 2 + 0.03, endZ = rotZ ? z + L / 2 + 0.03 : z;
    for (const k of [-0.75, -0.35, 0.35, 0.75]) {
      if (rotZ) this.box(x + k * W / 2 * 1.1, y + 0.2, endZ, 0.05, H - 0.4, 0.05, 'paint', { col: false, tint: 0x9a9a9a, ao: false });
      else this.box(endX, y + 0.2, z + k * W / 2 * 1.1, 0.05, H - 0.4, 0.05, 'paint', { col: false, tint: 0x9a9a9a, ao: false });
    }
  }
  barrier(x, z, len, axis = 'x', o = {}) { // jersey barrier run
    const y = o.y ?? this.ground(x, z); const w = axis === 'x' ? len : 0.62, d = axis === 'x' ? 0.62 : len;
    this.box(x, y, z, w, 0.35, d, 'concrete', { tint: o.tint ?? 0xc9c4b8, cover: 'low', coverSides: axis === 'x' ? 'ns' : 'ew' });
    this.box(x, y + 0.35, z, axis === 'x' ? len : 0.3, 0.68, axis === 'x' ? 0.3 : len, 'concrete', { tint: o.tint ?? 0xc9c4b8 });
    if (o.stripe !== false) this.box(x, y + 0.82, z, axis === 'x' ? len * 0.98 : 0.31, 0.1, axis === 'x' ? 0.31 : len * 0.98, 'paint', { col: false, tint: 0xd8a21e, ao: false });
  }
  sandbags(x, z, len, axis = 'x', o = {}) {
    const y = o.y ?? this.ground(x, z); const n = Math.max(1, Math.round(len / 0.62)); const rb = new THREE.CapsuleGeometry(0.17, 0.32, 3, 6).rotateZ(Math.PI / 2);
    for (let row = 0; row < 3; row++) for (let i = 0; i < n - (row % 2); i++) {
      const t = -len / 2 + (i + 0.5 + (row % 2) * 0.5) * (len / n); const px = axis === 'x' ? x + t : x, pz = axis === 'x' ? z : z + t;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(px, y + 0.15 + row * 0.27, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (axis === 'x' ? 0 : Math.PI / 2) + (this.r() - 0.5) * 0.2, 0)), new THREE.Vector3(1, 0.8, 1.15));
      this.geo(rb, m, 'cloth', { tint: o.tint ?? 0x8b7b5a, groundY: y });
    }
    const w = axis === 'x' ? len : 0.6, d = axis === 'x' ? 0.6 : len;
    this.world.add(x - w / 2, y, z - d / 2, x + w / 2, y + 0.95, z + d / 2, 'cloth');
    this.coverAround(x, z, w, d, 'low', axis === 'x' ? 'ns' : 'ew');
  }
  // Axis-aligned wall from (x1,z1) to (x2,z2) with openings [{at, w, h, y}] measured along the wall.
  wall(x1, z1, x2, z2, h, t, mat, o = {}) {
    const y = o.y ?? Math.min(this.ground(x1, z1), this.ground(x2, z2)); const alongX = Math.abs(x2 - x1) >= Math.abs(z2 - z1);
    const L = alongX ? Math.abs(x2 - x1) : Math.abs(z2 - z1); const s0 = alongX ? Math.min(x1, x2) : Math.min(z1, z2); const c = alongX ? z1 : x1;
    const ops = (o.openings || []).slice().sort((a, b) => a.at - b.at); let cur = 0;
    const seg = (a, b, yy, hh) => { if (b - a < 0.02 || hh < 0.02) return; const mid = s0 + (a + b) / 2; if (alongX) this.box(mid, yy, c, b - a, hh, t, mat, { tint: o.tint, top: o.top, groundY: y }); else this.box(c, yy, mid, t, hh, b - a, mat, { tint: o.tint, top: o.top, groundY: y }); };
    for (const op of ops) {
      const a = op.at - op.w / 2, b = op.at + op.w / 2, oy = op.y ?? 0, oh = op.h ?? 2.2;
      seg(cur, a, y, h); if (oy > 0) seg(a, b, y, oy); if (oy + oh < h) seg(a, b, y + oy + oh, h - oy - oh);
      cur = b;
      if (op.glow) { // window pane / door glow recessed in the wall
        const mid = s0 + op.at; const nrm = op.n ?? 1;
        if (alongX) this.quad(mid, y + oy, c + nrm * (t * 0.5 - 0.06), op.w, oh, 0, nrm, 'glow', op.glow); else this.quad(c + nrm * (t * 0.5 - 0.06), y + oy, mid, op.w, oh, nrm, 0, 'glow', op.glow);
        if (op.both) { if (alongX) this.quad(mid, y + oy, c - nrm * (t * 0.5 - 0.06), op.w, oh, 0, -nrm, 'glow', op.glow); else this.quad(c - nrm * (t * 0.5 - 0.06), y + oy, mid, op.w, oh, -nrm, 0, 'glow', op.glow); }
        const mid2 = s0 + op.at; if (alongX) this.world.add(mid2 - op.w / 2, y + oy, c - t / 2, mid2 + op.w / 2, y + oy + oh, c + t / 2, 'glass'); else this.world.add(c - t / 2, y + oy, mid2 - op.w / 2, c + t / 2, y + oy + oh, mid2 + op.w / 2, 'glass');
      }
      if (op.shutter && op.y > 0.3) { const mid = s0 + op.at, nrm = op.n ?? 1, off = t / 2 + 0.03;
        for (const sd of [-1, 1]) { const a = mid + sd * (op.w / 2 + 0.24); if (alongX) this.box(a, y + op.y, c + nrm * off, 0.44, oh, 0.05, 'wood', { col: false, tint: op.shutter, ao: false }); else this.box(c + nrm * off, y + op.y, a, 0.05, oh, 0.44, 'wood', { col: false, tint: op.shutter, ao: false }); }
        if (alongX) this.box(mid, y + op.y - 0.1, c + nrm * (t / 2 + 0.05), op.w + 0.2, 0.08, 0.12, 'concrete', { col: false, tint: 0xd8d0c0, ao: false }); else this.box(c + nrm * (t / 2 + 0.05), y + op.y - 0.1, mid, 0.12, 0.08, op.w + 0.2, 'concrete', { col: false, tint: 0xd8d0c0, ao: false }); }
      if (op.frame) { const fm = op.frame; const mid = s0 + op.at; if (alongX) { this.box(mid, y + oy - 0.08, c, op.w + 0.2, 0.08, t + 0.12, fm, { col: false }); this.box(mid, y + oy + oh, c, op.w + 0.2, 0.1, t + 0.12, fm, { col: false }); } else { this.box(c, y + oy - 0.08, mid, t + 0.12, 0.08, op.w + 0.2, fm, { col: false }); this.box(c, y + oy + oh, mid, t + 0.12, 0.1, op.w + 0.2, fm, { col: false }); } }
    }
    seg(cur, L, y, h);
  }
  // Rectangular building with door/window openings, slab roof or pitched roof, optional upper floor.
  building(b) {
    const { x, z, w, d } = b, h = b.h ?? 3.4, t = b.t ?? 0.3, mat = b.mat ?? 'concrete', y = b.y ?? this.ground(x, z);
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    const glow = b.lit === false ? null : (b.glow ?? 0xffc87a);
    const winRow = (len, doors, floorY = 0) => {
      const ops = (doors || []).map((dd) => ({ at: dd.at ?? len / 2, w: dd.w ?? 1.8, h: dd.h ?? 2.3, y: 0, frame: b.frame ?? 'wood', glow: dd.glow ? glow : null }));
      const sp = b.winSpacing ?? 3.2; if (b.windows !== false) for (let p = sp / 2 + 0.4; p < len - 0.6; p += sp) { if (ops.some((o) => Math.abs(o.at - p) < (o.w / 2 + 0.9))) continue; ops.push({ at: p, w: b.winW ?? 1.1, h: b.winH ?? 1.2, y: floorY + 1.0, frame: b.frame ?? 'wood', glow: glow && this.r() < (b.litChance ?? 0.55) ? glow : 0x1a2028, shutter: b.shutters }); }
      return ops;
    };
    const fixSide = (ops, s) => ops.forEach((o) => { o.n = s; });
    const floors = b.floors ?? 1, totalH = h * floors + (b.parapet ?? 0);
    const sides = { n: [x0, z0, x1, z0, w, -1], s: [x0, z1, x1, z1, w, 1], w: [x0, z0, x0, z1, d, -1], e: [x1, z0, x1, z1, d, 1] };
    for (const [k, [ax, az, bx, bz, len, sgn]] of Object.entries(sides)) {
      const doors = (b.doors || []).filter((dd) => dd.side === k);
      let ops = winRow(len, doors); for (let f = 1; f < floors; f++) ops = ops.concat(winRow(len, [], f * h).filter((o) => o.y > 0.5));
      fixSide(ops, sgn);
      // shift wall inward so corners overlap cleanly
      if (k === 'n' || k === 's') this.wall(ax, az + (k === 'n' ? t / 2 : -t / 2), bx, bz + (k === 'n' ? t / 2 : -t / 2), totalH, t, mat, { y, openings: ops, tint: b.tint });
      else this.wall(ax + (k === 'w' ? t / 2 : -t / 2), az + t, bx + (k === 'w' ? t / 2 : -t / 2), bz - t, totalH, t, mat, { y, openings: ops.map((o) => ({ ...o, at: o.at - t })), tint: b.tint });
    }
    // floor slab + interior floors
    this.box(x, y, z, w - t * 2 + 0.02, 0.08, d - t * 2 + 0.02, b.floorMat ?? 'concrete', { tint: 0x9a958c, ao: false, col: false });
    for (let f = 1; f < floors; f++) this.box(x + (b.stairGap ? -w / 4 : 0), y + f * h - 0.2, z, b.stairGap ? w / 2 - t : w - t * 2, 0.22, d - t * 2, 'concrete', { tint: 0xb0aaa0 });
    // roof
    const roofY = y + h * floors;
    if (b.roof === 'pitched') this.pitchedRoof(x, roofY, z, w + 0.5, d + 0.5, b.roofH ?? 1.6, b.roofMat ?? 'roof', b.ridgeX ?? (w >= d));
    else { this.box(x, roofY - 0.05, z, w, 0.25, d, 'concrete', { tint: 0x8a8580 }); if (b.parapet) {/* walls already extend */} }
    // inside: dim interior light pools for night readability + ceiling glow
    if (b.interiorGlow && glow) this.pool(x, z, Math.min(w, d) * 0.45, 0x553a1c, y + 0.1);
    if (b.cover !== false) this.coverAround(x, z, w, d, 'high');
    return { x0, x1, z0, z1, y, roofY };
  }
  pitchedRoof(x, y, z, w, d, rh, mat, ridgeX = true) {
    const L = ridgeX ? w : d, S = ridgeX ? d : w; const half = S / 2, slope = Math.hypot(half, rh);
    for (const sgn of [-1, 1]) {
      const g = new THREE.BoxGeometry(ridgeX ? L : slope, 0.12, ridgeX ? slope : L);
      const ang = Math.atan2(rh, half) * sgn;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x + (ridgeX ? 0 : -sgn * half / 2), y + rh / 2, z + (ridgeX ? -sgn * half / 2 : 0)), new THREE.Quaternion().setFromEuler(new THREE.Euler(ridgeX ? -ang : 0, 0, ridgeX ? 0 : ang)), new THREE.Vector3(1, 1, 1));
      this.geo(g, m, mat, { tint: 0xe0d6cc });
    }
    // gable ends (triangles) in plaster
    const tri = new THREE.BufferGeometry(); const hs = S / 2 - 0.25;
    const v = ridgeX ? [[0, 0, -hs], [0, 0, hs], [0, rh - 0.1, 0]] : [[-hs, 0, 0], [hs, 0, 0], [0, rh - 0.1, 0]];
    for (const e of [-1, 1]) {
      const off = ridgeX ? [x + e * (L / 2 - 0.3), y, z] : [x, y, z + e * (L / 2 - 0.3)];
      const pos = v.flatMap((p) => [p[0] + off[0], p[1] + off[1], p[2] + off[2]]);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
      const g2 = g.clone(); const p2 = g2.attributes.position.array; [p2[0], p2[1], p2[2], p2[3], p2[4], p2[5]] = [p2[3], p2[4], p2[5], p2[0], p2[1], p2[2]]; g2.computeVertexNormals();
      this.geo(g, new THREE.Matrix4(), 'plaster', { tint: 0xd8cfc0, ao: false }); this.geo(g2, new THREE.Matrix4(), 'plaster', { tint: 0xd8cfc0, ao: false });
    }
    this.world.add(x - w / 2 + 0.3, y, z - d / 2 + 0.3, x + w / 2 - 0.3, y + rh * 0.5, z + d / 2 - 0.3, 'concrete');
  }
  lamp(x, z, h = 6, color = 0xffd9a0, o = {}) {
    const y = o.y ?? this.ground(x, z); const dir = o.dir ?? [0, 1];
    this.geo(new THREE.CylinderGeometry(0.07, 0.1, h, 8), new THREE.Matrix4().makeTranslation(x, y + h / 2, z), 'paint', { tint: 0x3a3d42, groundY: y });
    const ax = x + dir[0] * 1.0, az = z + dir[1] * 1.0;
    this.box((x + ax) / 2, y + h - 0.08, (z + az) / 2, Math.abs(dir[0]) * 1.0 + 0.08, 0.08, Math.abs(dir[1]) * 1.0 + 0.08, 'paint', { col: false, tint: 0x3a3d42 });
    this.box(ax, y + h - 0.2, az, 0.5, 0.16, 0.34, 'paint', { col: false, tint: 0x2a2c30 });
    this.box(ax, y + h - 0.24, az, 0.42, 0.04, 0.28, 'glow', { col: false, tint: scaleHex(color, o.glow ?? 6), ao: false });
    this.world.add(x - 0.1, y, z - 0.1, x + 0.1, y + h, z + 0.1, 'metal');
    if (o.light !== false) this.light('spot', ax, y + h - 0.3, az, color, o.intensity ?? 60, o.dist ?? 26, ax, y, az);
    this.pool(ax, az, o.pool ?? 5.5, scaleHex(color, 0.55), y);
  }
  floodMast(x, z, h, aim, color = 0xdfe8ff) { // tall floodlight mast — landmark + key light source
    const y = this.ground(x, z);
    this.geo(new THREE.CylinderGeometry(0.18, 0.3, h, 8), new THREE.Matrix4().makeTranslation(x, y + h / 2, z), 'paint', { tint: 0x5a5e64, groundY: y });
    this.box(x, y + h, z, 2.6, 0.2, 0.3, 'paint', { col: false, tint: 0x3c3f44 });
    for (const k of [-0.9, 0, 0.9]) { this.box(x + k, y + h + 0.2, z, 0.62, 0.5, 0.3, 'paint', { col: false, tint: 0x2a2c30 }); this.box(x + k, y + h + 0.24, z + 0.16, 0.5, 0.4, 0.02, 'glow', { col: false, tint: scaleHex(color, 9), ao: false }); }
    this.world.add(x - 0.3, y, z - 0.3, x + 0.3, y + h, z + 0.3, 'metal');
    const L = this.light('spot', x, y + h, z + 0.3, color, 260, 70, aim[0], 0, aim[1]);
    this.pool(aim[0], aim[1], 13, scaleHex(color, 0.5));
    return L;
  }
  tank(x, z, r, h, mat = 'paint', tint = 0xb8bcc0) {
    const y = this.ground(x, z);
    this.geo(new THREE.CylinderGeometry(r, r, h, 24, 1), new THREE.Matrix4().makeTranslation(x, y + h / 2, z), mat, { tint, groundY: y });
    this.geo(new THREE.SphereGeometry(r, 24, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.25, 1), new THREE.Matrix4().makeTranslation(x, y + h, z), mat, { tint });
    for (const yy of [h * 0.33, h * 0.66]) this.geo(new THREE.TorusGeometry(r + 0.03, 0.05, 4, 32).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(x, y + yy, z), 'paint', { tint: darken(tint, 0.6), ao: false });
    // ladder
    this.box(x + r + 0.06, y, z, 0.06, h, 0.5, 'paint', { col: false, tint: 0x555555 });
    const k = r * 0.86; this.world.add(x - k, y, z - k, x + k, y + h, z + k, 'metal');
    this.coverAround(x, z, k * 2, k * 2, 'high');
  }
  pipe(x1, y, z1, x2, z2, r, tint = 0x8d8f86, col = true) {
    const alongX = Math.abs(x2 - x1) > Math.abs(z2 - z1); const L = alongX ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
    const g = new THREE.CylinderGeometry(r, r, L, 12, 1); g.rotateZ(Math.PI / 2); if (!alongX) g.rotateY(Math.PI / 2);
    this.geo(g, new THREE.Matrix4().makeTranslation((x1 + x2) / 2, y, (z1 + z2) / 2), 'paint', { tint });
    if (col) this.world.add(Math.min(x1, x2) - (alongX ? 0 : r), y - r, Math.min(z1, z2) - (alongX ? r : 0), Math.max(x1, x2) + (alongX ? 0 : r), y + r, Math.max(z1, z2) + (alongX ? r : 0), 'metal');
  }
  // stairs/ramp along axis ('x'|'z'), rising in dir (+1/-1). (x,z) centre; len horizontal, h rise
  stairs(x, z, w, len, h, axis = 'z', dir = 1, mat = 'concrete', o = {}) {
    const y = o.y ?? this.ground(x, z); const steps = Math.max(2, Math.round(h / 0.22));
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, sy = y + h * (i + 1) / steps, along = -len / 2 + len * (t0 + 0.5 / steps);
      const px = axis === 'x' ? x + along * dir : x, pz = axis === 'z' ? z + along * dir : z;
      this.box(px, y, pz, axis === 'x' ? len / steps : w, sy - y, axis === 'z' ? len / steps : w, mat, { col: false, tint: o.tint ?? 0xb8b2a8 });
    }
    const minx = axis === 'x' ? x - len / 2 : x - w / 2, maxx = axis === 'x' ? x + len / 2 : x + w / 2, minz = axis === 'z' ? z - len / 2 : z - w / 2, maxz = axis === 'z' ? z + len / 2 : z + w / 2;
    this.world.add(minx, y, minz, maxx, y + h, maxz, SURF[mat] || 'concrete', { kind: 'ramp', axis: axis === 'x' ? 0 : 2, dir });
  }
  fence(x1, z1, x2, z2, h = 2.4, o = {}) {
    const y = o.y ?? this.ground(x1, z1); const alongX = Math.abs(x2 - x1) >= Math.abs(z2 - z1); const L = alongX ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
    const n = Math.max(1, Math.round(L / 3));
    for (let i = 0; i <= n; i++) { const t = i / n; const px = x1 + (x2 - x1) * t, pz = z1 + (z2 - z1) * t; this.geo(new THREE.CylinderGeometry(0.04, 0.04, h, 6), new THREE.Matrix4().makeTranslation(px, y + h / 2, pz), 'paint', { tint: 0x777b80, ao: false }); }
    const g = new THREE.PlaneGeometry(L, h); if (!alongX) g.rotateY(Math.PI / 2);
    this.geo(g, new THREE.Matrix4().makeTranslation((x1 + x2) / 2, y + h / 2, (z1 + z2) / 2), 'fence', { uvMode: 'local', uvScale: [L / 0.5, h / 0.5], tint: 0xb0b4b8, ao: false });
    this.pipe(x1, y + h, z1, x2, z2, 0.035, 0x777b80, false);
    if (o.col !== false) { const t = 0.1; this.world.add(Math.min(x1, x2) - (alongX ? 0 : t), y, Math.min(z1, z2) - (alongX ? t : 0), Math.max(x1, x2) + (alongX ? 0 : t), y + h, Math.max(z1, z2) + (alongX ? t : 0), 'metal', { noBullet: true }); }
  }
  truck(x, z, rotZ = false, color = 0x2f5d8a) {
    const y = this.ground(x, z); const L = 7.2, W = 2.5;
    const bx = (dx, dz, w, h, d, yy, mat, tint, col = true) => rotZ ? this.box(x + dz, y + yy, z + dx, d, h, w, mat, { tint, col }) : this.box(x + dx, y + yy, z + dz, w, h, d, mat, { tint, col });
    bx(-0.9, 0, 5.0, 2.6, W, 0.9, 'corrugated', 0xd8d8d0); // cargo box
    bx(2.55, 0, 1.8, 1.9, W - 0.1, 0.7, 'paint', color); // cab
    bx(3.2, 0, 0.6, 0.8, W - 0.4, 1.25, 'glass', 0x203040, false); // windscreen
    bx(0.4, 0, L, 0.35, W - 0.3, 0.45, 'dark', 0x222222, false); // chassis
    for (const dx of [-2.6, -1.4, 2.6]) for (const s of [-1, 1]) { const g = new THREE.CylinderGeometry(0.48, 0.48, 0.34, 14); g.rotateX(Math.PI / 2); const px = rotZ ? x + s * (W / 2 - 0.1) : x + dx, pz = rotZ ? z + dx : z + s * (W / 2 - 0.1); if (rotZ) g.rotateY(Math.PI / 2); this.geo(g, new THREE.Matrix4().makeTranslation(px, y + 0.48, pz), 'dark', { tint: 0x1c1c1c }); }
    this.world.add(rotZ ? x - W / 2 : x - L / 2, y, rotZ ? z - L / 2 : z - W / 2, rotZ ? x + W / 2 : x + L / 2, y + 1.0, rotZ ? z + L / 2 : z + W / 2, 'metal');
    this.coverAround(x, z, rotZ ? W : L, rotZ ? L : W, 'high');
  }
  car(x, z, rotZ = false, color = 0x8a8f96) {
    const y = this.ground(x, z); const L = 4.3, W = 1.8;
    const bx = (dx, w, h, d, yy, mat, tint, col = false) => rotZ ? this.box(x, y + yy, z + dx, d, h, w, mat, { tint, col }) : this.box(x + dx, y + yy, z, w, h, d, mat, { tint, col });
    bx(0, L, 0.7, W, 0.3, 'paint', color); bx(-0.2, 2.2, 0.55, W - 0.15, 1.0, 'paint', color); bx(-0.2, 2.25, 0.4, W - 0.1, 1.05, 'glass', 0x1a2430);
    for (const dx of [-1.35, 1.35]) for (const s of [-1, 1]) { const g = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 12); g.rotateX(Math.PI / 2); if (rotZ) g.rotateY(Math.PI / 2); this.geo(g, new THREE.Matrix4().makeTranslation(rotZ ? x + s * W / 2 : x + dx, y + 0.33, rotZ ? z + dx : z + s * W / 2), 'dark', { tint: 0x181818 }); }
    this.world.add(rotZ ? x - W / 2 : x - L / 2, y, rotZ ? z - L / 2 : z - W / 2, rotZ ? x + W / 2 : x + L / 2, y + 1.5, rotZ ? z + L / 2 : z + W / 2, 'metal');
    this.coverAround(x, z, rotZ ? W : L, rotZ ? L : W, 'low');
  }
  palletStack(x, z, n = 3) { const y = this.ground(x, z); for (let i = 0; i < n; i++) { this.box(x, y + i * 0.16, z, 1.2, 0.14, 1.0, 'wood', { col: false, tint: 0xb89a74 }); } this.world.add(x - 0.6, y, z - 0.5, x + 0.6, y + n * 0.16, z + 0.5, 'wood'); }
  tree(x, z, kind = 'olive', s = 1, tint = 0xffffff) {
    const y = this.ground(x, z); const v = 0.85 + this.r() * 0.3;
    this.inst(kind, x, y - 0.05, z, s * v, s * (0.85 + this.r() * 0.35), s * v, this.r() * 6.28, tint);
    if (kind !== 'bush') this.world.add(x - 0.22 * s, y, z - 0.22 * s, x + 0.22 * s, y + 2.6 * s, z + 0.22 * s, 'wood');
  }
  rock(x, z, s = 1, tint = 0xffffff) {
    const y = this.ground(x, z); this.inst('rock', x, y - 0.25 * s, z, s * (1 + this.r() * 0.3), s * (0.8 + this.r() * 0.5), s, this.r() * 6.28, tint);
    const k = s * 0.95; this.world.add(x - k, y - 1, z - k * 0.75, x + k, y + 0.55 * s, z + k * 0.75, 'concrete');
    if (s > 0.8) this.coverAround(x, z, k * 2, k * 1.5, 'low');
  }
  tires(x, z) { const y = this.ground(x, z); for (let i = 0; i < 3; i++) this.geo(new THREE.TorusGeometry(0.34, 0.15, 6, 14).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(x + (this.r() - 0.5) * 0.08, y + 0.15 + i * 0.29, z), 'dark', { tint: 0x1a1a1a }); this.world.add(x - 0.5, y, z - 0.5, x + 0.5, y + 0.9, z + 0.5, 'dirt'); }
}

export function toRGB(c) { if (Array.isArray(c)) return c; const col = new THREE.Color(c); return [col.r, col.g, col.b]; }
export function scaleHex(c, k) { const [r, g, b] = toRGB(c); return [r * k, g * k, b * k]; }
export function darken(c, k) { const [r, g, b] = toRGB(c); return [r * k, g * k, b * k]; }
export function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
