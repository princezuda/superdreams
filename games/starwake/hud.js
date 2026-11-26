// Starwake — HUD overlay (2D canvas: reticle, brackets, lead pip, nav markers, gauges) + three MFD canvases used as cockpit textures.
import { THREE, settings } from '/shared/sd-kit.js';
import { FACTIONS, COMM } from './data.js';
import * as S from './sim.js';
import { relation, leadPoint, CRUISE_SPEED } from './world.js';

const V3 = THREE.Vector3;
const _v = new V3(), _w = new V3(), _lead = new V3();
const COL = { hostile: '#ff5a5a', ally: '#6dff9a', neutral: '#ffd35a', nav: '#7ad8ff', story: '#6ff7e8' };
const CB = { hostile: '#ff9a1a', ally: '#4ab0ff', neutral: '#f0f0f0', nav: '#b0e0ff', story: '#e0a0ff' }; // colourblind-safe set
const col = (k) => (settings.colorblind ? CB : COL)[k];

// silhouettes for the target MFD (top-down, nose up, unit ~1)
const SIL = {
  magpie: [[0, -1], [0.22, -0.7], [0.22, -0.2], [0.5, -0.1], [0.62, 0.15], [0.42, 0.25], [0.32, 0.55], [0.15, 0.9], [-0.15, 0.9], [-0.32, 0.55], [-0.42, 0.25], [-0.62, 0.15], [-0.5, -0.1], [-0.22, -0.2], [-0.22, -0.7]],
  kite: [[0, -1], [0.1, -0.5], [0.15, -0.05], [0.8, -0.2], [0.82, 0.05], [0.14, 0.45], [0.16, 0.95], [-0.16, 0.95], [-0.14, 0.45], [-0.82, 0.05], [-0.8, -0.2], [-0.15, -0.05], [-0.1, -0.5]],
  ox: [[0, -1], [0.12, -0.9], [0.18, -0.75], [0.18, 0.62], [0.2, 0.95], [-0.2, 0.95], [-0.18, 0.62], [-0.18, -0.75], [-0.12, -0.9]],
  halberd: [[0, -0.9], [0.12, -0.4], [0.38, -0.25], [0.38, -0.9], [0.48, -0.9], [0.48, 0.95], [0.38, 0.95], [0.38, 0.3], [-0.38, 0.3], [-0.38, 0.95], [-0.48, 0.95], [-0.48, -0.9], [-0.38, -0.9], [-0.38, -0.25], [-0.12, -0.4]],
  jackal: [[0, -1], [0.12, -0.3], [0.7, 0.4], [0.5, 0.55], [0.12, 0.35], [0, 0.6], [-0.12, 0.35], [-0.5, 0.55], [-0.7, 0.4], [-0.12, -0.3]],
  marauder: [[0, -1], [0.35, -0.3], [0.55, 0.4], [0.4, 0.85], [-0.4, 0.85], [-0.55, 0.4], [-0.35, -0.3]],
  barge: [[0, -1], [0.15, -0.85], [0.2, -0.6], [0.2, 0.8], [0.25, 0.98], [-0.25, 0.98], [-0.2, 0.8], [-0.2, -0.6], [-0.15, -0.85]],
  shepherd: [[0, -1], [0.45, 0], [0, 0.6], [-0.45, 0]],
  capital: [[0, -1], [0.2, -0.3], [0.32, 0.2], [0.32, 0.95], [-0.32, 0.95], [-0.32, 0.2], [-0.2, -0.3]],
};

