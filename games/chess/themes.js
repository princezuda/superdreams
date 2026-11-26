// Chess: Worlds — themes. Each theme = palette + piece set + piece material recipe + painted board + environment +
// lighting mood + capture effect. Everything here is data or pure builders so the remix config can mix and match
// (e.g. Space pieces on a Fantasy courtyard) and live postMessage updates can re-theme without a reload.
import * as THREE from 'three/webgpu';
import { attribute, uniform, userData, mix, float, vec3, sin, time, length, normalView, positionViewDirection, positionLocal, positionWorld, mx_noise_float, mx_fractal_noise_float, smoothstep, fract, abs, step, max, texture, uv, positionWorldDirection, color } from 'three/tsl';

export const THEME_IDS = ['classic', 'space', 'galaxy', 'scifi', 'fantasy', 'magic'];
export const FX_IDS = ['dust', 'wormhole', 'supernova', 'derez', 'crumble', 'sparkle'];

export const THEMES = {
  classic: {
    label: 'Classic', blurb: 'Staunton pieces on a lacquered walnut board in a lamplit study.', set: 'classic', env: 'study', fx: 'dust', board: 'wood',
    colors: { light: '#e9d1a4', dark: '#7b4b2c', whitePieces: '#f1e3c6', blackPieces: '#2a1912', accent: '#d8ad52' },
    glow: ['#ffd9a0', '#ffb070'], marker: '#ffe2a0', capture: '#ff8a5a', last: '#ffd060',
    piece: { rough: 0.3, metal: 0.0, clearcoat: 0.85, clearRough: 0.22, accentMetal: 1, accentRough: 0.3, pattern: 'wood', glowGain: 0.6 },
    lights: { sky: 0xffe2c4, ground: 0x2c1a10, hemi: 0.5, key: 0xffd2a0, keyI: 3.1, keyPos: [-5, 11, 4], rim: 0x9db6ff, rimI: 0.9, rimPos: [6, 5, -8], amb: 0.08 },
    tone: 'aces', exposure: 1.0, bloom: { strength: 0.3, radius: 0.4, threshold: 0.9 },
    fog: [0x150d07, 0.014], envMap: { top: '#3c2a1b', mid: '#6b4a2e', bottom: '#120a05', panels: [['#ffd6a0', 7, [-4, 5, 2]], ['#9fb8ff', 2, [5, 3, -5]], ['#ffffff', 2.5, [0, 8, 0]]] }, envI: 0.7,
  },
  space: {
    label: 'Space', blurb: 'A fleet of starships duels on a deck plate adrift among the stars.', set: 'space', env: 'space', fx: 'wormhole', board: 'deck',
    colors: { light: '#aeb9c9', dark: '#283246', whitePieces: '#e8edf3', blackPieces: '#535c6e', accent: '#ffb347' },
    glow: ['#5fd4ff', '#ff6a3a'], marker: '#7fdcff', capture: '#ff7a4a', last: '#5fd4ff',
    piece: { rough: 0.32, metal: 0.65, clearcoat: 0.3, clearRough: 0.3, accentMetal: 0.85, accentRough: 0.35, pattern: 'hull', glowGain: 2.2 },
    lights: { sky: 0x9fb8ff, ground: 0x101420, hemi: 0.45, key: 0xfff0e0, keyI: 3.4, keyPos: [7, 10, 5], rim: 0x5fa8ff, rimI: 1.6, rimPos: [-7, 4, -8], amb: 0.06 },
    tone: 'aces', exposure: 1.05, bloom: { strength: 0.55, radius: 0.45, threshold: 0.8 },
    fog: null, envMap: { top: '#0a1020', mid: '#1a2440', bottom: '#020308', panels: [['#ffffff', 8, [5, 6, 4]], ['#5fa8ff', 4, [-6, 2, -4]], ['#ffb070', 2, [0, -3, 6]]] }, envI: 1.0,
    nebula: { nebulaA: 0x2a1458, nebulaB: 0x0a3a6e, density: 0.9 },
  },
  galaxy: {
    label: 'Galaxy', blurb: 'Suns, moons and ringed giants on a board of glowing nebula glass.', set: 'galaxy', env: 'galaxy', fx: 'supernova', board: 'nebula',
    colors: { light: '#b0a3de', dark: '#1a1240', whitePieces: '#fff1cf', blackPieces: '#2a1850', accent: '#8ab8f0' },
    glow: ['#ffc860', '#c05cff'], marker: '#ffe08a', capture: '#ff60c0', last: '#b89cff',
    piece: { rough: 0.22, metal: 0.1, clearcoat: 1, clearRough: 0.1, accentMetal: 0.2, accentRough: 0.1, pattern: 'celestial', glowGain: 1.6 },
    lights: { sky: 0xc0a8ff, ground: 0x0a0618, hemi: 0.38, key: 0xfff0d8, keyI: 2.0, keyPos: [6, 10, 6], rim: 0xc070ff, rimI: 1.8, rimPos: [-7, 4, -7], amb: 0.08 },
    tone: 'agx', exposure: 0.95, bloom: { strength: 0.55, radius: 0.5, threshold: 0.8 },
    fog: null, envMap: { top: '#1a1040', mid: '#3a2070', bottom: '#05030c', panels: [['#ffd8a0', 5, [5, 6, 3]], ['#c070ff', 5, [-6, 3, -4]], ['#60a0ff', 3, [0, -4, 5]]] }, envI: 0.9,
    nebula: { nebulaA: 0x5a1270, nebulaB: 0x142a80, base: 0x030209, density: 0.85 },
  },
  scifi: {
    label: 'Sci-Fi', blurb: 'Hard-surface mechs and drones on a neon grid inside a data city.', set: 'scifi', env: 'grid', fx: 'derez', board: 'grid',
    colors: { light: '#4c5870', dark: '#10141d', whitePieces: '#dfe6ee', blackPieces: '#262b35', accent: '#2fe0ff' },
    glow: ['#2fe0ff', '#ff2fa8'], marker: '#2fe0ff', capture: '#ff2fa8', last: '#7a8cff',
    piece: { rough: 0.35, metal: 0.55, clearcoat: 0.6, clearRough: 0.2, accentMetal: 0.6, accentRough: 0.3, pattern: 'panels', glowGain: 2.6 },
    lights: { sky: 0x80a0ff, ground: 0x100818, hemi: 0.4, key: 0xe8f0ff, keyI: 3.0, keyPos: [5, 11, 6], rim: 0xff40c0, rimI: 1.8, rimPos: [-7, 4, -7], amb: 0.06 },
    tone: 'agx', exposure: 1.1, bloom: { strength: 0.7, radius: 0.5, threshold: 0.75 },
    fog: [0x06070f, 0.022], envMap: { top: '#0a0c1a', mid: '#1a1030', bottom: '#020205', panels: [['#2fe0ff', 6, [5, 4, 4]], ['#ff2fa8', 6, [-6, 3, -4]], ['#ffffff', 2, [0, 8, 0]]] }, envI: 1.0,
  },
  fantasy: {
    label: 'Fantasy', blurb: 'Dragons, wizards and castle towers carved in stone and gold at dusk.', set: 'fantasy', env: 'courtyard', fx: 'crumble', board: 'stone',
    colors: { light: '#d6c49c', dark: '#565a5e', whitePieces: '#e4dccb', blackPieces: '#3d3a40', accent: '#e0b040' },
    glow: ['#ffcf60', '#ff7a30'], marker: '#ffd36a', capture: '#ff6a3a', last: '#ffc040',
    piece: { rough: 0.78, metal: 0.0, clearcoat: 0.0, clearRough: 0.5, accentMetal: 1, accentRough: 0.28, pattern: 'stone', glowGain: 1.2 },
    lights: { sky: 0xffb890, ground: 0x2a2030, hemi: 0.6, key: 0xffc890, keyI: 3.0, keyPos: [-8, 7, 3], rim: 0x7a90ff, rimI: 1.3, rimPos: [7, 5, -7], amb: 0.1 },
    tone: 'aces', exposure: 1.05, bloom: { strength: 0.45, radius: 0.5, threshold: 0.85 },
    fog: [0x2a2030, 0.02], envMap: { top: '#2a3060', mid: '#c07050', bottom: '#2a2024', panels: [['#ffb070', 6, [-6, 3, 2]], ['#7a90ff', 3, [6, 5, -5]]] }, envI: 0.8,
  },
  magic: {
    label: 'Magic', blurb: 'Crystal wizards and familiars over an arcane board of living runes.', set: 'magic', env: 'arcane', fx: 'sparkle', board: 'arcane',
    colors: { light: '#8c7bbf', dark: '#21153e', whitePieces: '#f2f4ff', blackPieces: '#3b2466', accent: '#ffd27a' },
    glow: ['#7fe8ff', '#d070ff'], marker: '#a8f0ff', capture: '#ff70d8', last: '#c08cff',
    piece: { rough: 0.18, metal: 0.05, clearcoat: 1, clearRough: 0.08, accentMetal: 1, accentRough: 0.25, pattern: 'crystal', glowGain: 2.0, iridescence: 0.7 },
    lights: { sky: 0xb090ff, ground: 0x140a24, hemi: 0.32, key: 0xf0e8ff, keyI: 1.75, keyPos: [5, 10, 6], rim: 0x60e0ff, rimI: 1.8, rimPos: [-7, 4, -7], amb: 0.06 },
    tone: 'agx', exposure: 1.0, bloom: { strength: 0.7, radius: 0.55, threshold: 0.74 },
    fog: [0x0c0618, 0.02], envMap: { top: '#1a0e34', mid: '#4a2a80', bottom: '#06030c', panels: [['#7fe8ff', 5, [5, 5, 4]], ['#d070ff', 5, [-5, 3, -5]], ['#ffd27a', 2, [0, 7, 0]]] }, envI: 1.0,
    nebula: { nebulaA: 0x4a1a7a, nebulaB: 0x0e2a5a, base: 0x05020c, density: 0.8 },
  },
};

