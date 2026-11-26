// Weapons: kitbashed viewmodels (receiver/barrel/magazine/optic/stock from primitives), ADS with real
// sight alignment, spring-driven kick/sway/bob, learnable recoil patterns with recovery, spread bloom,
// tactical vs empty reloads, per-shell shotgun loading, bolt/pump cycling, swaps, melee and grenade throws.
import { THREE, settings } from '/shared/sd-kit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { WEAPONS, recoilStep } from './config.js';
import { spreadDeg, clamp, damp, DEG } from './logic.js';
import { texture, uniform, materialColor } from 'three/tsl';
export const VMFILL = uniform(0.05); // emissive fill so the gun reads at night (set per time of day)

export const VM_SCALE = 0.3; // viewmodel lives inside the player's collision radius → never clips walls

// ---------------------------------------------------------------- materials
let MAT = null;
function mats() {
  if (MAT) return MAT;
  const flash = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.translate(64, 64);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 64); gr.addColorStop(0, 'rgba(255,255,235,1)'); gr.addColorStop(0.2, 'rgba(255,214,130,0.95)'); gr.addColorStop(0.55, 'rgba(255,130,30,0.3)'); gr.addColorStop(1, 'rgba(255,90,10,0)'); g.fillStyle = gr; g.fillRect(-64, -64, 128, 128);
    g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,190,110,0.8)'; for (let i = 0; i < 5; i++) { g.rotate(Math.PI * 2 / 5 + Math.random() * 0.4); g.beginPath(); g.moveTo(0, -4); g.lineTo(40 + Math.random() * 22, 0); g.lineTo(0, 4); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const flashMat = new THREE.MeshBasicNodeMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  flashMat.colorNode = texture(flash).rgb.mul(2.2);
  MAT = {
    metal: new THREE.MeshStandardNodeMaterial({ color: 0x34373b, metalness: 0.55, roughness: 0.38 }),
    poly: new THREE.MeshStandardNodeMaterial({ color: 0x1c1e20, metalness: 0.08, roughness: 0.62 }),
    tan: new THREE.MeshStandardNodeMaterial({ color: 0x8c7b5b, metalness: 0.05, roughness: 0.72 }),
    olive: new THREE.MeshStandardNodeMaterial({ color: 0x4c5440, metalness: 0.05, roughness: 0.7 }),
    wood: new THREE.MeshStandardNodeMaterial({ color: 0x6b4126, metalness: 0.0, roughness: 0.55 }),
    steel: new THREE.MeshStandardNodeMaterial({ color: 0x8a8e94, metalness: 0.9, roughness: 0.25 }),
    glass: new THREE.MeshStandardNodeMaterial({ color: 0x5a7a9a, metalness: 0.95, roughness: 0.04, transparent: true, opacity: 0.28, depthWrite: false }),
    dot: new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(6, 0.25, 0.12) }),
    holo: new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0.6, 4.5, 1.2) }),
    trit: new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0.5, 3.5, 0.8) }),
    glove: new THREE.MeshStandardNodeMaterial({ color: 0x2a2826, roughness: 0.85, metalness: 0 }),
    sleeve: new THREE.MeshStandardNodeMaterial({ color: 0x4e5640, roughness: 0.92, metalness: 0 }),
    frag: new THREE.MeshStandardNodeMaterial({ color: 0x3d4a32, roughness: 0.6, metalness: 0.2 }),
    flash: flashMat,
  };
  for (const k of ['metal', 'poly', 'tan', 'olive', 'wood', 'steel', 'glove', 'sleeve', 'frag']) MAT[k].emissiveNode = materialColor.mul(VMFILL);
  return MAT;
}

