// Starwake — procedural art: kitbashed hard-surface ships/stations/gates, TSL planets + sun + gate swirl, asteroids, cockpit, hangar.
import { THREE, canvasTexture } from '/shared/sd-kit.js';
import { Fn, uniform, vec2, vec3, vec4, float, mix, smoothstep, dot, normalize, pow, max, min, abs, clamp, sin, cos, atan, length, uv, time,
  positionLocal, positionWorld, normalWorld, cameraPosition, positionView, normalView, mx_fractal_noise_float, mx_noise_float, exp, fract, step } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './data.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- textures
function noiseFill(g, w, h, r, base, amp, cells = 900) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < cells; i++) { const v = (r() - 0.5) * amp; g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`; const s = 4 + r() * 40; g.fillRect(r() * w, r() * h, s, s * (0.3 + r())); }
}
export const TEX = {};
export function makeTextures() {
  const r = rng(1234);
  TEX.panel = canvasTexture(512, 512, (g, w, h) => {
    noiseFill(g, w, h, r, '#b8b8b8', 0.07);
    // panel grid with random subdivisions
    const split = (x, y, sw, sh, d) => {
      if (d > 3 || (d > 1 && r() < 0.35)) {
        g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.07})`; g.fillRect(x + 2, y + 2, sw - 4, sh - 4);
        g.strokeStyle = 'rgba(20,20,24,.55)'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, sw - 2, sh - 2);
        g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1; g.strokeRect(x + 3, y + 3, sw - 6, sh - 6);
        if (sw > 40 && sh > 40 && r() < 0.4) { g.fillStyle = 'rgba(0,0,0,.35)'; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + 8 + (k % 2) * (sw - 16), y + 8 + (k >> 1) * (sh - 16), 2, 0, 7); g.fill(); } }
        if (r() < 0.08) { g.fillStyle = 'rgba(0,0,0,.4)'; for (let k = 0; k < 6; k++) g.fillRect(x + 6, y + 6 + k * 6, sw * 0.4, 2); }
        return;
      }
      if (r() < 0.5) { const k = 0.3 + r() * 0.4; split(x, y, sw * k, sh, d + 1); split(x + sw * k, y, sw * (1 - k), sh, d + 1); }
      else { const k = 0.3 + r() * 0.4; split(x, y, sw, sh * k, d + 1); split(x, y + sh * k, sw, sh * (1 - k), d + 1); }
    };
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) split(i * 256, j * 256, 256, 256, 0);
    // grime streaks + scorch
    for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(30,25,20,${0.04 + r() * 0.08})`; g.lineWidth = 1 + r() * 4; const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 8, y + 20 + r() * 70); g.stroke(); }
    for (let i = 0; i < 5; i++) { const x = r() * w, y = r() * h, rad = 20 + r() * 50; const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(10,8,6,.35)'); gr.addColorStop(1, 'rgba(10,8,6,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  }, { repeat: [1, 1] });
  TEX.rock = canvasTexture(256, 256, (g, w, h) => { noiseFill(g, w, h, r, '#8a8580', 0.18, 1400); }, { repeat: [1, 1] });
  TEX.glow = canvasTexture(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, { srgb: false });
  TEX.floor = canvasTexture(512, 512, (g, w, h) => {
    noiseFill(g, w, h, r, '#3a3e46', 0.1, 1500);
    g.strokeStyle = 'rgba(10,12,16,.8)'; g.lineWidth = 3; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
    g.fillStyle = 'rgba(255,190,60,.55)'; for (let i = 0; i < 16; i++) { g.save(); g.translate(i * 32, 0); g.transform(1, 0, -0.6, 1, 0, 0); g.fillRect(0, 0, 14, 18); g.restore(); }
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.2})`; g.beginPath(); g.arc(r() * w, r() * h, 10 + r() * 30, 0, 7); g.fill(); }
  }, { repeat: [6, 6] });
  return TEX;
}

// ---------------------------------------------------------------- palettes + materials
export const PALETTES = {
  player: { hull: '#cfc6b6', trim: '#d8802a', dark: '#2c3038', glow: '#ffb070' },
  concord: { hull: '#e2e9f2', trim: '#3a7ad0', dark: '#2a3140', glow: '#8fd0ff' },
  hollows: { hull: '#a99c86', trim: '#e0a030', dark: '#34302a', glow: '#ffc070' },
  veil: { hull: '#6a5f63', trim: '#d8303f', dark: '#2c282d', glow: '#ff5a44' },
  wake: { hull: '#1d3038', trim: '#3ee0d0', dark: '#0c1418', glow: '#6ff7e8' },
  station: { hull: '#c4c8ce', trim: '#d89030', dark: '#30343c', glow: '#ffd890' },
};
const matCache = {};
export function mats(palette = 'player') {
  if (matCache[palette]) return matCache[palette];
  const P = PALETTES[palette] || PALETTES.player;
  const m = {
    hull: new THREE.MeshStandardNodeMaterial({ color: P.hull, map: TEX.panel, metalness: 0.35, roughness: 0.52 }),
    trim: new THREE.MeshStandardNodeMaterial({ color: P.trim, map: TEX.panel, metalness: 0.25, roughness: 0.5 }),
    dark: new THREE.MeshStandardNodeMaterial({ color: P.dark, map: TEX.panel, metalness: 0.55, roughness: 0.42 }),
    glow: new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(P.glow).multiplyScalar(3.2) }),
    glass: new THREE.MeshStandardNodeMaterial({ color: '#0d1a26', metalness: 0.9, roughness: 0.08, emissive: '#06121c' }),
    rock: new THREE.MeshStandardNodeMaterial({ color: '#6c655e', map: TEX.rock, metalness: 0.05, roughness: 0.95 }),
  };
  // rim light: cool fresnel emissive on hulls so dark silhouettes still read against black space at dogfight range
  const rimC = vec3(...new THREE.Color(P.glow).lerp(new THREE.Color('#9cc4ff'), 0.6).toArray());
  const rimK = palette === 'station' || palette === 'hangar' ? 0.12 : palette === 'veil' || palette === 'wake' ? 0.55 : 0.35;
  const rim = Fn(() => { const V = normalize(positionView.negate()); return rimC.mul(pow(float(1).sub(max(dot(normalView, V), 0.0)), 2.6)).mul(rimK); });
  for (const k of ['hull', 'trim', 'dark']) m[k].emissiveNode = rim();
  return (matCache[palette] = m);
}