// ---------------------------------------------------------------- seeded random for painters
export function rng(seed = 1) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }
const hexA = (hex, a) => { const c = new THREE.Color(hex); return `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},${a})`; };
const shade = (hex, k) => { const c = new THREE.Color(hex); c.offsetHSL(0, 0, k); return '#' + c.getHexString(); };

// ---------------------------------------------------------------- piece materials (TSL)
const MARK = uniform(new THREE.Color('#ffe2a0'));
export const pieceUniforms = { mark: MARK };
export function pieceMaterial(theme, side, colors) {
  const P = theme.piece;
  const m = new THREE.MeshPhysicalNodeMaterial({ roughness: P.rough, metalness: P.metal, clearcoat: P.clearcoat, clearcoatRoughness: P.clearRough });
  if (P.iridescence) { m.iridescence = P.iridescence; m.iridescenceIOR = 1.4; }
  const part = attribute('part', 'vec3');
  const body = uniform(new THREE.Color(side ? colors.blackPieces : colors.whitePieces));
  const acc = uniform(new THREE.Color(colors.accent));
  const glowC = uniform(new THREE.Color(theme.glow[side]));
  const p = positionLocal;
  let pat = float(1);
  const NOPAT = typeof location !== 'undefined' && new URLSearchParams(location.search).has('nopat'); // debug: delete-a-layer check
  if (NOPAT) pat = float(1);
  else if (P.pattern === 'wood') pat = mix(float(0.84), float(1.06), sin(length(p.xz).mul(95).add(mx_noise_float(p.mul(vec3(5, 16, 5))).mul(3.2))).mul(0.5).add(0.5));
  else if (P.pattern === 'stone') pat = mx_fractal_noise_float(p.mul(14), 3, 2.0, 0.5).mul(0.26).add(0.98).mul(step(0.7, mx_noise_float(p.mul(48))).mul(-0.07).add(1));
  else if (P.pattern === 'hull') pat = float(1).sub(step(0.955, fract(p.y.mul(14))).mul(0.25)).mul(mx_noise_float(p.mul(vec3(3, 90, 3))).mul(0.05).add(1));
  else if (P.pattern === 'panels') pat = float(1).sub(step(0.94, fract(p.y.mul(9).add(0.3))).mul(0.35));
  else if (P.pattern === 'celestial') pat = mx_fractal_noise_float(p.mul(vec3(7, 22, 7)), 3, 2.0, 0.5).mul(0.5).add(1);
  else if (P.pattern === 'crystal') pat = mx_noise_float(p.mul(9)).mul(0.12).add(1);
  m.colorNode = mix(body, acc, part.x).mul(float(1).sub(part.z.mul(0.85))).mul(pat);
  m.roughnessNode = mix(float(P.rough), float(P.accentRough), part.x);
  m.metalnessNode = mix(float(P.metal), float(P.accentMetal), part.x);
  const rim = float(1).sub(abs(normalView.dot(positionViewDirection))).pow(2.2);
  const sel = userData('sel', 'float'), hov = userData('hov', 'float'), chk = userData('chk', 'float');
  const pulse = sin(time.mul(5.0)).mul(0.3).add(0.7);
  const breathe = sin(time.mul(1.7).add(positionWorld.x.mul(0.7))).mul(0.15).add(0.85);
  let em = glowC.mul(part.y).mul(P.glowGain).mul(breathe);
  if (P.pattern === 'crystal' || P.pattern === 'celestial') em = em.add(glowC.mul(rim).mul(side ? 0.28 : 0.3));
  m.emissiveNode = em
    .add(MARK.mul(rim.mul(1.4).add(0.12)).mul(sel.mul(1.3).add(hov.mul(0.45))))
    .add(vec3(1.0, 0.1, 0.04).mul(rim.mul(2.2).add(0.35)).mul(chk).mul(pulse));
  m.userData.u = { body, acc, glowC };
  return m;
}

