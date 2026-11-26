// Emberwake — HD-2D render stack: pixel atlas materials (Lambert + baked AO), occlusion dither around the hero,
// animated pixel water, flame cards, a screen-space sky, tilt-shift depth of field + bloom + grade, lighting presets
// and a fixed pool of point lights (never changes the light count → no shader recompiles).
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, texture, vertexColor, positionWorld, positionView, positionLocal, screenUV, vec2, vec3, vec4, float, mix, smoothstep,
  sin, time, fract, floor, length, dot, abs, max, min, pass, luminance, attribute, mx_noise_float, uv, pow, bool, clamp, screenSize, step,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import { buildAtlas } from './atlas.js';
import { settings } from '/shared/sd-kit.js';

export const U = {
  playerScreen: uniform(new THREE.Vector2(0.5, 0.5)), playerViewZ: uniform(-20), playerY: uniform(0), aspect: uniform(1.6), occl: uniform(1),
  glow: uniform(1), windAmt: uniform(1),
  waterDeep: uniform(new THREE.Color('#1d4a6a')), waterShallow: uniform(new THREE.Color('#3f8aa0')), waterGlint: uniform(new THREE.Color('#d8f4ff')),
  skyTop: uniform(new THREE.Color('#2c3a6e')), skyMid: uniform(new THREE.Color('#e88a5a')), skyLow: uniform(new THREE.Color('#ffc890')), stars: uniform(0),
  focusY: uniform(0.5), focusBand: uniform(0.2), tilt: uniform(1), sat: uniform(1.08), tint: uniform(new THREE.Color(1, 1, 1)), vign: uniform(0.5), fade: uniform(0),
  lift: uniform(new THREE.Color(0, 0, 0)),
};

export const M = {};
let atlasTex = null;
export function makeMaterials() {
  const cv = buildAtlas();
  atlasTex = new THREE.CanvasTexture(cv); atlasTex.colorSpace = THREE.SRGBColorSpace;
  atlasTex.magFilter = THREE.NearestFilter; atlasTex.minFilter = THREE.LinearMipmapLinearFilter; atlasTex.anisotropy = 4; atlasTex.generateMipmaps = true;
  const tex = texture(atlasTex);
  // occlusion dither: geometry between the camera and the hero (and above the hero's feet) gets a checkerboard cut-out
  const occlMask = Fn(() => {
    const d = screenUV.sub(U.playerScreen).mul(vec2(U.aspect, 1)).length();
    const near = positionView.z.greaterThan(U.playerViewZ.add(1.2));
    const above = positionWorld.y.greaterThan(U.playerY.add(0.45));
    const pxc = floor(screenUV.mul(screenSize).div(2.0));
    const checker = fract(pxc.x.add(pxc.y).mul(0.5)).greaterThan(0.25);
    const cut = near.and(above).and(d.lessThan(0.11)).and(checker).and(U.occl.greaterThan(0.5));
    return cut.not();
  });
  const lambert = (o = {}) => {
    const m = new THREE.MeshLambertNodeMaterial({ vertexColors: true, side: o.side ?? THREE.FrontSide });
    m.colorNode = tex.mul(vec4(vertexColor(), 1));
    if (o.alpha) { m.alphaTest = 0.5; m.transparent = false; }
    if (o.occl !== false) { m.maskNode = occlMask(); m.maskShadowNode = bool(true); }
    return m;
  };
  M.world = lambert();
  M.worldDS = lambert({ side: THREE.DoubleSide });
  M.cards = lambert({ side: THREE.DoubleSide, alpha: true, occl: false });
  // wind sway on cards: the `sway` attribute is 0 at the root, 1 at the tip
  M.cards.positionNode = Fn(() => {
    const s = attribute('sway', 'float');
    const w = sin(time.mul(1.7).add(positionLocal.x.mul(0.9)).add(positionLocal.z.mul(0.6))).mul(0.06).mul(U.windAmt);
    return positionLocal.add(vec3(w.mul(s), 0, w.mul(s).mul(0.4)));
  })();
  M.cards.maskNode = null;
  M.leaves = lambert();
  M.leaves.positionNode = Fn(() => {
    const s = attribute('sway', 'float');
    const w = sin(time.mul(1.1).add(positionLocal.x.mul(0.5)).add(positionLocal.z.mul(0.7))).mul(0.035).mul(U.windAmt);
    return positionLocal.add(vec3(w.mul(s), 0, w.mul(s)));
  })();
  // emissive props (windows, lamp glass, crystals, glow-moss): vertex colours can exceed 1 → bloom
  M.glow = new THREE.MeshBasicNodeMaterial({ vertexColors: true });
  M.glow.colorNode = Fn(() => {
    const p = positionWorld; const fl = sin(time.mul(6.3).add(p.x.mul(3.1)).add(p.z.mul(1.7))).mul(0.06).add(sin(time.mul(11.7).add(p.x)).mul(0.04)).add(1);
    return vec4(vertexColor().mul(U.glow).mul(fl), 1);
  })();
  M.glow.fog = false;
  M.atlas = atlasTex;
  makeWater(); makeFlame();
  return M;
}