// ---------------------------------------------------------------- kitbash builder
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = V3();
class Kit {
  constructor() { this.parts = {}; this.engines = []; this.guns = []; this.colliders = []; }
  add(mat, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    tmpM.compose(tmpS.set(x, y, z), tmpQ.setFromEuler(tmpE.set(rx, ry, rz)), V3(sx, sy, sz)); g.applyMatrix4(tmpM);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    (this.parts[mat] ||= []).push(g); return this;
  }
  box(mat, w, h, d, x, y, z, rx, ry, rz) { return this.add(mat, new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz); }
  // along Z (front cap at -Z = rt)
  tube(mat, rt, rb, len, x, y, z, seg = 12, rx = 0, ry = 0) { return this.add(mat, new THREE.CylinderGeometry(rt, rb, len, seg), x, y, z, -Math.PI / 2 + rx, ry, 0); }
  cyl(mat, rt, rb, h, x, y, z, rx, ry, rz, seg = 12) { return this.add(mat, new THREE.CylinderGeometry(rt, rb, h, seg), x, y, z, rx, ry, rz); }
  sphere(mat, r, x, y, z, sx = 1, sy = 1, sz = 1, ws = 16, hs = 10) { return this.add(mat, new THREE.SphereGeometry(r, ws, hs), x, y, z, 0, 0, 0, sx, sy, sz); }
  // box with front (-Z) face scaled by tx/ty: noses, wedges, blades
  wedge(mat, w, h, d, x, y, z, tx = 0.4, ty = 0.4, rx = 0, ry = 0, rz = 0, dy = 0) {
    const g = new THREE.BoxGeometry(w, h, d); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getZ(i) < 0) { p.setX(i, p.getX(i) * tx); p.setY(i, p.getY(i) * ty + dy); }
    g.computeVertexNormals(); return this.add(mat, g, x, y, z, rx, ry, rz);
  }
  // flat wing from an XZ outline, thickness t
  wing(mat, pts, t, y = 0, mirror = true) {
    const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, y - t / 2, 0);
    this.add(mat, g);
    if (mirror) { const g2 = g.clone(); g2.scale(-1, 1, 1); const idx = g2.attributes.position; // flip winding
      for (let i = 0; i < idx.count; i += 3) { for (const a of ['position', 'normal', 'uv']) { const at = g2.attributes[a]; const s = at.itemSize; for (let k = 0; k < s; k++) { const t0 = at.array[i * s + k]; at.array[i * s + k] = at.array[(i + 2) * s + k]; at.array[(i + 2) * s + k] = t0; } } }
      g2.computeVertexNormals(); this.add(mat, g2); }
    return this;
  }
  strut(mat, a, b, r, seg = 6) {
    const A = V3(...a), B = V3(...b); const g = new THREE.CylinderGeometry(r, r, A.distanceTo(B), seg);
    const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), B.clone().sub(A).normalize());
    g.applyQuaternion(q); const c = A.add(B).multiplyScalar(0.5); return this.add(mat, g, c.x, c.y, c.z);
  }
  mirror(fn) { fn(1); fn(-1); return this; }
  engine(x, y, z, r) { this.engines.push({ p: V3(x, y, z), r }); return this; }
  gun(x, y, z) { this.guns.push(V3(x, y, z)); return this; }
  build(M, uvScale = 0.12) {
    const group = new THREE.Group();
    for (const k in this.parts) {
      const g = mergeGeometries(this.parts[k], false); if (!g) continue;
      boxUV(g, k === 'rock' ? uvScale * 0.5 : uvScale);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, M[k]); mesh.name = k; group.add(mesh);
    }
    group.userData.engines = this.engines; group.userData.guns = this.guns;
    return group;
  }
}
function boxUV(g, s) { // world-space box projection so panel texel density is consistent across parts
  const p = g.attributes.position, n = g.attributes.normal, uvA = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (ax >= ay && ax >= az) uvA.setXY(i, z * s, y * s); else if (ay >= az) uvA.setXY(i, x * s, z * s); else uvA.setXY(i, x * s, y * s);
  }
  uvA.needsUpdate = true;
}