// ---------------------------------------------------------------- painted boards
// The board texture covers the frame + 8×8 squares. Squares occupy the centre 8/9.4 of the texture.
export const BOARD = { size: 9.4, squares: 8 };
export function paintBoard(style, colors, accent, { coords = true } = {}) {
  const N = 2048, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  const e = document.createElement('canvas'); e.width = e.height = 1024; // emissive mask (half res)
  const eg = e.getContext('2d'); eg.fillStyle = '#000'; eg.fillRect(0, 0, 1024, 1024);
  const sq = N / BOARD.size, off = (N - sq * 8) / 2, R = rng(7);
  const S = (f, r) => [off + f * sq, off + (7 - r) * sq]; // file 0..7, rank 0..7 → canvas xy (rank 8 at top)
  const light = colors.light, dark = colors.dark;
  const frame = { wood: '#3a1f12', deck: '#1d2330', nebula: '#0d0a1c', grid: '#07090f', stone: '#5e554c', arcane: '#160d2a' }[style] || '#333';
  // ---- frame
  g.fillStyle = frame; g.fillRect(0, 0, N, N);
  if (style === 'wood') { for (let i = 0; i < 900; i++) { g.strokeStyle = hexA(R() < 0.5 ? '#1c0d06' : '#5a3420', 0.18); g.lineWidth = 1 + R() * 3; const y = R() * N; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(N * 0.3, y + (R() - 0.5) * 40, N * 0.7, y + (R() - 0.5) * 40, N, y + (R() - 0.5) * 30); g.stroke(); } }
  if (style === 'stone') { const bh = 64; for (let y = 0; y < N; y += bh) for (let x = -((y / bh) % 2) * 70; x < N; x += 140) { g.fillStyle = shade('#625a50', (R() - 0.5) * 0.09); g.fillRect(x + 3, y + 3, 134, bh - 6); for (let i = 0; i < 10; i++) { g.fillStyle = `rgba(0,0,0,${R() * 0.1})`; g.fillRect(x + R() * 130, y + R() * (bh - 8), 2 + R() * 14, 2 + R() * 5); } g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(x + 3, y + 3, 134, 3); } }
  if (style === 'deck' || style === 'grid') { g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 2; for (let i = 0; i < N; i += 48) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, N); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(N, i); g.stroke(); } }
  if (style === 'nebula' || style === 'arcane') { for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(255,255,255,${R() * 0.5})`; g.fillRect(R() * N, R() * N, 2, 2); } }
  // inlay / trim line around the squares
  const trim = { wood: accent, deck: '#ffb347', nebula: accent, grid: accent, stone: accent, arcane: accent }[style];
  g.strokeStyle = trim; g.lineWidth = style === 'wood' ? 10 : 7;
  g.strokeRect(off - 22, off - 22, sq * 8 + 44, sq * 8 + 44);
  if (style !== 'stone') { g.lineWidth = 3; g.strokeRect(off - 40, off - 40, sq * 8 + 80, sq * 8 + 80); }
  const es = 1024 / N;
  if (style !== 'wood' && style !== 'stone') { eg.strokeStyle = trim; eg.lineWidth = 5; eg.strokeRect((off - 22) * es, (off - 22) * es, (sq * 8 + 44) * es, (sq * 8 + 44) * es); }
  if (style === 'deck') { // hazard stripes on corners
    for (const [cx, cy] of [[0, 0], [N, 0], [0, N], [N, N]]) { g.save(); g.translate(cx, cy); g.beginPath(); g.rect(-off * 0.8, -off * 0.8, off * 1.6, off * 1.6); g.clip(); for (let i = -12; i < 12; i++) { g.fillStyle = i % 2 ? '#ffb347' : '#151515'; g.beginPath(); g.moveTo(i * 30, -200); g.lineTo(i * 30 + 30, -200); g.lineTo(i * 30 + 230, 200); g.lineTo(i * 30 + 200, 200); g.fill(); } g.restore(); }
  }
  if (style === 'arcane') { // rune ring on the frame
    const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
    g.font = `${sq * 0.17}px serif`; eg.font = `${sq * 0.17 * es}px serif`; g.textAlign = eg.textAlign = 'center'; g.textBaseline = eg.textBaseline = 'middle';
    for (let side = 0; side < 4; side++) for (let i = 0; i < 18; i++) {
      const t = (i + 0.5) / 18, along = off - 10 + t * (sq * 8 + 20), across = off * 0.17;
      const pts = [[along, across], [N - across, along], [N - along, N - across], [across, N - along]][side];
      const ch = glyphs[(i * 7 + side * 3) % glyphs.length];
      g.fillStyle = hexA('#b48cff', 0.9); g.fillText(ch, pts[0], pts[1]);
      eg.fillStyle = '#9a70ff'; eg.fillText(ch, pts[0] * es, pts[1] * es);
    }
  }
  // ---- squares
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const isLight = (r + f) % 2 === 1, [x, y] = S(f, r), base = isLight ? light : dark;
    g.fillStyle = base; g.fillRect(x, y, sq + 1, sq + 1);
    g.save(); g.beginPath(); g.rect(x, y, sq, sq); g.clip();
    if (style === 'wood') {
      const vertical = (r + f) % 2 === 0;
      for (let i = 0; i < 46; i++) {
        g.strokeStyle = hexA(isLight ? '#a8783e' : '#2a140a', 0.08 + R() * 0.16); g.lineWidth = 0.8 + R() * 2.4;
        const t = R() * sq; g.beginPath();
        if (vertical) { g.moveTo(x + t, y); g.bezierCurveTo(x + t + (R() - 0.5) * 18, y + sq * 0.33, x + t + (R() - 0.5) * 18, y + sq * 0.66, x + t + (R() - 0.5) * 10, y + sq); }
        else { g.moveTo(x, y + t); g.bezierCurveTo(x + sq * 0.33, y + t + (R() - 0.5) * 18, x + sq * 0.66, y + t + (R() - 0.5) * 18, x + sq, y + t + (R() - 0.5) * 10); }
        g.stroke();
      }
      g.fillStyle = hexA('#000', 0.08); g.fillRect(x, y, sq, 2); g.fillRect(x, y, 2, sq);
    } else if (style === 'deck') {
      g.fillStyle = hexA('#fff', isLight ? 0.08 : 0.04); g.fillRect(x + 8, y + 8, sq - 16, sq - 16);
      g.strokeStyle = hexA('#000', 0.35); g.lineWidth = 3; g.strokeRect(x + 10, y + 10, sq - 20, sq - 20);
      g.fillStyle = hexA('#000', 0.35); for (const [a, b] of [[18, 18], [sq - 18, 18], [18, sq - 18], [sq - 18, sq - 18]]) { g.beginPath(); g.arc(x + a, y + b, 4, 0, 7); g.fill(); }
      for (let i = 0; i < 30; i++) { g.fillStyle = hexA(R() < 0.5 ? '#000' : '#fff', 0.05); g.fillRect(x + R() * sq, y + R() * sq, 2 + R() * 30, 1.5); }
      eg.fillStyle = hexA('#5fd4ff', 0.5); eg.fillRect((x + sq / 2 - 6) * es, (y + 4) * es, 12 * es, 3 * es);
    } else if (style === 'nebula') {
      for (let i = 0; i < 5; i++) {
        const cx = x + R() * sq, cy = y + R() * sq, rr = sq * (0.3 + R() * 0.6), col = ['#ff4fd8', '#5f7aff', '#9a4fff', '#40c8ff'][(R() * 4) | 0];
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rr); gr.addColorStop(0, hexA(col, isLight ? 0.18 : 0.35)); gr.addColorStop(1, hexA(col, 0));
        g.fillStyle = gr; g.fillRect(x, y, sq, sq);
        if (!isLight) { const ge = eg.createRadialGradient(cx * es, cy * es, 0, cx * es, cy * es, rr * es); ge.addColorStop(0, hexA(col, 0.55)); ge.addColorStop(1, hexA(col, 0)); eg.fillStyle = ge; eg.fillRect(x * es, y * es, sq * es, sq * es); }
      }
      for (let i = 0; i < 22; i++) { const a = R(), sx = x + R() * sq, sy = y + R() * sq; g.fillStyle = `rgba(255,255,255,${a})`; g.fillRect(sx, sy, 2, 2); if (!isLight && a > 0.6) { eg.fillStyle = '#fff'; eg.fillRect(sx * es, sy * es, 1.5, 1.5); } }
      g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, sq - 2, sq - 2);
    } else if (style === 'grid') {
      g.fillStyle = hexA('#fff', isLight ? 0.05 : 0.02); g.fillRect(x + 6, y + 6, sq - 12, sq - 12);
      for (let i = 1; i < 4; i++) { g.strokeStyle = hexA('#7ab8ff', 0.06); g.lineWidth = 1; g.beginPath(); g.moveTo(x + (i * sq) / 4, y); g.lineTo(x + (i * sq) / 4, y + sq); g.moveTo(x, y + (i * sq) / 4); g.lineTo(x + sq, y + (i * sq) / 4); g.stroke(); }
      eg.strokeStyle = hexA(accent, 0.95); eg.lineWidth = 2.2; eg.strokeRect((x + 2) * es, (y + 2) * es, (sq - 4) * es, (sq - 4) * es);
      eg.fillStyle = hexA(accent, 1); for (const [a, b] of [[0, 0], [sq, 0], [0, sq], [sq, sq]]) eg.fillRect((x + a) * es - 3, (y + b) * es - 3, 6, 6);
      g.strokeStyle = hexA(accent, 0.7); g.lineWidth = 3; g.strokeRect(x + 2, y + 2, sq - 4, sq - 4);
    } else if (style === 'stone') {
      for (let i = 0; i < 160; i++) { g.fillStyle = hexA(R() < 0.5 ? '#000' : '#fff', 0.035 + R() * 0.05); g.beginPath(); g.arc(x + R() * sq, y + R() * sq, 1 + R() * 7, 0, 7); g.fill(); }
      g.strokeStyle = hexA('#000', 0.35); g.lineWidth = 1.6;
      for (let k = 0; k < 2; k++) { let px = x + R() * sq, py = y + R() * sq; g.beginPath(); g.moveTo(px, py); for (let j = 0; j < 6; j++) { px += (R() - 0.5) * 50; py += (R() - 0.5) * 50; g.lineTo(px, py); } g.stroke(); }
      if (R() < 0.35) { g.fillStyle = hexA('#4a6a2a', 0.35); for (let i = 0; i < 18; i++) { g.beginPath(); g.arc(x + (R() < 0.5 ? R() * 16 : sq - R() * 16), y + R() * sq, 2 + R() * 6, 0, 7); g.fill(); } }
      g.strokeStyle = hexA('#1a140e', 0.8); g.lineWidth = 7; g.strokeRect(x + 2, y + 2, sq - 4, sq - 4);
      g.strokeStyle = hexA('#fff', 0.08); g.lineWidth = 3; g.strokeRect(x + 8, y + 8, sq - 16, sq - 16);
    } else if (style === 'arcane') {
      g.strokeStyle = hexA(isLight ? '#5a3a9a' : '#b48cff', isLight ? 0.18 : 0.22); g.lineWidth = 2;
      g.beginPath(); g.arc(x + sq / 2, y + sq / 2, sq * 0.34, 0, 7); g.stroke();
      if (!isLight) {
        const n = 3 + ((r * 3 + f) % 4);
        g.beginPath(); for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2 - Math.PI / 2; const px = x + sq / 2 + Math.cos(a) * sq * 0.34, py = y + sq / 2 + Math.sin(a) * sq * 0.34; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke();
        eg.strokeStyle = hexA('#8a5aff', 0.55); eg.lineWidth = 1.5; eg.beginPath(); eg.arc((x + sq / 2) * es, (y + sq / 2) * es, sq * 0.34 * es, 0, 7); eg.stroke();
      }
      const gr = g.createRadialGradient(x + sq / 2, y + sq / 2, 0, x + sq / 2, y + sq / 2, sq * 0.8); gr.addColorStop(0, hexA('#fff', isLight ? 0.08 : 0.04)); gr.addColorStop(1, 'rgba(0,0,0,.15)');
      g.fillStyle = gr; g.fillRect(x, y, sq, sq);
    }
    g.restore();
  }
  // ---- coordinates (both edges, each oriented to its player)
  if (coords) {
    const fontFam = style === 'wood' || style === 'stone' || style === 'arcane' ? 'Georgia, "Times New Roman", serif' : '"Segoe UI", Roboto, system-ui, sans-serif';
    const fs = sq * 0.3, col = { wood: '#f3dfb4', deck: '#9fdcff', nebula: '#e8d8ff', grid: accent, stone: '#f0d890', arcane: '#d8c0ff' }[style];
    g.font = `600 ${fs}px ${fontFam}`; eg.font = `600 ${fs * es}px ${fontFam}`;
    g.textAlign = eg.textAlign = 'center'; g.textBaseline = eg.textBaseline = 'middle';
    const glowy = style !== 'wood' && style !== 'stone';
    const put = (txt, x, y, rot) => {
      g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = col; g.fillText(txt, 0, 0); g.restore();
      if (glowy) { eg.save(); eg.translate(x * es, y * es); eg.rotate(rot); eg.fillStyle = hexA(col, 0.85); eg.fillText(txt, 0, 0); eg.restore(); }
    };
    for (let i = 0; i < 8; i++) {
      const fx = off + (i + 0.5) * sq, ry = off + (7 - i + 0.5) * sq, m = off * (style === 'arcane' ? 0.64 : 0.5);
      put('abcdefgh'[i], fx, N - m, 0); put('abcdefgh'[i], fx, m, Math.PI);
      put(String(i + 1), m, ry, 0); put(String(i + 1), N - m, ry, Math.PI);
    }
  }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const emap = new THREE.CanvasTexture(e); emap.colorSpace = THREE.SRGBColorSpace;
  return { map, emap };
}

export function boardMaterial(style, tex) {
  const P = {
    wood: { roughness: 0.34, metalness: 0, clearcoat: 0.75, clearcoatRoughness: 0.16, em: 0 },
    deck: { roughness: 0.42, metalness: 0.55, clearcoat: 0.2, clearcoatRoughness: 0.4, em: 1.4 },
    nebula: { roughness: 0.12, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05, em: 1.3 },
    grid: { roughness: 0.25, metalness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.1, em: 1.5 },
    stone: { roughness: 0.88, metalness: 0, clearcoat: 0, clearcoatRoughness: 0.5, em: 0 },
    arcane: { roughness: 0.3, metalness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.15, em: 1.6 },
  }[style];
  const m = new THREE.MeshPhysicalNodeMaterial({ map: tex.map, roughness: P.roughness, metalness: P.metalness, clearcoat: P.clearcoat, clearcoatRoughness: P.clearcoatRoughness });
  if (P.em) {
    const e = texture(tex.emap, uv()).rgb;
    let pulse = sin(time.mul(1.2)).mul(0.15).add(0.85);
    if (style === 'grid') pulse = smoothstep(0.0, 0.08, abs(fract(uv().y.sub(time.mul(0.06))).sub(0.5))).mul(-0.6).add(1.3); // travelling scan band
    if (style === 'arcane') pulse = sin(time.mul(0.9).add(uv().x.mul(9)).add(uv().y.mul(5))).mul(0.3).add(0.85);
    m.emissiveNode = e.mul(P.em).mul(pulse);
  }
  return m;
}

// ---------------------------------------------------------------- environment-map scene (PMREM source) per theme
export function envScene(def) {
  const s = new THREE.Scene();
  const top = uniform(new THREE.Color(def.top)), mid = uniform(new THREE.Color(def.mid)), bot = uniform(new THREE.Color(def.bottom));
  const sky = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide });
  const y = positionWorldDirection.y;
  sky.colorNode = mix(mix(bot, mid, smoothstep(-0.35, 0.0, y)), top, smoothstep(0.0, 0.7, y));
  s.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), sky));
  for (const [col, intensity, pos] of def.panels) {
    const pm = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(col).multiplyScalar(intensity), side: THREE.DoubleSide });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), pm); panel.position.set(...pos).multiplyScalar(1.6); panel.lookAt(0, 0, 0); s.add(panel);
  }
  return s;
}
export { color, max };
