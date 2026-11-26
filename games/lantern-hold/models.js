// Lantern Hold — procedural low-poly models. Every model is kitbashed from primitives and merged into at most three
// buckets (solid / glow / lamp) so a tower is 2–4 draw calls and every crowd is one InstancedMesh per bucket.
import { THREE } from '/shared/sd-kit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry } from './paths.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

export class Kit {
  constructor(seed = 1) { this.parts = { solid: [], glow: [], lamp: [] }; this.rng = mulberry(seed); }
  add(geo, col, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], b = 'solid', jit = 0.05 } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    _m.compose(_v.set(...pos), _q.setFromEuler(_e.set(...rot)), _s.set(...scale)); g.applyMatrix4(_m);
    const n = g.attributes.position.count, ca = new Float32Array(n * 3);
    _c.set(col);
    for (let f = 0; f < n; f += 3) {
      const j = 1 + (this.rng() - 0.5) * 2 * jit;
      for (let k = 0; k < 3 && f + k < n; k++) { ca[(f + k) * 3] = _c.r * j; ca[(f + k) * 3 + 1] = _c.g * j; ca[(f + k) * 3 + 2] = _c.b * j; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
    this.parts[b].push(g); geo.dispose?.();
    return this;
  }
  box(w, h, d, col, pos, o = {}) { return this.add(new THREE.BoxGeometry(w, h, d), col, { pos, ...o }); }
  cyl(rt, rb, h, seg, col, pos, o = {}) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), col, { pos, ...o }); }
  cone(r, h, seg, col, pos, o = {}) { return this.add(new THREE.ConeGeometry(r, h, seg), col, { pos, ...o }); }
  sph(r, col, pos, o = {}) { return this.add(new THREE.IcosahedronGeometry(r, o.detail ?? 1), col, { pos, ...o }); }
  oct(r, col, pos, o = {}) { return this.add(new THREE.OctahedronGeometry(r, 0), col, { pos, ...o }); }
  tor(R, r, col, pos, o = {}) { return this.add(new THREE.TorusGeometry(R, r, o.rs ?? 5, o.ts ?? 14, o.arc ?? Math.PI * 2), col, { pos, ...o }); }
  // ground-darkening gradient (cheap baked AO) on solid parts
  build({ ao = 0.3 } = {}) {
    const out = {};
    for (const [k, list] of Object.entries(this.parts)) {
      if (!list.length) { out[k] = null; continue; }
      const g = mergeGeometries(list, false); list.forEach((x) => x.dispose());
      if (k === 'solid' && ao > 0) {
        g.computeBoundingBox(); const y0 = g.boundingBox.min.y, h = Math.max(0.01, g.boundingBox.max.y - y0);
        const p = g.attributes.position.array, c = g.attributes.color.array;
        for (let i = 0; i < p.length; i += 3) { const f = 1 - ao + ao * Math.min(1, ((p[i + 1] - y0) / h) * 1.6); c[i] *= f; c[i + 1] *= f; c[i + 2] *= f; }
      }
      g.computeBoundingSphere();
      out[k] = g;
    }
    return out;
  }
}

// triangular prism (gable roofs): a 3-sided cylinder laid on its side
// ridge along x (ry = 0) or z (ry = PI/2); w = ridge length, d = span, base sits at pos.y
const roof = (k, w, h, d, col, pos, ry = 0) => {
  const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); g.translate(0, 0, -w / 2); g.rotateY(Math.PI / 2 + ry);
  return k.add(g, col, { pos });
};

// ---------------------------------------------------------------- palette
export const PAL = {
  stone: '#8d8aa0', stoneD: '#6a6680', stoneL: '#b0adbf', wood: '#7a5236', woodD: '#5a3a26', roofBlue: '#3e5fa8', roofRed: '#a8443e', roofTeal: '#2f8f8a',
  gold: '#e8b552', iron: '#555a66', brick: '#9a5a44', cloth: '#d8c9a8', teal: '#3cc7b8', crimson: '#c8384a', lamp: '#ffffff',
};

