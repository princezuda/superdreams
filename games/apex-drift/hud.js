// Apex Drift — DOM HUD: position / lap / timers, speedometer + segmented boost meter with drift tier, minimap
// (cached track path + live dots), live standings, rival name tags, banners, countdown, onboarding hints.
import { fmtTime } from './logic.js';
import { settings } from '/shared/sd-kit.js';

const ORD = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export { ORD, esc };

export class HUD {
  constructor() {
    const el = this.el = document.createElement('div'); el.id = 'hud';
    el.innerHTML = `
      <div class="h-tl"><div class="h-pos"><b id="hPos">1</b><sup id="hPosS">st</sup><span id="hPosN">/6</span></div>
        <div class="h-lap">LAP <b id="hLap">1/3</b></div><div class="h-time" id="hTime">0:00.000</div><div class="h-best" id="hBest"></div></div>
      <div class="h-board" id="hBoard"></div>
      <canvas id="hMap" width="340" height="340"></canvas>
      <div class="h-bc"><div class="h-tier" id="hTier"></div><div class="h-spd"><b id="hSpd">0</b><small id="hUnit">KM/H</small></div>
        <div class="h-boost"><i id="hBoostFill"></i><span class="seg"></span><span class="seg"></span><span class="seg"></span><span class="seg"></span><em>BOOST</em></div></div>
      <div class="h-banner" id="hBanner"></div><div class="h-count" id="hCount"></div><div class="h-sub" id="hSub"></div>
      <div class="h-hint" id="hHint"></div><div class="h-tags" id="hTags"></div><div class="h-speedlines" id="hLines"></div>
      <button class="sd-btn sd-icon h-pause" id="hPause" aria-label="Pause">❚❚</button>`;
    document.body.appendChild(el);
    this.$ = (id) => el.querySelector('#' + id);
    this.map = this.$('hMap'); this.mctx = this.map.getContext('2d'); this.tags = []; this.lastPos = 0; this.bannerT = 0; this.hintKey = null;
  }
  show(on) { this.el.classList.toggle('show', !!on); }
  setup(T, cars, laps, mode) {
    this.T = T; this.laps = laps; this.mode = mode;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < T.n; i++) { minX = Math.min(minX, T.x[i]); maxX = Math.max(maxX, T.x[i]); minZ = Math.min(minZ, T.z[i]); maxZ = Math.max(maxZ, T.z[i]); }
    const S = 300 / Math.max(maxX - minX, maxZ - minZ), ox = 170 - ((minX + maxX) / 2) * S, oz = 170 - ((minZ + maxZ) / 2) * S;
    // view from above with the camera's convention: world -x is screen right when looking down +z → mirror x
    this.mp = (x, z) => [340 - (x * S + ox), 340 - (z * S + oz)];
    const c = document.createElement('canvas'); c.width = c.height = 340; const g = c.getContext('2d');
    const path = new Path2D(); for (let i = 0; i <= T.n; i += 2) { const [a, b] = this.mp(T.x[i % T.n], T.z[i % T.n]); i ? path.lineTo(a, b) : path.moveTo(a, b); } path.closePath();
    g.lineJoin = 'round'; g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 16; g.stroke(path); g.strokeStyle = 'rgba(255,255,255,.92)'; g.lineWidth = 7; g.stroke(path);
    const [sx, sy] = this.mp(T.x[0], T.z[0]); const [qx, qy] = this.mp(T.x[0] + T.nx[0] * 12, T.z[0] + T.nz[0] * 12);
    g.strokeStyle = '#ff3d6e'; g.lineWidth = 5; g.beginPath(); g.moveTo(sx * 2 - qx, sy * 2 - qy); g.lineTo(qx, qy); g.stroke();
    this.mapBase = c; this.$('hPosN').textContent = '/' + cars.length;
    this.$('hBoard').innerHTML = cars.map((car) => `<div class="hb-row" data-id="${car.id}"><i style="background:${car.color}"></i><span>${esc(car.name)}</span><em></em></div>`).join('');
    this.rows = {}; this.el.querySelectorAll('.hb-row').forEach((r) => (this.rows[r.dataset.id] = r));
    this.$('hTags').innerHTML = cars.filter((c) => !c.isPlayer).map((car) => `<div class="tag" data-id="${car.id}"><i style="background:${car.color}"></i>${esc(car.name)}</div>`).join('');
    this.tagEls = {}; this.el.querySelectorAll('.tag').forEach((t) => (this.tagEls[t.dataset.id] = t));
    this.el.classList.toggle('tt', mode === 'tt'); this.el.classList.toggle('solo', cars.length === 1);
    this.lastPos = 0; this.$('hBest').textContent = '';
  }
  update(G) {
    const p = G.player, $ = this.$;
    const pos = G.order.indexOf(p) + 1;
    if (pos !== this.lastPos) { $('hPos').textContent = pos; $('hPosS').textContent = ORD(pos).slice(-2); if (this.lastPos) { const e = $('hPos').parentElement; e.classList.remove('pulse'); void e.offsetWidth; e.classList.add('pulse'); } this.lastPos = pos; }
    const lap = Math.max(1, Math.min(this.laps, p.lap.lap)); $('hLap').textContent = this.mode === 'tt' ? `${lap}/${this.laps}` : `${lap}/${this.laps}`;
    const lapT = p.lap.lap > 0 && !p.finished ? G.time - p.lap.lapStart : 0;
    $('hTime').textContent = fmtTime(G.phase === 'race' || G.phase === 'finished' ? (p.finished ? p.finishTime - G.startTime : G.time - G.startTime) : 0);
    $('hBest').innerHTML = `<span>LAP</span> ${fmtTime(lapT)}` + (isFinite(G.bestLap) ? ` <span>BEST</span> ${fmtTime(G.bestLap)}` : '');
    const kmh = Math.abs(p.vF) * (G.prefs.units === 'mph' ? 2.23694 : 3.6); $('hSpd').textContent = Math.round(kmh); $('hUnit').textContent = G.prefs.units === 'mph' ? 'MPH' : 'KM/H';
    $('hBoostFill').style.transform = `scaleX(${p.boost.toFixed(3)})`;
    this.el.classList.toggle('boosting', p.boosting); this.el.classList.toggle('full', p.boost > 0.98);
    const tier = p.drift ? p.tier : 0; const te = $('hTier');
    if (te.dataset.t !== String(tier)) { te.dataset.t = tier; te.textContent = p.drift ? ['DRIFT', 'DRIFT ●', 'DRIFT ●●', 'DRIFT ●●●'][tier] : ''; }
    // speed lines grow with speed / boost
    const sl = settings.reducedMotion ? 0 : Math.max(0, (Math.abs(p.vF) - 45) / 30) * 0.5 + (p.boosting ? 0.45 : 0);
    $('hLines').style.opacity = Math.min(0.85, sl).toFixed(2);
    // standings board
    if (G.cars.length > 1) {
      const lead = G.order[0];
      G.order.forEach((c, i) => { const r = this.rows[c.id]; if (!r) return; r.style.transform = `translateY(${i * 26}px)`; r.classList.toggle('me', c === p);
        const gap = c.finished ? fmtTime(c.finishTime - G.startTime) : i === 0 ? 'LEADER' : '+' + Math.max(0, (lead.dist - c.dist) / Math.max(20, Math.abs(c.vF) || 20)).toFixed(1) + 's';
        const em = r.querySelector('em'); if (em.textContent !== gap) em.textContent = gap; });
    }
    this.drawMap(G);
  }
  drawMap(G) {
    const g = this.mctx; g.clearRect(0, 0, 340, 340); g.drawImage(this.mapBase, 0, 0);
    if (G.ghostPos) { const [x, y] = this.mp(G.ghostPos.x, G.ghostPos.z); g.fillStyle = 'rgba(80,220,255,.85)'; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); }
    for (const c of G.cars) { if (c === G.player) continue; const [x, y] = this.mp(c.x, c.z); g.fillStyle = c.color; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill(); g.stroke(); }
    const p = G.player; const [x, y] = this.mp(p.x, p.z);
    g.save(); g.translate(x, y); g.rotate(Math.atan2(-Math.cos(p.yaw), -Math.sin(p.yaw))); g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 3; g.beginPath(); g.moveTo(14, 0); g.lineTo(-9, 9); g.lineTo(-4, 0); g.lineTo(-9, -9); g.closePath(); g.stroke(); g.fill(); g.restore();
  }
  /** Rival name tags: project to screen; show for cars 4–80 m ahead of the camera. */
  updateTags(G, camera, project) {
    const placed = [];
    const list = G.cars.filter((c) => this.tagEls?.[c.id]).sort((a, b) => Math.hypot(a.x - camera.position.x, a.z - camera.position.z) - Math.hypot(b.x - camera.position.x, b.z - camera.position.z));
    for (const c of list) {
      const t = this.tagEls?.[c.id]; if (!t) continue;
      const r = project(c.x, c.y + 2.1, c.z); const d = Math.hypot(c.x - camera.position.x, c.z - camera.position.z);
      let vis = r && r.z < 1 && d > 7 && d < 90 && G.phase !== 'podium';
      if (vis && placed.some((q) => Math.abs(q.x - r.x) < 64 && Math.abs(q.y - r.y) < 22)) vis = false; // nearest wins, no stacked labels
      if (vis) placed.push(r);
      t.style.display = vis ? 'flex' : 'none'; if (vis) { t.style.transform = `translate(${r.x}px, ${r.y}px) translate(-50%,-100%) scale(${Math.max(0.6, 1.25 - d / 80).toFixed(2)})`; }
    }
  }
  banner(html, cls = '', ms = 1600) {
    const b = this.$('hBanner'); b.className = 'h-banner show ' + cls; b.innerHTML = html; clearTimeout(this.bt);
    this.bt = setTimeout(() => b.classList.remove('show'), ms);
  }
  sub(html, ms = 1800) { const b = this.$('hSub'); b.innerHTML = html; b.classList.add('show'); clearTimeout(this.st); this.st = setTimeout(() => b.classList.remove('show'), ms); }
  count(text, go = false) { const c = this.$('hCount'); c.textContent = text; c.className = 'h-count show' + (go ? ' go' : ''); clearTimeout(this.ct); void c.offsetWidth; this.ct = setTimeout(() => (c.className = 'h-count'), go ? 900 : 800); }
  hint(key, html) {
    const h = this.$('hHint');
    if (!html) { if (!key || this.hintKey === key) { h.classList.remove('show'); this.hintKey = null; } return; }
    if (this.hintKey === key) return; this.hintKey = key; h.innerHTML = html; h.classList.add('show');
  }
}
