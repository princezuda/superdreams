// Chess: Worlds — environments. Each builder adds a group to the scene, sets scene.backgroundNode/fog and returns
// { group, update(t, dt), dispose() }. Budget: ≤ ~10 draw calls per environment (instancing/merging everywhere).
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Fn, uniform, mix, float, vec2, vec3, sin, cos, time, length, atan, exp, pow, max, abs, fract, floor, smoothstep, step, uv, positionLocal, positionWorld, positionWorldDirection, normalView, positionViewDirection, mx_noise_float, mx_fractal_noise_float, mx_cell_noise_float, attribute, hash, texture, instanceIndex } from 'three/tsl';
import { spaceBackground, canvasTexture, settings } from '/shared/sd-kit.js';
import { rng } from './themes.js';

export const ENV_IDS = ['study', 'space', 'galaxy', 'grid', 'courtyard', 'arcane'];
const TABLE_Y = -0.36;

const gradientSky = (stops, extra) => Fn(() => {
  const d = positionWorldDirection.normalize(), y = d.y;
  const [bot, hor, mid, top] = stops.map((c) => vec3(...new THREE.Color(c).toArray()));
  let col = mix(bot, hor, smoothstep(-0.25, 0.02, y));
  col = mix(col, mid, smoothstep(0.02, 0.25, y));
  col = mix(col, top, smoothstep(0.25, 0.85, y));
  return extra ? extra(col, d) : col;
})();
const starLayer = (d, scale, thr, gain) => { const p = d.mul(scale), cell = floor(p), h = fract(sin(cell.dot(vec3(127.1, 311.7, 74.7))).mul(43758.5453)); const r = length(fract(p).sub(0.5)); return smoothstep(thr, 1.0, h).mul(max(float(0), float(1).sub(r.mul(5))).pow(3)).mul(gain); };

function lambert(color, o = {}) { return new THREE.MeshStandardNodeMaterial({ color, roughness: o.rough ?? 0.7, metalness: o.metal ?? 0, ...o.extra }); }
function glowMat(col, k = 1, o = {}) { const m = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(col).multiplyScalar(k), transparent: !!o.additive, depthWrite: !o.additive, blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: o.side ?? THREE.FrontSide }); return m; }

