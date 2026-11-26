// Solitaire Suite — procedural card art (Canvas 2D). Large-index faces readable at phone sizes, vector suits (no font
// glyph dependence), original court-card designs, themed backs. Cached per size/DPR; optional four-colour deck.
import { suit, rank, RANKS } from './rules.js';
const TAU = Math.PI * 2;
export function suitPath(ctx, s, x, y, size) {
  const r = size / 2; ctx.beginPath();
  if (s === 1) { // heart
    ctx.moveTo(x, y + r * 0.9); ctx.bezierCurveTo(x - r * 1.25, y - r * 0.05, x - r * 0.6, y - r * 1.05, x, y - r * 0.38); ctx.bezierCurveTo(x + r * 0.6, y - r * 1.05, x + r * 1.25, y - r * 0.05, x, y + r * 0.9);
  } else if (s === 2) { ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x + r * 0.35, y - r * 0.35, x + r * 0.78, y); ctx.quadraticCurveTo(x + r * 0.35, y + r * 0.35, x, y + r); ctx.quadraticCurveTo(x - r * 0.35, y + r * 0.35, x - r * 0.78, y); ctx.quadraticCurveTo(x - r * 0.35, y - r * 0.35, x, y - r); }
  else if (s === 0) { // spade
    ctx.moveTo(x, y - r * 0.95); ctx.bezierCurveTo(x + r * 1.25, y + r * 0.0, x + r * 0.62, y + r * 0.85, x + r * 0.08, y + r * 0.38); ctx.quadraticCurveTo(x + r * 0.2, y + r * 0.8, x + r * 0.42, y + r * 0.98); ctx.lineTo(x - r * 0.42, y + r * 0.98); ctx.quadraticCurveTo(x - r * 0.2, y + r * 0.8, x - r * 0.08, y + r * 0.38); ctx.bezierCurveTo(x - r * 0.62, y + r * 0.85, x - r * 1.25, y + r * 0.0, x, y - r * 0.95);
  } else { // club
    const k = r * 0.42; ctx.arc(x, y - r * 0.45, k, 0, TAU); ctx.moveTo(x - r * 0.45 + k, y + r * 0.12); ctx.arc(x - r * 0.45, y + r * 0.12, k, 0, TAU); ctx.moveTo(x + r * 0.45 + k, y + r * 0.12); ctx.arc(x + r * 0.45, y + r * 0.12, k, 0, TAU);
    ctx.moveTo(x - r * 0.1, y); ctx.quadraticCurveTo(x - r * 0.12, y + r * 0.75, x - r * 0.42, y + r * 0.98); ctx.lineTo(x + r * 0.42, y + r * 0.98); ctx.quadraticCurveTo(x + r * 0.12, y + r * 0.75, x + r * 0.1, y);
  }
  ctx.closePath();
}
export function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
export const suitColor = (s, four) => (four ? ['#1b2130', '#d21f3c', '#1f6fd6', '#178a4a'][s] : s === 1 || s === 2 ? '#d21f3c' : '#1b2130');

