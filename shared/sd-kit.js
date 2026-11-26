// Superdreams shared game kit — three.js r187, WebGPU with automatic WebGL2 fallback (?webgl forces it).
// Every game imports this so the render stack, accessibility settings, remix ("dream") config,
// headless probe (window.__cam) and SFX behave identically across the catalog.
import * as THREE from 'three/webgpu';
import { pass, Fn, vec3, vec2, float, positionWorldDirection, mx_fractal_noise_float, mix, smoothstep, fract, sin, dot, floor, length, pow, max, uniform, time } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

export { THREE };
export const Q = new URLSearchParams(location.search);
export const FORCE_GL = Q.has('webgl');

// ---------------------------------------------------------------- settings (accessibility is AAA)
const SKEY = 'sd-settings-v1';
const readLS = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
export const settings = Object.assign({
  shake: true, flash: true, colorblind: false, volume: 0.7, quality: 'high',
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
}, readLS(SKEY) || {});
export const saveSettings = () => writeLS(SKEY, settings);
export const store = { get: (k, d = null) => readLS('sd-' + k) ?? d, set: (k, v) => writeLS('sd-' + k, v) };

// ---------------------------------------------------------------- renderer + post
export async function createRenderer({ container = document.body, toneMapping = 'aces', exposure = 1.0, shadows = true } = {}) {
  const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: FORCE_GL, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, settings.quality === 'low' ? 1 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = { agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping }[toneMapping] ?? THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap was removed in r187; soften with light.shadow.radius
  renderer.domElement.classList.add('sd-canvas');
  container.appendChild(renderer.domElement);
  await renderer.init();
  return renderer;
}

// RenderPipeline (renamed from PostProcessing in r183): scene pass + bloom. Tone mapping/sRGB applied at output.
export function createPipeline(renderer, scene, camera, { bloom: b = { strength: 0.55, radius: 0.45, threshold: 0.82 } } = {}) {
  const pipeline = new THREE.RenderPipeline(renderer);
  const scenePass = pass(scene, camera);
  const color = scenePass.getTextureNode('output');
  let bloomNode = null;
  if (b && settings.quality !== 'low') { bloomNode = bloom(color, b.strength, b.radius, b.threshold); pipeline.outputNode = color.add(bloomNode); }
  else pipeline.outputNode = color;
  return { pipeline, scenePass, bloomNode, render: () => pipeline.render() };
}

export function autoResize(renderer, camera, onResize) {
  const fit = () => {
    renderer.setSize(innerWidth, innerHeight);
    if (camera.isPerspectiveCamera) { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
    onResize?.(innerWidth, innerHeight);
  };
  addEventListener('resize', fit); fit();
}

// ---------------------------------------------------------------- headless probe (every page must expose __cam)
export function probe(renderer, extra = {}) {
  const p = window.__cam = Object.assign({
    frames: 0, dataReady: false, backend: renderer.backend?.isWebGPUBackend ? 'webgpu' : 'webgl2',
    player: { yaw: 0, pitch: 0 }, teleport: () => {}, drawCalls: 0, triangles: 0, counts: {}, errors: [],
  }, extra);
  addEventListener('error', (e) => p.errors.push(String(e.message)));
  addEventListener('unhandledrejection', (e) => p.errors.push(String(e.reason)));
  return p;
}

// Frame loop: THREE.Timer (Clock deprecated r183), dt clamped to avoid spiral-of-death.
export function startLoop(renderer, step, render) {
  const timer = new THREE.Timer(); timer.connect(document);
  renderer.setAnimationLoop((t) => {
    timer.update(t);
    const dt = Math.min(timer.getDelta(), 1 / 20);
    step(dt, timer.getElapsed());
    render();
    const p = window.__cam;
    if (p) { p.frames++; p.drawCalls = renderer.info.render.drawCalls; p.triangles = renderer.info.render.triangles; }
  });
}

// ---------------------------------------------------------------- lighting + atmosphere helpers
// Three-point rig: hemisphere + shadow-casting key + opposed rim + low ambient. Never a single light.
export function stageLights(scene, o = {}) {
  const hemi = new THREE.HemisphereLight(o.sky ?? 0xbcd4ff, o.ground ?? 0x2a2018, o.hemi ?? 0.9);
  const key = new THREE.DirectionalLight(o.key ?? 0xfff1dc, o.keyI ?? 2.6);
  key.position.set(...(o.keyPos ?? [6, 11, 5]));
  key.castShadow = true;
  const s = o.shadowSize ?? 8;
  Object.assign(key.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.5, far: 40 });
  key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 3; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  const rim = new THREE.DirectionalLight(o.rim ?? 0x8fb4ff, o.rimI ?? 1.1);
  rim.position.set(...(o.rimPos ?? [-7, 5, -8]));
  const amb = new THREE.AmbientLight(0xffffff, o.amb ?? 0.12);
  scene.add(hemi, key, rim, amb);
  return { hemi, key, rim, amb };
}