// ---------------------------------------------------------------- kitbash helpers
class Kit {
  constructor() { this.parts = {}; }
  add(mat, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    geo = geo.index ? geo.toNonIndexed() : geo; if (geo.attributes.uv) geo.deleteAttribute('uv');
    geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
    (this.parts[mat] ||= []).push(geo); return this;
  }
  box(mat, w, h, d, x, y, z, rx, ry, rz, r = 0.004) { return this.add(mat, new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2.2, h / 2.2, d / 2.2)), x, y, z, rx, ry, rz); }
  cyl(mat, r0, r1, len, x, y, z, seg = 12, rx = Math.PI / 2, ry = 0, rz = 0) { return this.add(mat, new THREE.CylinderGeometry(r0, r1, len, seg), x, y, z, rx, ry, rz); }
  build() { const g = new THREE.Group(); const M = mats(); for (const [k, list] of Object.entries(this.parts)) { const m = new THREE.Mesh(mergeGeometries(list), M[k]); m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false; g.add(m); } return g; }
}
const rail = (k, len, x, y, z) => { k.box('metal', 0.024, 0.008, len, x, y, z); for (let i = 0; i < Math.floor(len / 0.012); i += 1) k.box('metal', 0.026, 0.006, 0.005, x, y + 0.006, z - len / 2 + 0.006 + i * 0.012, 0, 0, 0, 0.001); };
function redDot(k, z, y) { // tube-less reflex: base, hood, lens, dot
  k.box('poly', 0.034, 0.012, 0.05, 0, y, z); k.box('poly', 0.0035, 0.034, 0.04, 0.0175, y + 0.023, z); k.box('poly', 0.0035, 0.034, 0.04, -0.0175, y + 0.023, z); k.box('poly', 0.038, 0.0035, 0.04, 0, y + 0.041, z);
  k.add('glass', new THREE.PlaneGeometry(0.028, 0.03), 0, y + 0.025, z - 0.018);
  k.add('dot', new THREE.CircleGeometry(0.0009, 10), 0, y + 0.025, z - 0.019);
  return y + 0.025;
}
function holo(k, z, y) {
  k.box('poly', 0.044, 0.016, 0.07, 0, y, z); k.box('poly', 0.006, 0.042, 0.016, 0.02, y + 0.03, z - 0.026); k.box('poly', 0.006, 0.042, 0.016, -0.02, y + 0.03, z - 0.026);
  k.box('poly', 0.046, 0.006, 0.016, 0, y + 0.052, z - 0.026); k.box('poly', 0.006, 0.042, 0.016, 0.02, y + 0.03, z + 0.026); k.box('poly', 0.006, 0.042, 0.016, -0.02, y + 0.03, z + 0.026); k.box('poly', 0.046, 0.006, 0.016, 0, y + 0.052, z + 0.026);
  k.add('glass', new THREE.PlaneGeometry(0.034, 0.03), 0, y + 0.03, z - 0.026);
  k.add('holo', new THREE.RingGeometry(0.0042, 0.0050, 24), 0, y + 0.03, z - 0.0275); k.add('holo', new THREE.CircleGeometry(0.0006, 8), 0, y + 0.03, z - 0.0275);
  return y + 0.03;
}
function scope(k, z, y, len = 0.3, r = 0.02) {
  k.cyl('metal', r, r, len, 0, y, z); k.cyl('metal', r * 1.5, r, 0.06, 0, y, z - len / 2 - 0.02); k.cyl('metal', r * 1.35, r, 0.05, 0, y, z + len / 2 + 0.015);
  k.cyl('metal', r * 0.9, r * 0.9, 0.035, 0, y + r + 0.008, z, 12, 0); k.cyl('metal', r * 0.9, r * 0.9, 0.035, r + 0.008, y, z, 12, 0, 0, Math.PI / 2);
  k.box('metal', 0.02, 0.026, 0.02, 0, y - r - 0.008, z - len / 4); k.box('metal', 0.02, 0.026, 0.02, 0, y - r - 0.008, z + len / 4);
  k.add('glass', new THREE.CircleGeometry(r * 1.4, 16), 0, y, z - len / 2 - 0.05, 0, Math.PI);
  return y;
}
function ironSights(k, frontZ, rearZ, y) {
  k.box('metal', 0.006, 0.016, 0.006, 0, y + 0.004, frontZ); k.add('trit', new THREE.CircleGeometry(0.0012, 8), 0, y + 0.01, frontZ + 0.0035, 0, 0);
  k.box('metal', 0.007, 0.014, 0.008, 0.007, y + 0.003, rearZ); k.box('metal', 0.007, 0.014, 0.008, -0.007, y + 0.003, rearZ);
  return y + 0.01;
}
// Hands: right glove on the grip (child of gun), left arm separate (animated to handguard/mag).
function rightHand(k) {
  k.box('glove', 0.04, 0.085, 0.05, 0.004, -0.045, 0.012, 0.25, 0, 0, 0.012);
  k.box('glove', 0.05, 0.03, 0.06, 0.02, -0.02, -0.01, 0, 0, 0, 0.01); // fingers wrapped
  k.box('glove', 0.02, 0.02, 0.04, -0.014, 0.004, -0.004, 0, 0.3, 0, 0.008); // thumb
  k.cyl('sleeve', 0.034, 0.038, 0.32, 0.03, -0.1, 0.2, 10, Math.PI / 2 - 0.45, 0, -0.18);
}
function leftArm() {
  const k = new Kit();
  k.box('glove', 0.055, 0.035, 0.085, 0, 0, 0, 0, 0, 0, 0.014); k.box('glove', 0.022, 0.024, 0.045, 0.026, 0.012, -0.012, 0, -0.3, 0, 0.008);
  k.cyl('sleeve', 0.03, 0.036, 0.55, -0.075, -0.13, 0.25, 10, Math.PI / 2 - 0.55, -0.3, 0);
  k.box('glove', 0.05, 0.03, 0.05, -0.02, -0.035, 0.05, 0.5, -0.3, 0, 0.012); // wrist cuff
  return k.build();
}

