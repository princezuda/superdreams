// Lantern Hold — diorama builder: terrain + cliff skirt, roads (procedural TSL cobbles + flow chevrons), lakes/lava,
// instanced props, build pads, the Hold, spawn rifts, sky, fog and ambient particles. One call per map; dispose() on swap.
import { THREE, settings } from '/shared/sd-kit.js';
import {
  uniform, uv, vec2, vec3, vec4, float, abs, fract, smoothstep, mix, sin, time, mx_noise_float, mx_worley_noise_float, mx_fractal_noise_float,
  positionWorld, positionWorldDirection, attribute, max, pow, dot, clamp, length, atan, instancedBufferAttribute, normalize, color,
} from 'three/tsl';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { propModel, holdModel, padModel, PAL } from './models.js';
import { posAt, mulberry, nearestOnPath } from './paths.js';

export const EXTENT = { x: 15.5, z: 11 };
export const BIOME = {
  forest: {
    ground: ['#4d6b47', '#3c5a46', '#5c6a3e'], dirt: '#6a5440', road: ['#6e5640', '#8a7666'], cliff: ['#5d4a3e', '#4a3b33', '#3a2e2a'],
    sky: ['#e08a6e', '#4a3a72', '#121634'], fog: '#3a3a5e', key: '#ffc890', keyI: 2.5, keyPos: [-12, 18, 9], hemi: ['#8a90d8', '#2a2a1c', 1.0], rim: '#8ab0ff', rimI: 1.2,
    props: { pine: 5, roundtree: 3, violettree: 2, bush: 3, rock: 2, mushroom: 0.8, grass: 4, log: 0.6 }, ambient: 'fireflies', exposure: 1.05,
  },
  frozen: {
    ground: ['#dfe7f4', '#c6d2e8', '#eef2fa'], dirt: '#9aa4bc', road: ['#a6b0c6', '#8890a8'], cliff: ['#7a86a6', '#5e6a8a', '#46506e'],
    sky: ['#a8c4ea', '#3a5490', '#0c1430'], fog: '#56688f', key: '#e6eeff', keyI: 2.1, keyPos: [-10, 20, 10], hemi: ['#a8c0ff', '#4a5068', 0.9], rim: '#b0c8ff', rimI: 1.0,
    props: { snowpine: 7, snowrock: 3, icespike: 2, crystal: 1.5, deadtree: 0.6 }, ambient: 'snow', exposure: 0.92,
  },
  ember: {
    ground: ['#4a3a36', '#3a2e2c', '#56423a'], dirt: '#5a4842', road: ['#6e5e58', '#857470'], cliff: ['#4a3430', '#3a2624', '#2a1a1a'],
    sky: ['#d0603a', '#4a1a2a', '#120a14'], fog: '#3a1e22', key: '#ffa070', keyI: 2.4, keyPos: [-12, 17, 6], hemi: ['#c08080', '#2a1010', 0.85], rim: '#ff7a5a', rimI: 1.3,
    props: { deadtree: 3, pillar: 1.5, brokenpillar: 2, emberrock: 3, rock: 2, brazier: 1, ruinwall: 1.2 }, ambient: 'embers', exposure: 1.0,
  },
};
const SKY_VARIANTS = { dusk: null, midnight: ['#3a4a7a', '#1a1e44', '#05060f'], aurora: ['#3ac8a0', '#2a3a7a', '#0a0e26'] };

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- shared materials (created once)
let MAT = null;
export function materials() {
  if (MAT) return MAT;
  const lampTint = uniform(new THREE.Color('#ffd49a'));
  const solid = new THREE.MeshStandardNodeMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0 });
  const glow = new THREE.MeshBasicNodeMaterial({ vertexColors: true }); glow.color.setScalar(1.7);
  const lamp = new THREE.MeshBasicNodeMaterial({ vertexColors: true }); lamp.colorNode = lampTint.mul(3.2);
  MAT = { solid, glow, lamp, lampTint };
  return MAT;
}
export function meshesFor(parts, { shadow = true } = {}) {
  const M = materials(), out = [];
  for (const k of ['solid', 'glow', 'lamp']) if (parts[k]) { const m = new THREE.Mesh(parts[k], M[k]); m.castShadow = shadow && k === 'solid'; m.receiveShadow = k === 'solid'; out.push(m); }
  return out;
}
function instanced(parts, count, { shadow = true } = {}) {
  const M = materials(), out = [];
  for (const k of ['solid', 'glow', 'lamp']) if (parts[k]) {
    const m = new THREE.InstancedMesh(parts[k], M[k], count);
    m.castShadow = shadow && k === 'solid'; m.receiveShadow = k === 'solid'; out.push(m);
  }
  return out;
}