// ---------------------------------------------------------------- towers
// returns { body:{solid,glow,lamp}, head:{solid,glow,lamp}|null, headY, muzzle:[x,y,z], spin: bool }
export function towerModel(type, tier, branch) {
  const k = new Kit(7 + tier * 3 + (branch === 'A' ? 1 : branch === 'B' ? 2 : 0)), h = new Kit(99);
  const lvl = tier + (branch ? 1 : 0);
  const trim = lvl >= 2 ? PAL.gold : PAL.woodD;
  const accent = branch === 'A' ? PAL.teal : branch === 'B' ? PAL.crimson : PAL.roofBlue;
  let headY = 1.5, spin = false, muzzle = [0, 1.9, 0];
  // shared foundation ring sits on the pad (pad top y = 0.16)
  k.cyl(0.74, 0.8, 0.14, 10, PAL.stoneD, [0, 0.23, 0]);
  if (type === 'archer') {
    const bh = 0.45 + tier * 0.15 + (branch === 'B' ? 0.4 : 0);
    k.cyl(0.6, 0.68, bh, 8, PAL.stone, [0, 0.3 + bh / 2, 0]);
    const top = 0.3 + bh;
    const postH = branch === 'B' ? 1.0 : 0.7;
    if (lvl < 2) for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) k.box(0.1, postH, 0.1, PAL.wood, [x, top + postH / 2, z]);
    else k.cyl(0.52, 0.56, postH, 8, PAL.stoneL, [0, top + postH / 2, 0]);
    const pl = top + postH;
    k.box(1.12, 0.1, 1.12, PAL.woodD, [0, pl, 0]);
    for (const s of [-1, 1]) { k.box(1.12, 0.16, 0.06, trim, [0, pl + 0.12, s * 0.53]); k.box(0.06, 0.16, 1.12, trim, [s * 0.53, pl + 0.12, 0]); }
    // roof on four corner posts above the platform
    for (const [x, z] of [[-0.48, -0.48], [0.48, -0.48], [-0.48, 0.48], [0.48, 0.48]]) k.box(0.06, 0.55, 0.06, PAL.wood, [x, pl + 0.32, z]);
    const rh = branch === 'B' ? 1.0 : 0.55 + tier * 0.08;
    k.cone(0.86, rh, 4, accent, [0, pl + 0.6 + rh / 2, 0], { rot: [0, Math.PI / 4, 0] });
    k.box(0.12, 0.16, 0.12, PAL.lamp, [0, pl + 0.5, 0], { b: 'lamp' });
    if (lvl >= 1) k.box(0.05, 0.42, 0.3, accent, [0.6, pl - 0.3, 0], {}); // banner
    if (branch === 'A') k.oct(0.16, '#9ff6ff', [0, pl + 0.6 + rh + 0.2, 0], { b: 'glow' });
    if (branch === 'B') k.cone(0.05, 0.5, 4, PAL.gold, [0, pl + 0.6 + rh + 0.2, 0]);
    headY = pl + 0.05; muzzle = [0, pl + 0.4, 0];
    // head: archer(s)
    const archer = (x, z, cloak) => {
      h.cyl(0.1, 0.16, 0.34, 6, cloak, [x, 0.17, z]); h.sph(0.09, '#e9c9a4', [x, 0.42, z], { detail: 0 });
      h.cone(0.11, 0.14, 6, cloak, [x, 0.52, z]);
      h.tor(0.2, 0.018, PAL.woodD, [x, 0.3, z + 0.1], { arc: Math.PI, rot: [0, Math.PI / 2, Math.PI / 2], ts: 8 });
    };
    if (branch === 'A') { archer(0, 0.05, '#2f6f6a'); archer(-0.26, -0.12, '#2f6f6a'); archer(0.26, -0.12, '#2f6f6a'); }
    else if (branch === 'B') { h.box(0.16, 0.16, 0.7, PAL.woodD, [0, 0.24, 0.05]); h.box(0.9, 0.05, 0.08, PAL.iron, [0, 0.3, 0.3]); h.box(0.06, 0.06, 0.6, PAL.gold, [0, 0.33, 0.12]); archer(0, -0.3, '#7a2a35'); }
    else archer(0, 0, tier >= 1 ? '#3a5f3a' : '#4f6a3a');
  } else if (type === 'mortar') {
    const r = 0.62 + tier * 0.05 + (branch ? 0.06 : 0);
    k.cyl(r * 0.92, r, 0.62 + tier * 0.1, 9, PAL.brick, [0, 0.62, 0]);
    const top = 0.93 + tier * 0.1;
    k.cyl(r * 0.98, r * 0.98, 0.08, 9, PAL.iron, [0, 0.5, 0]);
    if (tier >= 1) k.cyl(r * 0.95, r * 0.95, 0.07, 9, PAL.iron, [0, top - 0.1, 0]);
    k.box(0.36, 0.26, 0.12, '#ff9a3a', [0, 0.52, r * 0.9], { b: 'glow' }); // fire mouth
    k.cyl(0.11, 0.13, 0.5, 6, PAL.stoneD, [-r * 0.6, top + 0.15, -r * 0.4]);
    if (tier >= 2) k.cyl(0.1, 0.12, 0.42, 6, PAL.stoneD, [r * 0.6, top + 0.1, -r * 0.4]);
    k.cyl(0.08, 0.08, 0.04, 6, '#ff7a2a', [-r * 0.6, top + 0.41, -r * 0.4], { b: 'glow' });
    if (branch === 'A') for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; k.box(0.1, 0.18, 0.1, '#ffb050', [Math.cos(a) * r, top - 0.02, Math.sin(a) * r], { b: 'glow' }); }
    if (branch === 'B') for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.6; k.cyl(0.12, 0.14, 0.24, 6, PAL.iron, [Math.cos(a) * r * 0.82, top + 0.08, Math.sin(a) * r * 0.82]); }
    headY = top; muzzle = [0, top + 0.5, 0.2];
    // head: tilted barrel on a swivel
    h.cyl(0.32, 0.36, 0.14, 8, PAL.iron, [0, 0.07, 0]);
    const br = branch === 'A' ? 0.3 : 0.22 + tier * 0.02;
    h.cyl(br * 0.85, br, 0.62, 9, branch === 'A' ? '#3d3a40' : '#4a4752', [0, 0.36, 0.08], { rot: [0.55, 0, 0] });
    h.tor(br * 0.9, 0.04, PAL.gold, [0, 0.6, 0.24], { rot: [Math.PI / 2 + 0.55, 0, 0] });
    h.cyl(br * 0.7, br * 0.7, 0.03, 8, '#ff8a30', [0, 0.64, 0.25], { rot: [0.55, 0, 0], b: 'glow' });
  } else if (type === 'prism') {
    const s = 1 + tier * 0.08;
    k.box(0.9 * s, 0.3, 0.9 * s, PAL.stoneD, [0, 0.44, 0]);
    k.box(0.68 * s, 0.5 + tier * 0.15, 0.68 * s, PAL.stoneL, [0, 0.84 + tier * 0.075, 0]);
    const top = 1.09 + tier * 0.15;
    k.box(0.8 * s, 0.1, 0.8 * s, lvl >= 2 ? PAL.gold : PAL.stone, [0, top + 0.05, 0]);
    for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) k.box(x ? 0.02 : 0.34, 0.2, z ? 0.02 : 0.34, '#b78cff', [x * 0.345 * s, 0.84, z * 0.345 * s], { b: 'glow' }); // runes
    if (tier >= 2 || branch) for (const sx of [-1, 1]) k.box(0.1, 0.9, 0.1, PAL.stone, [sx * 0.42 * s, top + 0.5, 0]);
    if (tier >= 2 || branch) k.tor(0.42 * s, 0.04, PAL.gold, [0, top + 0.95, 0], { arc: Math.PI, ts: 10 });
    headY = top + 0.55; spin = branch !== 'B';
    const cc = branch === 'A' ? '#8ff0ff' : branch === 'B' ? '#ffe28a' : '#c8a0ff';
    if (branch === 'B') {
      h.tor(0.32, 0.05, PAL.gold, [0, 0, 0], { ts: 16 }); h.cyl(0.26, 0.26, 0.04, 12, '#fff2b0', [0, 0, 0], { rot: [Math.PI / 2, 0, 0], b: 'glow' });
      h.box(0.06, 0.4, 0.06, PAL.gold, [0, -0.36, 0]);
      muzzle = [0, top + 0.55, 0];
    } else if (branch === 'A') {
      for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; h.oct(0.16, cc, [Math.cos(a) * 0.28, 0, Math.sin(a) * 0.28], { scale: [1, 1.8, 1], b: 'glow' }); }
      h.tor(0.36, 0.03, PAL.gold, [0, 0, 0], { rot: [Math.PI / 2, 0, 0], ts: 16 });
      muzzle = [0, top + 0.55, 0];
    } else {
      h.oct(0.2 + tier * 0.03, cc, [0, 0, 0], { scale: [1, 1.9, 1], b: 'glow' });
      if (tier >= 1) for (const a of [0, Math.PI]) h.oct(0.07, cc, [Math.cos(a) * 0.36, 0.1, Math.sin(a) * 0.36], { scale: [1, 1.7, 1], b: 'glow' });
      muzzle = [0, top + 0.55, 0];
    }
  } else if (type === 'beacon') {
    const H = 1.2 + tier * 0.22 + (branch ? 0.15 : 0);
    const rb = 0.5, rt = 0.32;
    const bands = 4;
    for (let i = 0; i < bands; i++) {
      const y0 = 0.3 + H * i / bands, y1 = 0.3 + H * (i + 1) / bands;
      const r0 = rb + (rt - rb) * i / bands, r1 = rb + (rt - rb) * (i + 1) / bands;
      k.cyl(r1, r0, y1 - y0, 8, i % 2 ? (branch === 'B' ? PAL.roofRed : PAL.roofBlue) : PAL.stoneL, [0, (y0 + y1) / 2, 0]);
    }
    const top = 0.3 + H;
    k.cyl(0.42, 0.42, 0.08, 10, lvl >= 2 ? PAL.gold : PAL.stoneD, [0, top + 0.04, 0]); // balcony
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; k.box(0.03, 0.42, 0.03, PAL.iron, [Math.cos(a) * 0.26, top + 0.29, Math.sin(a) * 0.26]); }
    k.cyl(0.22, 0.22, 0.36, 8, PAL.lamp, [0, top + 0.28, 0], { b: 'lamp' });
    k.cone(0.34, 0.34, 8, lvl >= 2 ? PAL.gold : PAL.iron, [0, top + 0.67, 0]);
    if (branch === 'A') for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; k.cone(0.05, 0.3, 4, '#ffd27a', [Math.cos(a) * 0.5, top + 0.3, Math.sin(a) * 0.5], { rot: [0, 0, -Math.PI / 2], b: 'glow' }); }
    if (branch === 'B') { k.cyl(0.58, 0.3, 0.2, 10, PAL.iron, [0, top + 0.1, 0]); k.cone(0.3, 0.5, 7, '#ffb34a', [0, top + 1.05, 0], { b: 'glow' }); }
    headY = top + 0.28; spin = true; muzzle = [0, top + 0.3, 0];
    // head: rotating shutters around the lamp
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; h.box(0.04, 0.34, 0.16, PAL.woodD, [Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3], { rot: [0, -a, 0] }); }
  } else if (type === 'barracks') {
    const w = 1.2 + (branch ? 0.15 : 0), d = 0.9, wh = 0.55 + tier * 0.12;
    k.box(w + 0.1, 0.16, d + 0.1, PAL.stoneD, [0, 0.38, 0]);
    k.box(w, wh, d, tier >= 1 ? PAL.stoneL : PAL.cloth, [0, 0.46 + wh / 2, 0]);
    for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) k.box(0.08, wh, 0.08, PAL.woodD, [x, 0.46 + wh / 2, z]);
    roof(k, w + 0.18, 0.5 + tier * 0.05, d + 0.24, branch === 'A' ? PAL.roofTeal : PAL.roofRed, [0, 0.46 + wh, 0]);
    k.box(0.3, 0.38, 0.04, '#ffcf7a', [0, 0.65, d / 2 + 0.02], { b: 'glow' }); // lit doorway
    k.box(0.38, 0.06, 0.06, PAL.woodD, [0, 0.86, d / 2 + 0.03]);
    k.box(0.04, 1.0 + tier * 0.15, 0.04, PAL.woodD, [w / 2 + 0.12, 0.8 + tier * 0.07, -0.25]);
    k.box(0.03, 0.26, 0.36, branch === 'A' ? PAL.teal : branch === 'B' ? PAL.crimson : PAL.roofBlue, [w / 2 + 0.12, 1.15 + tier * 0.15, -0.07]);
    if (tier >= 2 || branch) { k.box(0.4, 0.7, 0.4, PAL.stone, [-w / 2 + 0.1, 1.05, -0.2]); k.cone(0.32, 0.4, 4, PAL.roofBlue, [-w / 2 + 0.1, 1.6, -0.2], { rot: [0, Math.PI / 4, 0] }); k.box(0.1, 0.12, 0.02, PAL.lamp, [-w / 2 + 0.1, 1.15, 0.01], { b: 'lamp' }); }
    if (branch === 'A') for (const x of [-0.35, 0.35]) k.cyl(0.16, 0.16, 0.04, 8, PAL.gold, [x, 0.8, d / 2 + 0.03], { rot: [Math.PI / 2, 0, 0] });
    if (branch === 'B') for (let i = 0; i < 4; i++) k.box(0.03, 0.9, 0.03, PAL.iron, [-0.4 + i * 0.12, 0.9, d / 2 + 0.12], { rot: [0.15, 0, 0] });
    headY = 0; muzzle = [0, 1, 0];
    return { body: k.build(), head: null, headY, muzzle, spin: false };
  }
  return { body: k.build(), head: h.build({ ao: 0 }), headY, muzzle, spin };
}