// Each builder returns {group, mag, sightY, muzzle:[x,y,z], port:[x,y,z], hand:[x,y,z] (left hand rest), magPos, slide?, pump?, bolt?}
const BUILD = {
  ar() {
    const k = new Kit();
    k.box('metal', 0.052, 0.058, 0.3, 0, 0.02, -0.06); // upper receiver
    k.box('metal', 0.048, 0.05, 0.2, 0, -0.03, -0.02); // lower
    k.box('poly', 0.03, 0.02, 0.012, 0.027, 0.02, -0.02); // ejection port cover
    rail(k, 0.3, 0, 0.054, -0.07);
    k.add('tan', new THREE.CylinderGeometry(0.032, 0.032, 0.3, 8), 0, 0.02, -0.36, Math.PI / 2, 0, Math.PI / 8); // handguard
    for (let i = 0; i < 5; i++) { k.box('poly', 0.066, 0.012, 0.03, 0, 0.02, -0.26 - i * 0.05); }
    k.cyl('metal', 0.011, 0.011, 0.24, 0, 0.022, -0.6); k.cyl('steel', 0.017, 0.017, 0.07, 0, 0.022, -0.74, 8); k.box('poly', 0.038, 0.007, 0.05, 0, 0.022, -0.735);
    k.box('tan', 0.034, 0.1, 0.045, 0, -0.08, 0.04, 0.28); // grip
    k.box('poly', 0.006, 0.04, 0.04, 0, -0.06, -0.035); // trigger guard
    k.cyl('metal', 0.016, 0.016, 0.2, 0, 0.0, 0.17, 10); k.box('tan', 0.045, 0.1, 0.16, 0, -0.02, 0.27, 0.05); k.box('poly', 0.046, 0.11, 0.02, 0, -0.025, 0.355); // stock
    k.box('metal', 0.012, 0.012, 0.03, -0.022, 0.044, 0.06); // charging handle
    k.box('tan', 0.03, 0.05, 0.03, 0, -0.025, -0.4); // foregrip stub
    const sightY = redDot(k, -0.06, 0.066);
    rightHand(k);
    const g = k.build();
    const m = new Kit(); m.box('metal', 0.03, 0.15, 0.06, 0, -0.06, 0, -0.18); m.box('metal', 0.03, 0.06, 0.06, 0, -0.16, 0.02, -0.4); const mag = m.build(); mag.position.set(0, -0.04, -0.075); g.add(mag);
    return { group: g, mag, sightY, muzzle: [0, 0.022, -0.78], port: [0.03, 0.02, -0.02], hand: [0.0, -0.02, -0.38], ads: -0.12 };
  },
  smg() {
    const k = new Kit();
    k.box('metal', 0.05, 0.08, 0.3, 0, 0.01, -0.08);
    rail(k, 0.24, 0, 0.056, -0.08);
    k.cyl('poly', 0.026, 0.026, 0.16, 0, 0.0, -0.3, 10); for (let i = 0; i < 4; i++) k.box('metal', 0.056, 0.006, 0.012, 0, 0.0, -0.25 - i * 0.035);
    k.cyl('metal', 0.01, 0.01, 0.08, 0, 0.0, -0.42); k.cyl('poly', 0.018, 0.018, 0.04, 0, 0.0, -0.46);
    k.box('poly', 0.032, 0.1, 0.045, 0, -0.08, 0.02, 0.2); k.box('poly', 0.006, 0.035, 0.04, 0, -0.06, -0.05);
    k.box('metal', 0.008, 0.008, 0.24, 0.016, 0.0, 0.17); k.box('metal', 0.008, 0.008, 0.24, -0.016, 0.0, 0.17); k.box('poly', 0.045, 0.09, 0.016, 0, -0.02, 0.29);
    k.box('olive', 0.052, 0.03, 0.14, 0, -0.035, -0.12); // mag well accent
    const sightY = holo(k, -0.07, 0.064);
    rightHand(k);
    const g = k.build();
    const m = new Kit(); m.box('poly', 0.026, 0.19, 0.04, 0, -0.08, 0, -0.06); const mag = m.build(); mag.position.set(0, -0.05, -0.16); g.add(mag);
    return { group: g, mag, sightY, muzzle: [0, 0.0, -0.49], port: [0.03, 0.02, -0.04], hand: [0, -0.04, -0.15], ads: -0.065, handOnMag: true };
  },
  shotgun() {
    const k = new Kit();
    k.box('metal', 0.05, 0.07, 0.26, 0, 0.01, -0.05);
    k.cyl('metal', 0.014, 0.014, 0.5, 0, 0.03, -0.42); k.cyl('metal', 0.013, 0.013, 0.44, 0, -0.005, -0.38);
    k.cyl('steel', 0.016, 0.016, 0.02, 0, 0.03, -0.66, 8);
    k.box('wood', 0.04, 0.1, 0.045, 0, -0.075, 0.05, 0.3); k.box('wood', 0.048, 0.085, 0.24, 0, -0.03, 0.22, 0.08); k.box('poly', 0.05, 0.095, 0.02, 0, -0.04, 0.345);
    k.box('poly', 0.006, 0.035, 0.04, 0, -0.055, -0.02);
    const sightY = ironSights(k, -0.64, -0.01, 0.046); k.box('metal', 0.012, 0.01, 0.6, 0, 0.044, -0.33);
    rightHand(k);
    const g = k.build();
    const p = new Kit(); p.box('wood', 0.054, 0.05, 0.16, 0, 0, 0); for (let i = 0; i < 6; i++) p.box('poly', 0.058, 0.006, 0.006, 0, 0.0, -0.06 + i * 0.024);
    const pump = p.build(); pump.position.set(0, -0.01, -0.3); g.add(pump);
    const m = new Kit(); m.cyl('olive', 0.011, 0.011, 0.05, 0, 0, 0, 8); m.cyl('steel', 0.012, 0.012, 0.008, 0, 0, 0.026, 8); const mag = m.build(); mag.position.set(0, -0.04, -0.06); mag.visible = false; g.add(mag);
    return { group: g, mag, sightY, muzzle: [0, 0.03, -0.67], port: [0.03, 0.02, -0.03], hand: [0, -0.04, -0.3], ads: -0.3, pump, pumpZ: -0.3, handOnPump: true };
  },
  dmr() {
    const k = new Kit();
    k.box('metal', 0.054, 0.064, 0.36, 0, 0.02, -0.08); k.box('metal', 0.05, 0.05, 0.2, 0, -0.035, -0.02);
    rail(k, 0.34, 0, 0.058, -0.1);
    k.add('olive', new THREE.CylinderGeometry(0.034, 0.034, 0.34, 6), 0, 0.02, -0.42, Math.PI / 2, 0, Math.PI / 6);
    k.cyl('metal', 0.012, 0.012, 0.36, 0, 0.022, -0.74); k.cyl('steel', 0.019, 0.019, 0.08, 0, 0.022, -0.95, 8);
    k.box('olive', 0.034, 0.1, 0.045, 0, -0.08, 0.04, 0.28); k.box('poly', 0.006, 0.04, 0.04, 0, -0.06, -0.035);
    k.box('olive', 0.05, 0.11, 0.26, 0, -0.025, 0.25, 0.04); k.box('poly', 0.03, 0.03, 0.1, 0, 0.04, 0.22); k.box('poly', 0.05, 0.12, 0.02, 0, -0.03, 0.385);
    k.box('metal', 0.008, 0.02, 0.1, 0.012, -0.02, -0.5, 0.1); k.box('metal', 0.008, 0.02, 0.1, -0.012, -0.02, -0.5, 0.1);
    const sightY = scope(k, -0.1, 0.1, 0.24, 0.019);
    rightHand(k);
    const g = k.build();
    const m = new Kit(); m.box('metal', 0.032, 0.1, 0.07, 0, -0.05, 0, -0.1); const mag = m.build(); mag.position.set(0, -0.045, -0.08); g.add(mag);
    return { group: g, mag, sightY, muzzle: [0, 0.022, -0.99], port: [0.03, 0.02, -0.03], hand: [0, -0.02, -0.42], ads: -0.13 };
  },
  sniper() {
    const k = new Kit();
    k.cyl('metal', 0.024, 0.024, 0.3, 0, 0.02, -0.05, 14);
    k.box('poly', 0.07, 0.07, 0.62, 0, -0.03, -0.1); k.box('poly', 0.05, 0.12, 0.05, 0, -0.09, 0.08, 0.25);
    k.box('poly', 0.06, 0.12, 0.3, 0, -0.03, 0.34, 0.02); k.box('poly', 0.034, 0.04, 0.16, 0, 0.04, 0.3); k.box('metal', 0.064, 0.13, 0.02, 0, -0.03, 0.495);
    k.cyl('metal', 0.015, 0.012, 0.58, 0, 0.02, -0.62, 10); for (let i = 0; i < 6; i++) k.box('steel', 0.004, 0.032, 0.05, 0, 0.02, -0.45 - i * 0.07);
    k.cyl('steel', 0.022, 0.022, 0.1, 0, 0.02, -0.96, 8); k.box('poly', 0.05, 0.01, 0.07, 0, 0.02, -0.96);
    k.box('poly', 0.006, 0.04, 0.045, 0, -0.06, -0.03);
    const sightY = scope(k, -0.06, 0.1, 0.34, 0.024);
    rightHand(k);
    const g = k.build();
    const b = new Kit(); b.cyl('steel', 0.008, 0.008, 0.06, 0.03, 0.0, 0, 8, 0, 0, Math.PI / 2); b.add('steel', new THREE.SphereGeometry(0.013, 10, 8), 0.065, 0, 0);
    const bolt = b.build(); bolt.position.set(0.0, 0.03, 0.06); g.add(bolt);
    const m = new Kit(); m.box('metal', 0.04, 0.05, 0.09, 0, -0.025, 0); const mag = m.build(); mag.position.set(0, -0.065, -0.06); g.add(mag);
    return { group: g, mag, sightY, muzzle: [0, 0.02, -1.0], port: [0.03, 0.03, 0.0], hand: [0, -0.06, -0.34], ads: -0.2, bolt };
  },
  lmg() {
    const k = new Kit();
    k.box('metal', 0.07, 0.09, 0.4, 0, 0.02, -0.06); k.box('metal', 0.06, 0.05, 0.2, 0, -0.04, -0.02);
    rail(k, 0.24, 0, 0.068, -0.02);
    k.cyl('poly', 0.04, 0.04, 0.36, 0, 0.02, -0.44, 10); for (let i = 0; i < 7; i++) k.box('metal', 0.086, 0.008, 0.016, 0, 0.02, -0.3 - i * 0.045);
    k.cyl('metal', 0.016, 0.016, 0.24, 0, 0.022, -0.72); k.cyl('steel', 0.024, 0.024, 0.06, 0, 0.022, -0.86, 8);
    k.box('metal', 0.016, 0.07, 0.12, 0, 0.11, -0.2); k.box('poly', 0.02, 0.016, 0.16, 0, 0.15, -0.2); // carry handle
    k.box('olive', 0.036, 0.11, 0.05, 0, -0.085, 0.04, 0.28); k.box('poly', 0.006, 0.04, 0.04, 0, -0.07, -0.04);
    k.box('olive', 0.06, 0.12, 0.28, 0, -0.025, 0.27, 0.05); k.box('poly', 0.064, 0.13, 0.02, 0, -0.03, 0.41);
    k.box('metal', 0.01, 0.16, 0.012, 0.016, -0.06, -0.6, 0.5); k.box('metal', 0.01, 0.16, 0.012, -0.016, -0.06, -0.6, 0.5);
    const sightY = redDot(k, 0.06, 0.076);
    rightHand(k);
    const g = k.build();
    const m = new Kit(); m.box('olive', 0.1, 0.12, 0.13, 0, -0.06, 0); m.box('metal', 0.03, 0.04, 0.05, 0.04, 0.0, 0); const mag = m.build(); mag.position.set(-0.02, -0.04, -0.1); g.add(mag);
    return { group: g, mag, sightY, muzzle: [0, 0.022, -0.89], port: [0.04, 0.02, -0.02], hand: [0, -0.03, -0.42], ads: -0.24 };
  },
  pistol() {
    const k = new Kit();
    k.box('poly', 0.03, 0.03, 0.17, 0, -0.005, -0.06); k.box('poly', 0.03, 0.105, 0.045, 0, -0.07, 0.015, 0.22); k.box('poly', 0.006, 0.026, 0.035, 0, -0.035, -0.04);
    rightHand(k);
    const g = k.build();
    const s = new Kit(); s.box('metal', 0.032, 0.032, 0.19, 0, 0, 0); for (let i = 0; i < 5; i++) s.box('metal', 0.034, 0.024, 0.004, 0, 0, 0.06 + i * 0.008);
    ironSights(s, -0.088, 0.085, 0.016); s.cyl('metal', 0.006, 0.006, 0.01, 0, -0.002, -0.097, 8);
    const slide = s.build(); slide.position.set(0, 0.026, -0.065); g.add(slide);
    const m = new Kit(); m.box('metal', 0.024, 0.1, 0.036, 0, -0.05, 0, 0.22); const mag = m.build(); mag.position.set(0, -0.02, 0.018); g.add(mag);
    return { group: g, mag, sightY: 0.026 + 0.026, muzzle: [0, 0.026, -0.17], port: [0.02, 0.03, -0.05], hand: [-0.01, -0.07, 0.005], ads: -0.3, slide, oneHand: true };
  },
};