// =================================================================== STUDY (Classic)
function study(scene) {
  const g = new THREE.Group();
  scene.backgroundNode = gradientSky(['#070403', '#1d120a', '#24160d', '#120b07'], (col, d) => {
    const win = smoothstep(0.86, 1.0, d.dot(vec3(-0.55, 0.3, -0.78).normalize())); // warm window glow behind
    return col.add(vec3(0.45, 0.26, 0.1).mul(win.mul(0.35)));
  });
  // table
  const tTex = canvasTexture(1024, 1024, (c, w, h) => {
    const R = rng(3); c.fillStyle = '#4a2a17'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { c.strokeStyle = `rgba(${R() < 0.5 ? '20,8,3' : '110,64,34'},${0.08 + R() * 0.18})`; c.lineWidth = 0.6 + R() * 2.5; const y = R() * h; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(w * 0.33, y + (R() - 0.5) * 30, w * 0.66, y + (R() - 0.5) * 30, w, y + (R() - 0.5) * 20); c.stroke(); }
    for (let i = 0; i < 6; i++) { c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(0, (i * h) / 6, w, 3); }
  }, { repeat: [5, 5] });
  const table = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshPhysicalNodeMaterial({ map: tTex, roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.3 }));
  table.rotation.x = -Math.PI / 2; table.position.y = TABLE_Y; table.receiveShadow = true; g.add(table);
  // brass desk lamp (merged)
  const brass = new THREE.MeshStandardNodeMaterial({ color: 0xc89a4a, metalness: 1, roughness: 0.28 });
  const lampParts = [];
  const lp = (geo, x, y, z, rx = 0, rz = 0) => { geo.rotateX(rx); geo.rotateZ(rz); geo.translate(x, y, z); lampParts.push(geo.index ? geo.toNonIndexed() : geo); };
  lp(new THREE.CylinderGeometry(0.9, 1.0, 0.18, 32), 0, 0.09, 0);
  lp(new THREE.CylinderGeometry(0.07, 0.07, 3.6, 12), 0, 1.9, 0);
  lp(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 12), 0.95, 3.5, 0, 0, -1.0);
  lp(new THREE.SphereGeometry(0.14, 12, 8), 0, 3.7, 0);
  for (const p of lampParts) for (const k of Object.keys(p.attributes)) if (!['position', 'normal', 'uv'].includes(k)) p.deleteAttribute(k);
  const lamp = new THREE.Mesh(mergeGeometries(lampParts), brass); lamp.castShadow = true;
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 1.05, 0.9, 32, 1, true), new THREE.MeshStandardNodeMaterial({ color: 0x1f4a2a, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide }));
  shade.position.set(1.95, 3.95, 0); shade.rotation.z = -0.5;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), glowMat('#ffd9a0', 6)); bulb.position.set(2.15, 3.55, 0);
  const lampG = new THREE.Group(); lampG.add(lamp, shade, bulb); lampG.position.set(-9.5, TABLE_Y, -5.2); lampG.rotation.y = 0.55; g.add(lampG);
  const lampLight = new THREE.PointLight(0xffc890, 28, 22, 2); lampLight.position.set(-8.2, 3.1, -4.2); g.add(lampLight);
  // stack of books + candle (one merged lit mesh with vertex colours)
  const parts = [], R = rng(11);
  const addBox = (w, h, d, x, y, z, ry, col) => { const b = new THREE.BoxGeometry(w, h, d).toNonIndexed(); b.rotateY(ry); b.translate(x, y, z); const c = new THREE.Color(col), n = b.attributes.position.count, arr = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.toArray(arr, i * 3); b.setAttribute('color', new THREE.BufferAttribute(arr, 3)); parts.push(b); };
  let y = 0;
  for (const [h, col, rot] of [[0.42, '#5a1a1a', 0.1], [0.36, '#1d3a5a', -0.15], [0.5, '#2a4a24', 0.25], [0.3, '#6a4a1a', 0.0]]) { addBox(2.6, h, 1.8, 0, y + h / 2, 0, rot, col); addBox(2.62, 0.05, 1.82, 0, y + h * 0.75, 0, rot, '#c8a050'); y += h; }
  const books = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75 }));
  books.position.set(9.6, TABLE_Y, -5.6); books.rotation.y = -0.4; books.castShadow = true; g.add(books);
  const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 1.1, 20), lambert(0xf0e4c8, { rough: 0.6 })); candle.position.set(9.3, TABLE_Y + 0.55, -2.4); candle.castShadow = true; g.add(candle);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), glowMat('#ffb050', 5)); flame.scale.set(1, 2.2, 1); flame.position.set(9.3, TABLE_Y + 1.27, -2.4); g.add(flame);
  const candleLight = new THREE.PointLight(0xffa850, 5, 8, 2); candleLight.position.set(9.3, TABLE_Y + 1.6, -2.4); g.add(candleLight);
  // out-of-focus room lights (bokeh) far behind — bloom turns them into soft orbs
  const bokeh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), glowMat('#ffffff', 1), 16);
  const m = new THREE.Matrix4(), col = new THREE.Color();
  for (let i = 0; i < 16; i++) { const a = -2.6 + R() * 2.2, r = 34 + R() * 14; m.compose(new THREE.Vector3(Math.cos(a) * r, 2 + R() * 9, Math.sin(a) * r), new THREE.Quaternion(), new THREE.Vector3().setScalar(0.25 + R() * 0.5)); bokeh.setMatrixAt(i, m); bokeh.setColorAt(i, col.set(R() < 0.7 ? '#ffb060' : '#ffe0a0').multiplyScalar(2 + R() * 3)); }
  g.add(bokeh);
  scene.fog = new THREE.FogExp2(0x150d07, 0.013);
  scene.add(g);
  return { group: g, update(t) { const f = 0.85 + Math.sin(t * 17) * 0.06 + Math.sin(t * 7.3) * 0.08; flame.scale.y = 2.2 * f; candleLight.intensity = 5 * f; } };
}