// ---------------------------------------------------------------- enemies (shadow creatures: violet bodies, glowing eyes)
const SH = { body: '#4a3878', dark: '#2c2148', light: '#6e58a8' };
export function enemyModel(type) {
  const k = new Kit(31 + type.length);
  const eye = (x, y, z, r = 0.05, col = '#ffe27a') => k.sph(r, col, [x, y, z], { detail: 0, b: 'glow' });
  let wing = null;
  switch (type) {
    case 'gloomling':
      k.sph(0.3, SH.body, [0, 0.32, 0], { scale: [1, 0.95, 1] });
      k.cone(0.07, 0.24, 5, SH.dark, [-0.15, 0.62, -0.02], { rot: [0, 0, 0.45] }); k.cone(0.07, 0.24, 5, SH.dark, [0.15, 0.62, -0.02], { rot: [0, 0, -0.45] });
      k.sph(0.08, SH.dark, [-0.13, 0.05, 0.05], { detail: 0 }); k.sph(0.08, SH.dark, [0.13, 0.05, 0.05], { detail: 0 });
      eye(-0.1, 0.38, 0.26); eye(0.1, 0.38, 0.26);
      break;
    case 'hound':
      k.sph(0.26, SH.body, [0, 0.36, -0.05], { scale: [0.9, 0.7, 1.6] });
      k.sph(0.17, SH.light, [0, 0.46, 0.36], { scale: [1, 0.9, 1.2] });
      k.cone(0.06, 0.2, 4, SH.dark, [-0.09, 0.62, 0.32], { rot: [-0.3, 0, 0.2] }); k.cone(0.06, 0.2, 4, SH.dark, [0.09, 0.62, 0.32], { rot: [-0.3, 0, -0.2] });
      for (const [x, z] of [[-0.12, 0.22], [0.12, 0.22], [-0.12, -0.3], [0.12, -0.3]]) k.box(0.07, 0.24, 0.07, SH.dark, [x, 0.12, z]);
      k.cone(0.06, 0.32, 4, SH.dark, [0, 0.42, -0.5], { rot: [-1.1, 0, 0] });
      eye(-0.07, 0.5, 0.5, 0.035, '#ff9a4a'); eye(0.07, 0.5, 0.5, 0.035, '#ff9a4a');
      break;
    case 'brute':
      k.sph(0.46, SH.body, [0, 0.6, -0.05], { scale: [1.2, 1, 1] });
      k.sph(0.2, SH.dark, [0, 0.82, 0.32], { detail: 0 });
      for (const sx of [-1, 1]) {
        k.box(0.36, 0.14, 0.42, '#9ba3b4', [sx * 0.42, 0.98, -0.02], { rot: [0, 0, sx * 0.5] });
        k.cyl(0.1, 0.13, 0.5, 6, SH.dark, [sx * 0.52, 0.42, 0.08], { rot: [0.2, 0, sx * 0.15] });
        k.sph(0.15, '#8e96a8', [sx * 0.56, 0.16, 0.14], { detail: 0 });
      }
      k.box(0.7, 0.5, 0.12, '#8a92a4', [0, 0.72, -0.42], { rot: [0.25, 0, 0] });
      k.box(0.56, 0.36, 0.1, '#a3abbc', [0, 0.62, 0.42], { rot: [-0.15, 0, 0] });
      eye(-0.08, 0.88, 0.5, 0.04, '#ff5a4a'); eye(0.08, 0.88, 0.5, 0.04, '#ff5a4a'); eye(0, 0.95, 0.49, 0.03, '#ff5a4a');
      break;
    case 'moth':
      k.sph(0.16, SH.body, [0, 0, 0], { scale: [0.9, 0.9, 1.9] });
      k.sph(0.12, SH.light, [0, 0.03, 0.3], { detail: 0 });
      k.cone(0.02, 0.24, 3, SH.dark, [-0.06, 0.16, 0.4], { rot: [0.6, 0, 0.3] }); k.cone(0.02, 0.24, 3, SH.dark, [0.06, 0.16, 0.4], { rot: [0.6, 0, -0.3] });
      eye(-0.06, 0.06, 0.4, 0.04, '#8af6ff'); eye(0.06, 0.06, 0.4, 0.04, '#8af6ff');
      {
        const w = new Kit(5);
        const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.bezierCurveTo(0.25, 0.25, 0.7, 0.32, 0.66, 0.02); shape.bezierCurveTo(0.62, -0.22, 0.3, -0.42, 0, -0.12);
        w.add(new THREE.ShapeGeometry(shape, 6), '#6c4ea8', { rot: [-Math.PI / 2, 0, 0], jit: 0.12 });
        w.add(new THREE.CircleGeometry(0.09, 6), '#bfa0ff', { pos: [0.4, 0.004, -0.05], rot: [-Math.PI / 2, 0, 0], b: 'glow' });
        wing = w.build({ ao: 0 });
      }
      break;
    case 'blob':
      k.sph(0.46, SH.body, [0, 0.44, 0], { detail: 1, scale: [1, 0.88, 1] });
      for (const [x, y, z, r] of [[0.3, 0.7, -0.1, 0.16], [-0.32, 0.6, 0.05, 0.14], [0.05, 0.82, -0.2, 0.15], [-0.15, 0.25, -0.35, 0.13]]) k.sph(r, SH.light, [x, y, z], { detail: 0 });
      eye(-0.13, 0.56, 0.4, 0.06, '#d4ff6a'); eye(0.13, 0.6, 0.38, 0.05, '#d4ff6a'); eye(0.02, 0.72, 0.36, 0.04, '#d4ff6a');
      break;
    case 'mite':
      k.sph(0.17, SH.body, [0, 0.17, 0], { detail: 0 });
      k.sph(0.06, SH.light, [0.08, 0.3, -0.05], { detail: 0 });
      eye(-0.05, 0.21, 0.14, 0.03, '#d4ff6a'); eye(0.05, 0.21, 0.14, 0.03, '#d4ff6a');
      break;
    case 'stalker':
      k.cone(0.3, 1.0, 7, '#3a2e5e', [0, 0.5, 0]);
      k.sph(0.16, '#2a2046', [0, 0.98, 0.02], { detail: 0 });
      k.cone(0.17, 0.3, 6, '#3a2e5e', [0, 1.12, -0.04], { rot: [-0.4, 0, 0] });
      for (const sx of [-1, 1]) k.cone(0.05, 0.42, 4, '#2a2046', [sx * 0.28, 0.5, 0.1], { rot: [0.3, 0, sx * 0.4] });
      k.box(0.18, 0.035, 0.02, '#7af0ff', [0, 0.98, 0.17], { b: 'glow' });
      break;
    case 'warlock':
      k.cone(0.34, 0.95, 8, '#35285c', [0, 0.48, 0]);
      k.sph(0.17, SH.dark, [0, 0.98, 0], { detail: 0 });
      k.cone(0.2, 0.42, 7, '#4a3878', [0, 1.15, -0.03], { rot: [-0.2, 0, 0] });
      k.box(0.04, 1.2, 0.04, '#3a2a1e', [0.34, 0.6, 0.1]);
      k.sph(0.11, '#7dffb0', [0.34, 1.28, 0.1], { detail: 0, b: 'glow' });
      k.tor(0.3, 0.02, '#7dffb0', [0, 0.35, 0], { rot: [Math.PI / 2, 0, 0], b: 'glow', ts: 12 });
      eye(-0.06, 1.0, 0.15, 0.03, '#7dffb0'); eye(0.06, 1.0, 0.15, 0.03, '#7dffb0');
      break;
    case 'boss':
      k.sph(0.95, SH.body, [0, 1.5, 0], { detail: 1, scale: [1.15, 1.1, 0.95] });
      k.sph(0.48, SH.dark, [0, 2.45, 0.25], { detail: 1 });
      for (let i = 0; i < 7; i++) { const a = -0.9 + i * 0.3; k.cone(0.09, 0.55 + (i === 3 ? 0.3 : 0), 4, '#1e1634', [Math.sin(a) * 0.4, 2.9 + Math.cos(a) * 0.08, 0.15 + Math.cos(a) * 0.1], { rot: [0, 0, -a * 0.7] }); }
      for (const sx of [-1, 1]) {
        k.sph(0.36, SH.light, [sx * 1.0, 2.1, 0.05], { detail: 0 });
        k.cyl(0.22, 0.3, 1.3, 7, SH.dark, [sx * 1.15, 1.25, 0.2], { rot: [0.2, 0, sx * 0.12] });
        k.sph(0.34, '#2a2048', [sx * 1.22, 0.5, 0.32], { detail: 0 });
        k.cyl(0.26, 0.34, 0.9, 7, SH.dark, [sx * 0.45, 0.45, 0], {});
      }
      k.oct(0.3, '#ff6a3a', [0, 1.6, 0.86], { b: 'glow', scale: [1, 1.4, 0.5] });
      eye(-0.18, 2.5, 0.68, 0.08, '#ff7a3a'); eye(0.18, 2.5, 0.68, 0.08, '#ff7a3a'); eye(0, 2.66, 0.66, 0.06, '#ff7a3a');
      k.tor(1.25, 0.04, '#ff8a4a', [0, 1.4, 0], { rot: [Math.PI / 2, 0, 0], b: 'glow', ts: 24 });
      break;
  }
  return { ...k.build({ ao: 0.25 }), wing };
}