// ---------------------------------------------------------------- viewmodel rig
const spring = (s, target, k, d, dt) => { const a = (target - s.x) * k - s.v * d; s.v += a * dt; s.x += s.v * dt; };
const S0 = () => ({ x: 0, v: 0 });

export class Viewmodel {
  constructor(camera) {
    this.root = new THREE.Group(); this.root.scale.setScalar(VM_SCALE); camera.add(this.root);
    this.pivot = new THREE.Group(); this.root.add(this.pivot);
    this.guns = {}; this.cur = null;
    this.left = leftArm(); this.pivot.add(this.left);
    const fm = mats().flash; const fg = new THREE.Group();
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), fm); const p2 = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.24), fm); p2.rotation.y = Math.PI / 2; p2.position.z = -0.08;
    const p3 = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.06), fm); p3.rotation.x = Math.PI / 2; p3.position.z = -0.08;
    fg.add(p1, p2, p3); fg.visible = false; this.flash = fg; this.flashT = 0;
    // held grenade (left hand)
    const gk = new Kit(); gk.add('frag', new THREE.SphereGeometry(0.032, 12, 10).scale(1, 1.25, 1)); gk.box('steel', 0.016, 0.03, 0.016, 0, 0.045, 0); gk.box('steel', 0.004, 0.035, 0.012, 0.014, 0.03, 0);
    this.nade = gk.build(); this.nade.visible = false; this.left.add(this.nade); this.nade.position.set(0, 0.035, -0.01);
    this.k = { z: S0(), pitch: S0(), roll: S0(), yaw: S0(), y: S0(), swayX: S0(), swayY: S0(), land: S0() };
    this.t = 0; this.bob = 0;
  }
  get(id) {
    if (!this.guns[id]) { const b = BUILD[id](); b.group.visible = false; this.pivot.add(b.group); b.magBase = b.mag.position.clone(); this.guns[id] = b; }
    return this.guns[id];
  }
  show(id) { for (const g of Object.values(this.guns)) g.group.visible = false; this.cur = this.get(id); this.cur.group.visible = true; this.cur.group.add(this.flash); this.flash.position.set(...this.cur.muzzle); this.flash.position.z -= 0.02; }
  kick(w, ads) {
    const r = w.recoil.kick, k = this.k;
    k.z.v += 1.6 * r * (ads ? 0.55 : 1); k.pitch.v += 9 * r * (ads ? 0.35 : 1) * (0.8 + Math.random() * 0.4); k.roll.v += (Math.random() - 0.5) * 10 * r; k.yaw.v += (Math.random() - 0.5) * 4 * r;
    this.flashT = 0.045; this.flash.visible = true; this.flash.rotation.z = Math.random() * 6.28; const s = 0.75 + Math.random() * 0.6; this.flash.scale.set(s, s, s * (w.id === 'shotgun' ? 1.6 : 1));
    if (this.cur.slide) this.slideT = 0.09;
  }
  // st: {ads, sprint, moving, speed, grounded, crouch, reloadK, reloadStage, swapK, lookDX, lookDY, lean, meleeK, nadeK, pumpK, boltK, scoped}
  update(dt, st) {
    const g = this.cur; if (!g) return; const k = this.k; this.t += dt;
    const rm = settings.reducedMotion ? 0.35 : 1;
    // springs
    spring(k.z, 0, 160, 16, dt); spring(k.pitch, 0, 150, 15, dt); spring(k.roll, 0, 120, 14, dt); spring(k.yaw, 0, 130, 14, dt); spring(k.land, 0, 90, 11, dt);
    spring(k.swayX, clamp(-st.lookDX * 0.0009, -0.05, 0.05) * rm, 80, 12, dt); spring(k.swayY, clamp(st.lookDY * 0.0009, -0.05, 0.05) * rm, 80, 12, dt);
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
    const ads = st.ads, hip = 1 - ads;
    // walk bob (figure-8), stronger when sprinting, nearly none in ADS
    if (st.moving && st.grounded) this.bob += dt * (st.sprint ? 13 : 9) * Math.min(1, st.speed / 4.5);
    const bobA = (st.moving && st.grounded ? 1 : 0) * (st.sprint ? 1.8 : 1) * (0.15 + hip * 0.85) * rm;
    const bx = Math.sin(this.bob) * 0.012 * bobA, by = -Math.abs(Math.cos(this.bob)) * 0.012 * bobA;
    const breathe = Math.sin(this.t * 1.6) * 0.0025 * (hip + 0.2) * rm;
    // poses (camera space, real scale)
    const P = this.pos || (this.pos = new THREE.Vector3()), R = this.rot || (this.rot = new THREE.Euler());
    const hipP = g.oneHand ? [0.15, -0.17, -0.36] : [0.17, -0.19, -0.42];
    const adsP = [0, -g.sightY, g.ads];
    P.set(hipP[0] * hip + adsP[0] * ads, hipP[1] * hip + adsP[1] * ads, hipP[2] * hip + adsP[2] * ads);
    R.set(0, 0.035 * hip, -0.02 * hip);
    if (st.crouch && hip > 0.5) { P.x -= 0.015 * hip; R.z += 0.06 * hip; }
    const sp = st.sprintK || 0; // sprint pose: tilted across the body
    P.x += -0.05 * sp; P.y += -0.06 * sp; P.z += 0.06 * sp; R.x += -0.35 * sp; R.y += 0.75 * sp; R.z += 0.35 * sp;
    // reload: roll the gun, drop it slightly
    const rl = st.reloadK || 0; P.y -= 0.05 * rl; P.x -= 0.02 * rl; R.z += 0.55 * rl; R.x += 0.18 * rl;
    // swap: drop out of view
    const sw = st.swapK || 0; P.y -= 0.3 * sw; R.x -= 0.9 * sw;
    // melee: shove forward-left
    const ml = st.meleeK || 0; P.z -= 0.12 * Math.sin(ml * Math.PI); P.x -= 0.08 * Math.sin(ml * Math.PI); R.y += 0.5 * Math.sin(ml * Math.PI); R.z -= 0.4 * Math.sin(ml * Math.PI);
    // grenade: lower the gun
    const nk = st.nadeK || 0; P.y -= 0.12 * nk; R.x -= 0.4 * nk;
    // pump / bolt cycling jerk
    if (st.pumpK) { R.x += 0.08 * Math.sin(st.pumpK * Math.PI); P.z += 0.02 * Math.sin(st.pumpK * Math.PI); }
    if (st.boltK) { R.z += 0.25 * Math.sin(st.boltK * Math.PI); R.y -= 0.1 * Math.sin(st.boltK * Math.PI); }
    this.pivot.position.set(P.x + bx + k.swayX.x + st.lean * 0.04, P.y + by + breathe + k.swayY.x - k.land.x * 0.04, P.z + k.z.x * 0.03);
    this.pivot.rotation.set(R.x + k.pitch.x * 0.012 + k.swayY.x * 2, R.y + k.yaw.x * 0.01 - k.swayX.x * 1.5, R.z + k.roll.x * 0.012 + Math.sin(this.bob) * 0.02 * bobA - st.lean * 0.15);
    this.pivot.updateMatrix();
    g.group.position.set(0, 0, 0);
    // magazine animation during reload stages: 0 out, 1 in
    if (st.reloadStage === 1 && g.mag.visible !== false) { const t = st.stageK; g.mag.position.copy(g.magBase); g.mag.position.y -= t * 0.25; g.mag.rotation.x = t * 0.3; }
    else if (st.reloadStage === 2) { const t = st.stageK; g.mag.position.copy(g.magBase); g.mag.position.y -= (1 - t) * 0.18; g.mag.rotation.x = (1 - t) * 0.2; }
    else { g.mag.position.copy(g.magBase); g.mag.rotation.x = 0; }
    if (g.pump) g.pump.position.z = g.pumpZ + (st.pumpK ? Math.sin(st.pumpK * Math.PI) * 0.09 : 0);
    if (g.bolt) { const b = st.boltK ? Math.sin(st.boltK * Math.PI) : 0; g.bolt.rotation.z = -b * 1.2; g.bolt.position.z = 0.06 + Math.max(0, (st.boltK || 0) - 0.3) * 0.12 * (1 - Math.max(0, (st.boltK || 0) - 0.65) * 2.8); }
    if (g.slide) { this.slideT = Math.max(0, (this.slideT || 0) - dt); g.slide.position.z = -0.065 + (this.slideT > 0 ? 0.03 : 0) + (st.slideLocked ? 0.03 : 0); }
    // left hand: handguard, or mag during reload, or holding grenade
    const L = this.left; const hand = g.hand;
    const lp = this.lp || (this.lp = new THREE.Vector3());
    if (nk > 0.01) { lp.set(-0.12, -0.12 + 0.02 * nk, -0.3); L.rotation.set(0.3, 0.2, 0.2); }
    else if (st.reloadStage === 1 || st.reloadStage === 2) { const mp = g.mag.position; lp.set(mp.x - 0.01, mp.y - 0.12, mp.z + 0.02); L.rotation.set(0.6, 0, 0.3); }
    else if (g.oneHand) { lp.set(hand[0] - 0.012, hand[1], hand[2] + 0.015); L.rotation.set(0.3, 0.4, -0.3); }
    else { lp.set(hand[0], hand[1] + (g.pump && st.pumpK ? 0 : 0), hand[2] + (g.pump && st.pumpK ? Math.sin(st.pumpK * Math.PI) * 0.09 : 0)); L.rotation.set(0.05, 0, 0.1); }
    lp.applyEuler(_eu.set(0, 0, 0)); // hand coords are in gun space (gun group has identity transform under pivot)
    L.position.lerp(lp, 1 - Math.exp(-28 * dt));
    this.nade.visible = nk > 0.05;
    this.root.visible = !st.scoped;
  }
  // camera-space (unscaled) points for world effects
  muzzleCam(out) { return this._camPoint(this.cur.muzzle, out); }
  portCam(out) { return this._camPoint(this.cur.port, out); }
  _camPoint(p, out) { out.set(p[0], p[1], p[2]).applyMatrix4(this.pivot.matrix); return out; }
}
const _eu = new THREE.Euler();