// =================================================================== SPACE
function spaceEnv(scene, theme) {
  const g = new THREE.Group();
  spaceBackground(scene, theme.nebula || { nebulaA: 0x2a1458, nebulaB: 0x0a3a6e, density: 0.9 });
  // planet with banded atmosphere
  const pm = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  const p = positionLocal.normalize();
  const bands = sin(p.y.mul(18).add(mx_fractal_noise_float(p.mul(3.5), 4, 2, 0.5).mul(4))).mul(0.5).add(0.5);
  pm.colorNode = mix(vec3(0.55, 0.32, 0.2), vec3(0.85, 0.7, 0.5), bands).mul(mx_noise_float(p.mul(12)).mul(0.15).add(0.9));
  const fres = float(1).sub(abs(normalView.dot(positionViewDirection))).pow(3);
  pm.emissiveNode = vec3(0.35, 0.6, 1.4).mul(fres.mul(1.6));
  const planet = new THREE.Mesh(new THREE.SphereGeometry(16, 64, 40), pm); planet.position.set(-36, -12, -48); planet.rotation.z = 0.3; g.add(planet);
  const ringM = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const rr = length(uv().sub(0.5)).mul(2);
  ringM.colorNode = vec3(0.9, 0.75, 0.55).mul(smoothstep(0.62, 0.66, rr).mul(smoothstep(0.98, 0.9, rr)).mul(sin(rr.mul(90)).mul(0.3).add(0.6))).mul(0.5);
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), ringM); ring.position.copy(planet.position); ring.rotation.set(-Math.PI / 2 + 0.35, 0, 0.3); g.add(ring);
  // asteroid belt (one instanced draw)
  const ag = new THREE.IcosahedronGeometry(1, 1); const ap = ag.attributes.position, R = rng(5);
  for (let i = 0; i < ap.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(ap, i); v.multiplyScalar(0.75 + R() * 0.5); ap.setXYZ(i, v.x, v.y, v.z); }
  ag.computeVertexNormals();
  const N = 90, ast = new THREE.InstancedMesh(ag, new THREE.MeshStandardNodeMaterial({ color: 0x6a6460, roughness: 0.95, flatShading: true }), N);
  const seeds = Array.from({ length: N }, () => ({ a: R() * Math.PI * 2, r: 15 + R() * 12, y: -4 + R() * 6, s: 0.12 + R() * R() * 0.9, sp: 0.01 + R() * 0.02, rx: R() * 6, ry: R() * 6 }));
  g.add(ast);
  // under-board engine halo so the board reads as floating
  const halo = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.05, 8, 96), glowMat('#5fd4ff', 2.2)); halo.rotation.x = -Math.PI / 2; halo.position.y = -0.75; g.add(halo);
  const thr = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.2, 0.12, 20), glowMat('#7fe0ff', 3), 4);
  [[-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [3.6, 3.6]].forEach(([x, z], i) => { thr.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, -0.42, z)); });
  g.add(thr);
  scene.fog = null; scene.add(g);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const place = (t) => { seeds.forEach((o, i) => { const a = o.a + t * o.sp; v.set(Math.cos(a) * o.r, o.y + Math.sin(t * 0.2 + o.a) * 0.3, Math.sin(a) * o.r); e.set(o.rx + t * 0.2, o.ry + t * 0.15, 0); m.compose(v, q.setFromEuler(e), s.setScalar(o.s)); ast.setMatrixAt(i, m); }); ast.instanceMatrix.needsUpdate = true; };
  place(0);
  return { group: g, update(t) { planet.rotation.y = t * 0.01; if (!settings.reducedMotion) place(t); halo.material.color.setScalar(1).multiply(new THREE.Color('#5fd4ff')).multiplyScalar(1.8 + Math.sin(t * 2) * 0.4); } };
}