export function initHUD(G) {
  const c = document.createElement('canvas'); c.id = 'hud'; document.body.appendChild(c);
  const ctx = c.getContext('2d');
  const fit = () => { const d = Math.min(devicePixelRatio || 1, 2); c.width = innerWidth * d; c.height = innerHeight * d; c.style.width = innerWidth + 'px'; c.style.height = innerHeight + 'px'; ctx.setTransform(d, 0, 0, d, 0, 0); };
  addEventListener('resize', fit); fit();
  const mk = () => { const m = document.createElement('canvas'); m.width = 320; m.height = 240; m.className = 'mfd'; return m; };
  const mfd = { left: mk(), center: mk(), right: mk() };
  const tex = {};
  for (const k in mfd) { tex[k] = new THREE.CanvasTexture(mfd[k]); tex[k].colorSpace = THREE.SRGBColorSpace; tex[k].anisotropy = 4; }
  const dom = document.createElement('div'); dom.id = 'mfd-dom'; for (const k of ['left', 'center', 'right']) { mfd[k].dataset.k = k; dom.appendChild(mfd[k]); } document.body.appendChild(dom);
  G.hud = { c, ctx, mfd, tex, dom, t: 0, hitT: 0, hullT: 0, dirs: [], mfdT: 0, lockBeep: 0 };
  return G.hud;
}
export function hudHitMarker(G) { G.hud.hitT = 0.15; }
export function hudHitFrom(G, p) { G.hud.dirs.push({ p: p.clone(), t: 0.8 }); if (G.hud.dirs.length > 6) G.hud.dirs.shift(); }