// ---------------------------------------------------------------- player arsenal (state machine)
export class Arsenal {
  constructor(game) {
    this.game = game; this.slots = []; this.idx = 0; this.vm = game.vm;
    this.cool = 0; this.reloadT = 0; this.reloadDur = 0; this.reloadEmpty = false; this.reloadStage = 0; this.stageK = 0;
    this.swapT = 0; this.swapDur = 0; this.burst = 0; this.bloom = 0; this.ads = 0; this.adsHeld = false;
    this.kp = 0; this.ky = 0; this.kpT = 0; this.kyT = 0; this.lastShot = 99; this.pumpT = 0; this.boltT = 0; this.meleeT = 0; this.nadeT = 0; this.cook = -1;
    this.triggerHeld = false; this.triggerPrev = false; this.sprintOut = 0; this.shots = 0; this.hits = 0; this.heads = 0;
    this.frags = 2; this.smokes = 1; this.breath = 1; this.holdBreath = false;
  }
  setLoadout(ids, tiers = []) {
    this.slots = ids.filter(Boolean).map((id, i) => this.makeSlot(id, tiers[i] ?? 0));
    this.idx = 0; this.equip(0, true);
  }
  makeSlot(id, tier = 0) { const w = WEAPONS[id]; return { id, w, tier, mag: w.mag, reserve: w.reserve }; }
  get slot() { return this.slots[this.idx]; }
  get w() { return this.slot?.w; }
  equip(i, instant = false) {
    if (!this.slots[i]) return; if (i === this.idx && !instant && this.swapT <= 0) return;
    this.cancelReload(); this.idx = i; this.vm.show(this.slot.id);
    this.swapDur = instant ? 0.01 : this.w.swap; this.swapT = this.swapDur; this.burst = 0;
    this.game.audio?.swap(); this.game.hud?.weapon(this);
  }
  swapNext() { if (this.slots.length > 1) this.equip((this.idx + 1) % this.slots.length); }
  cancelReload() { this.reloadT = 0; this.reloadStage = 0; }
  get reloading() { return this.reloadT > 0; }
  startReload() {
    const s = this.slot; if (!s || this.reloadT > 0 || this.swapT > 0) return;
    const w = s.w; const full = w.perShell ? w.mag : w.mag + (s.mag > 0 ? 1 : 0);
    if (s.mag >= full || s.reserve <= 0) return;
    this.reloadEmpty = s.mag === 0; this.reloadDur = w.perShell ? w.reload + (this.reloadEmpty ? 0.35 : 0) : this.reloadEmpty ? w.reloadEmpty : w.reload;
    this.reloadT = this.reloadDur; this.burst = 0; this.game.audio?.reloadStart(w);
  }
  // returns true if fired
  update(dt, inp, pl) {
    const s = this.slot; if (!s) return; const w = s.w; const g = this.game;
    this.cool -= dt; this.lastShot += dt;
    if (this.swapT > 0) this.swapT -= dt;
    // ADS (hold or toggle)
    const wantAds = (inp.ads && !pl.sprinting && this.swapT <= 0 && this.meleeT <= 0 && !(this.reloadT > 0 && !w.perShell) && !pl.mantling) ? 1 : 0;
    const adsRate = 1 / (w.ads * (pl.slideT > 0 ? 1.4 : 1));
    this.ads = clamp(this.ads + (wantAds ? adsRate : -adsRate * 1.25) * dt, 0, 1);
    // reload progress
    if (this.reloadT > 0) {
      this.reloadT -= dt; const k = 1 - this.reloadT / this.reloadDur;
      if (w.perShell) {
        this.reloadStage = 0;
        if (this.reloadT <= 0) {
          if (s.reserve > 0 && s.mag < w.mag) { s.mag++; s.reserve--; g.audio?.shell(); g.hud?.ammo(this); }
          if (s.mag < w.mag && s.reserve > 0 && !inp.fire) { this.reloadDur = w.reload; this.reloadT = w.reload; }
          else if (this.reloadEmpty) { this.pumpT = 0.4; g.audio?.pump(); this.reloadEmpty = false; }
        }
      } else {
        const prevStage = this.reloadStage;
        this.reloadStage = k < 0.3 ? 1 : k < 0.62 ? 2 : 3; this.stageK = this.reloadStage === 1 ? k / 0.3 : this.reloadStage === 2 ? (k - 0.3) / 0.32 : (k - 0.62) / 0.38;
        if (prevStage === 1 && this.reloadStage === 2) g.audio?.magOut(w);
        if (prevStage === 2 && this.reloadStage === 3) { g.audio?.magIn(w); }
        if (this.reloadT <= 0) {
          const full = w.mag + (this.reloadEmpty ? 0 : 1); const need = full - s.mag, take = Math.min(need, s.reserve);
          s.mag += take; s.reserve -= take; this.reloadStage = 0; if (this.reloadEmpty) g.audio?.rack(w); g.hud?.ammo(this);
        }
      }
    }
    if (this.pumpT > 0) this.pumpT -= dt; if (this.boltT > 0) this.boltT -= dt; if (this.meleeT > 0) this.meleeT -= dt;
    // recoil: kick springs toward target; target recovers when not firing
    const firing = inp.fire && this.lastShot < 0.25;
    const rec = w.recoil.recover * (firing ? 0.12 : 1) * DEG;
    const dec = (v, r) => (Math.abs(v) <= r ? 0 : v - Math.sign(v) * r);
    this.kpT = dec(this.kpT, rec * dt); this.kyT = dec(this.kyT, rec * dt * 1.2);
    const kp0 = this.kp, ky0 = this.ky;
    this.kp = damp(this.kp, this.kpT, 28, dt); this.ky = damp(this.ky, this.kyT, 28, dt);
    pl.pitch += this.kp - kp0; pl.yaw += this.ky - ky0; // applied as real aim change → player must pull down to stay on target
    this.bloom = Math.max(0, this.bloom - w.spread.decay * dt * (this.lastShot > 0.12 ? 1 : 0.3));
    if (!inp.fire) this.burst = this.lastShot > 0.3 ? 0 : this.burst;
    // scoped breath
    const scoped = w.optic === 'sniper' || w.optic === 'scope4';
    this.holdBreath = scoped && this.ads > 0.9 && inp.sprint && this.breath > 0;
    this.breath = clamp(this.breath + (this.holdBreath ? -dt / 4 : dt / 6), 0, 1);
    // trigger
    const pressed = inp.fire && !this.triggerPrev; this.triggerPrev = inp.fire;
    if (pl.sprinting && inp.fire) pl.stopSprint();
    if (pl.sprintK > 0.45) return false; // sprint-to-fire delay comes from the sprint pose easing out
    if (this.swapT > 0 || this.meleeT > 0 || this.nadeT > 0 || pl.mantling) return false;
    const wantFire = w.auto ? inp.fire : pressed;
    if (!wantFire || this.cool > 0) return false;
    if (this.pumpT > 0 || this.boltT > 0) return false;
    if (this.reloadT > 0) { if (w.perShell && s.mag > 0) this.cancelReload(); else return false; }
    if (s.mag <= 0) { if (pressed) { g.audio?.dry(); this.startReload(); } return false; }
    this.fire(s, w, pl);
    return true;
  }
  fire(s, w, pl) {
    const g = this.game; s.mag--; this.cool = 60 / w.rpm; this.lastShot = 0; this.shots++;
    const tier = g.tierInfo?.(s.tier) || { dmg: 1, recoil: 1 };
    const spd = spreadDeg(w, { ads: this.ads, moving: pl.speedH > 1.2, grounded: pl.grounded, crouch: pl.crouchK > 0.5, sliding: pl.slideT > 0, bloom: this.bloom }) * (this.holdBreath ? 0.5 : 1);
    const cam = g.camera; cam.updateMatrixWorld();
    const origin = _o.setFromMatrixPosition(cam.matrixWorld); const fwd = _fw.set(0, 0, -1).transformDirection(cam.matrixWorld);
    const right = _r.set(1, 0, 0).transformDirection(cam.matrixWorld), up = _u.set(0, 1, 0).transformDirection(cam.matrixWorld);
    const muz = this.vm.muzzleCam(_mz); cam.localToWorld(muz);
    for (let p = 0; p < w.pellets; p++) {
      const cone = (w.pellets > 1 ? w.spread.pelletCone * (1 - this.ads * 0.25) : spd) * DEG;
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * Math.tan(cone);
      _dir.copy(fwd).addScaledVector(right, Math.cos(a) * rr).addScaledVector(up, Math.sin(a) * rr).normalize();
      g.shoot({ shooter: g.player, team: g.player.team, ox: origin.x, oy: origin.y, oz: origin.z, dir: _dir, w, tierMul: tier.dmg, muzzle: muz, tracer: p === 0 && (s.mag % w.tracerEvery === 0), pellet: w.pellets > 1 });
    }
    this.bloom = Math.min(w.spread.bloomMax, this.bloom + w.spread.bloom);
    const [rv, rh] = recoilStep(w, this.burst++);
    const mul = tier.recoil * (1 - this.ads * 0.3) * (pl.crouchK > 0.5 ? 0.82 : 1) * DEG;
    this.kpT += rv * mul; this.kyT += rh * mul;
    this.vm.kick(w, this.ads > 0.5);
    g.shake?.(w.recoil.kick * 0.012); g.punch = Math.min(0.035, (g.punch || 0) + 0.006 * w.recoil.kick * (1 - this.ads * 0.6));
    // shells + effects
    const port = this.vm.portCam(_pt); cam.localToWorld(port);
    const ej = _ej.copy(right).multiplyScalar(2.2 + Math.random()).addScaledVector(up, 1.6 + Math.random()).addScaledVector(fwd, -0.4);
    port.addScaledVector(right, 0.18).addScaledVector(fwd, 0.08);
    if (!w.pump && !w.bolt) g.fx.shell(port.x, port.y, port.z, ej.x + pl.vel.x, ej.y, ej.z + pl.vel.z, (x, y, z) => g.audio?.shellBounce(x, y, z));
    g.muzzleLight?.(muz, 1);
    g.audio?.shot(w, 0, 0, true);
    g.noise?.(origin.x, origin.z, 55, g.player);
    if (w.pump) { this.pumpT = 0.55; setTimeout(() => g.audio?.pump(), 260); }
    if (w.bolt) { this.boltT = 1.05; setTimeout(() => g.audio?.bolt(), 380); }
    if (s.mag === 0 && s.reserve > 0) setTimeout(() => { if (this.slot === s && s.mag === 0) this.startReload(); }, 280);
    g.hud?.ammo(this);
  }
  vmState(pl, inp) {
    const s = this.slot; const w = s?.w;
    const scoped = w && (w.optic === 'sniper' || w.optic === 'scope4') && this.ads > 0.86;
    return {
      ads: this.ads, sprint: pl.sprinting, sprintK: pl.sprintK, moving: pl.speedH > 0.5, speed: pl.speedH, grounded: pl.grounded, crouch: pl.crouchK > 0.5,
      reloadK: this.reloadT > 0 ? Math.sin(Math.min(1, (1 - this.reloadT / this.reloadDur)) * Math.PI) ** 0.5 * (w?.perShell ? 0.5 : 1) : 0,
      reloadStage: this.reloadStage, stageK: this.stageK,
      swapK: this.swapT > 0 ? Math.min(1, this.swapT / Math.max(0.01, this.swapDur)) : 0,
      lookDX: inp.lookDX, lookDY: inp.lookDY, lean: pl.leanK, meleeK: this.meleeT > 0 ? 1 - this.meleeT / 0.45 : 0,
      nadeK: this.nadeT > 0 ? 1 : 0, pumpK: this.pumpT > 0 ? 1 - this.pumpT / 0.55 : 0, boltK: this.boltT > 0 ? 1 - this.boltT / 1.05 : 0, scoped,
      slideLocked: w?.id === 'pistol' && s.mag === 0,
    };
  }
  addAmmo(frac = 1) { for (const s of this.slots) s.reserve = Math.min(s.w.reserve * 2, s.reserve + Math.ceil(s.w.reserve * frac)); this.game.hud?.ammo(this); }
}
const _o = new THREE.Vector3(), _fw = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _dir = new THREE.Vector3(), _mz = new THREE.Vector3(), _pt = new THREE.Vector3(), _ej = new THREE.Vector3();