// =================================================================== GALAXY
function galaxyEnv(scene, theme) {
  const g = new THREE.Group();
  spaceBackground(scene, theme.nebula || { nebulaA: 0x7a1a8a, nebulaB: 0x1a3aa8, density: 1.5 });
  const gm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  gm.colorNode = Fn(() => {
    const q = uv().sub(0.5).mul(2), r = length(q).max(0.001), a = atan(q.y, q.x);
    const arms = cos(a.mul(2).sub(r.log().mul(4.2)).add(time.mul(0.03))).mul(0.5).add(0.5).pow(3);
    const dust = mx_fractal_noise_float(vec3(q.mul(5), time.mul(0.01)), 4, 2, 0.5).mul(0.6).add(0.7);
    const disk = exp(r.mul(-2.6)).mul(arms.mul(dust)).mul(1.4);
    const core = exp(r.mul(-14)).mul(3.0);
    const c = mix(vec3(1.0, 0.75, 0.45), mix(vec3(0.9, 0.3, 0.9), vec3(0.25, 0.45, 1.2), smoothstep(0.2, 0.8, r)), smoothstep(0.02, 0.3, r));
    return c.mul(disk.add(core)).mul(smoothstep(1.0, 0.75, r));
  })();
  const gal = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), gm); gal.rotation.x = -Math.PI / 2; gal.position.y = -12; g.add(gal);
  // drifting star motes (twinkle in TSL, one draw)
  const N = 120, st = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), glowMat('#ffffff', 1), N), R = rng(9), m = new THREE.Matrix4(), col = new THREE.Color();
  for (let i = 0; i < N; i++) { const a = R() * Math.PI * 2, r = 9 + R() * 22, y = -6 + R() * 14; m.compose(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), new THREE.Quaternion(), new THREE.Vector3(0.05, 0.12, 0.05).multiplyScalar(0.6 + R() * 1.4)); st.setMatrixAt(i, m); st.setColorAt(i, col.set(['#ffe0a0', '#c0a0ff', '#a0d8ff', '#ffffff'][(R() * 4) | 0]).multiplyScalar(2 + R() * 3)); }
  g.add(st);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(5.7, 0.035, 8, 96), glowMat('#b88cff', 2.5)); halo.rotation.x = -Math.PI / 2; halo.position.y = -0.6; g.add(halo);
  scene.fog = null; scene.add(g);
  return { group: g, update(t) { gal.rotation.z = t * 0.01; st.rotation.y = t * 0.004; } };
}