function project(G, p, out) {
  _v.copy(p).applyMatrix4(G.camera.matrixWorldInverse);
  const behind = _v.z > 0;
  _w.copy(p).project(G.camera);
  out.x = (_w.x * 0.5 + 0.5) * innerWidth; out.y = (-_w.y * 0.5 + 0.5) * innerHeight; out.behind = behind; out.depth = -_v.z;
  if (behind) { out.x = innerWidth - out.x; out.y = innerHeight - out.y; }
  return out;
}
const fmtD = (d) => (d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m');
function edgeArrow(ctx, x, y, color, label) {
  const cx = innerWidth / 2, cy = innerHeight / 2; let dx = x - cx, dy = y - cy; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  const m = 46; const k = Math.min((cx - m) / Math.abs(dx || 1e-6), (cy - m) / Math.abs(dy || 1e-6));
  const ax = cx + dx * k, ay = cy + dy * k;
  ctx.save(); ctx.translate(ax, ay); ctx.rotate(Math.atan2(dy, dx)); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-6, -9); ctx.lineTo(-2, 0); ctx.lineTo(-6, 9); ctx.closePath(); ctx.fill(); ctx.restore();
  if (label) { ctx.fillStyle = color; ctx.font = '600 11px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center'; ctx.fillText(label, ax - dx * 30, ay - dy * 22 + 4); }
}
function brackets(ctx, x, y, r, color, lw = 2) {
  const k = Math.max(r * 0.45, 5); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(x + sx * r, y + sy * (r - k)); ctx.lineTo(x + sx * r, y + sy * r); ctx.lineTo(x + sx * (r - k), y + sy * r); }
  ctx.stroke();
}
const sp = { x: 0, y: 0 }, sp2 = { x: 0, y: 0 };
export function drawHUD(G, dt) {
  const H = G.hud, ctx = H.ctx, P = G.player; H.t += dt;
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  if (G.state !== 'flight' || !P.alive || G.seq) { H.dom.classList.add('hide'); return; }
  H.dom.classList.toggle('hide', G.view === 'cockpit');
  const W = innerWidth, Hh = innerHeight, cx = W / 2, cy = Hh / 2;
  const acc = G.cfg.colors.accent || '#ffb347';
  const small = W < 700;
  // contacts
  for (const s of G.ships) {
    if (!s.alive || s.isPlayer) continue;
    const d = s.pos.distanceTo(P.pos); if (d > 6000) continue;
    const rel = relation(G, s); const c = col(rel);
    project(G, s.pos, sp);
    if (s === P.target) continue;
    if (sp.behind || sp.x < 0 || sp.y < 0 || sp.x > W || sp.y > Hh) { if (rel === 'hostile' && d < 2500) { ctx.globalAlpha = 0.6; edgeArrow(ctx, sp.x, sp.y, c); ctx.globalAlpha = 1; } continue; }
    const r = Math.max(7, Math.min(60, s.radius / Math.max(sp.depth, 1) * G.camera.projectionMatrix.elements[5] * Hh / 2));
    ctx.globalAlpha = s.parent ? 0.55 : 0.75; brackets(ctx, sp.x, sp.y, r + 3, c, 1.4); ctx.globalAlpha = 1;
    if (s.parent && s.invuln) continue;
    if (d < 1500 || s.parent) { ctx.fillStyle = c; ctx.font = '10px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center'; ctx.globalAlpha = 0.7; ctx.fillText(s.parent ? s.name : fmtD(d), sp.x, sp.y + r + 14); ctx.globalAlpha = 1; }
  }
  // nav marker
  const nav = G.navs[G.navSel];
  if (nav) {
    const c = nav.kind === 'story' ? col('story') : col('nav'); const d = nav.pos.distanceTo(P.pos);
    project(G, nav.pos, sp);
    const label = `${nav.name} · ${fmtD(d)}`;
    if (sp.behind || sp.x < 20 || sp.y < 20 || sp.x > W - 20 || sp.y > Hh - 20) edgeArrow(ctx, sp.x, sp.y, c, small ? fmtD(d) : nav.name);
    else { ctx.strokeStyle = c; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(sp.x, sp.y - 10); ctx.lineTo(sp.x + 10, sp.y); ctx.lineTo(sp.x, sp.y + 10); ctx.lineTo(sp.x - 10, sp.y); ctx.closePath(); ctx.stroke(); ctx.fillStyle = c; ctx.font = '600 11px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center'; ctx.fillText(label, sp.x, sp.y - 16); }
  }
  // target
  const T = P.target;
  if (T && T.alive) {
    const rel = relation(G, T); const c = col(rel); const d = T.pos.distanceTo(P.pos);
    project(G, T.pos, sp);
    if (sp.behind || sp.x < 0 || sp.y < 0 || sp.x > W || sp.y > Hh) edgeArrow(ctx, sp.x, sp.y, c, `${T.name} ${fmtD(d)}`);
    else {
      const r = Math.max(14, Math.min(90, T.radius / Math.max(sp.depth, 1) * G.camera.projectionMatrix.elements[5] * Hh / 2)) + 6;
      brackets(ctx, sp.x, sp.y, r, c, 2.2);
      ctx.fillStyle = c; ctx.font = '600 12px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center'; ctx.fillText(`${T.name}`, sp.x, sp.y - r - 8); ctx.fillText(fmtD(d), sp.x, sp.y + r + 15);
      // hull/shield mini bars
      const bw = Math.max(36, r * 1.4); ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(sp.x - bw / 2, sp.y + r + 20, bw, 4); ctx.fillStyle = c; ctx.fillRect(sp.x - bw / 2, sp.y + r + 20, bw * T.hullFrac(), 4);
      if (T.shieldMax > 0) { ctx.fillStyle = '#7ad8ff'; ctx.fillRect(sp.x - bw / 2, sp.y + r + 26, bw * ((T.shF + T.shB) / (2 * T.shieldMax)), 3); }
      // lead pip
      if (rel === 'hostile' || T.aggro || rel === 'neutral') {
        leadPoint(_lead, P, T, P.st.gun.speed); project(G, _lead, sp2);
        if (!sp2.behind) {
          ctx.strokeStyle = c; ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(sp2.x, sp2.y); ctx.stroke(); ctx.globalAlpha = 1;
          const inRange = d < P.st.gun.range; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sp2.x, sp2.y, 9, 0, 7); ctx.stroke();
          if (inRange) { ctx.beginPath(); ctx.arc(sp2.x, sp2.y, 3, 0, 7); ctx.fillStyle = c; ctx.fill(); }
        }
      }
      // missile lock
      if (P.lock > 0 && P.missiles > 0) {
        const k = P.locked ? 1 : P.lock; const rr = r + 30 * (1 - k); ctx.save(); ctx.translate(sp.x, sp.y); ctx.rotate(H.t * (P.locked ? 0 : 3)); ctx.strokeStyle = P.locked ? '#ff3b3b' : '#ffd35a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, -rr); ctx.lineTo(rr, 0); ctx.lineTo(0, rr); ctx.lineTo(-rr, 0); ctx.closePath(); ctx.stroke(); ctx.restore();
        if (P.locked) { ctx.fillStyle = '#ff3b3b'; ctx.font = '700 12px ui-monospace,Menlo,monospace'; ctx.fillText('LOCKED', sp.x, sp.y + r + 40); }
      }
    }
  }
  // reticle
  ctx.strokeStyle = acc; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.9;
  ctx.beginPath(); ctx.arc(cx, cy, 14, 0, 7); ctx.moveTo(cx - 26, cy); ctx.lineTo(cx - 18, cy); ctx.moveTo(cx + 18, cy); ctx.lineTo(cx + 26, cy); ctx.moveTo(cx, cy + 18); ctx.lineTo(cx, cy + 26); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 1.6, 0, 7); ctx.fillStyle = acc; ctx.fill();
  // shield arcs (front = top, rear = bottom) + hull ring
  const sF = P.shF / P.shieldMax, sB = P.shB / P.shieldMax, hf = P.hullFrac();
  const sc = (f) => (f > 0.5 ? '#7ad8ff' : f > 0.2 ? '#ffd35a' : '#ff5a5a');
  ctx.lineWidth = 3; ctx.globalAlpha = 0.85;
  ctx.strokeStyle = 'rgba(120,160,200,.18)'; ctx.beginPath(); ctx.arc(cx, cy, 36, -Math.PI * 0.85, -Math.PI * 0.15); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, 36, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
  if (sF > 0) { ctx.strokeStyle = sc(sF); ctx.beginPath(); ctx.arc(cx, cy, 36, -Math.PI / 2 - Math.PI * 0.35 * sF, -Math.PI / 2 + Math.PI * 0.35 * sF); ctx.stroke(); }
  if (sB > 0) { ctx.strokeStyle = sc(sB); ctx.beginPath(); ctx.arc(cx, cy, 36, Math.PI / 2 - Math.PI * 0.35 * sB, Math.PI / 2 + Math.PI * 0.35 * sB); ctx.stroke(); }
  ctx.lineWidth = 2; ctx.strokeStyle = hf > 0.5 ? acc : hf > 0.25 ? '#ffd35a' : '#ff5a5a'; ctx.beginPath(); ctx.arc(cx, cy, 41, Math.PI * 0.9, Math.PI * 0.9 + Math.PI * 0.2 * hf * 1); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 41, Math.PI * 0.1, Math.PI * 0.1 - Math.PI * 0.2 * hf, true); ctx.stroke();
  ctx.globalAlpha = 1;
  // hit marker + damage direction
  if (H.hitT > 0) { H.hitT -= dt; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); for (const [a, b] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { ctx.moveTo(cx + a * 8, cy + b * 8); ctx.lineTo(cx + a * 15, cy + b * 15); } ctx.stroke(); }
  for (let i = H.dirs.length - 1; i >= 0; i--) {
    const h = H.dirs[i]; h.t -= dt; if (h.t <= 0) { H.dirs.splice(i, 1); continue; }
    _v.copy(h.p).applyMatrix4(G.camera.matrixWorldInverse); const a = Math.atan2(-_v.y, _v.x);
    ctx.strokeStyle = `rgba(255,70,60,${h.t})`; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy, 70, a - 0.35, a + 0.35); ctx.stroke();
  }
  // mouse steering cursor
  if (G.input.mouseSteer && G.input.hasMouse) {
    const mx = cx + G.input.mx * Math.min(W, Hh) * 0.45, my = cy + G.input.my * Math.min(W, Hh) * 0.45;
    ctx.globalAlpha = 0.55; ctx.strokeStyle = acc; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(mx, my); ctx.stroke(); ctx.beginPath(); ctx.arc(mx, my, 5, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
  }
  // speed tape (left) + boost/heat (right)
  const gx = cx - (small ? 92 : 150), gy = cy - 60, gh = 120;
  ctx.globalAlpha = 0.75; ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(gx, gy, 4, gh); ctx.fillStyle = acc; ctx.fillRect(gx, gy + gh * (1 - P.throttle), 4, gh * P.throttle);
  ctx.fillStyle = acc; for (let i = 0; i <= 4; i++) ctx.fillRect(gx - 4, gy + i * gh / 4, 3, 1); ctx.globalAlpha = 1;
  const spd = P.vel.length(); ctx.fillStyle = P.boosting ? '#7ad8ff' : acc; ctx.font = '700 15px ui-monospace,Menlo,monospace'; ctx.textAlign = 'right'; ctx.fillText(Math.round(spd), gx - 6, cy + 5); ctx.font = '10px ui-monospace,Menlo,monospace'; ctx.fillText('M/S', gx - 6, cy + 18);
  const bx = cx + (small ? 86 : 144);
  ctx.globalAlpha = 0.7; ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(bx, gy, 4, gh); ctx.fillRect(bx + 7, gy, 3, gh);
  ctx.fillStyle = '#7ad8ff'; ctx.fillRect(bx, gy + gh * (1 - P.fuel), 4, gh * P.fuel);
  ctx.fillStyle = P.overheat ? '#ff3b3b' : P.heat > 0.7 ? '#ff9a3a' : '#ffd35a'; ctx.fillRect(bx + 7, gy + gh * (1 - P.heat), 3, gh * P.heat); ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffd35a'; ctx.font = '700 11px ui-monospace,Menlo,monospace'; ctx.textAlign = 'left'; ctx.fillText(`E ${Math.round(P.energy)}`, bx + 18, cy - 4); ctx.fillText(`M ${P.missiles}`, bx + 18, cy + 10);
  // status lines
  ctx.textAlign = 'center';
  if (P.cruise > 0) { ctx.fillStyle = '#7ad8ff'; ctx.font = '700 14px ui-monospace,Menlo,monospace'; ctx.fillText(P.cruise >= 1 ? (G.auto ? `AUTOPILOT → ${G.auto.nav.name} ${fmtD(G.auto.nav.pos.distanceTo(P.pos))}` : 'CRUISE') : `SPOOLING ${Math.round(P.cruise * 100)}%`, cx, cy + 96); }
  if (G.jumpCharge != null) { ctx.fillStyle = '#6ff7e8'; ctx.font = '700 14px ui-monospace,Menlo,monospace'; ctx.fillText(`JUMP DRIVE CHARGING ${Math.round(G.jumpCharge * 100)}%`, cx, cy + 116); }
  const warnK = G.missiles.some((m) => m.target === P) ? 'MISSILE' : null;
  if (warnK && Math.sin(H.t * 14) > 0) { ctx.fillStyle = '#ff3b3b'; ctx.font = '800 18px ui-monospace,Menlo,monospace'; ctx.fillText('◆ MISSILE ◆', cx, cy - 92); }
  if (hf < 0.25 && Math.sin(H.t * 8) > 0) { ctx.fillStyle = '#ff5a5a'; ctx.font = '800 13px ui-monospace,Menlo,monospace'; ctx.fillText('HULL CRITICAL', cx, cy + 62); }
  if (G.warnMsg && G.warnMsg.t > 0) { G.warnMsg.t -= dt; ctx.fillStyle = '#ff9a3a'; ctx.font = '800 14px ui-monospace,Menlo,monospace'; ctx.fillText(G.warnMsg.text, cx, cy - 116); }
  const ctxHint = G.contextHint; if (ctxHint) { ctx.fillStyle = '#eef2ff'; ctx.font = '600 13px Inter,system-ui,sans-serif'; ctx.globalAlpha = 0.85 + Math.sin(H.t * 4) * 0.15; ctx.fillText(ctxHint, cx, G.view === 'cockpit' && !small ? Hh * 0.655 : Hh * 0.2); ctx.globalAlpha = 1; }
}