// ---------------------------------------------------------------- ships (forward -Z)
const SHIP_BUILDERS = {
  magpie(K) {
    K.box('hull', 4.4, 2.8, 12, 0, 0, 0);
    K.wedge('hull', 4.4, 2.8, 5.5, 0, -0.1, -8.7, 0.62, 0.5, 0, 0, 0, -0.2);
    K.wedge('glass', 2.6, 1.0, 3.2, 0, 1.55, -6.2, 0.7, 0.4, 0.12);
    K.box('trim', 4.5, 0.5, 6, 0, 1.25, 1.5); K.box('dark', 3.2, 0.6, 5, 0, -1.6, 0.5);
    K.mirror((s) => {
      K.tube('trim', 1.35, 1.35, 9, s * 3.7, -0.6, 1); K.tube('dark', 1.0, 1.35, 1.2, s * 3.7, -0.6, -4.1); K.tube('dark', 1.35, 1.0, 1, s * 3.7, -0.6, 6);
      K.wedge('hull', 3.2, 0.35, 4.5, s * 5.6, 0.3, 2.2, 0.5, 1, 0, 0, s * -0.12);
      K.tube('dark', 0.18, 0.18, 2.6, s * 3.7, -0.6, -5.8, 6); K.gun(s * 3.7, -0.6, -7.2);
      K.tube('dark', 1.05, 1.2, 3.2, s * 1.45, 0, 7.4); K.tube('glow', 0.82, 0.82, 0.2, s * 1.45, 0, 9.05, 14); K.engine(s * 1.45, 0, 9.3, 1.0);
      K.box('dark', 0.25, 0.6, 2.2, s * 2.25, 1.5, -2); // vents
    });
    K.wedge('trim', 0.35, 2.4, 3.8, 0, 2.55, 5.2, 1, 1, 0, 0, 0); K.strut('dark', [0.6, 1.4, 3], [1.4, 3.6, 4.5], 0.06);
    K.box('glow', 0.25, 0.12, 0.25, 5.6 + 1.5, 0.35, 2.4); K.box('glow', 0.25, 0.12, 0.25, -5.6 - 1.5, 0.35, 2.4);
  },
  kite(K) {
    K.tube('hull', 0.95, 1.35, 13, 0, 0, 0.5, 14); K.add('hull', new THREE.ConeGeometry(0.95, 4.5, 14), 0, 0, -8.25, -Math.PI / 2);
    K.sphere('glass', 0.85, 0, 0.85, -3.4, 0.9, 0.7, 2.2);
    K.wing('hull', [[1, 5], [7.2, 0.8], [7.4, -0.8], [6.6, -1.2], [1, 1.2]], 0.3, -0.1);
    K.wing('trim', [[3, 3.6], [6.9, 0.5], [7.1, -0.6], [3.5, 1.6]], 0.34, -0.1);
    K.mirror((s) => {
      K.wedge('hull', 0.3, 2.6, 3.5, s * 1.1, 1.8, 5.4, 1, 1, 0, 0, s * -0.32);
      K.tube('dark', 0.15, 0.15, 3, s * 7.1, -0.1, -2.2, 6); K.gun(s * 7.1, -0.1, -3.8); K.box('glow', 0.15, 0.15, 0.6, s * 7.35, -0.1, 0.4);
      K.tube('dark', 0.45, 0.5, 2.4, s * 1.4, -0.8, 2.5); // intakes
    });
    K.tube('dark', 1.25, 1.45, 3, 0, 0, 7.9, 14); K.tube('glow', 1.05, 1.05, 0.2, 0, 0, 9.45, 16); K.engine(0, 0, 9.7, 1.25);
    K.tube('dark', 0.12, 0.12, 2.4, 0, -0.75, -6.5, 6); K.gun(0, -0.75, -7.9);
  },
  ox(K) {
    K.box('dark', 1.8, 1.8, 30, 0, 0, 0);
    const cols = ['trim', 'hull', 'dark', 'hull', 'trim', 'hull'];
    for (let i = 0; i < 3; i++) K.mirror((s) => K.box(cols[i * 2 + (s > 0 ? 0 : 1)], 3.6, 3.6, 5.6, s * 2.8, 0, -8 + i * 6.4));
    K.box('hull', 4.4, 3.2, 5, 0, 0.4, -16.5); K.wedge('hull', 4.4, 3.2, 3, 0, 0.4, -20.4, 0.7, 0.55);
    K.wedge('glass', 3.0, 1.0, 2.4, 0, 1.6, -18.6, 0.8, 0.5, 0.18);
    K.box('hull', 6.4, 4.6, 5, 0, 0, 14.5); K.box('trim', 6.6, 0.5, 2, 0, 2.4, 13);
    for (const [x, y] of [[-1.7, -1.2], [1.7, -1.2], [-1.7, 1.2], [1.7, 1.2]]) { K.tube('dark', 0.9, 1.1, 2.4, x, y, 18); K.tube('glow', 0.75, 0.75, 0.2, x, y, 19.3); K.engine(x, y, 19.5, 0.9); }
    K.mirror((s) => { K.box('dark', 0.2, 3.5, 6, s * 3.5, 2.5, 13.5, 0, 0, s * 0.3); K.tube('dark', 0.16, 0.16, 2, s * 2, -1.6, -21, 6); K.gun(s * 2, -1.6, -22.2); });
    K.strut('dark', [0, 2.2, -16], [0, 5, -15], 0.08);
  },
  halberd(K) {
    K.box('hull', 3.2, 2.2, 10, 0, 0, -2); K.wedge('hull', 3.2, 2.2, 5, 0, 0, -9.5, 0.45, 0.45);
    K.wedge('glass', 2.0, 0.9, 3, 0, 1.3, -5.6, 0.6, 0.4, 0.1);
    K.wedge('trim', 11.5, 0.7, 6, 0, 0, 1.5, 0.75, 1);
    K.mirror((s) => {
      K.box('hull', 1.9, 1.9, 18, s * 5.4, 0, 1.2); K.box('trim', 2.0, 0.4, 6, s * 5.4, 1.0, -3);
      K.tube('dark', 0.24, 0.24, 4.5, s * 5.4, 0, -10, 8); K.gun(s * 5.4, 0, -12.2);
      K.tube('dark', 1.0, 1.25, 2.6, s * 5.4, 0, 11.3); K.tube('glow', 0.85, 0.85, 0.2, s * 5.4, 0, 12.7, 14); K.engine(s * 5.4, 0, 12.9, 1.0);
      K.wedge('hull', 0.3, 2.8, 4.2, s * 5.4, 2.1, 7.6, 1, 1, 0, 0, 0);
      K.wedge('hull', 2.4, 0.25, 1.6, s * 2.3, 0, -7.6, 0.5, 1);
      K.tube('dark', 0.15, 0.15, 2.4, s * 1.2, -0.9, -8.6, 6); K.gun(s * 1.2, -0.9, -9.8);
    });
    K.tube('dark', 0.9, 1.1, 2, 0, 0, 3.8); K.tube('glow', 0.75, 0.75, 0.2, 0, 0, 4.9); K.engine(0, 0, 5.1, 0.85);
  },
  jackal(K) {
    K.sphere('dark', 1, 0, 0, 0, 1.7, 1.5, 3.6); K.add('trim', new THREE.ConeGeometry(0.9, 5, 8), 0, 0, -5.2, -Math.PI / 2);
    K.sphere('glass', 0.6, 0, 0.9, -1.6, 0.9, 0.6, 1.6);
    for (const a of [Math.PI / 2, Math.PI / 2 + 2.094, Math.PI / 2 - 2.094]) {
      const cx = Math.cos(a), cy = Math.sin(a);
      K.wedge('hull', 0.4, 6.2, 5, cx * 3.6, cy * 3.6, 1.4, 1, 0.5, 0, 0, a - Math.PI / 2, 1.4);
      K.box('trim', 0.45, 2.4, 0.5, cx * 4.4, cy * 4.4, 3.4, 0, 0, a - Math.PI / 2);
      K.box('glow', 0.2, 0.2, 1.6, cx * 6.4, cy * 6.4, 0.2, 0, 0, 0);
    }
    K.mirror((s) => { K.tube('dark', 0.13, 0.13, 2.2, s * 1.1, -0.6, -3.6, 6); K.gun(s * 1.1, -0.6, -4.8); });
    K.tube('dark', 0.9, 1.1, 1.6, 0, 0, 3.6); K.tube('glow', 0.8, 0.8, 0.2, 0, 0, 4.45, 12); K.engine(0, 0, 4.6, 1.1);
  },
  marauder(K) {
    K.wedge('hull', 8, 3.4, 16, 0, 0, 0, 0.28, 0.45, 0, 0, 0, -0.3);
    K.box('dark', 6.5, 2.4, 6, 0, 0.2, 6.5);
    K.mirror((s) => {
      K.box('trim', 0.6, 3.4, 11, s * 4.5, -0.2, 0.5, 0, s * 0.12, s * 0.35);
      K.add('dark', new THREE.ConeGeometry(0.45, 3.5, 6), s * 1.2, -0.6, -9.2, -Math.PI / 2);
      K.tube('dark', 0.22, 0.22, 3.4, s * 3, -0.7, -6, 8); K.gun(s * 3, -0.7, -7.8);
      K.tube('dark', 1.0, 1.2, 2.2, s * 2, 0, 10.2); K.tube('glow', 0.85, 0.85, 0.2, s * 2, 0, 11.35, 12); K.engine(s * 2, 0, 11.5, 1.0);
    });
    K.add('dark', new THREE.ConeGeometry(0.6, 4.5, 6), 0, -0.4, -9.8, -Math.PI / 2);
    K.sphere('dark', 1.4, 0, 1.9, -1.5, 1, 0.6, 1); K.tube('dark', 0.18, 0.18, 3, 0, 2.2, -3.6, 6); K.gun(0, 2.2, -5.2);
    K.wedge('glass', 2, 0.8, 2.4, 0, 1.6, -4.4, 0.6, 0.4); K.box('glow', 5.6, 0.15, 0.2, 0, 1.45, 3.5);
  },
  barge(K) {
    K.box('dark', 3, 3, 64, 0, 0, 0);
    for (const a of [Math.PI / 2, Math.PI / 2 + 2.094, Math.PI / 2 - 2.094]) {
      for (let i = 0; i < 3; i++) K.tube(i === 1 ? 'trim' : 'hull', 4.2, 4.2, 15, Math.cos(a) * 5.4, Math.sin(a) * 5.4, -18 + i * 16.5, 16);
    }
    K.box('hull', 8, 6, 9, 0, 3, -34); K.box('hull', 5, 6, 6, 0, 8, -33); K.wedge('glass', 5.2, 1.6, 2, 0, 9.2, -36.3, 0.9, 0.6);
    K.box('hull', 12, 10, 8, 0, 0, 34); K.box('trim', 12.4, 1, 3, 0, 5.2, 32);
    for (const [x, y] of [[-3.5, -2.5], [3.5, -2.5], [0, 3]]) { K.tube('dark', 2, 2.4, 4, x, y, 40); K.tube('glow', 1.7, 1.7, 0.3, x, y, 42.1); K.engine(x, y, 42.4, 2); }
    K.sphere('dark', 1.6, 0, 11.6, -33, 1, 0.6, 1); K.tube('dark', 0.25, 0.25, 4, 0, 11.6, -35.5, 6); K.gun(0, 11.6, -37.5);
    K.mirror((s) => K.box('glow', 0.3, 0.3, 0.3, s * 6.2, 5, 37.5));
  },
  shepherd(K) {
    K.add('dark', new THREE.OctahedronGeometry(3, 0), 0, 0, 0, 0, 0, 0, 1, 1, 1.8);
    K.add('glow', new THREE.OctahedronGeometry(1.3, 0), 0, 0, -2.6, 0, 0, 0, 1, 1, 1.5);
    for (const a of [0, 2.094, 4.188]) {
      K.add('hull', new THREE.TorusGeometry(5.2, 0.32, 5, 18, 1.7), 0, 0, 0, 0, 0, a);
      K.box('trim', 0.5, 0.5, 4, Math.cos(a + 0.85) * 5.2, Math.sin(a + 0.85) * 5.2, 0.5);
    }
    K.mirror((s) => { K.gun(s * 1.2, 0, -5); K.box('glow', 0.3, 0.3, 1.4, s * 1.2, 0, -4.6); });
    K.engine(0, 0, 5.2, 1.4); K.add('glow', new THREE.OctahedronGeometry(0.9, 0), 0, 0, 5.1);
  },
  capital(K) {
    K.wedge('hull', 52, 30, 190, 0, 0, 0, 0.3, 0.45, 0, 0, 0, -4);
    K.box('dark', 62, 34, 40, 0, 0, 105); K.box('trim', 63, 4, 22, 0, 15, 98);
    K.box('hull', 22, 18, 40, 0, 22, 50); K.box('hull', 14, 14, 18, 0, 36, 56); K.wedge('glass', 13, 4, 6, 0, 40, 45, 0.9, 0.7);
    K.mirror((s) => {
      K.box('hull', 14, 18, 80, s * 32, -2, 40); K.box('trim', 2, 18.5, 40, s * 39.2, -2, 30);
      K.box('dark', 6, 6, 18, s * 26, -14, -40); K.strut('dark', [s * 8, 30, 50], [s * 14, 52, 58], 0.8);
      for (let i = 0; i < 5; i++) K.box('glow', 0.6, 1.2, 4, s * 39.5, 3 - (i % 2) * 6, 0 + i * 15);
    });
    for (const [x, y] of [[-20, -8], [0, -8], [20, -8], [-11, 8], [11, 8]]) { K.tube('dark', 8, 9.5, 12, x, y, 130); K.tube('glow', 7, 7, 0.5, x, y, 136.4, 18); K.engine(x, y, 137, 8); }
    K.box('glow', 20, 4, 1, 0, -12, -80);
  },
};
export const SHIP_LEN = { magpie: 20, kite: 18, ox: 42, halberd: 26, jackal: 13, marauder: 24, barge: 86, shepherd: 13, capital: 275 };
const shipProto = {};
export function shipModel(cls, palette) {
  const key = cls + ':' + palette;
  if (!shipProto[key]) { const K = new Kit(); SHIP_BUILDERS[cls](K); shipProto[key] = K.build(mats(palette), cls === 'capital' ? 0.02 : 0.12); }
  const proto = shipProto[key];
  const g = new THREE.Group();
  for (const c of proto.children) g.add(new THREE.Mesh(c.geometry, c.material));
  g.userData.engines = proto.userData.engines; g.userData.guns = proto.userData.guns;
  if (cls === 'shepherd') { const ring = new THREE.Mesh(RING_GEO ||= new THREE.TorusGeometry(7.5, 0.18, 4, 40), mats(palette).glow); g.add(ring); g.userData.spin = ring; }
  return g;
}
let RING_GEO = null;
export function turretModel(palette) {
  const K = new Kit(); K.sphere('dark', 4, 0, 0, 0, 1, 0.6, 1); K.box('hull', 6, 2.5, 6, 0, 1.4, 0); K.mirror((s) => K.tube('dark', 0.6, 0.6, 9, s * 1.4, 1.6, -5.5, 8)); K.box('glow', 1, 0.6, 0.6, 0, 2.6, -2.6);
  return K.build(mats(palette));
}
export function generatorModel(palette) {
  const K = new Kit(); K.cyl('dark', 5, 7, 4, 0, 0, 0); K.sphere('glow', 4.5, 0, 3, 0, 1, 0.8, 1); K.mirror((s) => K.box('trim', 1, 6, 1, s * 6, 2, 0));
  return K.build(mats(palette));
}