// =================================================================== NEON GRID (Sci-Fi)
function gridEnv(scene) {
  const g = new THREE.Group();
  scene.backgroundNode = gradientSky(['#020208', '#2a0a3a', '#0a0a24', '#020309'], (col, d) => col.add(starLayer(d, 90, 0.96, 0.8)));
  const fm = new THREE.MeshBasicNodeMaterial();
  fm.colorNode = Fn(() => {
    const p = positionWorld.xz, cell = abs(fract(p.div(2)).sub(0.5)), line = smoothstep(0.47, 0.5, max(cell.x, cell.y));
    const big = abs(fract(p.div(10)).sub(0.5)), line2 = smoothstep(0.485, 0.5, max(big.x, big.y));
    const d = length(p), fade = exp(d.mul(-0.028));
    const pulse = smoothstep(1.2, 0.0, abs(d.sub(fract(time.mul(0.08)).mul(70)))).mul(0.9);
    const c1 = vec3(0.1, 0.85, 1.4), c2 = vec3(1.4, 0.2, 0.9);
    return vec3(0.01, 0.012, 0.03).add(mix(c1, c2, smoothstep(10, 40, d)).mul(line.mul(0.32).add(line2.mul(0.6)).add(pulse.mul(line.add(0.15))))).mul(fade.mul(0.95).add(0.05));
  })();
  const floor_ = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), fm); floor_.rotation.x = -Math.PI / 2; floor_.position.y = -2.6; g.add(floor_);
  // data towers (one instanced draw, windows in TSL)
  const N = 46, tm = new THREE.MeshStandardNodeMaterial({ color: 0x0a0c16, roughness: 0.4, metalness: 0.6 });
  const wp = positionWorld, wcell = floor(wp.mul(vec3(1.6, 2.4, 1.6)));
  const lit = step(0.82, mx_cell_noise_float(wcell)).mul(step(0.25, fract(wp.y.mul(2.4)))).mul(step(0.3, fract(wp.x.add(wp.z).mul(1.6))));
  tm.emissiveNode = mix(vec3(0.1, 0.8, 1.5), vec3(1.5, 0.2, 0.9), step(0.5, mx_cell_noise_float(wcell.add(7)))).mul(lit).mul(1.4);
  const tw = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), tm, N), R = rng(21), m = new THREE.Matrix4();
  for (let i = 0; i < N; i++) { const a = R() * Math.PI * 2, r = 30 + R() * 45, h = 6 + R() * R() * 34, w = 2 + R() * 4; m.compose(new THREE.Vector3(Math.cos(a) * r, -2.6 + h / 2, Math.sin(a) * r), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, R() * 3, 0)), new THREE.Vector3(w, h, w * (0.6 + R() * 0.8))); tw.setMatrixAt(i, m); }
  g.add(tw);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(7.1, 0.03, 6, 128), glowMat('#2fe0ff', 2.6)); ring.rotation.x = -Math.PI / 2; ring.position.y = -0.4; g.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(7.5, 0.015, 6, 128), glowMat('#ff2fa8', 2.4)); ring2.rotation.x = -Math.PI / 2; ring2.position.y = -0.9; g.add(ring2);
  // pedestal column under the board
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.2, 2.3, 6), new THREE.MeshStandardNodeMaterial({ color: 0x0b0e18, roughness: 0.35, metalness: 0.7 })); ped.position.y = -1.5; ped.rotation.y = Math.PI / 6; g.add(ped);
  scene.fog = new THREE.FogExp2(0x06070f, 0.018); scene.add(g);
  return { group: g, update(t) { ring2.rotation.z = t * 0.2; ring.material.color.set('#2fe0ff').multiplyScalar(2.2 + Math.sin(t * 3) * 0.5); } };
}

