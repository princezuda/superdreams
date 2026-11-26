// Gem Garden — procedural gem sprites (Canvas 2D). Six cuts with distinct silhouettes so colour is never the only cue.
// Faceted style: crown facets shaded by their normal vs. a top-left key light + table + specular. Glossy style: candy-smooth.
export const PALETTES = {
  normal: ['#ff3d6e', '#ff9a2e', '#ffd43b', '#2fd37a', '#3aa0ff', '#b061ff'],
  colorblind: ['#d55e00', '#e69f00', '#f0e442', '#009e73', '#0072b2', '#cc79a7'], // Okabe–Ito
};
export const GEM_NAMES = ['Ruby', 'Amber', 'Citrine', 'Emerald', 'Sapphire', 'Amethyst'];

const TAU = Math.PI * 2;
function shapePts(c) {
  const p = [];
  if (c === 0) for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU - Math.PI / 2; p.push([Math.cos(a) * 0.92, Math.sin(a) * 0.92]); }
  else if (c === 1) for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU - Math.PI / 2; p.push([Math.cos(a) * 0.98, Math.sin(a) * 0.98]); }
  else if (c === 2) p.push([0, -1], [0.82, 0], [0, 1], [-0.82, 0]);
  else if (c === 3) { const w = 0.8, h = 0.94, k = 0.3; p.push([-w + k, -h], [w - k, -h], [w, -h + k], [w, h - k], [w - k, h], [-w + k, h], [-w, h - k], [-w, -h + k]); }
  else if (c === 4) { p.push([0, -1]); for (let k = 1; k < 14; k++) { const a = -Math.PI / 2 + 0.62 + (k / 14) * (TAU - 1.24); p.push([Math.cos(a) * 0.74, 0.22 + Math.sin(a) * 0.74]); } }
  else { const r = 1.02; for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU - Math.PI / 2; const b = ((k + 0.5) / 3) * TAU - Math.PI / 2; p.push([Math.cos(a) * r, Math.sin(a) * r + 0.12], [Math.cos(b) * 0.62, Math.sin(b) * 0.62 + 0.12]); } }
  return p;
}
export const SHAPES = [0, 1, 2, 3, 4, 5].map(shapePts);

export function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function mix(h, t, to = 255) { const [r, g, b] = hexRgb(h); const f = (v) => Math.round(v + ((to === 255 ? 255 : 0) - v) * t); return `rgb(${f(r)},${f(g)},${f(b)})`; }
const lighten = (h, t) => mix(h, t, 255), darken = (h, t) => mix(h, t, 0);

function path(ctx, pts, s, ox = 0, oy = 0) { ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(ox + x * s, oy + y * s) : ctx.moveTo(ox + x * s, oy + y * s))); ctx.closePath(); }

// Draw one gem centred at (cx,cy) with radius R into ctx.
export function paintGem(ctx, c, col, R, cx, cy, style = 'faceted') {
  const pts = SHAPES[c];
  ctx.save();
  // soft contact shadow
  ctx.fillStyle = 'rgba(20,30,20,.28)'; ctx.beginPath(); ctx.ellipse(cx, cy + R * 0.86, R * 0.7, R * 0.2, 0, 0, TAU); ctx.fill();
  if (style === 'glossy') {
    path(ctx, pts, R, cx, cy);
    const g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.4, R * 0.1, cx, cy, R * 1.1);
    g.addColorStop(0, lighten(col, 0.55)); g.addColorStop(0.45, col); g.addColorStop(1, darken(col, 0.45));
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = R * 0.07; ctx.strokeStyle = darken(col, 0.5); ctx.stroke();
    ctx.globalAlpha = 0.85; ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.beginPath(); ctx.ellipse(cx - R * 0.22, cy - R * 0.45, R * 0.42, R * 0.2, -0.45, 0, TAU); ctx.fill();
    ctx.restore(); return;
  }
  // facets: outer ring between outline and an offset inner table
  const tS = 0.52, tox = -R * 0.06, toy = -R * 0.08, L = [-0.55, -0.83];
  const n = pts.length;
  for (let k = 0; k < n; k++) {
    const a = pts[k], b = pts[(k + 1) % n];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, ml = Math.hypot(mx, my) || 1;
    const d = (mx / ml) * L[0] + (my / ml) * L[1]; // -1..1
    ctx.beginPath();
    ctx.moveTo(cx + a[0] * R, cy + a[1] * R); ctx.lineTo(cx + b[0] * R, cy + b[1] * R);
    ctx.lineTo(cx + tox + b[0] * R * tS, cy + toy + b[1] * R * tS); ctx.lineTo(cx + tox + a[0] * R * tS, cy + toy + a[1] * R * tS); ctx.closePath();
    ctx.fillStyle = d > 0 ? lighten(col, 0.12 + d * 0.5) : darken(col, -d * 0.5 + (k % 2) * 0.06);
    ctx.fill();
    ctx.lineWidth = Math.max(0.6, R * 0.025); ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.stroke();
  }
  // table
  path(ctx, pts, R * tS, cx + tox, cy + toy);
  const tg = ctx.createLinearGradient(cx - R * 0.5, cy - R * 0.6, cx + R * 0.5, cy + R * 0.5);
  tg.addColorStop(0, lighten(col, 0.5)); tg.addColorStop(0.55, lighten(col, 0.12)); tg.addColorStop(1, col);
  ctx.fillStyle = tg; ctx.fill();
  // outline
  path(ctx, pts, R, cx, cy); ctx.lineWidth = Math.max(1, R * 0.06); ctx.strokeStyle = darken(col, 0.55); ctx.stroke();
  // inner rim light
  path(ctx, pts, R * 0.94, cx, cy); ctx.lineWidth = Math.max(0.6, R * 0.03); ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.stroke();
  // specular
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.beginPath(); ctx.ellipse(cx - R * 0.26, cy - R * 0.36, R * 0.2, R * 0.09, -0.6, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.95)'; star(ctx, cx - R * 0.3, cy - R * 0.4, R * 0.16);
  ctx.restore();
}
export function star(ctx, x, y, r) {
  ctx.beginPath(); for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; const rr = k % 2 ? r * 0.22 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); ctx.fill();
}