// ---------------------------------------------------------------- MFDs (10 Hz)
function crt(g, w, h, title, tint) {
  g.fillStyle = '#04080a'; g.fillRect(0, 0, w, h);
  const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.7); gr.addColorStop(0, 'rgba(40,70,60,.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = tint; g.font = '700 15px ui-monospace,Menlo,monospace'; g.textAlign = 'left'; g.fillText(title, 10, 20);
  g.strokeStyle = tint; g.globalAlpha = 0.35; g.lineWidth = 1; g.strokeRect(4.5, 4.5, w - 9, h - 9); g.beginPath(); g.moveTo(8, 27); g.lineTo(w - 8, 27); g.stroke(); g.globalAlpha = 1;
}
function scan(g, w, h) { g.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1); }
function bar(g, x, y, w, h, f, c, label) { g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x, y, w, h); g.fillStyle = c; g.fillRect(x, y, w * Math.max(0, Math.min(1, f)), h); if (label) { g.fillStyle = '#cfe'; g.font = '11px ui-monospace,Menlo,monospace'; g.textAlign = 'left'; g.fillText(label, x, y - 3); } }
export function drawMFD(G, dt, force = false) {
  const H = G.hud; H.mfdT -= dt; if (H.mfdT > 0 && !force) return; H.mfdT = 0.1;
  const P = G.player; if (!P) return;
  const acc = G.cfg.colors.accent || '#ffb347';
  // LEFT: target
  { const c = H.mfd.left, g = c.getContext('2d'), w = c.width, h = c.height; const T = P.target;
    crt(g, w, h, 'TARGET', acc);
    if (T && T.alive) {
      const rel = relation(G, T); const cc = col(rel);
      g.fillStyle = cc; g.font = '700 16px ui-monospace,Menlo,monospace'; g.textAlign = 'left'; g.fillText(T.name.slice(0, 22), 12, 48);
      g.font = '12px ui-monospace,Menlo,monospace'; g.fillStyle = '#9fb'; g.fillText(`${FACTIONS[T.fac]?.short || ''} ${T.def.role || ''}`.slice(0, 26), 12, 64);
      // silhouette
      const pts = SIL[T.parent ? 'capital' : T.cls] || SIL.jackal; const sx = 230, sy = 120, ss = 62;
      g.save(); g.translate(sx, sy); g.strokeStyle = cc; g.lineWidth = 2; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * ss, y * ss) : g.moveTo(x * ss, y * ss))); g.closePath(); g.stroke(); g.globalAlpha = 0.15; g.fillStyle = cc; g.fill(); g.globalAlpha = 1;
      // shield halves
      if (T.shieldMax) { g.lineWidth = 4; g.strokeStyle = '#7ad8ff'; g.globalAlpha = 0.2 + 0.8 * T.shF / T.shieldMax; g.beginPath(); g.arc(0, 0, ss * 1.2, -Math.PI * 0.85, -Math.PI * 0.15); g.stroke(); g.globalAlpha = 0.2 + 0.8 * T.shB / T.shieldMax; g.beginPath(); g.arc(0, 0, ss * 1.2, Math.PI * 0.15, Math.PI * 0.85); g.stroke(); g.globalAlpha = 1; }
      g.restore();
      const d = T.pos.distanceTo(P.pos);
      g.fillStyle = '#cfe'; g.font = '13px ui-monospace,Menlo,monospace'; g.fillText(`RNG ${fmtD(d)}`, 12, 90); g.fillText(`SPD ${Math.round(T.vel.length())}`, 12, 108);
      g.fillText(T.invuln ? 'SHIELDED' : rel === 'hostile' ? 'HOSTILE' : rel === 'ally' ? 'FRIENDLY' : 'NEUTRAL', 12, 126);
      bar(g, 12, 160, 150, 10, T.hullFrac(), cc, 'HULL'); if (T.shieldMax) bar(g, 12, 192, 150, 10, (T.shF + T.shB) / (2 * T.shieldMax), '#7ad8ff', 'SHIELD');
      if (P.locked) { g.fillStyle = '#ff3b3b'; g.font = '700 14px ui-monospace,Menlo,monospace'; g.fillText('MISSILE LOCK', 12, 226); }
    } else { g.fillStyle = '#6a8'; g.font = '14px ui-monospace,Menlo,monospace'; g.textAlign = 'center'; g.fillText('NO TARGET', w / 2, 110); g.font = '12px ui-monospace,Menlo,monospace'; g.fillText(G.input.touch ? 'tap TGT to lock' : 'press T for nearest hostile', w / 2, 132); }
    scan(g, w, h); H.tex.left.needsUpdate = true; }
  // CENTER: radar (centre = dead ahead, rim = directly behind)
  { const c = H.mfd.center, g = c.getContext('2d'), w = c.width, h = c.height;
    crt(g, w, h, 'SCOPE', acc);
    const cx = w / 2, cy = h / 2 + 12, R = 96;
    g.strokeStyle = acc; g.globalAlpha = 0.35; g.lineWidth = 1; for (const k of [0.5, 1]) { g.beginPath(); g.arc(cx, cy, R * k, 0, 7); g.stroke(); } g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke(); g.globalAlpha = 1;
    const inv = new THREE.Quaternion().copy(P.quat).invert();
    const plot = (p, color, size, ring) => {
      _v.copy(p).sub(P.pos); const d = _v.length(); if (d < 1) return; _v.applyQuaternion(inv).normalize();
      const ang = Math.acos(Math.max(-1, Math.min(1, -_v.z))); const L = Math.hypot(_v.x, _v.y) || 1;
      const x = cx + (_v.x / L) * (ang / Math.PI) * R, y = cy - (_v.y / L) * (ang / Math.PI) * R;
      g.fillStyle = color; if (ring) { g.strokeStyle = color; g.lineWidth = 2; g.beginPath(); g.arc(x, y, size + 3, 0, 7); g.stroke(); }
      g.beginPath(); g.arc(x, y, size, 0, 7); g.fill();
    };
    for (const n of G.navs) plot(n.pos, n.kind === 'story' ? col('story') : 'rgba(122,216,255,.75)', 2.5, G.navs[G.navSel] === n);
    for (const s of G.ships) if (s.alive && !s.isPlayer && !s.parent && s.pos.distanceTo(P.pos) < 7000) plot(s.pos, col(relation(G, s)), s.radius > 25 ? 4.5 : 3, s === P.target);
    for (const m of G.missiles) plot(m.p, '#fff', 2, false);
    g.fillStyle = '#9fb'; g.font = '11px ui-monospace,Menlo,monospace'; g.textAlign = 'right'; g.fillText(G.sys?.name || '', w - 10, 20);
    scan(g, w, h); H.tex.center.needsUpdate = true; }
  // RIGHT: ship status
  { const c = H.mfd.right, g = c.getContext('2d'), w = c.width, h = c.height; const st = S.shipStats(G.P);
    crt(g, w, h, st.name.toUpperCase(), acc);
    const sx = 70, sy = 120;
    g.save(); g.translate(sx, sy); const pts = SIL[P.cls]; g.strokeStyle = acc; g.lineWidth = 2; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * 40, y * 40) : g.moveTo(x * 40, y * 40))); g.closePath(); g.stroke();
    const hf = P.hullFrac(); g.globalAlpha = 0.3; g.fillStyle = hf > 0.5 ? acc : hf > 0.25 ? '#ffd35a' : '#ff5a5a'; g.fill(); g.globalAlpha = 1;
    g.lineWidth = 5; g.strokeStyle = '#7ad8ff'; g.globalAlpha = 0.15 + 0.85 * P.shF / P.shieldMax; g.beginPath(); g.arc(0, 0, 54, -Math.PI * 0.85, -Math.PI * 0.15); g.stroke();
    g.globalAlpha = 0.15 + 0.85 * P.shB / P.shieldMax; g.beginPath(); g.arc(0, 0, 54, Math.PI * 0.15, Math.PI * 0.85); g.stroke(); g.globalAlpha = 1; g.restore();
    bar(g, 150, 52, 155, 9, hf, hf > 0.5 ? acc : '#ff5a5a', `HULL ${Math.round(P.hull)}/${Math.round(P.hullMax)}`);
    bar(g, 150, 84, 155, 9, P.energy / 100, '#ffd35a', 'GUN ENERGY');
    bar(g, 150, 116, 155, 9, P.fuel, '#7ad8ff', P.overheat ? 'BOOST — OVERHEAT' : 'BOOST');
    bar(g, 150, 148, 155, 9, P.heat, P.heat > 0.7 ? '#ff7a3a' : '#c08a3a', 'HEAT');
    g.fillStyle = '#cfe'; g.font = '12px ui-monospace,Menlo,monospace'; g.textAlign = 'left';
    g.fillText(`MSL ${P.missiles}/${st.missilesMax}   CELLS ${G.P.ship.cells}`, 150, 178);
    g.fillText(`HOLD ${S.cargoUsed(G.P)}/${st.cargoMax}`, 150, 196);
    g.fillText(`${G.P.credits.toLocaleString()} CR`, 150, 214);
    g.fillStyle = acc; g.fillText(st.gun.name.toUpperCase() + ' ' + ['I', 'II', 'III'][st.gunMk - 1], 12, 226);
    scan(g, w, h); H.tex.right.needsUpdate = true; }
}
