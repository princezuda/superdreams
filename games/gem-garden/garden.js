// Gem Garden — the garden itself: procedural plants (each level grows one), zone backdrops and the scrolling garden map.
// Everything is vector-drawn in Canvas 2D; growth g ∈ [0,1] drives an eased grow-in, t drives idle sway.
import { ZONES } from './levels.js';
const TAU = Math.PI * 2;
const hash = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
export const easeBack = (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);

// ---------------------------------------------------------------- primitives
function stem(c, x, y, h, sway, col = '#3f9a3a', w = 3) { c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + sway * 0.5, y - h * 0.5, x + sway, y - h); c.stroke(); return [x + sway, y - h]; }
function leaf(c, x, y, len, ang, col = '#56c04b') { c.save(); c.translate(x, y); c.rotate(ang); c.fillStyle = col; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * 0.5, -len * 0.38, len, 0); c.quadraticCurveTo(len * 0.5, len * 0.38, 0, 0); c.fill(); c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 1; c.beginPath(); c.moveTo(len * 0.1, 0); c.lineTo(len * 0.85, 0); c.stroke(); c.restore(); }
function petals(c, x, y, n, r, w, col, rot = 0, inner = null) {
  for (let k = 0; k < n; k++) { const a = rot + (k / n) * TAU; c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = col; c.beginPath(); c.ellipse(r * 0.55, 0, r * 0.55, w, 0, 0, TAU); c.fill(); if (inner) { c.fillStyle = inner; c.beginPath(); c.ellipse(r * 0.4, 0, r * 0.28, w * 0.45, 0, 0, TAU); c.fill(); } c.restore(); }
}
function dot(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
function shadow(c, x, y, rx, ry = rx * 0.28, a = 0.22) { c.fillStyle = `rgba(20,40,20,${a})`; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill(); }
function canopy(c, x, y, r, cols, n = 7, seed = 1) {
  for (let k = 0; k < n; k++) { const a = (k / n) * TAU + seed, rr = r * (0.55 + hash(seed + k) * 0.2); dot(c, x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.38, rr, cols[k % cols.length]); }
  dot(c, x, y - r * 0.1, r * 0.7, cols[0]); c.fillStyle = 'rgba(255,255,255,.16)'; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.35, r * 0.35, 0, TAU); c.fill();
}
function trunk(c, x, y, h, w, col = '#8a5a34') { c.fillStyle = col; c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(x - w * 0.4, y - h * 0.5, x - w * 0.45, y - h); c.lineTo(x + w * 0.45, y - h); c.quadraticCurveTo(x + w * 0.4, y - h * 0.5, x + w, y); c.closePath(); c.fill(); }
function glow(c, x, y, r, col) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }

// ---------------------------------------------------------------- plants. Each draws at ground point (0,0), unit ≈ 1px at s=1
const FLOWER = (petal, center, n = 6, kind = 'round') => (c, s, t) => {
  const sway = Math.sin(t * 1.3) * 3 * s;
  shadow(c, 0, 0, 16 * s);
  for (const [dx, h, ph] of [[-9, 30, 0], [0, 42, 1], [10, 34, 2]]) {
    const [tx, ty] = stem(c, dx * s, 0, h * s, sway + Math.sin(t + ph) * 2 * s, '#3f9a3a', 2.4 * s);
    leaf(c, dx * s, -h * 0.35 * s, 11 * s, -0.9 + ph * 0.6);
    if (kind === 'tulip') { c.fillStyle = petal; c.beginPath(); c.moveTo(tx - 7 * s, ty); c.quadraticCurveTo(tx - 8 * s, ty - 12 * s, tx - 3 * s, ty - 13 * s); c.lineTo(tx, ty - 8 * s); c.lineTo(tx + 3 * s, ty - 13 * s); c.quadraticCurveTo(tx + 8 * s, ty - 12 * s, tx + 7 * s, ty); c.quadraticCurveTo(tx, ty + 5 * s, tx - 7 * s, ty); c.fill(); c.fillStyle = 'rgba(255,255,255,.3)'; c.beginPath(); c.ellipse(tx - 3 * s, ty - 6 * s, 1.6 * s, 4 * s, 0.2, 0, TAU); c.fill(); }
    else if (kind === 'spike') { for (let k = 0; k < 7; k++) dot(c, tx + Math.sin(k * 2) * 2 * s, ty + k * 3.2 * s, (3.2 - k * 0.2) * s, k % 2 ? petal : center); }
    else { petals(c, tx, ty, n, 11 * s, 3.6 * s, petal, t * 0.2 + ph); dot(c, tx, ty, 3.8 * s, center); }
  }
};
const SUN = (c, s, t) => {
  const sway = Math.sin(t * 1.1) * 3 * s; shadow(c, 0, 0, 14 * s);
  const [tx, ty] = stem(c, 0, 0, 62 * s, sway, '#3c8f34', 3.6 * s); leaf(c, 0, -22 * s, 16 * s, -0.6); leaf(c, 0, -34 * s, 14 * s, -2.5);
  petals(c, tx, ty, 14, 17 * s, 4 * s, '#ffcc22', 0, '#ffe680'); dot(c, tx, ty, 8 * s, '#7a4a1c');
  for (let k = 0; k < 9; k++) dot(c, tx + Math.cos(k * 2.4) * 4 * s, ty + Math.sin(k * 2.4) * 4 * s, 1.1 * s, '#4a2a0c');
};
const BUSH = (cols, fruit, fr = 3) => (c, s, t) => {
  shadow(c, 0, 0, 24 * s); const b = Math.sin(t * 1.2) * s;
  canopy(c, b, -16 * s, 20 * s, cols, 7, 3);
  if (fruit) for (let k = 0; k < 7; k++) dot(c, b + Math.cos(k * 2.1) * 13 * s, -16 * s + Math.sin(k * 2.1) * 9 * s, fr * s, fruit);
};
const ROSE = (c, s, t) => { BUSH(['#2f8a3c', '#3aa047', '#287a33'])(c, s, t); for (let k = 0; k < 6; k++) { const x = Math.cos(k * 1.9) * 13 * s, y = -16 * s + Math.sin(k * 1.9) * 9 * s; dot(c, x, y, 5 * s, '#e8345a'); c.strokeStyle = '#a3163a'; c.lineWidth = 1.2 * s; c.beginPath(); c.arc(x, y, 2.6 * s, 0, 5); c.stroke(); } };
const TREE = (cols, fruit, h = 54, kind = 'round') => (c, s, t) => {
  shadow(c, 0, 0, 30 * s); const b = Math.sin(t * 0.8) * 1.6 * s;
  trunk(c, 0, 0, h * s, 6 * s);
  if (kind === 'willow') { c.strokeStyle = cols[1]; c.lineWidth = 3 * s; c.lineCap = 'round'; canopy(c, b, -h * s, 26 * s, cols, 7, 5); for (let k = -5; k <= 5; k++) { c.beginPath(); c.moveTo(b + k * 4.5 * s, -h * s); c.quadraticCurveTo(b + k * 6 * s + Math.sin(t + k) * 3 * s, -h * 0.6 * s, b + k * 5.5 * s + Math.sin(t * 1.2 + k) * 4 * s, -h * 0.25 * s); c.stroke(); } return; }
  canopy(c, b, -h * s, 28 * s, cols, 8, 2);
  if (fruit) for (let k = 0; k < 8; k++) dot(c, b + Math.cos(k * 2.3) * 19 * s, -h * s + Math.sin(k * 2.3) * 13 * s, (kind === 'blossom' ? 3.2 : 3.6) * s, fruit);
};
const MOONTREE = (c, s, t) => { glow(c, 0, -60 * s, 70 * s, 'rgba(190,170,255,.45)'); TREE(['#6f5bd6', '#8a78f0', '#5546b8'], '#fff6c8', 62)(c, s, t); for (let k = 0; k < 6; k++) glow(c, Math.cos(t * 0.6 + k) * 34 * s, -62 * s + Math.sin(t * 0.8 + k * 2) * 24 * s, 6 * s, 'rgba(255,250,200,.9)'); };
function STRUCT(fn) { return fn; }
const BIRDBATH = STRUCT((c, s, t) => { shadow(c, 0, 0, 18 * s); c.fillStyle = '#d9d2c3'; c.fillRect(-4 * s, -26 * s, 8 * s, 26 * s); c.fillRect(-10 * s, -4 * s, 20 * s, 4 * s); c.beginPath(); c.ellipse(0, -28 * s, 20 * s, 6 * s, 0, 0, TAU); c.fill(); c.fillStyle = '#7fd0ff'; c.beginPath(); c.ellipse(0, -29 * s, 16 * s, 4 * s, 0, 0, TAU); c.fill(); const hop = Math.abs(Math.sin(t * 3)) * 3 * s; dot(c, 10 * s, -35 * s - hop, 4 * s, '#4c7bd8'); dot(c, 13 * s, -37 * s - hop, 2.5 * s, '#4c7bd8'); c.fillStyle = '#ffb02e'; c.beginPath(); c.moveTo(15 * s, -37 * s - hop); c.lineTo(18 * s, -36 * s - hop); c.lineTo(15 * s, -35.5 * s - hop); c.fill(); });
const FOUNTAIN = STRUCT((c, s, t) => { shadow(c, 0, 0, 30 * s); c.fillStyle = '#cfc6b4'; c.beginPath(); c.ellipse(0, -6 * s, 28 * s, 9 * s, 0, 0, TAU); c.fill(); c.fillStyle = '#6cc8f0'; c.beginPath(); c.ellipse(0, -8 * s, 24 * s, 6 * s, 0, 0, TAU); c.fill(); c.fillStyle = '#d9d2c3'; c.fillRect(-3 * s, -36 * s, 6 * s, 28 * s); c.beginPath(); c.ellipse(0, -36 * s, 12 * s, 4 * s, 0, 0, TAU); c.fill(); for (let k = 0; k < 10; k++) { const ph = (t * 0.9 + k / 10) % 1; const a = (k / 10) * TAU; dot(c, Math.cos(a) * ph * 14 * s, -42 * s + ph * 30 * s - Math.sin(ph * Math.PI) * 10 * s, 1.6 * s, 'rgba(190,235,255,.9)'); } });
const BRIDGE = STRUCT((c, s, t) => { c.fillStyle = '#6cc8f0'; c.beginPath(); c.ellipse(0, 0, 40 * s, 8 * s, 0, 0, TAU); c.fill(); c.strokeStyle = '#9a6535'; c.lineWidth = 6 * s; c.beginPath(); c.arc(0, 14 * s, 36 * s, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); c.lineWidth = 2.5 * s; c.beginPath(); c.arc(0, 4 * s, 36 * s, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); for (let k = -3; k <= 3; k++) { const a = Math.PI * 1.5 + k * 0.1; c.beginPath(); c.moveTo(Math.cos(a) * 36 * s, 14 * s + Math.sin(a) * 36 * s); c.lineTo(Math.cos(a) * 36 * s, 4 * s + Math.sin(a) * 36 * s); c.stroke(); } });
const PAVILION = STRUCT((c, s, t) => { shadow(c, 0, 0, 36 * s); c.fillStyle = '#f3ead8'; for (const x of [-24, -8, 8, 24]) c.fillRect((x - 2) * s, -40 * s, 4 * s, 40 * s); c.fillStyle = '#c0503c'; c.beginPath(); c.moveTo(-36 * s, -40 * s); c.quadraticCurveTo(0, -78 * s, 36 * s, -40 * s); c.closePath(); c.fill(); c.fillStyle = '#e8d6b8'; c.fillRect(-30 * s, -6 * s, 60 * s, 6 * s); dot(c, 0, -66 * s, 3 * s, '#ffd24a'); });
const WINDMILL = STRUCT((c, s, t) => { shadow(c, 0, 0, 22 * s); c.fillStyle = '#f0e4cc'; c.beginPath(); c.moveTo(-14 * s, 0); c.lineTo(-9 * s, -58 * s); c.lineTo(9 * s, -58 * s); c.lineTo(14 * s, 0); c.fill(); c.fillStyle = '#b5523b'; c.beginPath(); c.moveTo(-12 * s, -58 * s); c.lineTo(0, -72 * s); c.lineTo(12 * s, -58 * s); c.fill(); c.fillStyle = '#7a4a22'; c.fillRect(-4 * s, -14 * s, 8 * s, 14 * s); c.save(); c.translate(0, -56 * s); c.rotate(t * 0.9); c.fillStyle = '#fff8e8'; for (let k = 0; k < 4; k++) { c.rotate(TAU / 4); c.fillRect(2 * s, -3.5 * s, 30 * s, 7 * s); } c.restore(); dot(c, 0, -56 * s, 3 * s, '#5a3a1a'); });
const SCARECROW = STRUCT((c, s, t) => { shadow(c, 0, 0, 14 * s); c.strokeStyle = '#8a5a34'; c.lineWidth = 3.5 * s; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -54 * s); c.moveTo(-22 * s, -36 * s); c.lineTo(22 * s, -36 * s); c.stroke(); c.fillStyle = '#4f7fd0'; c.fillRect(-11 * s, -42 * s, 22 * s, 20 * s); dot(c, 0, -50 * s, 8 * s, '#f2d28c'); c.fillStyle = '#6b3d1a'; c.beginPath(); c.ellipse(0, -57 * s, 14 * s, 3 * s, 0, 0, TAU); c.fill(); c.fillRect(-7 * s, -66 * s, 14 * s, 9 * s); dot(c, -3 * s, -51 * s, 1.2 * s, '#333'); dot(c, 3 * s, -51 * s, 1.2 * s, '#333'); const fl = Math.sin(t * 2) * 2 * s; c.fillStyle = '#e8c860'; c.fillRect(-26 * s, -38 * s + fl, 5 * s, 6 * s); c.fillRect(21 * s, -38 * s - fl, 5 * s, 6 * s); });
const BEEHIVE = STRUCT((c, s, t) => { shadow(c, 0, 0, 18 * s); c.fillStyle = '#e8b33c'; for (let k = 0; k < 4; k++) { c.beginPath(); c.ellipse(0, -(6 + k * 9) * s, (16 - k * 3) * s, 6 * s, 0, 0, TAU); c.fill(); } c.fillStyle = '#5a3a12'; dot(c, 0, -10 * s, 3.5 * s, '#5a3a12'); for (let k = 0; k < 3; k++) { const a = t * 2 + k * 2.1; const bx = Math.cos(a) * 22 * s, by = -26 * s + Math.sin(a * 1.6) * 10 * s; dot(c, bx, by, 2.6 * s, '#ffcc00'); c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.ellipse(bx, by - 2.5 * s, 2 * s, 1.2 * s, 0, 0, TAU); c.fill(); } });
const LANTERN = STRUCT((c, s, t, night) => { shadow(c, 0, 0, 10 * s); c.fillStyle = '#5a5248'; c.fillRect(-2 * s, -46 * s, 4 * s, 46 * s); const f = 0.8 + Math.sin(t * 5) * 0.1; glow(c, 0, -52 * s, (night ? 40 : 18) * s * f, 'rgba(255,200,90,.7)'); c.fillStyle = '#ffd77a'; c.fillRect(-6 * s, -58 * s, 12 * s, 12 * s); c.fillStyle = '#3c362e'; c.fillRect(-8 * s, -61 * s, 16 * s, 3 * s); });
const ARCH = STRUCT((c, s, t) => { shadow(c, 0, 0, 30 * s); c.strokeStyle = '#7a5a3a'; c.lineWidth = 4 * s; c.beginPath(); c.moveTo(-24 * s, 0); c.lineTo(-24 * s, -40 * s); c.arc(0, -40 * s, 24 * s, Math.PI, 0); c.lineTo(24 * s, 0); c.stroke(); for (let k = 0; k <= 12; k++) { const a = Math.PI + (k / 12) * Math.PI; const x = Math.cos(a) * 24 * s, y = -40 * s + Math.sin(a) * 24 * s; dot(c, x, y, 4.5 * s, k % 2 ? '#3a9a46' : '#ff6f9a'); } for (let k = 0; k < 6; k++) { dot(c, -24 * s, -k * 7 * s, 3.5 * s, k % 2 ? '#3a9a46' : '#ffd1e0'); dot(c, 24 * s, -k * 7 * s, 3.5 * s, k % 2 ? '#ffd1e0' : '#3a9a46'); } });
const OWL = STRUCT((c, s, t) => { TREE(['#33584a', '#2b4c40', '#3f6a58'], null, 40)(c, s * 0.8, t); const blink = (t % 4) < 0.15; c.fillStyle = '#9a7a5a'; c.beginPath(); c.ellipse(10 * s, -40 * s, 9 * s, 11 * s, 0, 0, TAU); c.fill(); dot(c, 6.5 * s, -43 * s, 3.4 * s, '#fff'); dot(c, 13.5 * s, -43 * s, 3.4 * s, '#fff'); if (!blink) { dot(c, 6.5 * s, -43 * s, 1.7 * s, '#222'); dot(c, 13.5 * s, -43 * s, 1.7 * s, '#222'); } c.fillStyle = '#e8a030'; c.beginPath(); c.moveTo(9 * s, -40 * s); c.lineTo(11 * s, -40 * s); c.lineTo(10 * s, -37 * s); c.fill(); });
const FROG = STRUCT((c, s, t) => { c.fillStyle = '#4fae5a'; c.beginPath(); c.ellipse(0, 0, 22 * s, 8 * s, 0, 0.3, TAU - 0.3); c.lineTo(0, 0); c.fill(); const j = Math.max(0, Math.sin(t * 1.5)) * 4 * s; c.fillStyle = '#6ccf5a'; c.beginPath(); c.ellipse(0, -7 * s - j, 9 * s, 6 * s, 0, 0, TAU); c.fill(); dot(c, -4 * s, -12 * s - j, 3 * s, '#6ccf5a'); dot(c, 4 * s, -12 * s - j, 3 * s, '#6ccf5a'); dot(c, -4 * s, -12.5 * s - j, 1.4 * s, '#222'); dot(c, 4 * s, -12.5 * s - j, 1.4 * s, '#222'); });
const HERON = STRUCT((c, s, t) => { shadow(c, 0, 0, 12 * s); c.strokeStyle = '#d7a050'; c.lineWidth = 1.6 * s; c.beginPath(); c.moveTo(-3 * s, 0); c.lineTo(-2 * s, -22 * s); c.moveTo(3 * s, 0); c.lineTo(2 * s, -22 * s); c.stroke(); c.fillStyle = '#eef2f6'; c.beginPath(); c.ellipse(0, -28 * s, 10 * s, 7 * s, -0.3, 0, TAU); c.fill(); c.strokeStyle = '#eef2f6'; c.lineWidth = 3 * s; const bob = Math.sin(t * 0.9) * 3 * s; c.beginPath(); c.moveTo(6 * s, -32 * s); c.quadraticCurveTo(14 * s, -40 * s, 8 * s, -50 * s + bob); c.stroke(); dot(c, 8 * s, -51 * s + bob, 3.4 * s, '#eef2f6'); c.fillStyle = '#e8a030'; c.beginPath(); c.moveTo(10 * s, -52 * s + bob); c.lineTo(20 * s, -50 * s + bob); c.lineTo(10 * s, -49.5 * s + bob); c.fill(); });
const DRAGONFLY = STRUCT((c, s, t) => { FLOWER('#9fd8ff', '#ffffff', 5, 'spike')(c, s * 0.7, t); const x = Math.cos(t * 1.4) * 18 * s, y = -46 * s + Math.sin(t * 2.2) * 8 * s; c.fillStyle = 'rgba(200,240,255,.7)'; const f = Math.abs(Math.sin(t * 30)); c.beginPath(); c.ellipse(x - 5 * s, y - 2 * s, 7 * s, (1.5 + f * 2) * s, 0.3, 0, TAU); c.ellipse(x + 5 * s, y - 2 * s, 7 * s, (1.5 + f * 2) * s, -0.3, 0, TAU); c.fill(); c.strokeStyle = '#2a8ad0'; c.lineWidth = 2 * s; c.beginPath(); c.moveTo(x, y - 4 * s); c.lineTo(x, y + 10 * s); c.stroke(); });
const LILY = (petal) => (c, s, t) => { c.fillStyle = '#3d9a5a'; c.beginPath(); c.ellipse(0, 0, 22 * s, 8 * s, 0, 0.25, TAU - 0.25); c.lineTo(0, 0); c.fill(); c.fillStyle = 'rgba(255,255,255,.15)'; c.beginPath(); c.ellipse(-6 * s, -2 * s, 8 * s, 2.5 * s, 0, 0, TAU); c.fill(); const b = Math.sin(t) * 0.05; c.save(); c.translate(4 * s, -6 * s); c.scale(1, 0.6); petals(c, 0, 0, 8, 12 * s, 4 * s, petal, b, '#fff'); c.restore(); dot(c, 4 * s, -7 * s, 3 * s, '#ffd24a'); };
const REEDS = (c, s, t) => { for (let k = -3; k <= 3; k++) { const h = (36 + hash(k) * 22) * s, sw = Math.sin(t * 1.2 + k) * 4 * s; stem(c, k * 4 * s, 0, h, sw, '#4f8f3a', 2.2 * s); c.fillStyle = '#8a5a2e'; c.beginPath(); c.ellipse(k * 4 * s + sw, -h, 2.4 * s, 6 * s, sw * 0.02, 0, TAU); c.fill(); } };
const CRYSTAL = (c, s, t) => { glow(c, 0, -26 * s, 50 * s, 'rgba(200,160,255,.5)'); shadow(c, 0, 0, 20 * s); for (const [x, h, w, col] of [[-12, 30, 7, '#b38cff'], [0, 46, 9, '#d8c2ff'], [12, 34, 7, '#9a6cf0']]) { c.fillStyle = col; c.beginPath(); c.moveTo((x - w) * s, 0); c.lineTo((x - w * 0.8) * s, -h * 0.75 * s); c.lineTo(x * s, -h * s); c.lineTo((x + w * 0.8) * s, -h * 0.75 * s); c.lineTo((x + w) * s, 0); c.fill(); c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.moveTo(x * s, -h * s); c.lineTo((x - w * 0.8) * s, -h * 0.75 * s); c.lineTo((x - w * 0.3) * s, 0); c.lineTo(x * s, 0); c.fill(); } const tw = (Math.sin(t * 3) + 1) / 2; c.fillStyle = `rgba(255,255,255,${tw})`; dot(c, 2 * s, -40 * s, 2 * s, c.fillStyle); };
const STARGAZER = (c, s, t) => { shadow(c, 0, 0, 18 * s); c.strokeStyle = '#6a5a4a'; c.lineWidth = 2.4 * s; c.beginPath(); c.moveTo(-12 * s, 0); c.lineTo(0, -24 * s); c.lineTo(12 * s, 0); c.moveTo(0, -24 * s); c.lineTo(0, 0); c.stroke(); c.save(); c.translate(0, -26 * s); c.rotate(-0.7 + Math.sin(t * 0.3) * 0.1); c.fillStyle = '#c8a060'; c.fillRect(-18 * s, -4 * s, 36 * s, 8 * s); c.fillStyle = '#e8d098'; c.fillRect(14 * s, -5 * s, 6 * s, 10 * s); c.restore(); };
const PEACOCK = (c, s, t) => { shadow(c, 0, 0, 30 * s); const open = 0.85 + Math.sin(t * 0.7) * 0.15; for (let k = -6; k <= 6; k++) { const a = -Math.PI / 2 + k * 0.2 * open; const x = Math.cos(a) * 40 * s, y = -14 * s + Math.sin(a) * 40 * s; c.strokeStyle = '#2f8a6a'; c.lineWidth = 2 * s; c.beginPath(); c.moveTo(0, -14 * s); c.lineTo(x, y); c.stroke(); dot(c, x, y, 6 * s, '#2fb38a'); dot(c, x, y, 3.4 * s, '#2a5ad0'); dot(c, x, y, 1.6 * s, '#ffd24a'); } c.fillStyle = '#2a6ad8'; c.beginPath(); c.ellipse(0, -14 * s, 6 * s, 12 * s, 0, 0, TAU); c.fill(); dot(c, 0, -28 * s, 4 * s, '#2a6ad8'); };
const HEART = (c, s, t) => { shadow(c, 0, 0, 22 * s); trunk(c, 0, 0, 16 * s, 3 * s); c.save(); c.translate(0, -36 * s); const p = 1 + Math.sin(t * 1.6) * 0.03; c.scale(p, p); c.fillStyle = '#3a9a46'; c.beginPath(); c.moveTo(0, 18 * s); c.bezierCurveTo(-30 * s, -2 * s, -16 * s, -26 * s, 0, -10 * s); c.bezierCurveTo(16 * s, -26 * s, 30 * s, -2 * s, 0, 18 * s); c.fill(); for (let k = 0; k < 7; k++) dot(c, Math.cos(k * 2) * 10 * s, Math.sin(k * 2) * 7 * s - 2 * s, 2.6 * s, '#ff8fb0'); c.restore(); };
const STRAW = (c, s, t) => { BUSH(['#3a9a46', '#2f8a3c'], null)(c, s * 0.8, t); for (let k = 0; k < 5; k++) { const x = (k - 2) * 8 * s, y = -6 * s - (k % 2) * 6 * s; c.fillStyle = '#ff3d5a'; c.beginPath(); c.moveTo(x - 4 * s, y - 3 * s); c.quadraticCurveTo(x, y + 8 * s, x + 4 * s, y - 3 * s); c.closePath(); c.fill(); c.fillStyle = '#3a9a46'; c.fillRect(x - 3 * s, y - 5 * s, 6 * s, 2 * s); } };
const PUMPKIN = (c, s, t) => { shadow(c, 0, 0, 24 * s); for (const [x, w] of [[-10, 11], [10, 11], [0, 13]]) { c.fillStyle = x ? '#e8741f' : '#ff8c2e'; c.beginPath(); c.ellipse(x * s, -12 * s, w * s, 12 * s, 0, 0, TAU); c.fill(); } c.fillStyle = '#5a7a2a'; c.fillRect(-2 * s, -28 * s, 4 * s, 6 * s); leaf(c, 2 * s, -26 * s, 12 * s, -0.4, '#5cae3a'); };
const MOONFLOWER = (c, s, t) => { glow(c, 0, -36 * s, 40 * s, 'rgba(230,230,255,.55)'); FLOWER('#f4f2ff', '#d8ccff', 5)(c, s, t); };