// Seed pod: chunky acorn-like seed with a sprout — cannot be matched, so it must not look like a gem.
export function paintSeed(ctx, R, cx, cy) {
  ctx.save();
  ctx.fillStyle = 'rgba(20,30,20,.3)'; ctx.beginPath(); ctx.ellipse(cx, cy + R * 0.86, R * 0.6, R * 0.18, 0, 0, TAU); ctx.fill();
  const g = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.1, R * 0.1, cx, cy + R * 0.2, R);
  g.addColorStop(0, '#f6c98a'); g.addColorStop(0.6, '#c8813f'); g.addColorStop(1, '#7a4a20');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy + R * 0.18, R * 0.62, R * 0.7, 0, 0, TAU); ctx.fill();
  ctx.lineWidth = R * 0.06; ctx.strokeStyle = '#5c3414'; ctx.stroke();
  // cap
  ctx.fillStyle = '#7a5230'; ctx.beginPath(); ctx.ellipse(cx, cy - R * 0.28, R * 0.7, R * 0.3, 0, Math.PI, TAU); ctx.lineTo(cx + R * 0.7, cy - R * 0.22); ctx.ellipse(cx, cy - R * 0.22, R * 0.7, R * 0.12, 0, 0, Math.PI); ctx.fill();
  ctx.strokeStyle = 'rgba(255,230,190,.35)'; ctx.lineWidth = R * 0.04;
  for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(cx + k * R * 0.22, cy - R * 0.5); ctx.lineTo(cx + k * R * 0.28, cy - R * 0.14); ctx.stroke(); }
  // sprout
  ctx.strokeStyle = '#3c9a3c'; ctx.lineWidth = R * 0.09; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx, cy - R * 0.52); ctx.quadraticCurveTo(cx + R * 0.05, cy - R * 0.8, cx + R * 0.12, cy - R * 0.92); ctx.stroke();
  ctx.fillStyle = '#5fd35f';
  ctx.beginPath(); ctx.ellipse(cx + R * 0.32, cy - R * 0.9, R * 0.26, R * 0.12, -0.5, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx - R * 0.12, cy - R * 0.86, R * 0.2, R * 0.1, 0.6, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.ellipse(cx - R * 0.22, cy + R * 0.02, R * 0.12, R * 0.22, 0.3, 0, TAU); ctx.fill();
  ctx.restore();
}