// ---------------------------------------------------------------- build
export function buildWorld(scene, L, map, cfg) {
  const B = BIOME[L.biome];
  const group = new THREE.Group(); group.name = 'world'; scene.add(group);
  const rng = mulberry(L.seed * 17 + 3);
  const simplex = new SimplexNoise({ random: rng });
  const disposables = [];
  const keep = (o) => { disposables.push(o); return o; };
  const waters = [...(L.lakes || []).map((l) => ({ ...l, kind: 'lake' })), ...(L.lavas || []).map((l) => ({ ...l, kind: 'lava' }))];
  const P = map.paths;
  const roadDist = (x, z) => { let m = 1e9; for (const p of P) for (let i = 0; i < p.n; i += 1) { const d = (p.xs[i] - x) ** 2 + (p.zs[i] - z) ** 2; if (d < m) m = d; } return Math.sqrt(m); };
  const padDist = (x, z) => { let m = 1e9; for (const p of map.pads) m = Math.min(m, Math.hypot(p.x - x, p.z - z)); return m; };
  const mounds = [];
  for (let i = 0; i < 24 && mounds.length < 7; i++) {
    const x = (rng() - 0.5) * 2 * 13.5, z = (rng() - 0.5) * 2 * 9.5;
    if (roadDist(x, z) > 3.6 && padDist(x, z) > 2.8 && !waters.some((w) => Math.hypot(w.x - x, w.z - z) < w.r + 2.5)) mounds.push({ x, z, r: 1.8 + rng() * 1.6, h: 0.5 + rng() * 0.7 });
  }
  const heightAt = (x, z, rd = roadDist(x, z), pd = padDist(x, z)) => {
    let h = simplex.noise(x * 0.18, z * 0.18) * 0.22 + simplex.noise(x * 0.6, z * 0.6) * 0.05;
    for (const m of mounds) { const d = Math.hypot(x - m.x, z - m.z); if (d < m.r) h += m.h * (1 - smooth(0, m.r, d)) * 1.0; }
    h *= smooth(1.0, 2.6, rd) * smooth(1.05, 1.9, pd);
    h -= 0.04 * (1 - smooth(0.6, 1.1, rd));
    for (const w of waters) { const d = Math.hypot(x - w.x, z - w.z); if (d < w.r + 0.8) h = Math.min(h, -0.32 + 0.32 * smooth(w.r - 0.3, w.r + 0.8, d)); }
    // the edge of the diorama lifts into a lip so the cliff reads
    const ex = Math.abs(x) / EXTENT.x, ez = Math.abs(z) / EXTENT.z, e = Math.max(ex, ez);
    h += smooth(0.9, 1.0, e) * 0.12 * smooth(1.2, 2.2, rd);
    return h;
  };

  // ---- terrain
  const NX = 96, NZ = 68;
  const tg = new THREE.PlaneGeometry(EXTENT.x * 2, EXTENT.z * 2, NX, NZ); tg.rotateX(-Math.PI / 2);
  const pos = tg.attributes.position, n = pos.count;
  const col = new Float32Array(n * 3), glowA = new Float32Array(n);
  const cA = new THREE.Color(B.ground[0]), cB = new THREE.Color(B.ground[1]), cC = new THREE.Color(B.ground[2]), cD = new THREE.Color(B.dirt), tmp = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), z = pos.getZ(i), rd = roadDist(x, z), pd = padDist(x, z);
    const y = heightAt(x, z, rd, pd); pos.setY(i, y);
    const nn = simplex.noise(x * 0.22 + 7, z * 0.22) * 0.5 + 0.5, n2 = simplex.noise(x * 0.9, z * 0.9) * 0.5 + 0.5;
    tmp.copy(cA).lerp(cB, nn).lerp(cC, smooth(0.55, 0.9, n2) * 0.6);
    tmp.lerp(cD, (1 - smooth(0.7, 1.5, rd)) * 0.85);                 // dirt fringe along the road
    tmp.lerp(cD, (1 - smooth(1.0, 1.5, pd)) * 0.35);                 // trodden ground round pads
    for (const w of waters) { const d = Math.hypot(x - w.x, z - w.z); if (d < w.r + 1.0) tmp.lerp(w.kind === 'lava' ? new THREE.Color('#2a1614') : new THREE.Color('#f4f8ff'), (1 - smooth(w.r - 0.2, w.r + 1.0, d)) * 0.8); }
    const sh = 0.9 + y * 0.35; tmp.multiplyScalar(Math.max(0.7, Math.min(1.15, sh)));
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    if (L.biome === 'ember') glowA[i] = smooth(1.6, 2.6, rd) * smooth(1.2, 2, pd) * smooth(-0.2, 0.3, simplex.noise(x * 0.12 + 3, z * 0.12));
  }
  tg.setAttribute('color', new THREE.BufferAttribute(col, 3)); tg.setAttribute('glow', new THREE.BufferAttribute(glowA, 1));
  tg.computeVertexNormals();
  const terrainMat = keep(new THREE.MeshStandardNodeMaterial({ vertexColors: true, flatShading: true, roughness: 0.92 }));
  if (L.biome === 'ember') { // crisp per-pixel crack lines, masked away from roads/pads by the vertex attribute
    const cn = abs(mx_noise_float(vec3(positionWorld.xz.mul(0.42), 2.7)));
    const line = float(1).sub(smoothstep(0.0, 0.035, cn));
    terrainMat.emissiveNode = vec3(2.4, 0.55, 0.1).mul(line).mul(attribute('glow', 'float')).mul(sin(time.mul(1.3).add(positionWorld.x.mul(0.7))).mul(0.25).add(0.75));
  }
  const terrain = new THREE.Mesh(keep(tg), terrainMat); terrain.receiveShadow = true; group.add(terrain);

  // ---- cliff skirt: strata bands down to y = -2.8 with a rough outward jitter
  {
    const ring = [];
    const push = (x, z) => ring.push([x, z]);
    for (let i = 0; i <= NX; i++) push(-EXTENT.x + i / NX * EXTENT.x * 2, EXTENT.z);
    for (let i = 1; i <= NZ; i++) push(EXTENT.x, EXTENT.z - i / NZ * EXTENT.z * 2);
    for (let i = 1; i <= NX; i++) push(EXTENT.x - i / NX * EXTENT.x * 2, -EXTENT.z);
    for (let i = 1; i < NZ; i++) push(-EXTENT.x, -EXTENT.z + i / NZ * EXTENT.z * 2);
    const levels = [0, -0.35, -1.1, -1.9, -2.8], cc = B.cliff.map((c) => new THREE.Color(c));
    const verts = [], cols = [];
    const ringPt = (k, li) => {
      const [x, z] = ring[k % ring.length]; const top = heightAt(x, z);
      const y = li === 0 ? top : top * 0.3 + levels[li];
      const out = li === 0 ? 0 : (simplex.noise(x * 0.7 + li, z * 0.7) * 0.18 + 0.05) * (li < 4 ? 1 : 0.4) - li * 0.06;
      const nx = Math.abs(x) >= EXTENT.x - 1e-3 ? Math.sign(x) : 0, nz = Math.abs(z) >= EXTENT.z - 1e-3 ? Math.sign(z) : 0;
      return [x + nx * out, y, z + nz * out];
    };
    for (let k = 0; k < ring.length; k++) for (let li = 0; li < levels.length - 1; li++) {
      const a = ringPt(k, li), b = ringPt(k + 1, li), c = ringPt(k + 1, li + 1), d = ringPt(k, li + 1);
      const cl = li === 0 ? new THREE.Color(B.ground[1]).multiplyScalar(0.8) : cc[Math.min(2, li - 1)].clone().multiplyScalar(0.92 + rng() * 0.16);
      for (const v of [a, d, c, a, c, b]) { verts.push(...v); cols.push(cl.r, cl.g, cl.b); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(keep(g), materials().solid); m.receiveShadow = true; group.add(m);
  }

  // ---- roads
  const roadCols = B.road.map((c) => new THREE.Color(c));
  const roadMat = keep(new THREE.MeshStandardNodeMaterial({ roughness: 0.95 }));
  {
    const u = uv().x, v = uv().y, edge = abs(v.sub(0.5)).mul(2);
    const cell = mx_worley_noise_float(vec2(u.mul(1.7), v.mul(3.4)));
    const n = mx_noise_float(vec3(u.mul(0.6), v.mul(2), 1.3)).mul(0.5).add(0.5);
    const base = mix(color(roadCols[0]), color(roadCols[1]), smoothstep(0.25, 0.75, n));
    const stones = smoothstep(0.08, 0.22, cell).mul(0.32).add(0.68);
    const ground = color(new THREE.Color(B.dirt));
    roadMat.colorNode = mix(base.mul(stones), ground, smoothstep(0.72, 1.0, edge)).mul(float(1).sub(edge.mul(edge).mul(0.25)));
  }
  const flow = uniform(0), flowCol = uniform(new THREE.Color(cfg.colors?.accent || '#ffd27a'));
  const flowMat = keep(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  {
    const u = uv().x, v = uv().y, edge = abs(v.sub(0.5)).mul(2);
    const ch = fract(u.mul(0.55).sub(time.mul(0.9)).add(edge.mul(0.35)));
    const a = smoothstep(0.0, 0.07, ch).mul(smoothstep(0.3, 0.16, ch)).mul(float(1).sub(smoothstep(0.55, 0.95, edge))).mul(flow);
    flowMat.colorNode = vec3(flowCol).mul(a).mul(1.6); flowMat.opacityNode = a;
  }
  const ribbon = (Pp, half, lift) => {
    const vs = [], uvs = [], idx = [], o = {};
    for (let i = 0; i < Pp.n; i++) {
      const s = Math.min(i * 0.2, Pp.len); posAt(Pp, s, o);
      const w = half * (1 + 0.15 * (1 - smooth(0, 1.2, s)));
      const lx = -o.tz * w, lz = o.tx * w;
      vs.push(o.x + lx, lift, o.z + lz, o.x - lx, lift, o.z - lz); uvs.push(s, 0, s, 1);
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } // CCW from above
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vs, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
    const nn = g.attributes.normal; for (let i = 0; i < nn.count; i++) nn.setXYZ(i, 0, 1, 0);
    return keep(g);
  };
  P.forEach((Pp, i) => {
    const r = new THREE.Mesh(ribbon(Pp, 0.8, 0.015 + i * 0.006), roadMat); r.receiveShadow = true; group.add(r);
    const f = new THREE.Mesh(ribbon(Pp, 0.55, 0.05 + i * 0.006), flowMat); f.renderOrder = 2; group.add(f);
  });

  // ---- lakes (ice) + lava
  for (const w of waters) {
    const g = keep(new THREE.CircleGeometry(w.r + 0.25, 48)); g.rotateX(-Math.PI / 2);
    let m;
    if (w.kind === 'lake') {
      m = keep(new THREE.MeshStandardNodeMaterial({ roughness: 0.18, metalness: 0.0 }));
      const p = positionWorld.xz.mul(1.1);
      const crack = mx_worley_noise_float(p.mul(0.9)); const crack2 = mx_worley_noise_float(p.mul(2.6).add(3));
      const lines = float(1).sub(smoothstep(0.02, 0.07, crack)).mul(0.6).add(float(1).sub(smoothstep(0.02, 0.06, crack2)).mul(0.25));
      const depth = clamp(length(positionWorld.xz.sub(vec2(w.x, w.z))).div(w.r), 0, 1);
      m.colorNode = mix(vec3(0.32, 0.52, 0.72), vec3(0.72, 0.86, 0.96), depth.mul(depth)).add(lines);
    } else {
      m = keep(new THREE.MeshBasicNodeMaterial());
      const p = positionWorld.xz;
      const nz = mx_fractal_noise_float(vec3(p.mul(0.7), time.mul(0.12)), 3, 2.0, 0.5);
      const hot = smoothstep(0.02, 0.4, nz);
      const rim = smoothstep(w.r * 0.75, w.r + 0.2, length(p.sub(vec2(w.x, w.z))));
      m.colorNode = mix(vec3(0.14, 0.03, 0.02), vec3(2.1, 0.5, 0.08), hot.mul(float(1).sub(rim.mul(0.9)))).add(vec3(0.5, 0.08, 0.0).mul(float(1).sub(rim)));
    }
    const mesh = new THREE.Mesh(g, m); mesh.position.set(w.x, w.kind === 'lake' ? -0.1 : -0.12, w.z); mesh.receiveShadow = w.kind === 'lake'; group.add(mesh);
  }

  // ---- pads
  const pads = map.pads;
  const padParts = padModel();
  const padMeshes = instanced(padParts, pads.length);
  const padRingState = new THREE.InstancedBufferAttribute(new Float32Array(pads.length), 1); padRingState.setUsage(THREE.DynamicDrawUsage);
  const ringMat = keep(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  {
    const st = instancedBufferAttribute(padRingState);
    const d = length(uv().sub(0.5)).mul(2);
    const band = smoothstep(0.66, 0.78, d).mul(smoothstep(1.0, 0.86, d));
    const runes = smoothstep(0.35, 0.6, sin(atan(uv().y.sub(0.5), uv().x.sub(0.5)).mul(12).add(time.mul(0.6)))).mul(smoothstep(0.55, 0.62, d)).mul(smoothstep(0.7, 0.64, d));
    const pulse = sin(time.mul(3)).mul(0.25).add(0.75);
    const a = band.add(runes.mul(0.6)).mul(st).mul(pulse);
    ringMat.colorNode = vec3(flowCol).mul(a).mul(0.95); ringMat.opacityNode = clamp(a, 0, 1);
  }
  const ringGeo = keep(new THREE.PlaneGeometry(1.7, 1.7)); ringGeo.rotateX(-Math.PI / 2);
  const ringMesh = new THREE.InstancedMesh(ringGeo, ringMat, pads.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), v3 = new THREE.Vector3();
  pads.forEach((p, i) => {
    m4.compose(v3.set(p.x, 0, p.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.3), sc); padMeshes.forEach((m) => m.setMatrixAt(i, m4));
    m4.compose(v3.set(p.x, 0.2, p.z), q.identity(), sc); ringMesh.setMatrixAt(i, m4); padRingState.array[i] = 1;
  });
  padMeshes.forEach((m) => group.add(m)); ringMesh.renderOrder = 3; ringMesh.frustumCulled = false; group.add(ringMesh);

  // ---- the Hold + spawn rifts
  const hp = P[0], ho = posAt(hp, hp.len - 0.01);
  const holdYaw = Math.atan2(-ho.tz, ho.tx);
  const hold = new THREE.Group(); meshesFor(holdModel()).forEach((m) => hold.add(m));
  hold.position.set(ho.x - ho.tx * 1.6, 0, ho.z - ho.tz * 1.6); hold.rotation.y = holdYaw; group.add(hold);
  const riftMat = keep(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  const riftPulse = uniform(0);
  {
    const c = uv().sub(0.5), d = length(c).mul(2), ang = atan(c.y, c.x);
    const sw = sin(ang.mul(5).add(d.mul(9)).sub(time.mul(2.6))).mul(0.5).add(0.5);
    const core = float(1).sub(smoothstep(0.0, 0.85, d));
    const rim = smoothstep(0.62, 0.86, d).mul(smoothstep(1.0, 0.88, d));
    const colr = mix(vec3(0.05, 0.0, 0.1), vec3(0.9, 0.35, 1.6), sw.mul(0.6).mul(core)).add(vec3(1.2, 0.5, 2.4).mul(rim).mul(riftPulse.mul(1.5).add(1)));
    riftMat.colorNode = colr; riftMat.opacityNode = clamp(core.mul(0.95).add(rim), 0, 1).mul(smoothstep(1.0, 0.92, d));
  }
  const rifts = map.spawns.map((sp) => {
    const Pp = P[sp.path], o = posAt(Pp, 0.4);
    const g = new THREE.Group();
    const disc = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.9, 2.2)), riftMat); disc.position.y = 1.1; g.add(disc);
    const rk = new THREE.Group(); meshesFor(propModel('rock', 5)).forEach((m) => rk.add(m)); rk.scale.setScalar(0.8); rk.position.set(-1.25, 0, 0.1); g.add(rk);
    const rk2 = rk.clone(); rk2.position.set(1.25, 0, -0.1); rk2.rotation.y = 2; g.add(rk2);
    g.position.set(o.x, 0, o.z); g.rotation.y = Math.atan2(o.tx, o.tz); group.add(g); // disc faces down the road
    return { group: g, disc, x: o.x, z: o.z };
  });

  // ---- props: lantern posts along the road + biome scatter
  const placed = [];
  const okSpot = (x, z, r) => Math.abs(x) < EXTENT.x - 0.4 && Math.abs(z) < EXTENT.z - 0.4 && padDist(x, z) > 1.35 + r && !waters.some((w) => Math.hypot(w.x - x, w.z - z) < w.r + 0.5 + r)
    && Math.hypot(hold.position.x - x, hold.position.z - z) > 3.2 && !rifts.some((rf) => Math.hypot(rf.x - x, rf.z - z) < 2) && !placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + r);
  const posts = [];
  for (const Pp of P) for (let s = 2.5, side = 1; s < Pp.len - 2.5; s += 5.2, side = -side) {
    const o = posAt(Pp, s), x = o.x - o.tz * 1.12 * side, z = o.z + o.tx * 1.12 * side;
    if (roadDist(x, z) < 0.95 || !okSpot(x, z, 0.2)) continue;
    posts.push({ x, z, yaw: Math.atan2(o.tx, o.tz) + (side > 0 ? Math.PI : 0) }); placed.push({ x, z, r: 0.3 });
  }
  const scatter = [];
  const kinds = Object.entries(B.props), wsum = kinds.reduce((a, [, w]) => a + w, 0);
  for (let i = 0; i < 2600 && scatter.length < 230; i++) {
    const x = (rng() - 0.5) * 2 * (EXTENT.x - 0.5), z = (rng() - 0.5) * 2 * (EXTENT.z - 0.5);
    const e = Math.max(Math.abs(x) / EXTENT.x, Math.abs(z) / EXTENT.z);
    const rd = roadDist(x, z);
    let r = rng() * wsum, kind = kinds[0][0]; for (const [k, w] of kinds) { r -= w; if (r <= 0) { kind = k; break; } }
    const big = !['grass', 'mushroom', 'bush', 'crystal'].includes(kind);
    const rad = big ? 0.55 : 0.25;
    if (rd < (big ? 1.5 : 1.05)) continue;
    const pAccept = big ? (0.12 + smooth(0.7, 0.98, e) * 0.9 + smooth(3.5, 6, rd) * 0.35) : 0.5;
    if (rng() > pAccept) continue;
    if (!okSpot(x, z, rad)) continue;
    placed.push({ x, z, r: rad });
    scatter.push({ kind, x, z, y: heightAt(x, z, rd), s: (big ? 0.85 : 0.8) + rng() * 0.5, yaw: rng() * 6.28 });
  }
  const byKind = new Map();
  for (const s of scatter) { if (!byKind.has(s.kind)) byKind.set(s.kind, []); byKind.get(s.kind).push(s); }
  if (posts.length) byKind.set('lanternpost', posts.map((p) => ({ ...p, y: 0, s: 1 })));
  const propMeshes = [];
  const ic = new THREE.Color();
  for (const [kind, list] of byKind) {
    const ms = instanced(propModel(kind, kind.length * 13), list.length, { shadow: !['grass', 'mushroom'].includes(kind) });
    list.forEach((s, i) => {
      m4.compose(v3.set(s.x, s.y - 0.02, s.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw), sc.setScalar(s.s));
      ic.setHSL(0, 0, 0.86 + rng() * 0.22);
      for (const m of ms) { m.setMatrixAt(i, m4); if (m.material === materials().solid) m.setColorAt(i, ic); }
    });
    sc.set(1, 1, 1);
    ms.forEach((m) => { m.computeBoundingSphere(); group.add(m); propMeshes.push(m); });
  }

  // ---- ambient particles (fireflies / snow / embers): one instanced billboard set
  // FABLE: music/ambience — per-biome soundscape (crickets + owls / ice creak + wind / lava bubbling) layered with the music bed.
  const AMB = { fireflies: 34, snow: 170, embers: 90 }[B.ambient];
  const ambMat = keep(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: B.ambient === 'snow' ? THREE.NormalBlending : THREE.AdditiveBlending }));
  {
    const d = length(uv().sub(0.5)).mul(2), a = pow(clamp(float(1).sub(d), 0, 1), 1.8);
    const c = B.ambient === 'fireflies' ? vec3(2.2, 2.0, 0.5) : B.ambient === 'snow' ? vec3(0.95, 0.97, 1.0) : vec3(3.0, 1.1, 0.3);
    ambMat.colorNode = c.mul(B.ambient === 'snow' ? 1 : a); ambMat.opacityNode = a.mul(B.ambient === 'snow' ? 0.85 : 1);
  }
  const amb = new THREE.InstancedMesh(keep(new THREE.PlaneGeometry(1, 1)), ambMat, AMB);
  amb.frustumCulled = false; amb.renderOrder = 5; group.add(amb);
  const seeds = Array.from({ length: AMB }, () => [(rng() - 0.5) * 2 * EXTENT.x, rng(), (rng() - 0.5) * 2 * EXTENT.z, rng() * 100]);

  // ---- sky
  const skyCols = (SKY_VARIANTS[cfg.sky] || B.sky).map((c) => uniform(new THREE.Color(c)));
  const moonDir = new THREE.Vector3(-0.4, 0.35, -0.85).normalize();
  scene.backgroundNode = (() => {
    const d = positionWorldDirection.normalize(), y = d.y;
    const lo = mix(vec3(skyCols[0]), vec3(skyCols[1]), smoothstep(-0.05, 0.28, y));
    let c = mix(lo, vec3(skyCols[2]), smoothstep(0.25, 0.75, y));
    // below the horizon the island floats over a deep twilight abyss (camera mostly looks down here)
    const abyss = mix(vec3(skyCols[1]).mul(0.55), vec3(skyCols[2]).mul(0.7), smoothstep(-0.15, -0.75, y));
    c = mix(c, abyss, smoothstep(0.02, -0.22, y));
    const md = dot(d, vec3(moonDir.x, moonDir.y, moonDir.z));
    c = c.add(vec3(1.0, 0.95, 0.85).mul(smoothstep(0.9988, 0.9992, md)).mul(2.2)).add(vec3(0.6, 0.55, 0.7).mul(pow(max(md, 0), 60)).mul(0.25));
    const sp = d.mul(90), cell = sp.floor();
    const h = fract(sin(dot(cell, vec3(12.9898, 78.233, 45.164))).mul(43758.5453));
    const star = smoothstep(0.985, 1.0, h).mul(smoothstep(0.15, 0.5, y)).mul(sin(time.mul(h.mul(4)).add(h.mul(30))).mul(0.3).add(0.7));
    return c.add(vec3(star.mul(1.4)));
  })();
  scene.fog = new THREE.Fog(new THREE.Color(B.fog), 34, 95);

  return {
    group, biome: L.biome, B, pads: { meshes: padMeshes, ring: ringMesh, state: padRingState }, hold, rifts, riftPulse, flow, flowCol, heightAt, skyCols, propMeshes,
    setPad(i, v) { padRingState.array[i] = v; padRingState.needsUpdate = true; },
    setSky(name) { const s = SKY_VARIANTS[name] || B.sky; s.forEach((c, i) => skyCols[i].value.set(c)); },
    update(t, dt, cam) {
      if (!settings.reducedMotion || B.ambient === 'snow') {
        const camQ = cam.quaternion;
        for (let i = 0; i < AMB; i++) {
          const s = seeds[i]; let x, y, z, sz;
          if (B.ambient === 'fireflies') { x = s[0] + Math.sin(t * 0.3 + s[3]) * 0.8; z = s[2] + Math.cos(t * 0.23 + s[3] * 2) * 0.8; y = 0.4 + s[1] * 1.6 + Math.sin(t * 0.9 + s[3]) * 0.3; sz = 0.07 * Math.max(0, Math.sin(t * 1.3 + s[3] * 3)); }
          else if (B.ambient === 'snow') { y = 7 - ((t * (0.5 + s[1] * 0.4) + s[3]) % 8); x = s[0] + Math.sin(t * 0.6 + s[3]) * 0.5; z = s[2]; sz = 0.06 + s[1] * 0.04; }
          else { y = ((t * (0.4 + s[1] * 0.5) + s[3]) % 6); x = s[0] + Math.sin(t * 0.8 + s[3]) * 0.4 * y; z = s[2] + Math.cos(t * 0.5 + s[3]) * 0.3 * y; sz = 0.07 * (1 - y / 6); }
          m4.compose(v3.set(x, y, z), camQ, sc.setScalar(Math.max(0.001, sz))); amb.setMatrixAt(i, m4);
        }
        sc.set(1, 1, 1); amb.instanceMatrix.needsUpdate = true;
      }
      riftPulse.value *= Math.pow(0.05, dt);
      for (const rf of rifts) rf.disc.rotation.y = Math.atan2(cam.position.x - rf.x, cam.position.z - rf.z) - rf.group.rotation.y; // y-billboard
    },
    dispose() {
      scene.remove(group);
      group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); if (o.geometry && !disposables.includes(o.geometry)) o.geometry.dispose?.(); });
      for (const d of disposables) d.dispose?.();
    },
  };
}
export { PAL, nearestOnPath };