export const PLANTS = {
  tulip: FLOWER('#ff4f6e', '#ffd24a', 6, 'tulip'), tulip2: FLOWER('#ffb02e', '#ffd24a', 6, 'tulip'), daisy: FLOWER('#ffffff', '#ffc928', 9), daisy2: FLOWER('#ff9fd0', '#ffe066', 8),
  sunflower: SUN, sunflower2: SUN, bush: BUSH(['#3aa047', '#2f8a3c', '#48b552'], '#ff6f9a', 2.6), lavender: FLOWER('#9a6cf0', '#c7a6ff', 6, 'spike'), rose: ROSE,
  birdbath: BIRDBATH, oak: TREE(['#3c9a3c', '#2f8a34', '#4fb04a'], null, 58), apple: TREE(['#3c9a3c', '#2f8a34', '#4fb04a'], '#e8344a'), strawberry: STRAW,
  pear: TREE(['#5aa83a', '#4a983a', '#6cba44'], '#d8e04a'), pumpkin: PUMPKIN, cherry: TREE(['#ffb7d0', '#ff9fc0', '#ffd0e0'], '#ffffff', 52, 'blossom'),
  beehive: BEEHIVE, scarecrow: SCARECROW, plum: TREE(['#3c8a4a', '#2f7a3c', '#4a9a52'], '#7a3ac0'), windmill: WINDMILL,
  lily: LILY('#ffd0e8'), reeds: REEDS, frog: FROG, lily2: LILY('#ffffff'), bridge: BRIDGE, heron: HERON, fountain: FOUNTAIN, lotus: LILY('#ff8fc8'), dragonfly: DRAGONFLY, pavilion: PAVILION,
  moonflower: MOONFLOWER, lantern: LANTERN, willow: TREE(['#4a8a6a', '#5aa07a', '#3a7a5a'], null, 56, 'willow'), owl: OWL, crystal: CRYSTAL, stargazer: STARGAZER, arch: ARCH,
  peacock: PEACOCK, heart: HEART, moontree: MOONTREE,
};
// Draw plant at (x,y) ground point. g<=0: a dirt mound with a dotted sprout outline (what you'll grow).
export function drawPlant(c, name, x, y, s, g, t, night = false) {
  c.save(); c.translate(x, y);
  if (g <= 0) {
    shadow(c, 0, 0, 14 * s, 4 * s, 0.25); c.fillStyle = '#8a6040'; c.beginPath(); c.ellipse(0, -1 * s, 12 * s, 5 * s, 0, Math.PI, TAU); c.fill();
    c.setLineDash([3 * s, 3 * s]); c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1.6 * s; c.beginPath(); c.moveTo(0, -4 * s); c.lineTo(0, -16 * s); c.stroke(); c.beginPath(); c.ellipse(5 * s, -16 * s, 5 * s, 2.5 * s, -0.5, 0, TAU); c.stroke(); c.setLineDash([]);
  } else {
    const k = easeBack(Math.min(1, g)); c.scale(Math.max(0.01, k), Math.max(0.01, k));
    (PLANTS[name] || PLANTS.daisy)(c, s, t, night);
  }
  c.restore();
}