// ---------------------------------------------------------------- stations (docking bay mouth at local +Z, ~ (0,0,bayZ))
export function stationModel(type, faction, seed) {
  const r = rng(seed); const pal = faction === 'veil' ? 'veil' : faction === 'hollows' ? 'hollows' : 'station';
  const M = mats(pal); const K = new Kit(); const ring = new Kit();
  const colliders = []; const C = (x, y, z, rad) => colliders.push({ p: V3(x, y, z), r: rad });
  const bayZ = 95;
  if (type !== 'pirate') {
    K.tube('hull', 55, 55, 150, 0, 0, 0, 24); K.tube('dark', 30, 55, 20, 0, 0, -85, 24); K.tube('trim', 57, 57, 12, 0, 0, 40, 24);
    K.box('dark', 70, 40, 30, 0, 0, 82); // bay block
    C(0, 0, 0, 62); C(0, 0, 60, 50); C(0, 0, -70, 50);
  }
  // bay frame + guide lights
  K.box('hull', 78, 6, 34, 0, 23, 84); K.box('hull', 78, 6, 34, 0, -23, 84); K.mirror((s) => K.box('hull', 6, 46, 34, s * 39, 0, 84));
  K.box('glow', 72, 1.2, 1.2, 0, 19.6, bayZ + 6); K.box('glow', 72, 1.2, 1.2, 0, -19.6, bayZ + 6);
  for (let i = 0; i < 8; i++) K.mirror((s) => K.box('glow', 1.6, 1.6, 1.6, s * 34, -19, bayZ + 30 + i * 22));
  for (let i = 0; i < 8; i++) K.strut('dark', [-34, -21, bayZ + 30 + i * 22], [34, -21, bayZ + 30 + i * 22], 0.6, 4);
  K.mirror((s) => K.strut('dark', [s * 34, -21, bayZ + 26], [s * 34, -21, bayZ + 190], 1.2));
  const box = (m, w, h, d, x, y, z, rx, ry, rz) => { K.box(m, w, h, d, x, y, z, rx, ry, rz); };
  if (type === 'mining') {
    K.add('rock', jitter(new THREE.IcosahedronGeometry(150, 2), seed, 0.35), 0, 20, -230); C(0, 20, -230, 150);
    for (let i = 0; i < 5; i++) { const a = i * 1.256 + r(); const x = Math.cos(a) * 150, y = Math.sin(a) * 150 + 20; K.strut('dark', [x * 0.4, y * 0.4, -120], [x, y, -200 + r() * 60], 6); K.add('trim', new THREE.ConeGeometry(14, 40, 8), x, y, -205, Math.PI / 2); }
    for (let i = 0; i < 3; i++) K.strut('trim', [0, 0, -70], [(r() - 0.5) * 200, (r() - 0.5) * 200, -180], 4);
    K.mirror((s) => { box('dark', 8, 120, 60, s * 110, 0, -20); box('glow', 2, 100, 2, s * 114.5, 0, -20); K.strut('dark', [s * 55, 0, -20], [s * 106, 0, -20], 6); });
  } else if (type === 'agri') {
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4; const x = Math.cos(a) * 150, y = Math.sin(a) * 150;
      K.tube('hull', 34, 34, 220, x, y, -30, 16); K.tube('trim', 36, 36, 14, x, y, -130, 16); K.tube('trim', 36, 36, 14, x, y, 70, 16);
      for (let k = 0; k < 4; k++) { const b = k * Math.PI / 2 + a; K.box('glow', 2, 2, 190, x + Math.cos(b) * 34.5, y + Math.sin(b) * 34.5, -30); }
      K.strut('dark', [x * 0.3, y * 0.3, -30], [x * 0.78, y * 0.78, -30], 8); C(x, y, -30, 40); C(x, y, 50, 40); C(x, y, -110, 40);
      K.box('glass', 2, 90, 150, x + Math.cos(a) * 62, y + Math.sin(a) * 62, -30, 0, 0, a); K.box('trim', 3, 92, 4, x + Math.cos(a) * 62, y + Math.sin(a) * 62, 46, 0, 0, a);
    }
  } else if (type === 'industrial') {
    for (let i = 0; i < 6; i++) { const a = i * 1.047; K.sphere(i % 2 ? 'trim' : 'hull', 34, Math.cos(a) * 120, Math.sin(a) * 120, -60); C(Math.cos(a) * 120, Math.sin(a) * 120, -60, 36); K.strut('dark', [Math.cos(a) * 50, Math.sin(a) * 50, -60], [Math.cos(a) * 95, Math.sin(a) * 95, -60], 5); }
    for (let i = 0; i < 6; i++) { const z = -160 + i * 50; K.mirror((s) => { K.strut('dark', [s * 70, 70, z], [s * 70, -70, z], 3); K.strut('dark', [s * 70, 70, z], [s * 70, -70, z + 50], 2); }); K.strut('dark', [-70, 70, z], [70, 70, z], 3); }
    K.box('dark', 150, 4, 300, 0, 72, -60); K.box('glow', 140, 1, 1, 0, 74.6, -60);
    K.mirror((s) => { for (let i = 0; i < 4; i++) box('dark', 2, 70, 30, s * (160 + i * 8), 0, -150 + i * 4); });
  } else if (type === 'tech') {
    K.tube('dark', 8, 8, 260, 0, 0, -200, 10); K.sphere('hull', 26, 0, 0, -330); K.add('glow', new THREE.TorusGeometry(40, 2, 6, 40), 0, 0, -330);
    K.mirror((s) => { K.sphere('trim', 22, s * 90, 60, -40, 1, 0.3, 1); K.strut('dark', [s * 40, 30, -40], [s * 90, 60, -40], 4); C(s * 90, 60, -40, 24); });
    for (let i = 0; i < 6; i++) { const a = i * 1.047; K.box('dark', 100, 2, 36, Math.cos(a) * 120, Math.sin(a) * 120, -150, 0, 0, a); }
    C(0, 0, -330, 30);
  } else if (type === 'pirate') {
    K.add('rock', jitter(new THREE.IcosahedronGeometry(130, 2), seed, 0.4), 0, 0, -60); C(0, 0, -60, 125);
    K.add('rock', jitter(new THREE.IcosahedronGeometry(70, 1), seed + 3, 0.45), 120, 60, -150); C(120, 60, -150, 68);
    K.add('rock', jitter(new THREE.IcosahedronGeometry(55, 1), seed + 5, 0.45), -110, -40, -120); C(-110, -40, -120, 52);
    K.box('dark', 70, 40, 60, 0, 0, 60); C(0, 0, 50, 45);
    for (let i = 0; i < 12; i++) { const a = r() * 6.28, b = (r() - 0.5) * 2; const p = V3(Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)).multiplyScalar(128); p.z -= 60; K.box(r() < 0.5 ? 'dark' : 'hull', 14 + r() * 20, 10 + r() * 10, 14 + r() * 20, p.x, p.y, p.z, r(), r(), r()); K.box('glow', 4, 4, 4, p.x * 1.03, p.y * 1.03, p.z + 2); }
    for (let i = 0; i < 5; i++) K.strut('dark', [(r() - 0.5) * 100, 120, -60 + (r() - 0.5) * 60], [(r() - 0.5) * 160, 230 + r() * 60, -60], 1.5);
    K.strut('trim', [0, 0, 30], [120, 60, -150], 5); K.strut('trim', [0, 0, 30], [-110, -40, -120], 5);
  }
  // bay atmosphere field (soft blue glow in the mouth)
  const field = new THREE.Mesh(new THREE.PlaneGeometry(70, 38), BAYFIELD ||= new THREE.MeshBasicNodeMaterial({ color: new THREE.Color('#3a7ab8').multiplyScalar(0.9), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  field.position.set(0, 0, 97.4);
  // rotating habitat ring (skip on pirate rocks)
  let ringMesh = null;
  if (type !== 'pirate' && type !== 'agri') {
    ring.add('hull', new THREE.TorusGeometry(230, 16, 12, 64), 0, 0, 0);
    ring.add('trim', new THREE.TorusGeometry(230, 16.6, 12, 64, 0.5), 0, 0, 0);
    for (let i = 0; i < 6; i++) { const a = i * 1.047; ring.strut('dark', [Math.cos(a) * 55, Math.sin(a) * 55, 0], [Math.cos(a) * 216, Math.sin(a) * 216, 0], 5); }
    for (let i = 0; i < 24; i++) { const a = i * 0.2618; ring.box('glow', 6, 3, 2, Math.cos(a) * 230, Math.sin(a) * 230, 16.4, 0, 0, a + Math.PI / 2); }
    ringMesh = ring.build(M, 0.03); ringMesh.position.z = -20;
    for (let i = 0; i < 28; i++) { const a = i * 0.2244; C(Math.cos(a) * 230, Math.sin(a) * 230, -20, 22); }
  }
  // antennas + beacons
  K.strut('dark', [0, 55, 0], [0, 140, -10], 2); K.box('glow', 5, 5, 5, 0, 142, -10);
  const g = K.build(M, 0.03); g.add(field);
  if (ringMesh) { g.add(ringMesh); g.userData.ring = ringMesh; }
  g.userData.colliders = colliders; g.userData.bay = V3(0, 0, bayZ + 4); g.userData.bayOut = V3(0, 0, bayZ + 260);
  return g;
}
let BAYFIELD = null;
export function jitter(geo, seed, scale) {
  const p = geo.attributes.position; const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(2)},${p.getY(i).toFixed(2)},${p.getZ(i).toFixed(2)}`; // weld duplicates so the rock stays closed
    let f = map.get(k);
    if (f === undefined) { let h = (seed * 374761393 + map.size * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h = (h ^ (h >>> 16)) >>> 0; f = 1 + (h / 4294967296 - 0.5) * scale; map.set(k, f); }
    p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.85, p.getZ(i) * f);
  }
  geo.computeVertexNormals(); return geo;
}

// ---------------------------------------------------------------- jump gate
export function gateModel(color = '#7ad8ff') {
  const M = mats('station'); const K = new Kit();
  K.add('dark', new THREE.TorusGeometry(140, 9, 10, 64)); K.add('hull', new THREE.TorusGeometry(140, 9.6, 10, 64, 0.6), 0, 0, 0, 0, 0, 0.3);
  for (let i = 0; i < 6; i++) { const a = i * 1.047; K.box('hull', 22, 34, 26, Math.cos(a) * 150, Math.sin(a) * 150, 0, 0, 0, a); K.box('trim', 23, 6, 27, Math.cos(a) * 160, Math.sin(a) * 160, 0, 0, 0, a); K.box('glow', 4, 4, 28, Math.cos(a) * 168, Math.sin(a) * 168, 0, 0, 0, a); }
  const g = K.build(M, 0.03);
  const glowMat = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(color).multiplyScalar(3) });
  g.add(new THREE.Mesh(new THREE.TorusGeometry(130, 2.2, 6, 72), glowMat));
  const col = uniform(new THREE.Color(color));
  const sw = new THREE.MeshBasicNodeMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  sw.colorNode = Fn(() => {
    const c = uv().sub(0.5).mul(2); const r = length(c); const a = atan(c.y, c.x).add(r.mul(5)).sub(time.mul(0.7));
    const n = mx_fractal_noise_float(vec3(cos(a).mul(2), sin(a).mul(2), r.mul(3).sub(time.mul(0.4))), 4, 2.0, 0.5);
    const edge = float(1).sub(smoothstep(0.8, 1.0, r));
    const k = edge.mul(n.mul(1.4).add(0.35)).mul(smoothstep(0.0, 0.5, r).mul(0.7).add(0.3));
    return col.mul(max(k, 0)).mul(1.3);
  })();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(129, 48), sw); g.add(disc);
  g.userData.colU = col;
  return g;
}

// ---------------------------------------------------------------- celestial: planets, rings, sun
export const sunDirU = uniform(new THREE.Vector3(0.5, 0.3, -0.8).normalize());
const PLANET_LOOKS = {
  terran: { ocean: '#0c3a6a', low: '#3f6a34', high: '#8a7a58', ice: '#e8eef4', sea: 0.02, iceLat: 0.78, cloud: 0.75, atmo: '#5aa8ff', lights: 1, lava: 0 },
  ocean: { ocean: '#0a3e72', low: '#2c7a6a', high: '#c8c098', ice: '#eaf2f8', sea: 0.22, iceLat: 0.82, cloud: 0.85, atmo: '#58b8ff', lights: 0.4, lava: 0 },
  desert: { ocean: '#7a4a2a', low: '#c08a50', high: '#e8c890', ice: '#f0e8dc', sea: -0.18, iceLat: 0.92, cloud: 0.25, atmo: '#ffb878', lights: 0.6, lava: 0 },
  ice: { ocean: '#4a6a88', low: '#9fb4c8', high: '#cfdbe8', ice: '#e2eaf3', sea: -0.06, iceLat: 0.5, cloud: 0.45, atmo: '#a8d8ff', lights: 0, lava: 0 },
  lava: { ocean: '#1a0e0a', low: '#2a1a14', high: '#4a3428', ice: '#3a2a22', sea: -0.03, iceLat: 2, cloud: 0.2, atmo: '#ff7040', lights: 0, lava: 1 },
  barren: { ocean: '#4a4440', low: '#6a625a', high: '#9a9086', ice: '#c8c4c0', sea: -0.3, iceLat: 0.9, cloud: 0, atmo: '#9a9aa8', lights: 0, lava: 0 },
  gas: { ocean: '#c8a070', low: '#e8d0a8', high: '#9a5a3a', ice: '#f0e4d0', sea: 0, iceLat: 2, cloud: 0, atmo: '#ffd8a0', lights: 0, lava: 0, gas: 1 },
  wake: { ocean: '#062028', low: '#0a3a40', high: '#40e0d0', ice: '#c8fff8', sea: 0, iceLat: 2, cloud: 0, atmo: '#6ff7e8', lights: 0, lava: 0, gas: 1 },
};
export function planetModel(pl, hueShift = 0) {
  const L = { ...PLANET_LOOKS[pl.type] || PLANET_LOOKS.barren };
  const shift = (hex) => { const c = new THREE.Color(hex); const hsl = {}; c.getHSL(hsl); c.setHSL((hsl.h + hueShift + 1) % 1, hsl.s, hsl.l); return c; };
  const ocean = vec3(...shift(L.ocean).toArray()), low = vec3(...shift(L.low).toArray()), high = vec3(...shift(L.high).toArray()), ice = vec3(...new THREE.Color(L.ice).toArray());
  const atmo = new THREE.Color(L.atmo); const atmoV = vec3(...atmo.toArray());
  const s = pl.seed % 1000; const off = vec3(s * 0.37, s * 0.11, s * 0.23);
  const sea = float(L.sea), iceLat = float(L.iceLat), cloudAmt = float(L.cloud), lightsAmt = float(L.lights), lavaAmt = float(L.lava);
  const center = uniform(new THREE.Vector3());
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.colorNode = Fn(() => {
    const n = positionLocal.normalize(); const p = n.mul(2.0).add(off);
    const N = normalize(positionWorld.sub(center)); const Ld = sunDirU; const V = normalize(cameraPosition.sub(positionWorld));
    const ndl = dot(N, Ld); const diff = max(ndl, 0.0); const day = smoothstep(-0.12, 0.3, ndl);
    let surf, land;
    if (L.gas) {
      const w = mx_fractal_noise_float(p.mul(vec3(1.2, 3.0, 1.2)), 4, 2.0, 0.5);
      const b = sin(n.y.mul(22.0).add(w.mul(6.0))).mul(0.5).add(0.5);
      const b2 = sin(n.y.mul(7.0).add(w.mul(3.0)).add(1.3)).mul(0.5).add(0.5);
      surf = mix(mix(ocean, low, b), high, smoothstep(0.55, 0.95, b2).mul(0.7));
      land = float(0);
    } else {
      const h = mx_fractal_noise_float(p, 6, 2.0, 0.5).add(mx_fractal_noise_float(p.mul(5.0), 3, 2.0, 0.5).mul(0.18));
      land = smoothstep(sea.sub(0.015), sea.add(0.015), h);
      const landCol = mix(low, high, smoothstep(sea, sea.add(0.28), h));
      surf = mix(ocean.mul(mix(float(0.7), float(1.1), smoothstep(sea.sub(0.3), sea, h))), landCol, land);
      const icy = smoothstep(iceLat.sub(0.04), iceLat.add(0.04), abs(n.y).add(h.mul(0.25)));
      surf = mix(surf, ice, icy);
    }
    let col = surf.mul(diff.mul(1.2).add(0.012));
    // ocean glint
    const H = normalize(Ld.add(V)); col = col.add(vec3(1.0, 0.95, 0.85).mul(pow(max(dot(N, H), 0.0), 70.0)).mul(float(1).sub(land)).mul(day).mul(L.gas ? 0.0 : 0.55));
    // clouds
    const c = mx_fractal_noise_float(p.mul(1.6).add(vec3(time.mul(0.006), 0, time.mul(0.002))), 5, 2.0, 0.55);
    const cloud = smoothstep(0.02, 0.32, c).mul(cloudAmt);
    col = mix(col, vec3(0.95, 0.96, 1.0).mul(diff.mul(1.4).add(0.01)), cloud);
    // night lights + lava
    const city = step(0.5, mx_noise_float(p.mul(34.0))).mul(smoothstep(0.15, 0.35, mx_noise_float(p.mul(4.0)))).mul(land).mul(float(1).sub(day)).mul(float(1).sub(cloud)).mul(lightsAmt);
    col = col.add(vec3(1.0, 0.7, 0.35).mul(city).mul(0.55));
    const crack = float(1).sub(smoothstep(0.0, 0.07, abs(mx_fractal_noise_float(p.mul(2.2).add(7.0), 2, 2.0, 0.5)))).mul(lavaAmt).mul(smoothstep(-0.1, 0.2, mx_noise_float(p.mul(1.3))));
    col = col.add(vec3(2.2, 0.6, 0.12).mul(crack).mul(mix(float(0.25), float(1), float(1).sub(day))));
    // limb glow
    const fres = pow(float(1).sub(max(dot(N, V), 0.0)), 3.0);
    col = col.add(atmoV.mul(fres).mul(smoothstep(-0.25, 0.5, ndl)).mul(1.4));
    return col;
  })();
  const R = pl.radius;
  const body = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), mat);
  const g = new THREE.Group(); g.add(body);
  // atmosphere halo: back-side shell; brightness from traversed-atmosphere approximation
  if (pl.type !== 'barren') {
    const k = 1 / Math.sqrt(1 - 1 / (1.07 * 1.07));
    const am = new THREE.MeshBasicNodeMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide });
    am.colorNode = Fn(() => {
      const d = normalize(positionWorld.sub(center)); const V = normalize(cameraPosition.sub(positionWorld));
      const t = clamp(abs(dot(d, V)).mul(k), 0.0, 1.0);
      return atmoV.mul(pow(t, 2.2)).mul(smoothstep(-0.35, 0.45, dot(d, sunDirU))).mul(1.1);
    })();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.07, 64, 40), am));
  }
  if (pl.rings) {
    const rm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const inner = R * 1.35, outer = R * 2.3;
    rm.colorNode = Fn(() => { const rr = length(positionLocal.xy).sub(inner).div(outer - inner); const b = mx_noise_float(vec2(rr.mul(60.0), 0.5)).mul(0.5).add(0.5); return mix(low, high, b).mul(0.9); })();
    rm.opacityNode = Fn(() => { const rr = length(positionLocal.xy).sub(inner).div(outer - inner); const b = mx_noise_float(vec2(rr.mul(23.0), 3.5)).mul(0.5).add(0.5); return smoothstep(0.0, 0.08, rr).mul(float(1).sub(smoothstep(0.85, 1.0, rr))).mul(b.mul(0.7).add(0.15)); })();
    const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 128, 1), rm); ring.rotation.x = Math.PI / 2 - 0.35; ring.rotation.y = 0.2; g.add(ring);
  }
  g.userData.center = center; g.userData.radius = R;
  return g;
}
export function sunSprite(color, size) {
  const m = new THREE.SpriteNodeMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true });
  const col = uniform(new THREE.Color(color));
  m.colorNode = Fn(() => {
    const c = uv().sub(0.5).mul(2); const r = length(c); const a = atan(c.y, c.x);
    const core = float(1).sub(smoothstep(0.06, 0.075, r)).mul(14.0);
    const glow = exp(r.mul(-9.0)).mul(3.0).add(pow(max(float(1).sub(r), 0.0), 3.0).mul(0.5));
    const rays = mx_noise_float(vec3(cos(a).mul(4.0), sin(a).mul(4.0), time.mul(0.05))).mul(0.5).add(0.5);
    const corona = pow(rays, 3.0).mul(exp(r.mul(-4.0))).mul(1.6).mul(smoothstep(0.06, 0.12, r));
    return vec4(col.mul(core.add(glow).add(corona)), 1.0);
  })();
  const s = new THREE.Sprite(m); s.scale.setScalar(size); s.userData.col = col; return s;
}

// ---------------------------------------------------------------- asteroids (InstancedMesh per rock shape)
export function asteroidField(seed, count = 240, radius = 1500) {
  const r = rng(seed); const group = new THREE.Group(); const rocks = [];
  const geos = [0, 1, 2].map((i) => { const g = jitter(new THREE.IcosahedronGeometry(1, 1), seed + i * 13, 0.55); return g; });
  const M = new THREE.MeshStandardNodeMaterial({ color: '#7a7068', map: TEX.rock, metalness: 0.05, roughness: 0.95, flatShading: true });
  const meshes = geos.map((g) => { const m = new THREE.InstancedMesh(g, M, Math.ceil(count / 3)); m.count = 0; group.add(m); return m; });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = V3(), s = V3();
  const tint = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const a = r() * 6.28, d = Math.pow(r(), 0.6) * radius, y = (r() - 0.5) * radius * 0.35;
    p.set(Math.cos(a) * d, y, Math.sin(a) * d);
    const size = 6 + Math.pow(r(), 3) * 90; s.set(size, size * (0.7 + r() * 0.5), size * (0.8 + r() * 0.4));
    q.setFromEuler(e.set(r() * 6, r() * 6, r() * 6));
    m4.compose(p, q, s); const mesh = meshes[i % 3]; const idx = mesh.count++;
    mesh.setMatrixAt(idx, m4); tint.setHSL(0.07 + r() * 0.05, 0.12 + r() * 0.1, 0.32 + r() * 0.25); mesh.setColorAt(idx, tint);
    rocks.push({ mesh, idx, p: p.clone(), r: size * 0.95, hp: size * 3, alive: true, q: q.clone(), s: s.clone() });
  }
  for (const m of meshes) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); }
  group.userData.rocks = rocks;
  return group;
}

// ---------------------------------------------------------------- cockpit (camera space: eye at origin, looking -Z)
export function cockpitModel(palette = 'player', screens) {
  const P = PALETTES[palette] || PALETTES.player;
  const M = {
    hull: new THREE.MeshStandardNodeMaterial({ color: '#55585f', map: TEX.panel, metalness: 0.35, roughness: 0.6 }),
    trim: new THREE.MeshStandardNodeMaterial({ color: P.trim, map: TEX.panel, metalness: 0.3, roughness: 0.55 }),
    dark: new THREE.MeshStandardNodeMaterial({ color: '#1a1c21', map: TEX.panel, metalness: 0.45, roughness: 0.55 }),
    glow: new THREE.MeshBasicNodeMaterial({ color: new THREE.Color('#ffb070').multiplyScalar(2.2) }),
    glow2: new THREE.MeshBasicNodeMaterial({ color: new THREE.Color('#6ad8ff').multiplyScalar(1.6) }),
  };
  const root = new THREE.Group();
  // frame: glare-shield cowl, canopy bows, A-pillars, sills (merged)
  const K = new Kit();
  K.wedge('dark', 2.9, 0.07, 0.5, 0, -0.315, -1.16, 0.9, 1);
  K.box('trim', 2.6, 0.01, 0.016, 0, -0.278, -1.41);
  K.mirror((s) => {
    K.strut('hull', [s * 1.3, -0.34, -1.25], [s * 0.98, 0.4, -1.08], 0.03);
    K.strut('hull', [s * 0.98, 0.4, -1.08], [s * 0.42, 0.66, -0.92], 0.028);
    K.strut('hull', [s * 0.98, 0.4, -1.08], [s * 1.25, 0.46, 0.3], 0.028);
    K.strut('dark', [s * 1.32, -0.36, -1.2], [s * 1.36, -0.36, 0.4], 0.05);
    K.box('hull', 0.55, 0.6, 1.3, s * 1.28, -0.66, -0.45, 0, 0, s * 0.4);
  });
  K.strut('hull', [-0.42, 0.66, -0.92], [0.42, 0.66, -0.92], 0.028);
  K.strut('hull', [0, 0.66, -0.92], [0, 0.82, 0.4], 0.022);
  root.add(K.build(M, 2.4));
  // FABLE: pilot hands on stick + throttle, animated with player input
  // instrument panel group (tilted back toward the pilot), sized so all three MFDs sit fully on screen
  const panel = new THREE.Group(); panel.position.set(0, -0.475, -0.94); panel.rotation.x = -0.36; root.add(panel);
  const pk = new Kit(); pk.box('dark', 2.7, 0.36, 0.06, 0, 0, 0); pk.box('hull', 2.7, 0.025, 0.08, 0, 0.18, 0.01);
  panel.add(pk.build(M, 2.4));
  const scr = [];
  const units = [[screens.left, -0.5, 0.0, 0.32, 0.33, 0.25], [screens.center, 0, -0.006, 0, 0.31, 0.235], [screens.right, 0.5, 0.0, -0.32, 0.33, 0.25]];
  for (const [tex, x, y, ry, w, h] of units) {
    const u = new THREE.Group(); u.position.set(x, y, 0.04); u.rotation.y = ry; panel.add(u);
    const uk = new Kit(); uk.box('hull', w + 0.05, h + 0.05, 0.03, 0, -0.004, 0);
    for (let i = 0; i < 5; i++) { uk.box(i === 2 ? 'glow2' : 'glow', 0.026, 0.01, 0.012, (i - 2) * (w / 5.5), h / 2 + 0.014, 0.017); }
    u.add(uk.build(M, 2.4));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicNodeMaterial({ map: tex }));
    m.position.z = 0.017; u.add(m); scr.push(m);
  }
  root.userData.screens = scr;
  return root;
}

// ---------------------------------------------------------------- hangar (docked backdrop)
export function hangarScene(lightHex = '#ffd27a', backgroundNode = null) {
  const scene = new THREE.Scene();
  PALETTES.hangar = { hull: '#717782', trim: '#c8782a', dark: '#23262d', glow: '#ffd9a0' };
  const M = mats('hangar');
  const floorMat = new THREE.MeshStandardNodeMaterial({ color: '#8a8e96', map: TEX.floor, metalness: 0.45, roughness: 0.5 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), floorMat); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const K = new Kit();
  // side walls + back wall with an open bay door onto space
  K.mirror((s) => K.box('dark', 4, 72, 220, s * 100, 36, 0));
  K.box('dark', 220, 72, 4, 0, 36, 100);
  K.box('dark', 220, 22, 4, 0, 61, -100); K.mirror((s) => K.box('dark', 35, 72, 4, s * 92.5, 36, -100));
  for (let i = 0; i < 9; i++) { const z = -90 + i * 22; K.mirror((s) => { K.box('hull', 5, 72, 5, s * 96, 36, z); K.box('hull', 10, 4, 5, s * 91, 66, z, 0, 0, s * 0.5); K.box('glow', 0.6, 30, 0.6, s * 93.4, 30, z + 3); }); K.box('hull', 186, 3, 5, 0, 71, z); K.box('glow', 120, 0.8, 1.6, 0, 69.2, z); }
  K.box('hull', 150, 5, 6, 0, 50, -100); K.mirror((s) => K.box('hull', 6, 50, 6, s * 75, 25, -100)); K.box('trim', 150, 1.4, 6.4, 0, 47, -100);
  for (let i = 0; i < 12; i++) K.mirror((s) => K.box('glow', 1.2, 1.2, 1.2, s * 72, 4 + i * 3.6, -99));
  // landing pad
  K.cyl('dark', 26, 28, 1.2, 0, 0.6, 0, 0, 0, 0, 40); K.cyl('hull', 20, 21, 1.3, 0, 0.65, 0, 0, 0, 0, 40);
  // FABLE: animate the hangar crane, docking clamps and deck crew around the pad
  // gantry crane + crate stacks against the walls + fuel lines
  K.mirror((s) => { K.box('hull', 3, 52, 3, s * 50, 26, -40); K.box('trim', 2, 2, 60, s * 50, 50, -20); });
  K.box('hull', 104, 3, 3, 0, 51, -40); K.box('trim', 8, 6, 8, 18, 46, -40); K.strut('dark', [18, 43, -40], [18, 28, -40], 0.3);
  const r = rng(77);
  for (let i = 0; i < 8; i++) { const s = i % 2 ? 1 : -1, z = -70 + Math.floor(i / 2) * 38 + r() * 8, x = s * (78 + r() * 8);
    for (let k = 0; k < 1 + Math.floor(r() * 3); k++) { const w = 12, h = 7; K.box(r() < 0.45 ? 'trim' : 'dark', w, h, 7, x, h / 2 + k * h, z + (k % 2) * 1.5, 0, s * 0.02 * k, 0); K.box('hull', w + 0.4, 0.6, 7.4, x, h * (k + 1), z + (k % 2) * 1.5); } }
  K.mirror((s) => { K.strut('trim', [s * 30, 0.8, -10], [s * 80, 0.8, -60], 0.7); K.strut('dark', [s * 30, 0.8, 8], [s * 80, 0.8, 60], 0.7); });
  scene.add(K.build(M, 0.06));
  const padGlow = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(lightHex).multiplyScalar(1.4) });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(24, 0.35, 6, 72), padGlow); ring.rotation.x = Math.PI / 2; ring.position.y = 1.28; scene.add(ring);
  for (let i = 0; i < 8; i++) { const a = i * 0.785; const m = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 0.6), padGlow); m.position.set(Math.cos(a) * 17, 1.32, Math.sin(a) * 17); m.rotation.y = -a; scene.add(m); }
  // soft light shafts under the ceiling strips (additive cones fading downward)
  const shaft = new THREE.MeshBasicNodeMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  shaft.colorNode = Fn(() => { const v = uv().y; return vec3(1.0, 0.85, 0.62).mul(pow(v, 2.0)).mul(0.05); })();
  for (const z of [-46, 0, 44]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(6, 26, 68, 24, 1, true), shaft); c.position.set(0, 35, z); scene.add(c); }
  // bay door: faint force field over open space
  const ff = new THREE.MeshBasicNodeMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  ff.colorNode = Fn(() => { const u = uv(); const n = mx_fractal_noise_float(vec3(u.x.mul(6), u.y.mul(3), time.mul(0.15)), 3, 2.0, 0.5); return vec3(0.15, 0.4, 0.8).mul(n.mul(0.35).add(0.12)).mul(smoothstep(0.0, 0.3, u.y)); })();
  const door = new THREE.Mesh(new THREE.PlaneGeometry(150, 50), ff); door.position.set(0, 25, -101); scene.add(door);
  scene.add(new THREE.HemisphereLight('#8aa0c8', '#2a2620', 0.7));
  const key = new THREE.DirectionalLight('#fff2dc', 1.6); key.position.set(30, 80, 40); scene.add(key);
  const p1 = new THREE.PointLight(lightHex, 2200, 170, 1.6); p1.position.set(-40, 30, 30); scene.add(p1);
  const p2 = new THREE.PointLight('#6ab8ff', 2400, 180, 1.5); p2.position.set(20, 25, -80); scene.add(p2);
  const padL = new THREE.PointLight(lightHex, 500, 60, 1.6); padL.position.set(0, 5, 0); scene.add(padL);
  if (backgroundNode) scene.backgroundNode = backgroundNode; else scene.background = new THREE.Color('#05070c');
  scene.userData.lights = { p1, padL }; scene.userData.padGlow = padGlow;
  return scene;
}