// =================================================================== CASTLE COURTYARD (Fantasy)
function courtyard(scene) {
  const g = new THREE.Group(), R = rng(17);
  scene.backgroundNode = gradientSky(['#1e1820', '#ff9a58', '#8a4a72', '#141a44'], (col, d) => {
    const clouds = smoothstep(0.05, 0.35, mx_fractal_noise_float(vec3(d.x.div(d.y.add(0.25)), d.z.div(d.y.add(0.25)), 0).mul(1.3), 4, 2, 0.5)).mul(smoothstep(0.0, 0.3, d.y)).mul(0.35);
    return mix(col, vec3(0.95, 0.55, 0.5), clouds).add(starLayer(d, 80, 0.965, 0.9).mul(smoothstep(0.35, 0.8, d.y)));
  });
  const GROUND = -1.25;
  const flag = canvasTexture(1024, 1024, (c, w, h) => {
    c.fillStyle = '#26221f'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 128) for (let x = -(y / 2) % 170; x < w; x += 170) { c.fillStyle = `hsl(28,${5 + R() * 7}%,${17 + R() * 10}%)`; c.fillRect(x + 4, y + 4, 162, 120); for (let i = 0; i < 30; i++) { c.fillStyle = `rgba(0,0,0,${R() * 0.12})`; c.beginPath(); c.arc(x + R() * 166, y + R() * 124, 2 + R() * 8, 0, 7); c.fill(); } if (R() < 0.4) { c.fillStyle = 'rgba(70,100,40,.35)'; c.fillRect(x, y + 118, 170, 8); } }
  }, { repeat: [24, 24] });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshStandardNodeMaterial({ map: flag, roughness: 0.92 })); ground.rotation.x = -Math.PI / 2; ground.position.y = GROUND; ground.receiveShadow = true; g.add(ground);
  // stone dais the board rests on + walls + towers: merged into one stone mesh
  const stone = [], lit = [];
  const put = (geo, x, y, z, ry = 0, arr = stone) => { geo = geo.toNonIndexed(); geo.rotateY(ry); geo.translate(x, y, z); for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k); arr.push(geo); };
  put(new THREE.BoxGeometry(12.6, TABLE_Y - GROUND, 12.6), 0, (TABLE_Y + GROUND) / 2, 0);
  put(new THREE.BoxGeometry(14, 0.3, 14), 0, GROUND + 0.15, 0);
  const W = 13, H = 8;
  for (let side = 0; side < 4; side++) {
    const ry = (side * Math.PI) / 2, cx = Math.sin(ry) * W, cz = Math.cos(ry) * W;
    put(new THREE.BoxGeometry(W * 2, H, 2), cx, GROUND + H / 2, cz, ry);
    for (let i = -6; i <= 6; i++) { const ox = Math.cos(ry) * i * 2, oz = -Math.sin(ry) * i * 2; put(new THREE.BoxGeometry(1.1, 1.0, 2.2), cx + ox, GROUND + H + 0.5, cz + oz, ry); }
    for (let i = -2; i <= 2; i++) if (i) { const ox = Math.cos(ry) * i * 5.0, oz = -Math.sin(ry) * i * 5.0; put(new THREE.BoxGeometry(0.7, 1.4, 0.3), cx + ox - Math.sin(ry) * 1.05, GROUND + 4.5, cz + oz - Math.cos(ry) * 1.05, ry, lit); }
  }
  for (const [x, z] of [[W, W], [-W, W], [W, -W], [-W, -W]]) { put(new THREE.CylinderGeometry(2.8, 3.1, 13, 16), x, GROUND + 6.5, z); for (const yy of [4, 7.5]) put(new THREE.BoxGeometry(0.6, 1.2, 0.3), x - Math.sign(x) * 2.08, GROUND + yy, z - Math.sign(z) * 2.08, Math.atan2(x, z), lit); }
  put(new THREE.BoxGeometry(4, 4.4, 0.5), 0, GROUND + 2.2, -W + 1.1, 0, lit); // lit gate
  const sm = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
  const sp = positionWorld, brick = vec2(sp.x.add(sp.z).mul(1.1), sp.y.mul(2.2));
  const mortar = step(0.9, fract(brick.y)).max(step(0.94, fract(brick.x.add(floor(brick.y).mul(0.5)))));
  sm.colorNode = vec3(0.46, 0.42, 0.38).mul(mx_noise_float(floor(vec3(brick, 0)).mul(1.7)).mul(0.25).add(0.9)).mul(mortar.mul(-0.45).add(1)).mul(mx_noise_float(sp.mul(3)).mul(0.12).add(0.95));
  const walls = new THREE.Mesh(mergeGeometries(stone), sm); walls.receiveShadow = true; g.add(walls);
  const litMesh = new THREE.Mesh(mergeGeometries(lit), glowMat('#ff9a48', 1.15)); g.add(litMesh);
  const roofs = new THREE.InstancedMesh(new THREE.ConeGeometry(3.7, 6, 16), new THREE.MeshStandardNodeMaterial({ color: 0x3a3a66, roughness: 0.7 }), 4);
  [[W, W], [-W, W], [W, -W], [-W, -W]].forEach(([x, z], i) => roofs.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, GROUND + 16, z)));
  g.add(roofs);
  // banners (team colours) on the near walls
  const ban = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.2, 5), new THREE.MeshStandardNodeMaterial({ roughness: 0.8, side: THREE.DoubleSide }), 6);
  const bc = new THREE.Color();
  [[-6, -W + 1.05, 0, '#7a1a1a'], [6, -W + 1.05, 0, '#1a2a6a'], [-W + 1.05, -6, Math.PI / 2, '#7a1a1a'], [-W + 1.05, 6, Math.PI / 2, '#1a2a6a'], [W - 1.05, -6, -Math.PI / 2, '#1a2a6a'], [W - 1.05, 6, -Math.PI / 2, '#7a1a1a']].forEach(([x, z, ry, c], i) => { ban.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, GROUND + 4.2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1))); ban.setColorAt(i, bc.set(c)); });
  g.add(ban);
  // torches on the dais corners: posts (merged) + instanced flames + two flickering lights
  const posts = [];
  const TP = [[-6.6, -6.6], [6.6, -6.6]];
  for (const [x, z] of TP) { put(new THREE.CylinderGeometry(0.11, 0.15, 1.5, 10), x, TABLE_Y + 0.75, z, 0, posts); put(new THREE.CylinderGeometry(0.32, 0.15, 0.28, 12), x, TABLE_Y + 1.6, z, 0, posts); }
  const postMesh = new THREE.Mesh(mergeGeometries(posts), new THREE.MeshStandardNodeMaterial({ color: 0x2a2018, metalness: 0.6, roughness: 0.5 })); postMesh.castShadow = true; g.add(postMesh);
  const fl = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const fy = positionLocal.y.add(0.5);
  fl.positionNode = positionLocal.add(vec3(sin(time.mul(9).add(positionLocal.y.mul(6)).add(instanceIndex.toFloat().mul(1.7))).mul(0.06).mul(fy), 0, cos(time.mul(7).add(instanceIndex.toFloat())).mul(0.05).mul(fy)));
  fl.colorNode = mix(vec3(3.0, 1.4, 0.35), vec3(1.2, 0.25, 0.05), fy.clamp(0, 1)).mul(smoothstep(1.0, 0.3, fy).add(0.2));
  const flames = new THREE.InstancedMesh(new THREE.ConeGeometry(0.26, 0.85, 12, 4, true), fl, 2);
  TP.forEach(([x, z], i) => flames.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, TABLE_Y + 2.12, z)));
  g.add(flames);
  const tl = [new THREE.PointLight(0xff9a40, 18, 16, 2), new THREE.PointLight(0xff9a40, 18, 16, 2)];
  tl[0].position.set(-6.6, TABLE_Y + 2.4, -6.6); tl[1].position.set(6.6, TABLE_Y + 2.4, -6.6); g.add(...tl);
  scene.fog = new THREE.FogExp2(0x3a2838, 0.02); scene.add(g);
  return { group: g, update(t) { tl[0].intensity = 18 * (0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 5.1) * 0.07); tl[1].intensity = 18 * (0.85 + Math.sin(t * 11 + 2) * 0.08 + Math.sin(t * 4.3) * 0.07); } };
}