// ---------------------------------------------------------------- zone palettes (theme-aware)
export const THEMES = {
  spring: (z) => ZONES[z],
  autumn: (z) => ({ ...ZONES[z], sky: z === 3 ? ['#2b2148', '#8a4a6a'] : ['#ffcf9a', '#ffeedb'], ground: ['#c9a24a', '#d08a3a', '#9aa84a', '#4a5a3a'][z] }),
  moonlight: (z) => ({ ...ZONES[z], sky: ['#1a1d46', '#4a3a7a'], ground: ['#2f5a4a', '#3a5a3a', '#2a5a5a', '#2a4a4a'][z] }),
  candy: (z) => ({ ...ZONES[z], sky: ['#ffd6f0', '#e6f0ff'], ground: ['#ffb3d9', '#c9b3ff', '#a6e8ff', '#c2a6ff'][z] }),
};
export const zoneOf = (level) => Math.min(3, Math.floor((level - 1) / 10));
export const isNight = (theme, z) => theme === 'moonlight' || z === 3;

// Play-screen backdrop: sky, sun/moon, two hill layers, a hedge row of the plants you've grown. Cached; clouds/fireflies live.
export function paintBackdrop(cv, W, H, dpr, pal, night, grown) {
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sk = c.createLinearGradient(0, 0, 0, H); sk.addColorStop(0, pal.sky[0]); sk.addColorStop(0.75, pal.sky[1]); sk.addColorStop(1, pal.sky[1]);
  c.fillStyle = sk; c.fillRect(0, 0, W, H);
  if (night) { for (let k = 0; k < 120; k++) { const x = hash(k) * W, y = hash(k + 50) * H * 0.6; dot(c, x, y, hash(k + 9) * 1.4 + 0.3, `rgba(255,255,255,${0.3 + hash(k + 3) * 0.6})`); } glow(c, W * 0.8, H * 0.13, 90, 'rgba(230,230,255,.35)'); dot(c, W * 0.8, H * 0.13, 26, '#f4f0ff'); dot(c, W * 0.8 + 9, H * 0.13 - 6, 22, pal.sky[0]); }
  else { glow(c, W * 0.82, H * 0.12, 140, 'rgba(255,240,180,.75)'); dot(c, W * 0.82, H * 0.12, 30, '#fff6cf'); }
  const hill = (base, amp, col, ph) => { c.fillStyle = col; c.beginPath(); c.moveTo(0, H); for (let x = 0; x <= W + 20; x += 20) c.lineTo(x, base + Math.sin(x * 0.006 + ph) * amp + Math.sin(x * 0.017 + ph * 2) * amp * 0.35); c.lineTo(W, H); c.fill(); };
  const g = Array.isArray(pal.ground) ? pal.ground : pal.ground;
  hill(H * 0.62, 26, shade(g, night ? -0.35 : 0.18, 0.5), 1);
  hill(H * 0.74, 20, shade(g, night ? -0.2 : 0, 0.8), 2.4);
  hill(H * 0.86, 14, shade(g, night ? -0.1 : -0.08, 1), 4.1);
  // grown plants along the front hedge
  const n = grown.length; for (let k = 0; k < n; k++) { const x = ((k * 0.618) % 1) * W, y = H * 0.9 + hash(k) * H * 0.08; drawPlant(c, grown[k], x, y, 0.8 + hash(k + 2) * 0.4, 1, k, night); }
  // grass tufts
  for (let k = 0; k < 70; k++) { const x = hash(k + 300) * W, y = H * 0.8 + hash(k + 700) * H * 0.2; c.strokeStyle = shade(g, -0.2, 1); c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 3, y - 8); c.moveTo(x, y); c.lineTo(x + 2, y - 10); c.stroke(); }
}
export function shade(hex, t, alpha = 1) { const n = parseInt(hex.slice(1), 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; if (t >= 0) { r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t; } else { r *= 1 + t; g *= 1 + t; b *= 1 + t; } return alpha >= 1 ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${alpha})`; }

// ---------------------------------------------------------------- garden map
export const STEP = 118;
export function mapLayout(W, count) {
  const H = count * STEP + 420, amp = Math.min(W * 0.24, 150), cx = W / 2; const nodes = [];
  for (let k = 1; k <= count; k++) { const y = H - 190 - (k - 1) * STEP, x = cx + Math.sin(k * 0.82) * amp; const side = x > cx ? -1 : 1; nodes.push({ k, x, y, px: Math.max(36, Math.min(W - 36, x + side * Math.min(W * 0.27, 140))), py: y + 26 }); }
  return { H, nodes };
}
// decorative scatter for the map (deterministic)
export function mapDecor(W, H) { const d = []; for (let k = 0; k < Math.floor(H / 34); k++) d.push({ x: hash(k * 3 + 1) * W, y: hash(k * 7 + 2) * H, kind: hash(k + 11) < 0.55 ? 'tuft' : 'bloom', col: ['#ffffff', '#ffd24a', '#ff8fb0', '#b38cff', '#7fd0ff'][k % 5], s: 0.6 + hash(k + 5) * 0.6 }); return d; }
export function drawMapDecor(c, it, night, t) {
  if (it.kind === 'tuft') { c.strokeStyle = night ? 'rgba(120,200,160,.5)' : 'rgba(40,110,40,.45)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(it.x, it.y); c.lineTo(it.x - 4 * it.s, it.y - 9 * it.s); c.moveTo(it.x, it.y); c.lineTo(it.x + 1, it.y - 12 * it.s); c.moveTo(it.x, it.y); c.lineTo(it.x + 5 * it.s, it.y - 8 * it.s); c.stroke(); }
  else { petals(c, it.x, it.y, 5, 6 * it.s, 2.2 * it.s, it.col, it.x); dot(c, it.x, it.y, 1.8 * it.s, '#ffcf3a'); if (night) glow(c, it.x, it.y, 10 * it.s, 'rgba(255,255,255,.25)'); }
}