// ---------------------------------------------------------------- hero + wardens
export function heroModel() {
  const k = new Kit(77);
  k.cyl(0.14, 0.3, 0.62, 8, '#2f4f8f', [0, 0.31, 0]);           // cloak
  k.cyl(0.13, 0.15, 0.24, 8, '#c9a46a', [0, 0.72, 0]);          // jerkin
  k.sph(0.13, '#efcfa8', [0, 0.95, 0], { detail: 1 });
  k.cone(0.17, 0.2, 8, '#d8a43a', [0, 1.12, -0.02]);            // hood
  k.tor(0.15, 0.03, '#e8b552', [0, 0.86, 0], { rot: [Math.PI / 2, 0, 0], ts: 10 });
  k.box(0.035, 1.25, 0.035, '#5a3a26', [0.26, 0.62, 0.08]);     // staff
  k.box(0.12, 0.03, 0.12, '#e8b552', [0.26, 1.27, 0.08]);
  k.cyl(0.07, 0.07, 0.14, 6, PAL.lamp, [0.26, 1.18, 0.08], { b: 'lamp' });
  k.cone(0.09, 0.08, 6, '#e8b552', [0.26, 1.31, 0.08]);
  return k.build({ ao: 0.2 });
}
export function wardenModel() {
  const k = new Kit(55);
  k.cyl(0.1, 0.16, 0.36, 6, '#5d6f9a', [0, 0.18, 0]);
  k.cyl(0.12, 0.12, 0.14, 6, '#b8c0d0', [0, 0.42, 0]);
  k.sph(0.09, '#e9c9a4', [0, 0.56, 0], { detail: 0 });
  k.cone(0.1, 0.12, 6, '#c0c8d8', [0, 0.66, 0]);
  k.box(0.04, 0.12, 0.2, '#e8b552', [0, 0.72, 0]);                 // plume crest
  k.cyl(0.15, 0.15, 0.04, 8, '#3e5fa8', [-0.15, 0.34, 0.06], { rot: [0, 0, Math.PI / 2] }); // shield
  k.box(0.025, 0.7, 0.025, '#5a3a26', [0.15, 0.4, 0.06]);
  k.cone(0.03, 0.1, 4, '#d8dce8', [0.15, 0.8, 0.06]);
  return k.build({ ao: 0.2 });
}