// =================================================================== ARCANE (Magic)
function arcane(scene, theme) {
  const g = new THREE.Group();
  spaceBackground(scene, theme.nebula || { nebulaA: 0x4a1a7a, nebulaB: 0x0e2a5a, base: 0x05020c, density: 0.8 });
  const circleTex = canvasTexture(1024, 1024, (c, w) => {
    const C = w / 2; c.clearRect(0, 0, w, w); c.strokeStyle = '#fff'; c.fillStyle = '#fff'; c.lineCap = 'round';
    for (const [r, lw] of [[0.97, 6], [0.9, 3], [0.62, 4], [0.56, 2], [0.3, 3]]) { c.lineWidth = lw; c.beginPath(); c.arc(C, C, r * C, 0, 7); c.stroke(); }
    c.lineWidth = 3; c.beginPath(); for (let i = 0; i <= 7; i++) { const a = (i * 3 / 7) * Math.PI * 2 - Math.PI / 2; const x = C + Math.cos(a) * 0.62 * C, y = C + Math.sin(a) * 0.62 * C; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); // heptagram
    const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ'; c.font = `${C * 0.08}px serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; c.save(); c.translate(C + Math.cos(a) * 0.935 * C, C + Math.sin(a) * 0.935 * C); c.rotate(a + Math.PI / 2); c.fillText(glyphs[i % glyphs.length], 0, 0); c.restore(); }
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 - Math.PI / 2; c.beginPath(); c.arc(C + Math.cos(a) * 0.76 * C, C + Math.sin(a) * 0.76 * C, C * 0.06, 0, 7); c.stroke(); }
  }, { srgb: true });
  const mk = (size, col, k) => { const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); m.colorNode = texture(circleTex, uv()).rgb.mul(vec3(...new THREE.Color(col).toArray())).mul(k).mul(sin(time.mul(1.3)).mul(0.2).add(0.9)); const me = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m); me.rotation.x = -Math.PI / 2; return me; };
  const c1 = mk(26, '#8a5aff', 1.6); c1.position.y = -2.4; g.add(c1);
  const c2 = mk(13, '#60e0ff', 1.4); c2.position.y = -1.3; g.add(c2);
  // floating crystals (instanced, bobbing)
  const N = 26, cm = new THREE.MeshPhysicalNodeMaterial({ color: 0x9a7aff, roughness: 0.1, metalness: 0.1, clearcoat: 1, flatShading: true });
  cm.emissiveNode = vec3(0.35, 0.2, 0.9).mul(float(1).sub(abs(normalView.dot(positionViewDirection))).pow(2).mul(2).add(0.25));
  const cr = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), cm, N), R = rng(31);
  const seeds = Array.from({ length: N }, () => ({ a: R() * Math.PI * 2, r: 8.5 + R() * 9, y: -1 + R() * 6, s: 0.25 + R() * 0.6, ph: R() * 6 }));
  g.add(cr);
  const orbit = [new THREE.Mesh(new THREE.TorusGeometry(7.2, 0.025, 6, 140), glowMat('#c08cff', 2.4)), new THREE.Mesh(new THREE.TorusGeometry(7.8, 0.018, 6, 140), glowMat('#7fe8ff', 2.2))];
  orbit[0].rotation.set(-Math.PI / 2 + 0.12, 0, 0); orbit[1].rotation.set(-Math.PI / 2 - 0.1, 0.1, 0); orbit.forEach((o) => { o.position.y = -0.3; g.add(o); });
  scene.fog = new THREE.FogExp2(0x0c0618, 0.016); scene.add(g);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const place = (t) => { seeds.forEach((o, i) => { v.set(Math.cos(o.a + t * 0.03) * o.r, o.y + Math.sin(t * 0.7 + o.ph) * 0.35, Math.sin(o.a + t * 0.03) * o.r); e.set(0, t * 0.4 + o.ph, 0.2); m.compose(v, q.setFromEuler(e), s.set(o.s * 0.6, o.s * 1.4, o.s * 0.6)); cr.setMatrixAt(i, m); }); cr.instanceMatrix.needsUpdate = true; };
  place(0);
  return { group: g, update(t) { c1.rotation.z = t * 0.03; c2.rotation.z = -t * 0.06; orbit[0].rotation.z = t * 0.08; orbit[1].rotation.z = -t * 0.06; if (!settings.reducedMotion) place(t); } };
}

const BUILDERS = { study, space: spaceEnv, galaxy: galaxyEnv, grid: gridEnv, courtyard, arcane };
export function buildEnvironment(id, scene, theme) {
  const env = (BUILDERS[id] || study)(scene, theme);
  env.id = id;
  env.dispose = () => {
    scene.remove(env.group);
    env.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((mm) => { mm.map?.dispose(); mm.dispose(); }); } if (o.isLight) o.dispose?.(); });
  };
  return env;
}
