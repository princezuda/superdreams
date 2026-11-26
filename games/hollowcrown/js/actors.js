// The Hollow Crown — characters built from primitives, merged per limb (≈6 draw calls each), procedural motion.
// FABLE: full character animation (hand-keyed walk/talk/reach cycles, lip-sync, cloth sim on capes).
import * as THREE from 'three/webgpu';
import { Batch, box, cyl, cone, sph, tor, jit } from './props.js';

const T = (x, y, z) => new THREE.Vector3(x, y, z);

function limb(group, build) { const B = new Batch(7); B.forceMat = 'char'; build(B); B.finish(group, { shadows: true }).forEach((m) => { m.material = MAT(); m.castShadow = true; m.receiveShadow = false; }); return group; }
let MAT = () => null;
export function setCharMaterial(fn) { MAT = fn; }

// p: { skin, hair, hairStyle, hat, top, bottom, boots, cape, robe, apron, beard, moustache, scale, girth, glasses, belt, kind }
export function makeHuman(p = {}) {
  const root = new THREE.Group(); root.name = p.name || 'actor';
  const body = new THREE.Group(); root.add(body);
  const sc = p.scale ?? 1; root.scale.setScalar(sc);
  const skin = p.skin ?? '#f1c7a5', top = p.top ?? '#4f7fb0', bottom = p.bottom ?? '#5a4a3a', boots = p.boots ?? '#4a3020', girth = p.girth ?? 1;
  const hipY = 0.6, shY = 1.06, headY = 1.38;
  // legs (pivot at hip)
  const legs = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(sx * 0.1 * girth, hipY, 0); body.add(g);
    if (!p.robe) limb(g, (B) => {
      cyl(B, 0.075, 0.07, 0.46, bottom, 0, -0.25, 0, { seg: 8 });
      B.add(new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), boots, { x: 0, y: -0.56, z: 0.04, sz: 1.5, sy: 0.9, ao: false });
      cyl(B, 0.085, 0.09, 0.12, boots, 0, -0.5, 0, { seg: 8 });
    });
    legs.push(g);
  }
  // torso
  limb(body, (B) => {
    if (p.robe) {
      cyl(B, 0.2 * girth, 0.38 * girth, 1.0, p.robeC ?? top, 0, 0.55, 0, { seg: 14, jit: 0.05 });
      if (p.robeHem) tor(B, 0.37 * girth, 0.035, p.robeHem, 0, 0.07, 0, { rx: Math.PI / 2, ts: 18 });
      for (const sx of [-1, 1]) B.add(new THREE.SphereGeometry(0.09, 8, 6), boots, { x: sx * 0.12, y: 0.04, z: 0.14, sy: 0.6, sz: 1.3 });
    } else {
      cyl(B, 0.19 * girth, 0.26 * girth, 0.52, top, 0, 0.84, 0, { seg: 12, jit: 0.05 });
      cyl(B, 0.27 * girth, 0.24 * girth, 0.16, top, 0, 0.6, 0, { seg: 12 }); // tunic hem
      cyl(B, 0.16 * girth, 0.17 * girth, 0.12, bottom, 0, 0.56, 0, { seg: 10 });
    }
    if (p.belt !== false) tor(B, (p.robe ? 0.25 : 0.235) * girth, 0.03, p.belt ?? '#6a4428', 0, p.robe ? 0.78 : 0.7, 0, { rx: Math.PI / 2, ts: 16 });
    if (p.buckle) box(B, 0.08, 0.07, 0.03, '#e0c060', 0, p.robe ? 0.78 : 0.7, 0.24 * girth, { ao: false });
    if (p.apron) B.add(new THREE.CylinderGeometry(0.25 * girth, 0.33 * girth, 0.6, 12, 1, true, -0.9, 1.8), p.apron, { y: 0.55, mat: 'char', ao: false });
    if (p.tools) { box(B, 0.06, 0.16, 0.05, '#b8b0a0', -0.17 * girth, 0.62, 0.17, { rz: 0.3 }); box(B, 0.1, 0.12, 0.07, '#7a5030', 0.16 * girth, 0.64, 0.17); }
    // shoulders + collar
    sph(B, 0.2 * girth, top, 0, shY - 0.02, 0, { sy: 0.55, ws: 12, hs: 8 });
    cyl(B, 0.07, 0.08, 0.12, skin, 0, shY + 0.08, 0, { seg: 8 });
    if (p.collar) tor(B, 0.11, 0.035, p.collar, 0, shY + 0.04, 0, { rx: Math.PI / 2, ts: 12 });
    if (p.cape) B.add(new THREE.CylinderGeometry(0.24 * girth, 0.36 * girth, p.capeLen ?? 0.78, 14, 2, true, Math.PI * 0.62, Math.PI * 0.76), p.cape, { y: shY - (p.capeLen ?? 0.78) / 2 + 0.04, z: -0.02, mat: 'char', ao: false });
    if (p.scarf) tor(B, 0.12, 0.05, p.scarf, 0, shY + 0.06, 0, { rx: Math.PI / 2, ts: 12 });
  });
  // arms (pivot at shoulder)
  const arms = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(sx * 0.25 * girth, shY, 0); g.rotation.z = sx * 0.12; body.add(g);
    limb(g, (B) => {
      cyl(B, 0.065, 0.055, 0.42, p.sleeve ?? top, 0, -0.2, 0, { seg: 8 });
      sph(B, 0.065, skin, 0, -0.44, 0.01, { ws: 8, hs: 6 });
    });
    arms.push(g);
  }
  // head (pivot at neck)
  const head = new THREE.Group(); head.position.set(0, shY + 0.12, 0); body.add(head);
  const hy = headY - shY - 0.12;
  limb(head, (B) => {
    sph(B, 0.24, skin, 0, hy, 0, { ws: 18, hs: 14, ao: false, jit: 0.02 });
    sph(B, 0.045, p.nose ?? '#e8a888', 0, hy - 0.03, 0.235, { ws: 8, hs: 6, ao: false });
    for (const sx of [-1, 1]) sph(B, 0.05, '#f0a090', sx * 0.13, hy - 0.06, 0.19, { sy: 0.6, sz: 0.4, ws: 8, hs: 6, ao: false }); // cheeks
    for (const sx of [-1, 1]) sph(B, 0.05, skin, sx * 0.235, hy, 0, { sx: 0.5, ws: 6, hs: 5, ao: false }); // ears
    const hair = p.hair ?? '#7a3e1e', hs = p.hairStyle ?? 'short';
    if (hs !== 'bald') {
      B.add(new THREE.SphereGeometry(0.255, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, { y: hy + 0.01, z: -0.02, ao: false, jit: 0.06 });
      B.add(new THREE.SphereGeometry(0.25, 14, 8, Math.PI * 0.9, Math.PI * 1.2, Math.PI * 0.3, Math.PI * 0.45), hair, { y: hy, z: -0.02, ao: false, mat: 'char' });
      if (hs === 'bun') sph(B, 0.12, hair, 0, hy + 0.22, -0.12, { ao: false });
      if (hs === 'long') B.add(new THREE.CylinderGeometry(0.22, 0.28, 0.5, 12, 1, true, Math.PI * 0.55, Math.PI * 0.9), hair, { y: hy - 0.18, z: -0.02, ao: false, mat: 'char' });
      if (hs === 'tufts') for (const sx of [-1, 1]) sph(B, 0.09, hair, sx * 0.2, hy + 0.02, -0.04, { ao: false });
      if (hs === 'fringe') for (let i = 0; i < 4; i++) sph(B, 0.07, hair, -0.12 + i * 0.08, hy + 0.15, 0.17, { ao: false, sy: 0.7 });
    }
    if (p.beard) { sph(B, 0.19, p.beard, 0, hy - 0.15, 0.1, { sy: 0.9, sz: 0.7, ao: false, jit: 0.08 }); }
    if (p.moustache) for (const sx of [-1, 1]) B.add(new THREE.CapsuleGeometry(0.035, 0.14, 4, 6), p.moustache, { x: sx * 0.08, y: hy - 0.08, z: 0.22, rz: sx * 1.2, ao: false });
    if (p.glasses) { for (const sx of [-1, 1]) tor(B, 0.055, 0.01, p.glasses, sx * 0.085, hy + 0.02, 0.225, { ts: 12, rs: 4, ao: false }); }
    const hat = p.hat;
    if (hat === 'tinker') {
      B.add(new THREE.SphereGeometry(0.27, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), p.hatC ?? '#8a5a34', { y: hy + 0.06, ao: false, jit: 0.04 });
      cyl(B, 0.3, 0.3, 0.03, p.hatC ?? '#7a4e2c', 0, hy + 0.06, 0.06, { seg: 16, sz: 1.15 });
      for (const sx of [-1, 1]) { cyl(B, 0.06, 0.06, 0.06, '#c89a3a', sx * 0.09, hy + 0.2, 0.2, { rx: 1.1, seg: 10 }); cyl(B, 0.045, 0.045, 0.065, '#8fd8ff', sx * 0.09, hy + 0.205, 0.205, { rx: 1.1, seg: 10, mat: 'glow' }); }
      tor(B, 0.262, 0.018, '#3a2a1e', 0, hy + 0.17, 0, { rx: Math.PI / 2 - 0.25, ts: 18 });
    } else if (hat === 'crown') {
      cyl(B, 0.2, 0.19, 0.12, '#e8c050', 0, hy + 0.25, 0, { seg: 12, open: true, mat: 'char' });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; cone(B, 0.04, 0.1, '#e8c050', Math.sin(a) * 0.19, hy + 0.35, Math.cos(a) * 0.19, { seg: 4 }); }
      sph(B, 0.035, '#d04050', 0, hy + 0.26, 0.2, { ws: 6, hs: 5 });
    } else if (hat === 'helmet') {
      B.add(new THREE.SphereGeometry(0.28, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#b8c0c8', { y: hy + 0.03, ao: false });
      box(B, 0.04, 0.2, 0.06, '#b8c0c8', 0, hy - 0.06, 0.26);
      cone(B, 0.05, 0.25, p.plume ?? '#c8302e', 0, hy + 0.38, -0.02, { seg: 6 });
      cyl(B, 0.3, 0.3, 0.03, '#9aa2ac', 0, hy + 0.03, 0, { seg: 16 });
    } else if (hat === 'witch') {
      cyl(B, 0.4, 0.4, 0.03, p.hatC ?? '#4a3a5a', 0, hy + 0.15, 0, { seg: 18 });
      cone(B, 0.22, 0.55, p.hatC ?? '#4a3a5a', 0, hy + 0.42, -0.04, { seg: 12, rx: -0.25 });
      tor(B, 0.21, 0.03, '#9a6ab0', 0, hy + 0.2, 0, { rx: Math.PI / 2, ts: 14 });
    } else if (hat === 'flatcap') {
      B.add(new THREE.SphereGeometry(0.27, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.4), p.hatC ?? '#6a6a5a', { y: hy + 0.06, sy: 0.75, ao: false });
      box(B, 0.3, 0.03, 0.15, p.hatC ?? '#6a6a5a', 0, hy + 0.1, 0.24, { rx: 0.2 });
    } else if (hat === 'chef') {
      cyl(B, 0.2, 0.18, 0.12, '#f8f4ec', 0, hy + 0.2, 0, { seg: 12 });
      sph(B, 0.24, '#fbf8f2', 0, hy + 0.36, 0, { sy: 0.7, ao: false });
    } else if (hat === 'souwester') {
      B.add(new THREE.SphereGeometry(0.27, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#e8b830', { y: hy + 0.05, ao: false });
      cyl(B, 0.36, 0.38, 0.04, '#d8a820', 0, hy + 0.05, -0.05, { seg: 16, rx: 0.15 });
    }
  });
  // eyes: separate so they can blink
  const eyes = new THREE.Group(); eyes.position.set(0, hy + 0.02, 0); head.add(eyes);
  limb(eyes, (B) => { for (const sx of [-1, 1]) { sph(B, 0.04, '#1e1612', sx * 0.085, 0, 0.215, { sy: 1.25, sz: 0.5, ws: 8, hs: 6, ao: false }); sph(B, 0.012, '#ffffff', sx * 0.085 + 0.012, 0.018, 0.236, { ws: 4, hs: 3, ao: false }); } if (p.brows !== false) for (const sx of [-1, 1]) box(B, 0.08, 0.018, 0.02, p.browC ?? p.hair ?? '#5a3a22', sx * 0.09, 0.075, 0.215, { rz: sx * -0.15, ao: false }); });
  return rig(root, { body, legs, arms, head, eyes, height: (p.hat ? 1.85 : 1.7) * sc, ...p.rig });
}

// fox peddler: humanoid with a fox head + tail
export function makeFox(p = {}) {
  const a = makeHuman({ ...p, skin: '#d8702a', hairStyle: 'bald', hat: null, brows: false, nose: '#2a1a12', top: p.top ?? '#4a6a4a', bottom: '#3a3a2a', boots: '#2a1e16', scarf: '#d8b040' });
  const B = new Batch(3);
  const hy = 1.38 - 1.06 - 0.12;
  for (const sx of [-1, 1]) cone(B, 0.09, 0.22, '#c8601e', sx * 0.15, hy + 0.26, -0.02, { seg: 6, rz: -sx * 0.3 });
  B.add(new THREE.ConeGeometry(0.13, 0.28, 10), '#f4e8d8', { x: 0, y: hy - 0.06, z: 0.27, rx: Math.PI / 2, ao: false });
  sph(B, 0.04, '#1a1210', 0, hy - 0.05, 0.42, { ws: 6, hs: 5 });
  sph(B, 0.17, '#f4e8d8', 0, hy - 0.1, 0.1, { sz: 0.8, ao: false });
  B.finish(a.head).forEach((m) => { m.material = MAT(); m.castShadow = true; });
  const tail = new THREE.Group(); tail.position.set(0, 0.62, -0.2); a.body.add(tail);
  const T2 = new Batch(4); T2.add(jit(new THREE.SphereGeometry(0.16, 10, 8), 0.02), '#d8702a', { y: -0.05, z: -0.25, sz: 2.4, rx: 0.5, ao: false }); sph(T2, 0.1, '#f4e8d8', 0, -0.28, -0.6, { ao: false }); T2.finish(tail).forEach((m) => { m.material = MAT(); m.castShadow = true; });
  a.tail = tail; return a;
}

// Corvin, the Magpie King: a man-sized magpie with a stolen-tinsel crown
export function makeMagpie(p = {}) {
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const B = new Batch(9);
  B.add(jit(new THREE.SphereGeometry(0.45, 16, 12), 0.02), '#1a1c26', { y: 0.9, sy: 1.25, sz: 1.1, rx: 0.35, ao: false });
  B.add(new THREE.SphereGeometry(0.4, 14, 10), '#f4f4f0', { y: 0.82, z: 0.12, sy: 1.1, sz: 0.8, rx: 0.35, ao: false });
  for (const sx of [-1, 1]) B.add(new THREE.SphereGeometry(0.32, 12, 8), '#20264a', { x: sx * 0.38, y: 0.95, z: -0.05, sx: 0.4, sy: 1.3, rz: sx * 0.15, ao: false });
  for (const sx of [-1, 1]) box(B, 0.05, 0.28, 0.05, '#2a2a2a', sx * 0.13, 0.25, 0.05);
  B.add(new THREE.BoxGeometry(0.22, 0.04, 1.3), '#1e2a4e', { y: 0.55, z: -0.75, rx: -0.5, ao: false });
  B.finish(body).forEach((m) => { m.material = MAT(); m.castShadow = true; });
  const head = new THREE.Group(); head.position.set(0, 1.45, 0.12); body.add(head);
  const H = new Batch(10);
  sph(H, 0.27, '#1a1c26', 0, 0, 0, { ao: false });
  H.add(new THREE.ConeGeometry(0.07, 0.34, 8), '#2a2622', { y: -0.02, z: 0.38, rx: Math.PI / 2, ao: false });
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI - Math.PI / 2; cone(H, 0.035, 0.14, '#d8c050', Math.sin(a) * 0.16, 0.27, Math.cos(a) * 0.16 * 0.6 - 0.02, { seg: 4 }); }
  tor(H, 0.17, 0.022, '#d8c050', 0, 0.22, -0.02, { rx: Math.PI / 2, ts: 14 });
  sph(H, 0.04, '#5ac8f0', 0, 0.25, 0.17, { ws: 6, hs: 5, mat: 'glow' });
  H.finish(head).forEach((m) => { m.material = MAT(); m.castShadow = true; });
  const eyes = new THREE.Group(); head.add(eyes);
  const E = new Batch(11); for (const sx of [-1, 1]) { sph(E, 0.055, '#f8f0d0', sx * 0.13, 0.05, 0.2, { ws: 8, hs: 6, ao: false }); sph(E, 0.03, '#141010', sx * 0.135, 0.05, 0.245, { ws: 6, hs: 5, ao: false }); }
  E.finish(eyes).forEach((m) => { m.material = MAT(); });
  const wings = [];
  for (const sx of [-1, 1]) { const g = new THREE.Group(); g.position.set(sx * 0.38, 1.15, -0.05); body.add(g); const W = new Batch(12); W.add(new THREE.SphereGeometry(0.3, 10, 8), '#20264a', { x: sx * 0.08, y: -0.25, sx: 0.35, sy: 1.4, ao: false }); W.add(new THREE.BoxGeometry(0.06, 0.5, 0.2), '#f0f0ea', { x: sx * 0.1, y: -0.2, z: 0.08, ao: false }); W.finish(g).forEach((m) => { m.material = MAT(); m.castShadow = true; }); wings.push(g); }
  return rig(root, { body, legs: [], arms: wings, head, eyes, height: 1.9, bird: true });
}

// small animal helpers (single merged mesh each) — they idle procedurally in the scene update
export function makeAnimal(kind, p = {}) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const B = new Batch(13);
  if (kind === 'duck') {
    sph(B, 0.2, p.col ?? '#f4f0e6', 0, 0.16, 0, { sz: 1.4, sy: 0.75, ao: false });
    sph(B, 0.11, p.head ?? '#3a7a4a', 0, 0.34, 0.2, { ao: false });
    B.add(new THREE.ConeGeometry(0.05, 0.13, 6), '#f0a030', { y: 0.32, z: 0.33, rx: Math.PI / 2, sx: 1.4, sy: 0.5 });
    cone(B, 0.08, 0.14, p.col ?? '#f4f0e6', 0, 0.22, -0.3, { rx: -1.2, seg: 6 });
    for (const sx of [-1, 1]) sph(B, 0.022, '#141010', sx * 0.07, 0.37, 0.27, { ws: 5, hs: 4 });
  } else if (kind === 'cat') {
    sph(B, 0.22, p.col ?? '#e89a4a', 0, 0.2, 0, { sz: 1.5, sy: 0.85, ao: false });
    sph(B, 0.16, p.col ?? '#e89a4a', 0, 0.38, 0.26, { ao: false });
    for (const sx of [-1, 1]) cone(B, 0.06, 0.12, p.col ?? '#e89a4a', sx * 0.09, 0.53, 0.25, { seg: 4 });
    for (const sx of [-1, 1]) sph(B, 0.03, '#4a8a3a', sx * 0.065, 0.41, 0.4, { ws: 6, hs: 5, mat: 'glow' });
    B.add(new THREE.CapsuleGeometry(0.04, 0.4, 4, 6), p.col ?? '#e89a4a', { y: 0.22, z: -0.42, rx: 1.0, ao: false });
    sph(B, 0.07, '#f4ece0', 0, 0.33, 0.39, { sy: 0.6, ao: false });
  } else if (kind === 'horse') {
    B.add(new THREE.CapsuleGeometry(0.22, 0.5, 6, 10), p.col ?? '#8a5a3a', { y: 0.2, z: 0.2, rx: 1.1, ao: false });
    B.add(new THREE.CapsuleGeometry(0.15, 0.28, 6, 10), p.col ?? '#8a5a3a', { y: 0.32, z: 0.62, rx: 1.6, ao: false });
    for (const sx of [-1, 1]) cone(B, 0.05, 0.14, p.col ?? '#8a5a3a', sx * 0.09, 0.66, 0.36, { seg: 5 });
    for (const sx of [-1, 1]) sph(B, 0.03, '#141010', sx * 0.13, 0.48, 0.52, { ws: 5, hs: 4 });
    box(B, 0.06, 0.42, 0.5, '#3a2618', 0, 0.62, 0.05, { rx: 0.4 });
    sph(B, 0.09, '#f4ece4', 0, 0.3, 0.86, { sy: 0.6, ao: false });
  } else if (kind === 'goat') {
    sph(B, 0.28, '#f0ece2', 0, 0.55, 0, { sz: 1.4, sy: 0.85, ao: false });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(B, 0.045, 0.04, 0.4, '#d8d0c2', sx * 0.12, 0.2, sz * 0.22, { seg: 6 });
    sph(B, 0.16, '#f0ece2', 0, 0.8, 0.38, { sz: 1.3, ao: false });
    for (const sx of [-1, 1]) cone(B, 0.035, 0.2, '#8a7a60', sx * 0.07, 1.0, 0.32, { rx: -0.6, seg: 5 });
    for (const sx of [-1, 1]) sph(B, 0.025, '#2a1a10', sx * 0.09, 0.84, 0.5, { ws: 5, hs: 4 });
    cone(B, 0.04, 0.14, '#d8d0c2', 0, 0.64, 0.52, { rx: Math.PI, seg: 5 });
  } else if (kind === 'crab') {
    sph(B, 0.16, '#d0482e', 0, 0.1, 0, { sy: 0.5, sx: 1.3, ao: false });
    for (const sx of [-1, 1]) { sph(B, 0.07, '#d8562e', sx * 0.24, 0.12, 0.14, { sz: 0.7, ao: false }); for (let i = 0; i < 3; i++) cyl(B, 0.012, 0.012, 0.16, '#b83a22', sx * (0.15 + i * 0.02), 0.06, -0.06 + i * 0.06, { rz: sx * 1.2, seg: 4 }); }
    for (const sx of [-1, 1]) sph(B, 0.025, '#141010', sx * 0.05, 0.2, 0.1, { ws: 5, hs: 4 });
  } else if (kind === 'gull') {
    sph(B, 0.12, '#f4f4f0', 0, 0.12, 0, { sz: 1.6, ao: false });
    for (const sx of [-1, 1]) box(B, 0.4, 0.02, 0.12, '#9aa4b0', sx * 0.22, 0.15, 0, { rz: sx * 0.2 });
    cone(B, 0.025, 0.1, '#f0b030', 0, 0.16, 0.22, { rx: Math.PI / 2, seg: 5 });
  } else if (kind === 'chicken') {
    sph(B, 0.14, p.col ?? '#f4ece0', 0, 0.16, 0, { sz: 1.2, ao: false });
    sph(B, 0.07, p.col ?? '#f4ece0', 0, 0.3, 0.12, { ao: false });
    cone(B, 0.03, 0.06, '#e8a030', 0, 0.29, 0.2, { rx: Math.PI / 2, seg: 4 });
    sph(B, 0.03, '#d83a2e', 0, 0.37, 0.12, { ao: false });
    cone(B, 0.06, 0.12, p.col ?? '#f4ece0', 0, 0.24, -0.14, { rx: -0.8, seg: 5 });
  }
  B.finish(body).forEach((m) => { m.material = MAT(); m.castShadow = true; });
  return rig(root, { body, legs: [], arms: [], head: body, eyes: null, height: { duck: 0.5, cat: 0.6, horse: 1.0, goat: 1.2, crab: 0.3, gull: 0.3, chicken: 0.45 }[kind] ?? 0.6, animal: kind });
}

// ------------------------------------------------------------------ procedural motion
function rig(root, parts) {
  const a = {
    root, ...parts, phase: Math.random() * 6, blinkT: 2 + Math.random() * 3, talkT: 0, state: 'idle', anim: null, animT: 0, face: 0, faceTarget: 0,
    speed: 2.0, path: [], onArrive: null,
    headTop() { return new THREE.Vector3(0, this.height + 0.25, 0).applyMatrix4(root.matrixWorld); },
    play(name, dur = 0.8) { this.anim = name; this.animT = 0; this.animDur = dur; return new Promise((r) => (this._animDone = r)); },
    update(dt, t) { animate(this, dt, t); },
  };
  root.userData.actor = a;
  return a;
}
const angLerp = (a, b, k) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * k; };
function animate(a, dt, t) {
  const moving = a.state === 'walk';
  a.face = angLerp(a.face, a.faceTarget, 1 - Math.exp(-dt * 10));
  a.root.rotation.y = a.face;
  const L = a.legs, A = a.arms;
  if (moving) {
    a.phase += dt * a.speed * 4.2;
    const s = Math.sin(a.phase);
    if (L.length) { L[0].rotation.x = s * 0.62; L[1].rotation.x = -s * 0.62; }
    if (A.length && !a.bird) { A[0].rotation.x = -s * 0.5; A[1].rotation.x = s * 0.5; }
    a.body.position.y = Math.abs(Math.cos(a.phase)) * 0.045;
    a.body.rotation.z = s * 0.03; a.body.rotation.x = 0.05;
  } else {
    const k = 1 - Math.exp(-dt * 8);
    for (const l of L) l.rotation.x *= 1 - k;
    if (!a.bird) for (const ar of A) ar.rotation.x *= 1 - k;
    a.body.position.y += (Math.sin(t * 1.6 + a.phase) * 0.008 - a.body.position.y) * k;
    a.body.rotation.z *= 1 - k; a.body.rotation.x *= 1 - k;
    if (a.animal) { a.body.position.y = Math.max(0, Math.sin(t * 2 + a.phase)) * 0.01; a.body.rotation.y = Math.sin(t * 0.7 + a.phase) * 0.25; }
  }
  // talking: head bob + gesturing arm
  if (a.talkT > 0) {
    a.talkT -= dt;
    a.head.rotation.x = Math.sin(t * 11) * 0.06; a.head.rotation.z = Math.sin(t * 4.3) * 0.05;
    if (A.length && !moving && !a.bird) A[1].rotation.x = -0.5 + Math.sin(t * 5) * 0.35;
    if (a.bird && A.length) { A[0].rotation.z = Math.sin(t * 8) * 0.3; A[1].rotation.z = -Math.sin(t * 8) * 0.3; }
  } else if (a.head !== a.body) {
    a.head.rotation.x *= 0.9; a.head.rotation.z *= 0.9;
    a.head.rotation.y = Math.sin(t * 0.37 + a.phase) * 0.18;
  }
  if (a.tail) a.tail.rotation.y = Math.sin(t * 2.2) * 0.35;
  // blink
  if (a.eyes) { a.blinkT -= dt; a.eyes.scale.y = a.blinkT < 0.12 && a.blinkT > 0 ? 0.15 : 1; if (a.blinkT < 0) a.blinkT = 2.5 + Math.random() * 3.5; }
  // one-shot gestures
  if (a.anim) {
    a.animT += dt; const k = Math.min(1, a.animT / a.animDur), w = Math.sin(k * Math.PI);
    if (a.anim === 'reach' && A.length) { A[1].rotation.x = -1.3 * w; a.body.rotation.x = 0.25 * w; }
    if (a.anim === 'pickup' && A.length) { A[1].rotation.x = -0.9 * w; A[0].rotation.x = -0.6 * w; a.body.rotation.x = 0.45 * w; a.body.position.y = -0.18 * w; }
    if (a.anim === 'cheer' && A.length) { A[0].rotation.z = -2.6 * w; A[1].rotation.z = 2.6 * w; a.body.position.y = 0.15 * Math.abs(Math.sin(k * Math.PI * 2)); }
    if (a.anim === 'shrug' && A.length) { A[0].rotation.z = -0.7 * w; A[1].rotation.z = 0.7 * w; }
    if (a.anim === 'flap' && A.length) { A[0].rotation.z = Math.sin(k * 30) * 0.9; A[1].rotation.z = -Math.sin(k * 30) * 0.9; a.body.position.y = 0.3 * w; }
    if (a.anim === 'sleep') { a.body.rotation.x = 0.3 * w; }
    if (k >= 1) { const r = a._animDone; a.anim = null; if (A.length && !a.bird) { A[0].rotation.z = -0.12; A[1].rotation.z = 0.12; } if (A.length && a.bird) { A[0].rotation.z = 0; A[1].rotation.z = 0; } r?.(); }
  }
}