function makeWater() {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  m.colorNode = Fn(() => {
    const p = positionWorld.xz;
    const q = floor(p.mul(16)).div(16); // pixel-quantised like the sprites
    const n1 = mx_noise_float(vec3(q.x.mul(0.7), q.y.mul(1.6), time.mul(0.35)));
    const n2 = mx_noise_float(vec3(q.x.mul(2.3).add(time.mul(0.4)), q.y.mul(3.1), time.mul(0.6)));
    const shore = texture(waterMaskTex, positionWorld.xz.div(waterMaskSize.xy)).r; // 1 = open water, 0 = near shore
    let c = mix(U.waterShallow, U.waterDeep, smoothstep(0.1, 0.9, shore).mul(0.8).add(n1.mul(0.15)));
    const glint = smoothstep(0.42, 0.6, n2).mul(smoothstep(0.25, 0.8, shore).mul(0.5).add(0.5));
    c = c.add(U.waterGlint.mul(glint).mul(0.5));
    const foam = smoothstep(0.16, 0.0, shore).add(smoothstep(0.32, 0.18, shore).mul(step(0.55, fract(n1.mul(3).add(time.mul(0.25)))).mul(0.6)));
    c = mix(c, vec3(0.92, 0.97, 1.0), clamp(foam, 0, 1).mul(0.85));
    return vec4(c, mix(0.86, 0.95, shore));
  })();
  M.water = m;
}
const waterMaskTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); waterMaskTex.needsUpdate = true;
const waterMaskSize = uniform(new THREE.Vector2(1, 1));
// per-map signed-ish distance-to-shore mask (1 texel per tile, linear filtering)
export function setWaterMask(W, H, isWater) {
  const d = new Uint8Array(W * H * 4);
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    let best = 4;
    if (isWater(x, z)) { for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (!isWater(x + dx, z + dz, true)) best = Math.min(best, Math.hypot(dx, dz)); }
    else best = 0;
    const v = Math.round(Math.min(1, Math.max(0, (best - 0.5) / 3)) * 255); const i = (z * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  waterMaskTex.image = { data: d, width: W, height: H }; waterMaskTex.magFilter = waterMaskTex.minFilter = THREE.LinearFilter; waterMaskTex.flipY = false; waterMaskTex.needsUpdate = true;
  waterMaskSize.value.set(W, H);
}

function makeFlame() {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  m.colorNode = Fn(() => {
    const p = uv(); const seed = attribute('seed', 'float');
    const t = time.mul(2.2).add(seed.mul(7.0));
    const q = floor(p.mul(12)).div(12); // chunky pixel flame
    const n = mx_noise_float(vec3(q.x.mul(3.0), q.y.mul(2.0).sub(t), seed));
    const w = q.x.sub(0.5).abs().mul(2.0);
    const shape = smoothstep(0.95, 0.25, w.add(q.y.mul(0.9)).add(n.mul(0.35)));
    const core = smoothstep(0.55, 0.1, w.add(q.y.mul(1.2)).add(n.mul(0.2)));
    const col = mix(vec3(1.6, 0.45, 0.12), vec3(2.6, 2.0, 1.1), core);
    return vec4(col.mul(shape).mul(vertexColor()), shape);
  })();
  m.fog = false;
  M.flame = m;
}

// ------------------------------------------------------------------ sky (screen-space, the camera never looks at the horizon much)
export function skyNode() {
  return Fn(() => {
    const y = screenUV.y.oneMinus(); // 0 bottom → 1 top
    let c = mix(U.skyLow, U.skyMid, smoothstep(0.0, 0.45, y));
    c = mix(c, U.skyTop, smoothstep(0.4, 1.0, y));
    const cell = floor(screenUV.mul(vec2(220, 130)));
    const h = fract(sin(dot(cell, vec2(12.9898, 78.233))).mul(43758.5453));
    const tw = sin(time.mul(h.mul(3).add(1)).add(h.mul(30))).mul(0.3).add(0.7);
    c = c.add(vec3(1, 0.95, 0.85).mul(step(0.994, h)).mul(U.stars).mul(tw).mul(smoothstep(0.3, 0.8, y)));
    return c;
  })();
}

// ------------------------------------------------------------------ post: tilt-shift + bloom + grade
export function createPost(renderer, scene, camera) {
  const pipeline = new THREE.RenderPipeline(renderer);
  const sp = pass(scene, camera);
  const col = sp.getTextureNode('output');
  const low = settings.quality === 'low';
  const blurred = low ? col : gaussianBlur(col, null, 3, { resolutionScale: 0.5 });
  const b = low ? vec3(0) : bloom(col, 0.6, 0.5, 0.78);
  pipeline.outputNode = Fn(() => {
    const uvv = screenUV;
    const ts = smoothstep(U.focusBand, U.focusBand.add(0.3), abs(uvv.y.sub(U.focusY))).mul(U.tilt);
    let c = mix(col.rgb, blurred.rgb, ts);
    c = c.add(b.rgb);
    const l = luminance(c);
    c = mix(vec3(l), c, U.sat).mul(U.tint).add(U.lift);
    const v = smoothstep(0.35, 1.05, length(uvv.sub(0.5).mul(vec2(1.25, 1.0))));
    c = c.mul(float(1).sub(v.mul(U.vign)));
    c = mix(c, vec3(0), U.fade);
    return vec4(c, 1);
  })();
  return { pipeline, render: () => pipeline.render() };
}

// ------------------------------------------------------------------ lighting presets
export const PRESETS = {
  dusk: { sky: ['#2d3a72', '#d9826a', '#ffcf98'], fog: '#c89884', fogR: [30, 75], hemi: ['#9aa8e0', '#5a3a2a', 0.85], key: ['#ffb27a', 2.5, [-8, 12, 7]], rim: ['#8a9aff', 0.7, [8, 6, -9]], amb: 0.18, glow: 1.0, water: ['#244e70', '#4a90a0'], sat: 1.12, tint: '#fff4ea', stars: 0.15, lantern: 0, wind: 1 },
  bluedusk: { sky: ['#1c2a58', '#6a7ab0', '#f0a890'], fog: '#8ea0c0', fogR: [30, 80], hemi: ['#8aa0d8', '#3a3a4a', 0.85], key: ['#ffb490', 2.1, [-10, 10, 6]], rim: ['#6a8aff', 0.9, [9, 6, -8]], amb: 0.2, glow: 1.1, water: ['#1e4468', '#3c7c96'], sat: 1.05, tint: '#eef2ff', stars: 0.35, lantern: 0, wind: 1.3 },
  cave: { sky: ['#000000', '#05080a', '#0a100c'], fog: '#0a1210', fogR: [14, 34], hemi: ['#4a6a5a', '#100c08', 0.45], key: ['#8aa8c0', 0.5, [-4, 14, 6]], rim: ['#3a6a5a', 0.35, [6, 6, -6]], amb: 0.06, glow: 1.3, water: ['#0a2a2a', '#1a4a4a'], sat: 1.1, tint: '#f2fff4', stars: 0, lantern: 1, wind: 0.2 },
  crystal: { sky: ['#000000', '#04060c', '#080c18'], fog: '#081422', fogR: [14, 36], hemi: ['#4a6a9a', '#0a0a14', 0.5], key: ['#9ab8ff', 0.55, [-4, 14, 6]], rim: ['#a08aff', 0.4, [6, 6, -6]], amb: 0.07, glow: 1.35, water: ['#0a2a4a', '#2a7aa0'], sat: 1.15, tint: '#eef4ff', stars: 0, lantern: 1, wind: 0.2 },
  crystalLit: { sky: ['#000000', '#08080a', '#140f08'], fog: '#1c1810', fogR: [16, 40], hemi: ['#b0a080', '#1a140a', 0.7], key: ['#ffd8a0', 1.0, [-4, 14, 6]], rim: ['#a08aff', 0.4, [6, 6, -6]], amb: 0.1, glow: 1.5, water: ['#103a4a', '#3a9ab0'], sat: 1.12, tint: '#fff8ec', stars: 0, lantern: 1, wind: 0.2 },
  night: { sky: ['#05061a', '#141c44', '#2a2a5a'], fog: '#141a3a', fogR: [26, 70], hemi: ['#5a6aaa', '#1a1420', 0.55], key: ['#9ab0ff', 1.0, [6, 14, 8]], rim: ['#ff8a4a', 0.5, [-6, 5, -8]], amb: 0.1, glow: 1.3, water: ['#0a1a3a', '#1a3a6a'], sat: 1.08, tint: '#eef0ff', stars: 1, lantern: 0.6, wind: 1.5 },
  dawn: { sky: ['#5a8ad0', '#f0b8a0', '#ffe4b8'], fog: '#f0d0b8', fogR: [35, 85], hemi: ['#c8d8ff', '#6a5040', 1.0], key: ['#ffe0b0', 2.7, [-9, 11, 8]], rim: ['#ffb0c8', 0.6, [8, 6, -9]], amb: 0.22, glow: 0.55, water: ['#2a6a90', '#5ab0c0'], sat: 1.1, tint: '#fffaf0', stars: 0, lantern: 0, wind: 1 },
  battleSpire: null,
};

export class Lighting {
  constructor(scene) {
    this.scene = scene;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 1);
    this.key = new THREE.DirectionalLight(0xffffff, 2); this.key.castShadow = true;
    const s = this.key.shadow; s.mapSize.set(2048, 2048); s.radius = 3; s.bias = -0.0005; s.normalBias = 0.03;
    Object.assign(s.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 70 });
    this.rim = new THREE.DirectionalLight(0xffffff, 0.5); this.amb = new THREE.AmbientLight(0xffffff, 0.1);
    scene.add(this.hemi, this.key, this.key.target, this.rim, this.amb);
    this.pool = []; for (let i = 0; i < 6; i++) { const l = new THREE.PointLight(0xffaa66, 0, 8, 1.6); scene.add(l); this.pool.push(l); }
    this.preset = null; this.cur = null;
  }
  apply(name) {
    const P = PRESETS[name] || PRESETS.dusk; this.preset = name; this.cur = P;
    U.skyTop.value.set(P.sky[0]); U.skyMid.value.set(P.sky[1]); U.skyLow.value.set(P.sky[2]); U.stars.value = P.stars;
    this.scene.fog = new THREE.Fog(P.fog, P.fogR[0], P.fogR[1]);
    this.hemi.color.set(P.hemi[0]); this.hemi.groundColor.set(P.hemi[1]); this.hemi.intensity = P.hemi[2];
    this.key.color.set(P.key[0]); this.key.intensity = P.key[1]; this.keyDir = new THREE.Vector3(...P.key[2]);
    this.rim.color.set(P.rim[0]); this.rim.intensity = P.rim[1]; this.rim.position.set(...P.rim[2]);
    this.amb.intensity = P.amb; U.glow.value = P.glow; U.waterDeep.value.set(P.water[0]); U.waterShallow.value.set(P.water[1]);
    U.sat.value = P.sat; U.tint.value.set(P.tint); U.windAmt.value = P.wind;
  }
  // keep the shadow frustum tight around what the camera sees
  follow(x, z) { this.key.position.set(x + this.keyDir.x, this.keyDir.y, z + this.keyDir.z); this.key.target.position.set(x, 0, z); this.key.target.updateMatrixWorld(); }
  // assign the fixed pool to the brightest nearby sources (+ the hero's lantern in dark places)
  assign(sources, cx, cz, lantern) {
    const list = sources.map((s) => ({ s, d: (s.x - cx) ** 2 + (s.z - cz) ** 2 - (s.i || 1) * 4 })).filter((o) => o.d < 22 * 22).sort((a, b) => a.d - b.d);
    let k = 0;
    if (lantern && this.cur.lantern) { const l = this.pool[k++]; l.position.set(lantern.x, lantern.y, lantern.z); l.color.set('#ffb468'); l.intensity = 9 * this.cur.lantern; l.distance = 9; }
    for (const o of list) { if (k >= this.pool.length) break; const l = this.pool[k++]; const s = o.s; l.position.set(s.x, s.y, s.z); l.color.set(s.c || '#ffa860'); l.intensity = (s.i || 4) * (s.flicker ? 0.9 + Math.random() * 0.2 : 1); l.distance = s.r || 7; }
    for (; k < this.pool.length; k++) this.pool[k].intensity = 0;
  }
}