function face(ctx, c, W, H, four) {
  const s = suit(c), r = rank(c), col = suitColor(s, four), R = W * 0.085;
  const g = ctx.createLinearGradient(0, 0, W * 0.3, H); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#f1ede3');
  rrect(ctx, 0.5, 0.5, W - 1, H - 1, R); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(60,50,30,.28)'; ctx.stroke();
  // large index: rank top-left, suit top-right — the strip that shows when cards overlap
  const fs = W * 0.36; ctx.fillStyle = col; ctx.font = `800 ${fs}px Inter, "Segoe UI", system-ui, sans-serif`; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  const txt = RANKS[r]; if (txt === '10') { ctx.save(); ctx.scale(0.82, 1); ctx.fillText(txt, (W * 0.06) / 0.82, H * 0.035); ctx.restore(); } else ctx.fillText(txt, W * 0.08, H * 0.035);
  suitPath(ctx, s, W * 0.76, H * 0.12, W * 0.3); ctx.fill();
  // body
  const cx = W / 2, cy = H * 0.6;
  if (r === 1) { suitPath(ctx, s, cx, cy, W * 0.6); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(cx - W * 0.09, cy - W * 0.12, W * 0.07, W * 0.04, -0.6, 0, TAU); ctx.fill(); }
  else if (r <= 10) {
    const pips = PIPS[r]; const pw = W * 0.58, ph = H * 0.5, x0 = cx - pw / 2, y0 = H * 0.36, ps = W * (r > 8 ? 0.17 : 0.2);
    for (const [px, py] of pips) { ctx.save(); const X = x0 + px * pw, Y = y0 + py * ph; if (py > 0.55) { ctx.translate(X, Y); ctx.rotate(Math.PI); ctx.translate(-X, -Y); } suitPath(ctx, s, X, Y, ps); ctx.fill(); ctx.restore(); }
  } else court(ctx, s, r, W, H, col);
}
const PIPS = { 2: [[0.5, 0], [0.5, 1]], 3: [[0.5, 0], [0.5, 0.5], [0.5, 1]], 4: [[0, 0], [1, 0], [0, 1], [1, 1]], 5: [[0, 0], [1, 0], [0.5, 0.5], [0, 1], [1, 1]], 6: [[0, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [1, 1]], 7: [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0, 1], [1, 1]], 8: [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0.5, 0.75], [0, 1], [1, 1]], 9: [[0, 0], [1, 0], [0, 0.33], [1, 0.33], [0.5, 0.5], [0, 0.67], [1, 0.67], [0, 1], [1, 1]], 10: [[0, 0], [1, 0], [0.5, 0.17], [0, 0.33], [1, 0.33], [0, 0.67], [1, 0.67], [0.5, 0.83], [0, 1], [1, 1]] };
// Original court design: framed panel, crowned bust built from simple shapes, suit emblem on the chest.
function court(ctx, s, r, W, H, col) {
  const x = W * 0.14, y = H * 0.3, w = W * 0.72, h = H * 0.62;
  const tint = { 0: ['#e8ecf6', '#9aa8c8'], 1: ['#fbe4e8', '#e08a9a'], 2: ['#fbe9dc', '#e2a070'], 3: ['#e3f1e6', '#86b894'] }[s];
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, tint[0]); g.addColorStop(1, tint[1]); rrect(ctx, x, y, w, h, W * 0.05); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, W * 0.02); ctx.stroke();
  const cx = W / 2, hy = y + h * 0.36, hr = w * 0.17;
  // robe
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(cx - w * 0.36, y + h); ctx.quadraticCurveTo(cx - w * 0.3, hy + hr * 1.3, cx, hy + hr * 1.1); ctx.quadraticCurveTo(cx + w * 0.3, hy + hr * 1.3, cx + w * 0.36, y + h); ctx.fill();
  ctx.fillStyle = '#f6d38a'; ctx.fillRect(cx - w * 0.04, hy + hr * 1.1, w * 0.08, h - (hy + hr * 1.1 - y));
  // head
  ctx.fillStyle = '#f3d2b4'; ctx.beginPath(); ctx.arc(cx, hy, hr, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(80,50,30,.4)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#3a2a1e'; ctx.beginPath(); ctx.arc(cx - hr * 0.35, hy - hr * 0.05, hr * 0.09, 0, TAU); ctx.arc(cx + hr * 0.35, hy - hr * 0.05, hr * 0.09, 0, TAU); ctx.fill();
  if (r === 13) { ctx.fillStyle = '#8a6a4a'; ctx.beginPath(); ctx.moveTo(cx - hr * 0.7, hy + hr * 0.35); ctx.quadraticCurveTo(cx, hy + hr * 1.5, cx + hr * 0.7, hy + hr * 0.35); ctx.quadraticCurveTo(cx, hy + hr * 0.75, cx - hr * 0.7, hy + hr * 0.35); ctx.fill(); }
  if (r === 12) { ctx.fillStyle = '#6a3a2a'; ctx.beginPath(); ctx.arc(cx, hy - hr * 0.2, hr * 1.12, Math.PI * 1.05, Math.PI * 1.95); ctx.lineTo(cx + hr * 1.15, hy + hr * 0.9); ctx.lineTo(cx + hr * 0.85, hy + hr * 0.9); ctx.lineTo(cx + hr * 0.95, hy); ctx.arc(cx, hy - hr * 0.2, hr * 0.92, Math.PI * 1.95, Math.PI * 1.05, true); ctx.lineTo(cx - hr * 0.85, hy + hr * 0.9); ctx.lineTo(cx - hr * 1.15, hy + hr * 0.9); ctx.fill(); }
  // crown (K: tall 5 points, Q: 3 points + jewels, J: cap with feather)
  ctx.fillStyle = '#f2b632'; ctx.strokeStyle = '#a0701a';
  if (r === 11) { ctx.beginPath(); ctx.ellipse(cx, hy - hr * 0.8, hr * 1.05, hr * 0.42, 0, Math.PI, TAU); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, W * 0.025); ctx.beginPath(); ctx.moveTo(cx + hr * 0.6, hy - hr * 1.0); ctx.quadraticCurveTo(cx + hr * 1.6, hy - hr * 2.0, cx + hr * 1.1, hy - hr * 2.4); ctx.stroke(); }
  else { const pts = r === 13 ? 5 : 3, bw = hr * 1.9, bh = hr * (r === 13 ? 1.0 : 0.75), bx = cx - bw / 2, by = hy - hr * 0.75; ctx.beginPath(); ctx.moveTo(bx, by); for (let k = 0; k <= pts * 2; k++) { const px = bx + (k / (pts * 2)) * bw, py = k % 2 ? by - bh * 0.45 : by - bh; ctx.lineTo(px, k === 0 || k === pts * 2 ? by : py); } ctx.lineTo(bx + bw, by); ctx.closePath(); ctx.fill(); ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = col; for (let k = 0; k < pts; k++) { ctx.beginPath(); ctx.arc(bx + ((k + 0.5) / pts) * bw, by - bh * 0.2, hr * 0.1, 0, TAU); ctx.fill(); } }
  ctx.fillStyle = '#fff'; suitPath(ctx, s, cx, hy + hr * 2.05, hr * 0.95); ctx.fill(); ctx.fillStyle = col; suitPath(ctx, s, cx, hy + hr * 2.05, hr * 0.7); ctx.fill();
}
export function back(ctx, W, H, col, col2) {
  const R = W * 0.085; rrect(ctx, 0.5, 0.5, W - 1, H - 1, R); ctx.fillStyle = '#fbf7ee'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1; ctx.stroke();
  const m = W * 0.07; rrect(ctx, m, m, W - 2 * m, H - 2 * m, R * 0.7); const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, col); g.addColorStop(1, col2); ctx.fillStyle = g; ctx.fill();
  ctx.save(); rrect(ctx, m, m, W - 2 * m, H - 2 * m, R * 0.7); ctx.clip(); ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = Math.max(1, W * 0.018); const step = W * 0.16;
  for (let k = -H; k < W + H; k += step) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k + H, H); ctx.stroke(); ctx.beginPath(); ctx.moveTo(k + H, 0); ctx.lineTo(k, H); ctx.stroke(); }
  ctx.restore();
  // emblem: a faceted prism star
  const cx = W / 2, cy = H / 2, r = W * 0.2; ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU - Math.PI / 2, rr = k % 2 ? r * 0.42 : r; ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } ctx.closePath(); ctx.fill();
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, r * 0.22, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = Math.max(1, W * 0.02); rrect(ctx, m * 1.8, m * 1.8, W - 3.6 * m, H - 3.6 * m, R * 0.5); ctx.stroke();
}
export function buildCards(cw, ch, dpr, { four = false, backA = '#2a5fd0', backB = '#173a8a' } = {}) {
  const W = Math.round(cw * dpr), H = Math.round(ch * dpr); const faces = new Map();
  const mk = (fn) => { const c = document.createElement('canvas'); c.width = W; c.height = H; fn(c.getContext('2d')); return c; };
  for (let c = 0; c < 52; c++) faces.set(c, mk((x) => face(x, c, W, H, four)));
  const b = mk((x) => back(x, W, H, backA, backB));
  // soft shadow sprite
  const pad = Math.round(14 * dpr), sh = document.createElement('canvas'); sh.width = W + pad * 2; sh.height = H + pad * 2; const sx = sh.getContext('2d'); sx.shadowColor = 'rgba(0,0,0,.55)'; sx.shadowBlur = 10 * dpr; sx.shadowOffsetY = 3 * dpr; sx.fillStyle = '#000'; rrect(sx, pad, pad, W, H, W * 0.085); sx.fill();
  sx.globalCompositeOperation = 'destination-out'; rrect(sx, pad + 1, pad + 1, W - 2, H - 2, W * 0.085); sx.fill();
  return { faces, back: b, shadow: sh, pad: pad / dpr };
}
export { suit, rank };