// ---------------------------------------------------------------- world props
export function propModel(kind, seed = 1) {
  const k = new Kit(seed);
  switch (kind) {
    case 'pine': {
      k.cyl(0.07, 0.1, 0.5, 5, '#5a3e2c', [0, 0.25, 0]);
      for (let i = 0; i < 3; i++) k.cone(0.62 - i * 0.15, 0.7, 7, ['#2f5a4a', '#376652', '#3f7058'][i], [0, 0.55 + i * 0.42, 0], { jit: 0.1 });
      break;
    }
    case 'roundtree': {
      k.cyl(0.08, 0.12, 0.7, 5, '#5a3e2c', [0, 0.35, 0]);
      k.sph(0.5, '#4a6b3a', [0, 1.0, 0], { detail: 0, jit: 0.12 }); k.sph(0.36, '#56783f', [0.28, 1.2, 0.1], { detail: 0, jit: 0.12 }); k.sph(0.32, '#3f5e36', [-0.25, 1.15, -0.12], { detail: 0, jit: 0.12 });
      break;
    }
    case 'violettree': {
      k.cyl(0.07, 0.11, 0.8, 5, '#4a3a3a', [0, 0.4, 0]);
      k.sph(0.48, '#6a4a8a', [0, 1.1, 0], { detail: 0, jit: 0.14 }); k.sph(0.3, '#7a58a0', [0.26, 1.32, 0.05], { detail: 0, jit: 0.12 });
      break;
    }
    case 'snowpine': {
      k.cyl(0.07, 0.1, 0.45, 5, '#5a463c', [0, 0.22, 0]);
      for (let i = 0; i < 3; i++) { k.cone(0.6 - i * 0.15, 0.66, 7, '#2e5a5a', [0, 0.5 + i * 0.4, 0]); k.cone(0.42 - i * 0.12, 0.3, 7, '#eef4ff', [0, 0.72 + i * 0.4, 0]); }
      break;
    }
    case 'deadtree': {
      k.cyl(0.06, 0.12, 1.2, 5, '#2a2020', [0, 0.6, 0]);
      k.cyl(0.03, 0.05, 0.55, 4, '#2a2020', [0.18, 1.0, 0], { rot: [0, 0, -0.8] });
      k.cyl(0.03, 0.05, 0.45, 4, '#2a2020', [-0.15, 0.85, 0.05], { rot: [0.2, 0, 0.9] });
      k.cyl(0.02, 0.04, 0.35, 4, '#2a2020', [0.05, 1.3, 0.1], { rot: [0.6, 0, 0.2] });
      break;
    }
    case 'rock': k.add(new THREE.DodecahedronGeometry(0.42, 0), '#7c7890', { pos: [0, 0.2, 0], scale: [1.2, 0.7, 1], jit: 0.12 }); k.add(new THREE.DodecahedronGeometry(0.22, 0), '#8c88a0', { pos: [0.38, 0.1, 0.15], jit: 0.12 }); break;
    case 'snowrock': k.add(new THREE.DodecahedronGeometry(0.42, 0), '#8a92a8', { pos: [0, 0.2, 0], scale: [1.2, 0.7, 1], jit: 0.1 }); k.add(new THREE.DodecahedronGeometry(0.3, 0), '#f0f4ff', { pos: [0, 0.38, 0], scale: [1.2, 0.35, 1] }); break;
    case 'emberrock': k.add(new THREE.DodecahedronGeometry(0.42, 0), '#3e302e', { pos: [0, 0.2, 0], scale: [1.2, 0.8, 1], jit: 0.12 }); k.box(0.05, 0.3, 0.3, '#ff6a2a', [0.2, 0.2, 0], { b: 'glow', rot: [0, 0.4, 0] }); break;
    case 'bush': k.sph(0.3, '#3f6a42', [0, 0.18, 0], { detail: 0, scale: [1.3, 0.8, 1], jit: 0.15 }); k.sph(0.2, '#4a7a48', [0.25, 0.2, 0.1], { detail: 0, jit: 0.12 }); break;
    case 'mushroom': {
      for (const [x, z, s] of [[0, 0, 1], [0.22, 0.12, 0.7], [-0.15, 0.18, 0.55]]) {
        k.cyl(0.04 * s, 0.05 * s, 0.24 * s, 5, '#d8d0c0', [x, 0.12 * s, z]);
        k.sph(0.13 * s, '#1f7f78', [x, 0.25 * s, z], { detail: 0, scale: [1, 0.55, 1], b: 'glow' });
      }
      break;
    }
    case 'crystal': for (const [x, z, h, r] of [[0, 0, 0.9, 0.16], [0.2, 0.1, 0.55, 0.11], [-0.16, 0.12, 0.45, 0.1]]) k.oct(r, '#9fdcff', [x, h * 0.5, z], { scale: [1, h / r * 0.55, 1], b: 'glow' }); break;
    case 'pillar': {
      k.box(0.6, 0.2, 0.6, '#6a5a58', [0, 0.1, 0]);
      k.cyl(0.22, 0.24, 1.4, 7, '#857470', [0, 0.9, 0]);
      k.box(0.55, 0.16, 0.55, '#6a5a58', [0, 1.65, 0], { rot: [0.08, 0.3, 0.1] });
      break;
    }
    case 'brokenpillar': k.box(0.6, 0.2, 0.6, '#6a5a58', [0, 0.1, 0]); k.cyl(0.22, 0.24, 0.6, 7, '#857470', [0, 0.5, 0], { rot: [0.05, 0, 0.08] }); k.cyl(0.2, 0.22, 0.5, 7, '#857470', [0.5, 0.15, 0.2], { rot: [0, 0.4, Math.PI / 2] }); break;
    case 'brazier': k.cyl(0.08, 0.12, 0.6, 6, '#3a3030', [0, 0.3, 0]); k.cyl(0.26, 0.12, 0.18, 8, '#4a3c3a', [0, 0.66, 0]); k.cone(0.18, 0.42, 6, '#ffb040', [0, 0.95, 0], { b: 'glow' }); break;
    case 'lanternpost': k.box(0.07, 1.1, 0.07, '#4a3a2e', [0, 0.55, 0]); k.box(0.34, 0.05, 0.05, '#4a3a2e', [0.14, 1.05, 0]); k.box(0.14, 0.18, 0.14, PAL.lamp, [0.28, 0.92, 0], { b: 'lamp' }); k.cone(0.12, 0.08, 4, '#2a2a30', [0.28, 1.05, 0], { rot: [0, Math.PI / 4, 0] }); break;
    case 'log': k.cyl(0.14, 0.14, 1.2, 7, '#5a3e2c', [0, 0.14, 0], { rot: [0, 0, Math.PI / 2] }); k.cyl(0.13, 0.13, 0.02, 7, '#a07a50', [0.6, 0.14, 0], { rot: [0, 0, Math.PI / 2] }); break;
    case 'grass': for (let i = 0; i < 5; i++) { const a = i * 1.3; k.cone(0.04, 0.3, 3, '#5a8a4a', [Math.cos(a) * 0.1, 0.15, Math.sin(a) * 0.1], { rot: [Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3], jit: 0.2 }); } break;
    case 'icespike': k.cone(0.16, 0.9, 5, '#cfe8ff', [0, 0.45, 0], { jit: 0.08 }); k.cone(0.1, 0.5, 5, '#bcdcff', [0.18, 0.25, 0.05], { rot: [0, 0, -0.3] }); break;
    case 'ruinwall': k.box(1.4, 0.8, 0.3, '#7a6a66', [0, 0.4, 0], { jit: 0.1 }); k.box(0.6, 0.4, 0.3, '#7a6a66', [-0.35, 1.0, 0]); k.box(0.3, 0.3, 0.3, '#6a5a58', [0.6, 0.15, 0.4]); break;
  }
  return k.build({ ao: 0.35 });
}