// Vine overlay (1 = tendrils, 2 = dense woven mat) drawn over the tile, under the gem.
export function paintVine(ctx, layers, S, x0, y0, seed = 1) {
  const r = (k) => { const v = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  ctx.save(); ctx.lineCap = 'round';
  if (layers >= 2) { ctx.fillStyle = 'rgba(40,110,40,.55)'; roundRect(ctx, x0 + S * 0.04, y0 + S * 0.04, S * 0.92, S * 0.92, S * 0.18); ctx.fill(); }
  const strands = layers >= 2 ? 5 : 3;
  for (let k = 0; k < strands; k++) {
    ctx.strokeStyle = k % 2 ? '#2e8b3a' : '#43a843'; ctx.lineWidth = S * (layers >= 2 ? 0.07 : 0.055);
    const ya = y0 + S * (0.15 + r(k) * 0.7), yb = y0 + S * (0.15 + r(k + 9) * 0.7);
    ctx.beginPath(); ctx.moveTo(x0 + S * 0.02, ya);
    ctx.bezierCurveTo(x0 + S * 0.35, ya - S * 0.3 * (r(k + 3) - 0.5) * 2, x0 + S * 0.65, yb + S * 0.3, x0 + S * 0.98, yb); ctx.stroke();
    for (let j = 0; j < 3; j++) {
      const t = 0.2 + j * 0.3, lx = x0 + S * t, ly = ya + (yb - ya) * t + S * 0.08 * Math.sin(k + j * 2);
      ctx.fillStyle = j % 2 ? '#7bd65c' : '#5cc24a';
      ctx.beginPath(); ctx.ellipse(lx, ly, S * 0.09, S * 0.045, (j + k) * 1.3, 0, TAU); ctx.fill();
    }
  }
  if (layers >= 2) { ctx.strokeStyle = 'rgba(20,60,20,.7)'; ctx.lineWidth = S * 0.04; roundRect(ctx, x0 + S * 0.06, y0 + S * 0.06, S * 0.88, S * 0.88, S * 0.16); ctx.stroke(); }
  ctx.restore();
}
// Bramble: thorny bush ball; layer 2 adds a woven twig cage + berries.
export function paintBramble(ctx, layers, S, x0, y0) {
  const cx = x0 + S / 2, cy = y0 + S / 2, R = S * 0.44;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(cx, cy + R * 0.85, R * 0.9, R * 0.22, 0, 0, TAU); ctx.fill();
  const g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R * 1.1);
  g.addColorStop(0, layers >= 2 ? '#6b8f3a' : '#7fb24a'); g.addColorStop(1, layers >= 2 ? '#2b3d17' : '#35561f');
  ctx.fillStyle = g;
  ctx.beginPath(); for (let k = 0; k < 18; k++) { const a = (k / 18) * TAU, rr = R * (k % 2 ? 0.86 : 1.0); ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#26361a'; ctx.lineWidth = S * 0.03; ctx.stroke();
  ctx.strokeStyle = '#a0703a'; ctx.lineWidth = S * 0.04; ctx.lineCap = 'round';
  for (let k = 0; k < (layers >= 2 ? 7 : 4); k++) { const a = k * 2.4; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.7, cy + Math.sin(a) * R * 0.7); ctx.quadraticCurveTo(cx, cy, cx + Math.cos(a + 2) * R * 0.7, cy + Math.sin(a + 2) * R * 0.7); ctx.stroke(); }
  ctx.fillStyle = '#e8dcc0';
  for (let k = 0; k < 10; k++) { const a = k * 0.63 + 0.2, x = cx + Math.cos(a) * R * 0.96, y = cy + Math.sin(a) * R * 0.96; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * S * 0.09, y + Math.sin(a) * S * 0.09); ctx.lineTo(x + Math.cos(a + 1.6) * S * 0.03, y + Math.sin(a + 1.6) * S * 0.03); ctx.fill(); }
  if (layers >= 2) { ctx.fillStyle = '#d8344a'; for (let k = 0; k < 5; k++) { const a = k * 1.3 + 0.5; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R * 0.45, cy + Math.sin(a) * R * 0.45, S * 0.05, 0, TAU); ctx.fill(); } }
  ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.ellipse(cx - R * 0.35, cy - R * 0.4, R * 0.25, R * 0.12, -0.6, 0, TAU); ctx.fill();
  ctx.restore();
}
export function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

// Sprite cache: one canvas per colour, rebuilt on resize / palette / style change.
export function buildSprites(px, palette, style) {
  const out = { size: px, gems: [], seed: null };
  for (let c = 0; c < 6; c++) {
    const cv = document.createElement('canvas'); cv.width = cv.height = px;
    paintGem(cv.getContext('2d'), c, palette[c], px * 0.42, px / 2, px * 0.47, style); out.gems.push(cv);
  }
  const s = document.createElement('canvas'); s.width = s.height = px; paintSeed(s.getContext('2d'), px * 0.42, px / 2, px * 0.5); out.seed = s;
  const glow = document.createElement('canvas'); glow.width = glow.height = 64; const g = glow.getContext('2d');
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.35, 'rgba(255,255,255,.45)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64); out.glow = glow;
  return out;
}
// Tinted glow sprites per colour (cached).
const tintCache = new Map();
export function tintedGlow(base, col) {
  if (tintCache.has(col)) return tintCache.get(col);
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
  g.drawImage(base, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, 64, 64);
  tintCache.set(col, cv); return cv;
}