// Procedural space backdrop: hashed starfield + fractal-noise nebula, no textures, zero extra draw calls.
// Noise gates straddle the noise's real (gaussian-ish, sigma~0.12-0.2) distribution, not its theoretical range.
export function spaceBackground(scene, o = {}) {
  const c1 = uniform(new THREE.Color(o.nebulaA ?? 0x3a1a6e)), c2 = uniform(new THREE.Color(o.nebulaB ?? 0x0d4a7a));
  const base = uniform(new THREE.Color(o.base ?? 0x02030a)), density = uniform(o.density ?? 1.0);
  const hash = (p) => fract(sin(dot(p, vec3(127.1, 311.7, 74.7))).mul(43758.5453));
  scene.backgroundNode = Fn(() => {
    const d = positionWorldDirection.normalize();
    const n = mx_fractal_noise_float(d.mul(1.6), 5, 2.0, 0.5);
    const n2 = mx_fractal_noise_float(d.mul(3.1).add(7.3), 4, 2.0, 0.5);
    const neb = smoothstep(-0.05, 0.35, n).mul(density);
    let col = mix(base, mix(c1, c2, smoothstep(-0.2, 0.25, n2)), neb.mul(0.55));
    // stars: two cell layers, bright core falloff, slight colour temperature variation
    const star = (scale, thr, gain) => {
      const p = d.mul(scale); const cell = floor(p); const h = hash(cell);
      const off = vec3(hash(cell.add(1.7)), hash(cell.add(4.1)), hash(cell.add(9.3)));
      const r = length(fract(p).sub(off));
      const on = smoothstep(thr, 1.0, h);
      const tw = sin(time.mul(h.mul(3.0).add(0.5)).add(h.mul(40.0))).mul(0.25).add(0.75);
      return on.mul(pow(max(float(0), float(1).sub(r.mul(9.0))), 3.0)).mul(gain).mul(tw);
    };
    const s = star(70, 0.93, 2.2).add(star(160, 0.95, 1.4));
    const tint = mix(vec3(1.0, 0.85, 0.7), vec3(0.75, 0.85, 1.0), hash(floor(d.mul(70))));
    col = col.add(tint.mul(s));
    return col;
  })();
  return { c1, c2, base, density };
}