// ---------------------------------------------------------------- the Hold (gate keep at the end of every road)
export function holdModel() {
  const k = new Kit(3);
  const wall = '#9a94b0', wallD = '#7a7494', roofC = '#3e5fa8';
  // gate arch spans the road (road runs along +x into the keep)
  for (const sz of [-1, 1]) {
    k.box(1.0, 1.9, 0.9, wall, [0, 0.95, sz * 1.25]);
    for (let i = 0; i < 3; i++) k.box(0.22, 0.22, 0.9, wall, [-0.36 + i * 0.36, 2.0, sz * 1.25]);
    k.cyl(0.55, 0.62, 2.6, 8, wallD, [0.1, 1.3, sz * 2.0]);
    k.cyl(0.66, 0.6, 0.16, 8, wall, [0.1, 2.68, sz * 2.0]);
    k.cone(0.7, 0.9, 8, roofC, [0.1, 3.2, sz * 2.0]);
    k.box(0.14, 0.22, 0.05, PAL.lamp, [-0.45, 1.8, sz * 2.0], { b: 'lamp' });
    k.box(0.12, 0.2, 0.12, PAL.lamp, [-0.58, 1.25, sz * 0.86], { b: 'lamp' }); // gate lanterns
  }
  k.box(1.0, 0.45, 1.6, wall, [0, 1.75, 0]);
  k.box(0.06, 1.3, 1.5, '#ffd08a', [0.3, 0.68, 0], { b: 'glow' }); // lit gateway
  // keep behind the gate
  k.box(1.7, 2.3, 2.9, wallD, [1.45, 1.15, 0]);
  for (let i = 0; i < 4; i++) k.box(0.24, 0.24, 0.24, wall, [0.65, 2.42, -1.2 + i * 0.8]);
  for (const z of [-0.8, 0.8]) k.box(0.05, 0.36, 0.22, PAL.lamp, [0.58, 1.6, z], { b: 'lamp' });
  roof(k, 2.0, 0.9, 1.5, roofC, [1.6, 2.3, 0], Math.PI / 2);
  k.box(0.04, 1.0, 0.04, '#4a3a2e', [1.6, 3.6, 0]); k.box(0.03, 0.34, 0.52, '#e8b552', [1.6, 3.9, 0.27]);
  return k.build({ ao: 0.35 });
}
export function padModel() {
  const k = new Kit(9);
  k.cyl(0.86, 0.95, 0.16, 12, '#7c7790', [0, 0.08, 0], { jit: 0.08 });
  k.cyl(0.72, 0.8, 0.04, 12, '#8e89a2', [0, 0.17, 0], { jit: 0.06 });
  return k.build({ ao: 0.25 });
}