// Ambient dust motes: subliminal volume cue. Instanced so it costs one draw call.
export function dust(scene, { count = 40, area = 10, height = 4, color = 0xffffff, size = 0.025, opacity = 0.35 } = {}) {
  const geo = new THREE.SphereGeometry(size, 6, 4);
  const mat = new THREE.MeshBasicNodeMaterial({ color, transparent: true, opacity, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const seeds = []; const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) seeds.push([Math.random() * area - area / 2, Math.random() * height, Math.random() * area - area / 2, Math.random() * 6.28]);
  mesh.frustumCulled = false; scene.add(mesh);
  return { mesh, update(t) { if (settings.reducedMotion) return; seeds.forEach((s, i) => { m.makeTranslation(s[0] + Math.sin(t * 0.13 + s[3]) * 0.6, s[1] + Math.sin(t * 0.21 + s[3] * 2) * 0.3, s[2] + Math.cos(t * 0.11 + s[3]) * 0.6); mesh.setMatrixAt(i, m); }); mesh.instanceMatrix.needsUpdate = true; } };
}

// Canvas-painted texture helper (procedural detail instead of flat fills).
export function canvasTexture(w, h, paint, { srgb = true, repeat = null } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

// ---------------------------------------------------------------- tweens + camera juice
const tweens = new Set();
export const ease = {
  outCubic: (t) => 1 - Math.pow(1 - t, 3), inOutCubic: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  outBack: (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2), outElastic: (t) => t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * 2.094) + 1,
  inQuad: (t) => t * t,
};
export function tween(dur, fn, { ease: e = ease.outCubic, delay = 0 } = {}) {
  return new Promise((res) => tweens.add({ t: -delay, dur: Math.max(dur, 1e-4), fn, e, res }));
}
export function updateTweens(dt) {
  for (const tw of tweens) {
    tw.t += dt; if (tw.t < 0) continue;
    const k = Math.min(tw.t / tw.dur, 1); tw.fn(tw.e(k), k);
    if (k >= 1) { tweens.delete(tw); tw.res(); }
  }
}
let shakeAmt = 0;
export const shake = (a = 0.15) => { if (settings.shake && !settings.reducedMotion) shakeAmt = Math.max(shakeAmt, a); };
export function applyShake(camera, dt) {
  if (shakeAmt <= 0.0005) return;
  camera.position.x += (Math.random() - 0.5) * shakeAmt; camera.position.y += (Math.random() - 0.5) * shakeAmt;
  shakeAmt *= Math.pow(0.0015, dt);
}
export function flash(color = '#fff', ms = 160) {
  if (!settings.flash) return;
  const d = document.createElement('div'); d.className = 'sd-flash'; d.style.background = color; document.body.appendChild(d);
  requestAnimationFrame(() => { d.style.opacity = '0'; d.style.transition = `opacity ${ms}ms ease-out`; });
  setTimeout(() => d.remove(), ms + 60);
}

// ---------------------------------------------------------------- SFX (Web Audio synth; music is added later in the audio pass)
let actx = null, master = null;
const unlock = () => { if (!actx) { actx = new (window.AudioContext || window.webkitAudioContext)(); master = actx.createGain(); master.gain.value = settings.volume; master.connect(actx.destination); } actx.resume?.(); };
addEventListener('pointerdown', unlock, { once: false, passive: true });
addEventListener('keydown', unlock, { once: false });
function noiseBuf() { const b = actx.createBuffer(1, actx.sampleRate * 0.5, actx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
let nb = null;
function voice({ type = 'sine', f0 = 440, f1 = f0, dur = 0.15, vol = 0.3, noise = false, filter = null, attack = 0.005 }) {
  if (!actx || settings.volume <= 0) return;
  master.gain.value = settings.volume;
  const t = actx.currentTime, jitter = 1 + (Math.random() - 0.5) * 0.2; // ±10% pitch variance on repeats
  const g = actx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let src;
  if (noise) { nb ??= noiseBuf(); src = actx.createBufferSource(); src.buffer = nb; }
  else { src = actx.createOscillator(); src.type = type; src.frequency.setValueAtTime(f0 * jitter, t); src.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * jitter), t + dur); }
  let node = src;
  if (filter) { const fl = actx.createBiquadFilter(); fl.type = filter.type || 'lowpass'; fl.frequency.setValueAtTime(filter.f0 ?? 2000, t); fl.frequency.exponentialRampToValueAtTime(filter.f1 ?? filter.f0 ?? 2000, t + dur); fl.Q.value = filter.q ?? 1; node.connect(fl); node = fl; }
  node.connect(g); g.connect(master); src.start(t); src.stop(t + dur + 0.05);
}
export const sfx = {
  click: () => voice({ type: 'triangle', f0: 900, f1: 600, dur: 0.06, vol: 0.18 }),
  select: () => voice({ type: 'sine', f0: 520, f1: 780, dur: 0.12, vol: 0.2 }),
  move: () => { voice({ type: 'triangle', f0: 220, f1: 150, dur: 0.14, vol: 0.25 }); voice({ noise: true, dur: 0.08, vol: 0.08, filter: { f0: 1800, f1: 600 } }); },
  thud: () => { voice({ type: 'sine', f0: 140, f1: 50, dur: 0.25, vol: 0.45 }); voice({ noise: true, dur: 0.12, vol: 0.12, filter: { f0: 900, f1: 200 } }); },
  capture: () => { voice({ type: 'square', f0: 300, f1: 90, dur: 0.22, vol: 0.12, filter: { f0: 2400, f1: 300 } }); voice({ noise: true, dur: 0.25, vol: 0.18, filter: { type: 'bandpass', f0: 3000, f1: 400, q: 2 } }); },
  whoosh: () => voice({ noise: true, dur: 0.35, vol: 0.2, filter: { type: 'bandpass', f0: 400, f1: 2600, q: 1.5 }, attack: 0.08 }),
  suck: () => { voice({ type: 'sawtooth', f0: 600, f1: 40, dur: 0.9, vol: 0.12, filter: { f0: 3000, f1: 120 } }); voice({ noise: true, dur: 0.9, vol: 0.15, filter: { type: 'bandpass', f0: 2500, f1: 80, q: 3 }, attack: 0.2 }); },
  chime: () => { [0, 4, 7].forEach((s, i) => setTimeout(() => voice({ type: 'sine', f0: 660 * 2 ** (s / 12), dur: 0.5, vol: 0.14 }), i * 60)); },
  magic: () => { [0, 7, 12, 19].forEach((s, i) => setTimeout(() => voice({ type: 'triangle', f0: 520 * 2 ** (s / 12), f1: 540 * 2 ** (s / 12), dur: 0.35, vol: 0.1 }), i * 45)); },
  zap: () => voice({ type: 'sawtooth', f0: 1400, f1: 120, dur: 0.18, vol: 0.12, filter: { f0: 5000, f1: 500 } }),
  error: () => voice({ type: 'square', f0: 180, f1: 140, dur: 0.18, vol: 0.12, filter: { f0: 900 } }),
  check: () => { voice({ type: 'triangle', f0: 880, f1: 880, dur: 0.12, vol: 0.18 }); setTimeout(() => voice({ type: 'triangle', f0: 1175, dur: 0.2, vol: 0.16 }), 110); },
  win: () => { [0, 4, 7, 12, 16].forEach((s, i) => setTimeout(() => voice({ type: 'triangle', f0: 392 * 2 ** (s / 12), dur: 0.45, vol: 0.16 }), i * 110)); },
  lose: () => { [7, 3, 0, -5].forEach((s, i) => setTimeout(() => voice({ type: 'sine', f0: 330 * 2 ** (s / 12), dur: 0.5, vol: 0.14 }), i * 170)); },
};

// ---------------------------------------------------------------- dream (remix) config
// Sources, later wins: game defaults < ?dream=<base64url json> < ?redream=<id> (server) < postMessage live preview.
export const encodeDream = (cfg) => btoa(unescape(encodeURIComponent(JSON.stringify(cfg)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const decodeDream = (s) => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
export function deepMerge(a, b) { for (const k in b) a[k] = isObj(a[k]) && isObj(b[k]) ? deepMerge(a[k], b[k]) : b[k]; return a; }
export async function loadDream(defaults, onLive) {
  const cfg = structuredClone(defaults);
  try { if (Q.get('dream')) deepMerge(cfg, decodeDream(Q.get('dream'))); } catch (e) { console.warn('bad dream param', e); }
  if (Q.get('redream')) {
    try { const r = await fetch('/api/redream.php?id=' + encodeURIComponent(Q.get('redream'))); if (r.ok) deepMerge(cfg, (await r.json()).config || {}); } catch { /* offline/file:// */ }
  }
  addEventListener('message', (e) => { if (e.origin === location.origin && e.data?.type === 'sd-dream') onLive?.(deepMerge(structuredClone(defaults), e.data.config || {})); });
  return cfg;
}

// ---------------------------------------------------------------- UI: start menu (#menu), toasts, settings panel
const css = `
.sd-canvas{position:fixed;inset:0;width:100%!important;height:100%!important;display:block;touch-action:none}
.sd-vignette{position:fixed;inset:0;pointer-events:none;z-index:5;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 55%,rgba(0,0,0,.38) 100%)}
.sd-grain{position:fixed;inset:-50%;pointer-events:none;z-index:6;opacity:.05;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");animation:sdgrain 1s steps(6) infinite}
@keyframes sdgrain{0%{transform:translate(0,0)}33%{transform:translate(-3%,2%)}66%{transform:translate(2%,-3%)}100%{transform:translate(0,0)}}
@media (prefers-reduced-motion:reduce){.sd-grain{animation:none}}
.sd-flash{position:fixed;inset:0;pointer-events:none;z-index:40;opacity:.55}
.sd-ui{font-family:"Inter",system-ui,-apple-system,Segoe UI,sans-serif;color:#eef2ff}
#menu{position:fixed;inset:0;z-index:50;display:grid;place-items:center;background:radial-gradient(ellipse at 50% 40%,rgba(10,14,40,.55),rgba(2,3,10,.9));backdrop-filter:blur(6px);transition:opacity .35s}
#menu.hide{opacity:0;pointer-events:none}
.sd-card{max-width:min(560px,92vw);padding:28px 30px;border-radius:20px;background:rgba(14,18,40,.72);border:1px solid rgba(160,180,255,.18);box-shadow:0 30px 80px rgba(0,0,0,.5);text-align:center}
.sd-card h1{margin:0 0 6px;font-size:clamp(28px,6vw,44px);letter-spacing:.02em;background:linear-gradient(90deg,#ffd27a,#ff7ad9 50%,#7ac8ff);-webkit-background-clip:text;background-clip:text;color:transparent}
.sd-card p{margin:0 0 18px;opacity:.8;line-height:1.5}
.sd-row{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:10px 0}
.sd-btn{font:600 15px/1 inherit;font-family:inherit;padding:12px 18px;border-radius:12px;border:1px solid rgba(170,190,255,.25);background:rgba(40,50,100,.55);color:#eef2ff;cursor:pointer;transition:transform .12s,background .2s,border-color .2s;min-height:44px}
.sd-btn:hover{transform:translateY(-1px);background:rgba(70,80,150,.7);border-color:rgba(200,210,255,.5)}
.sd-btn.on,.sd-btn.primary{background:linear-gradient(135deg,#6a5cff,#c04dff);border-color:transparent}
.sd-btn:focus-visible{outline:2px solid #ffd27a;outline-offset:2px}
.sd-label{font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.6;margin-top:14px}
.sd-toasts{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:60;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none}
.sd-toast{padding:10px 16px;border-radius:12px;background:rgba(12,16,36,.85);border:1px solid rgba(160,180,255,.2);font-weight:600;animation:sdtoast .3s ease-out}
@keyframes sdtoast{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
.sd-corner{position:fixed;top:12px;right:12px;z-index:30;display:flex;gap:8px}
.sd-icon{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;font-size:18px}
.sd-panel{position:fixed;inset:0;z-index:55;display:none;place-items:center;background:rgba(2,3,10,.6);backdrop-filter:blur(4px)}
.sd-panel.open{display:grid}
.sd-panel label{display:flex;justify-content:space-between;gap:16px;align-items:center;margin:10px 0;text-align:left}
`;
let uiReady = false;
export function initUI({ vignette = true, grain = true } = {}) {
  if (uiReady) return; uiReady = true;
  const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  document.body.classList.add('sd-ui');
  if (vignette) document.body.insertAdjacentHTML('beforeend', '<div class="sd-vignette"></div>');
  if (grain) document.body.insertAdjacentHTML('beforeend', '<div class="sd-grain"></div>');
  document.body.insertAdjacentHTML('beforeend', '<div class="sd-toasts"></div>');
}
export function toast(msg, ms = 2200) {
  const box = document.querySelector('.sd-toasts'); if (!box) return;
  const d = document.createElement('div'); d.className = 'sd-toast'; d.textContent = msg; box.appendChild(d);
  setTimeout(() => { d.style.transition = 'opacity .3s'; d.style.opacity = '0'; setTimeout(() => d.remove(), 320); }, ms);
}
// Start menu. Must be #menu (the headless harness clicks it). `options` = [{key,label,choices:[{v,label}],value}]
export function startMenu({ title, subtitle, options = [], startLabel = 'Play', onStart }) {
  const el = document.createElement('div'); el.id = 'menu';
  const opts = options.map((o) => `<div class="sd-label">${o.label}</div><div class="sd-row" data-key="${o.key}">${o.choices.map((c) => `<button class="sd-btn ${c.v === o.value ? 'on' : ''}" data-v="${c.v}">${c.label}</button>`).join('')}</div>`).join('');
  el.innerHTML = `<div class="sd-card"><h1>${title}</h1><p>${subtitle || ''}</p>${opts}<div class="sd-row" style="margin-top:20px"><button class="sd-btn primary" id="sd-start">${startLabel}</button></div></div>`;
  document.body.appendChild(el);
  const values = Object.fromEntries(options.map((o) => [o.key, o.value]));
  el.querySelectorAll('.sd-row[data-key]').forEach((row) => row.addEventListener('click', (e) => {
    const b = e.target.closest('.sd-btn'); if (!b) return; sfx.click();
    row.querySelectorAll('.sd-btn').forEach((x) => x.classList.toggle('on', x === b));
    values[row.dataset.key] = b.dataset.v;
  }));
  const go = () => { el.classList.add('hide'); sfx.select(); onStart?.(values); };
  el.querySelector('#sd-start').addEventListener('click', go);
  return { el, show: () => el.classList.remove('hide'), hide: () => el.classList.add('hide'), values };
}
// Settings panel (shake / flash / colorblind / volume / quality) behind a gear button.
export function settingsButton(extraButtons = '') {
  document.body.insertAdjacentHTML('beforeend', `<div class="sd-corner">${extraButtons}<button class="sd-btn sd-icon" id="sd-gear" aria-label="Settings">⚙</button></div>
  <div class="sd-panel" id="sd-settings"><div class="sd-card"><h1 style="font-size:28px">Settings</h1>
  <label>Screen shake <input type="checkbox" data-k="shake"></label><label>Flashes <input type="checkbox" data-k="flash"></label>
  <label>Colorblind-safe palette <input type="checkbox" data-k="colorblind"></label><label>Reduced motion <input type="checkbox" data-k="reducedMotion"></label>
  <label>Volume <input type="range" min="0" max="1" step="0.05" data-k="volume"></label>
  <label>Graphics <select data-k="quality"><option value="high">High</option><option value="low">Low (reload)</option></select></label>
  <div class="sd-row"><button class="sd-btn primary" id="sd-close">Done</button></div></div></div>`);
  const panel = document.getElementById('sd-settings');
  panel.querySelectorAll('[data-k]').forEach((inp) => {
    const k = inp.dataset.k;
    if (inp.type === 'checkbox') inp.checked = !!settings[k]; else inp.value = settings[k];
    inp.addEventListener('input', () => { settings[k] = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' ? +inp.value : inp.value; saveSettings(); dispatchEvent(new CustomEvent('sd-settings', { detail: settings })); });
  });
  document.getElementById('sd-gear').onclick = () => { sfx.click(); panel.classList.add('open'); };
  document.getElementById('sd-close').onclick = () => { sfx.click(); panel.classList.remove('open'); };
}
// Tell the hosting site (game.php wrapper) about events — used for play-time stats and redream saves.
export const host = (type, data = {}) => { try { if (parent !== window) parent.postMessage({ type: 'sd-' + type, ...data }, location.origin); } catch { /* standalone */ } };
