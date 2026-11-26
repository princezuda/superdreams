// DOM HUD: crosshair (reacts to spread), hit/kill markers, damage direction arcs, grenade indicator,
// compass with objective pip, rotating minimap (fire pings), objective panel, killfeed, ammo/vitals,
// world markers + floating squad barks, prompts, onboarding tips, banners, XP popups, scope overlay.
import { THREE, settings } from '/shared/sd-kit.js';
import { TIERS, WEAPONS } from './config.js';
import { spreadDeg, clamp, wrapAngle } from './logic.js';

const $ = (s, r = document) => r.querySelector(s);
const _v = new THREE.Vector3();

export class HUD {
  constructor() {
    const el = document.createElement('div'); el.id = 'hud'; el.className = 'off';
    el.innerHTML = `
      <div class="xh"><i></i><i></i><i></i><i></i><b></b></div><div class="hm"><i></i><i></i><i></i><i></i></div>
      <div id="dmgInd"></div><div id="nadeInd"><div class="icon">!</div></div>
      <div class="compass"><div class="strip"></div></div><div class="compass-hd">000</div>
      <div id="obj"><div class="t"></div><div class="x"></div><div class="sub"></div><div class="bar"><i></i></div></div>
      <div id="killfeed"></div><div id="modeTop"></div>
      <div id="mm"><canvas width="356" height="356"></canvas></div>
      <div id="vitals"><div class="lbl"><span>HEALTH</span><span class="hpn">100</span></div><div class="hp"><b></b><i></i></div><div class="ar hide"><i></i></div></div>
      <div id="ammo"><div class="tier"></div><div class="wn"></div><div class="ct"><b>30</b><small>/ 150</small></div><div class="nades"></div><div class="mats hide"></div></div>
      <div id="prompt"><div class="pt"></div><div class="pr"><i></i></div></div>
      <div class="tip"></div><div id="banner"><div class="b1"></div><div class="line"></div><div class="b2"></div></div>
      <div id="markers"></div><div id="barks"></div><div id="comms"></div><div id="xp"></div><div id="build" class="hide"></div>`;
    document.body.appendChild(el); this.el = el;
    for (const id of ['lowhp', 'suppr', 'stormOv', 'scope']) { const d = document.createElement('div'); d.id = id; d.className = 'ov'; document.body.appendChild(d); }
    $('#scope').innerHTML = '<div class="rl h"></div><div class="rl v"></div><div class="c"></div><div class="ch"></div>';
    this.xh = $('.xh', el); this.hm = $('.hm', el); this.mm = $('#mm canvas', el); this.mmx = this.mm.getContext('2d');
    this.strip = $('.compass .strip', el); this.hd = $('.compass-hd', el); this.buildCompass();
    this.barkEls = []; this.markEls = []; this.markers = []; this.pings = []; this.tipQueue = []; this.taught = new Set();
    this.objWorld = null; this.lowhpT = 0; this.beatT = 0;
  }
  show(v) { this.el.classList.toggle('off', !v); if (!v) { for (const id of ['lowhp', 'suppr', 'stormOv']) $('#' + id).style.opacity = 0; $('#scope').classList.remove('on'); } }
  buildCompass() {
    const W = 3.2; let h = ''; const lab = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let d = -360; d <= 720; d += 15) { const x = (d + 360) * W; const dd = ((d % 360) + 360) % 360; h += `<div class="tk" style="left:${x}px;height:${dd % 45 ? 5 : 9}px"></div>`; if (lab[dd] !== undefined) h += `<div class="lb ${dd % 90 ? '' : 'c'}" style="left:${x}px">${lab[dd]}</div>`; }
    h += '<div class="obj hide"></div>'; this.strip.innerHTML = h; this.cW = W; this.cObj = $('.obj', this.strip);
  }
  // ---------------------------------------------------------------- events
  weapon(ars) {
    const s = ars.slot; if (!s) return; $('#ammo .wn').textContent = s.w.name; const t = TIERS[s.tier || 0];
    $('#ammo .tier').textContent = this.showTiers ? t.label.toUpperCase() : s.w.cls.toUpperCase(); $('#ammo .tier').style.color = this.showTiers ? t.color : 'var(--dim)';
    this.ammo(ars);
  }
  ammo(ars) {
    const s = ars.slot; if (!s) return; const ct = $('#ammo .ct'); ct.querySelector('b').textContent = s.mag; ct.querySelector('small').textContent = '/ ' + s.reserve;
    ct.classList.toggle('low', s.mag <= Math.ceil(s.w.mag * 0.25));
    $('#ammo .nades').innerHTML = `<span><i></i>${ars.frags}</span><span><i class="s"></i>${ars.smokes}</span>`;
    if (s.mag <= Math.ceil(s.w.mag * 0.25) && s.reserve > 0 && !ars.reloading) this.teach('reload'); else if (s.mag <= Math.ceil(s.w.mag * 0.25) && s.reserve === 0) this.prompt('NO AMMO — swap weapon <kbd>X</kbd>', null, 1);
  }
  mats(n) { const m = $('#ammo .mats'); m.classList.toggle('hide', n === null); if (n !== null) m.textContent = `◆ ${n} ALLOY`; }
  health(p) {
    const k = clamp(p.health / p.maxHealth, 0, 1); $('#vitals .hp i').style.width = k * 100 + '%'; $('#vitals .hp b').style.width = k * 100 + '%'; $('#vitals .hpn').textContent = Math.ceil(p.health);
    const ar = $('#vitals .ar'); ar.classList.toggle('hide', !this.showArmor); $('#vitals .ar i').style.width = clamp(p.armor, 0, 100) + '%';
  }
  hit(head, kill) {
    const h = this.hm; h.className = 'hm'; void h.offsetWidth; h.className = 'hm show' + (kill ? ' kill' : head ? ' head' : '');
  }
  damage(angle) {
    const box = $('#dmgInd'); const d = document.createElement('div'); d.className = 'di'; d.style.transform = `rotate(${angle}rad)`; box.appendChild(d);
    requestAnimationFrame(() => requestAnimationFrame(() => { d.style.opacity = 0; })); setTimeout(() => d.remove(), 1300);
    while (box.children.length > 6) box.firstChild.remove();
  }
  killfeed(killer, victim, wname, head, me) {
    const kf = $('#killfeed'); const d = document.createElement('div'); d.className = 'kf' + (me ? ' me' : '');
    const cls = (a) => a?.team === 'A' ? 'a' : 'b';
    d.innerHTML = `<span class="${cls(killer)}">${esc(killer?.name || 'World')}</span><span class="w">${esc(wname)}${head ? ' ◎' : ''}</span><span class="${cls(victim)}">${esc(victim.name)}</span>`;
    kf.prepend(d); setTimeout(() => d.remove(), 5000); while (kf.children.length > 5) kf.lastChild.remove();
  }
  objective(title, text, sub = '', progress = null) {
    $('#obj .t').textContent = title || ''; $('#obj .x').textContent = text || ''; $('#obj .sub').textContent = sub || '';
    const bar = $('#obj .bar'); bar.style.display = progress === null ? 'none' : 'block'; if (progress !== null) bar.firstElementChild.style.width = clamp(progress, 0, 1) * 100 + '%';
  }
  modeTop(html) { $('#modeTop').innerHTML = html; }
  banner(t1, t2 = '', ms = 2600) { const b = $('#banner'); b.querySelector('.b1').textContent = t1; b.querySelector('.b2').textContent = t2; b.classList.add('on'); clearTimeout(this.bT); this.bT = setTimeout(() => b.classList.remove('on'), ms); }
  prompt(html, progress = null, holdT = 0.15) { this.promptT = holdT; const p = $('#prompt'); if (this.promptHtml !== html) { p.querySelector('.pt').innerHTML = html; this.promptHtml = html; } p.classList.add('on'); const pr = p.querySelector('.pr'); pr.style.display = progress === null ? 'none' : 'block'; if (progress !== null) pr.firstElementChild.style.width = clamp(progress, 0, 1) * 100 + '%'; }
  tip(html, ms = 4200) { const t = $('.tip', this.el); t.innerHTML = html; t.classList.add('on'); clearTimeout(this.tT); this.tT = setTimeout(() => t.classList.remove('on'), ms); }
  // one-time contextual teaching (first-minute onboarding inside play)
  teach(key, force = false) {
    if (this.taught.has(key) && !force) return; const K = this.keyName;
    const T = {
      move: `<kbd>${K('forward')}</kbd><kbd>${K('left')}</kbd><kbd>${K('back')}</kbd><kbd>${K('right')}</kbd> move · mouse to look · <kbd>${K('sprint')}</kbd> sprint`,
      crouch: `<kbd>${K('crouch')}</kbd> crouch to get under — sprint + <kbd>${K('crouch')}</kbd> to slide`,
      mantle: `<kbd>${K('jump')}</kbd> at a low wall to mantle over it`,
      ads: `Hold <kbd>RMB</kbd> to aim down sights — steadier, more precise`,
      fire: `<kbd>LMB</kbd> fire · pull down against the recoil climb`,
      reload: `<kbd>${K('reload')}</kbd> reload — tactical reloads keep a round chambered`,
      nade: `Hold <kbd>${K('frag')}</kbd> to cook a frag, release to throw · <kbd>${K('smoke')}</kbd> smoke blocks enemy sight`,
      lean: `<kbd>${K('leanL')}</kbd> / <kbd>${K('leanR')}</kbd> lean around cover`,
      swap: `<kbd>${K('swap')}</kbd> or <kbd>1</kbd>/<kbd>2</kbd> swap weapons — faster than reloading`,
      regen: `Get into cover — health regenerates when you stop taking hits`,
      build: `<kbd>${K('build')}</kbd> build mode · <kbd>${K('wall')}</kbd> wall <kbd>${K('floor')}</kbd> floor <kbd>${K('ramp')}</kbd> ramp · <kbd>LMB</kbd> place · costs alloy (salvage scrap with <kbd>${K('melee')}</kbd>)`,
      melee: `<kbd>${K('melee')}</kbd> melee — instant takedown up close`,
    };
    if (!T[key]) return; this.taught.add(key); this.tip(T[key], 5200);
  }
  xp(n, label) { const box = $('#xp'); const d = document.createElement('div'); d.textContent = `+${n} ${label}`; box.appendChild(d); setTimeout(() => d.remove(), 1250); while (box.children.length > 4) box.firstChild.remove(); }
  bark(bot, text) {
    const g = this.game; if (!g) return; const P = g.player.pos; const d = Math.hypot(bot.x - P.x, bot.z - P.z);
    if (bot.team !== 'A' && d > 38) return;
    if (!bot.radio) this.barkEls.push({ bot, text, t: 2.6, el: null });
    const c = $('#comms'); const line = document.createElement('div'); line.innerHTML = `<b class="${bot.team}">${esc(bot.name)}</b>${esc(text)}`; c.appendChild(line); setTimeout(() => line.remove(), 5200); while (c.children.length > 4) c.firstChild.remove();
    g.audio?.ui('radio');
  }
  ping(x, z, team) { this.pings.push({ x, z, team, t: 1.6 }); if (this.pings.length > 40) this.pings.shift(); }
  // ---------------------------------------------------------------- minimap static layer
  setMap(world, map) {
    const B = world.bounds, S = 2; const w = Math.ceil((B.maxX - B.minX) * S), h = Math.ceil((B.maxZ - B.minZ) * S);
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    g.fillStyle = map.waterZ ? '#0b1620' : '#1a2026'; g.fillRect(0, 0, w, h);
    if (map.waterZ) { g.fillStyle = '#1a2026'; g.fillRect(0, 0, w, (map.waterZ - B.minZ) * S); }
    if (map.island) { g.fillStyle = '#0b1620'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) { const wx = B.minX + x / S, wz = B.minZ + y / S; const th = world.terrain(wx, wz); if (th > map.waterY) { const k = clamp((th - map.waterY) / 18, 0, 1); g.fillStyle = `rgb(${30 + k * 30},${40 + k * 30},${32 + k * 16})`; g.fillRect(x, y, 2, 2); } } }
    for (const col of world.cols) { if (col.dead || col.noNav && col.noBullet) continue; const hgt = col.max[1] - col.min[1]; if (hgt < 0.6 && col.kind !== 'ramp') continue; const tall = col.max[1] > 2.5;
      g.fillStyle = col.kind === 'ramp' ? '#3a4650' : tall ? '#5b6670' : '#3c464f'; g.fillRect((col.min[0] - B.minX) * S, (col.min[2] - B.minZ) * S, Math.max(1, (col.max[0] - col.min[0]) * S), Math.max(1, (col.max[2] - col.min[2]) * S)); }
    this.mmLayer = c; this.mmS = S; this.B = B;
  }
  // ---------------------------------------------------------------- per frame
  update(dt, g) {
    const p = g.player, cam = g.camera, ars = g.arsenal, w = ars?.w;
    // crosshair gap from current spread
    if (w) {
      const sp = w.pellets > 1 ? w.spread.pelletCone : spreadDeg(w, { ads: ars.ads, moving: p.speedH > 1.2, grounded: p.grounded, crouch: p.crouchK > 0.5, sliding: p.slideT > 0, bloom: ars.bloom });
      const px = Math.tan(sp * Math.PI / 180) / Math.tan(cam.fov * Math.PI / 360) * (innerHeight / 2);
      this.xh.style.setProperty('--gap', Math.max(3, px) + 'px');
      const hide = (ars.ads > 0.6 && w.pellets === 1) || p.sprintK > 0.5 || ars.reloadT > 0 && ars.reloadStage > 0 || g.buildMode;
      this.xh.style.opacity = hide ? 0 : 1;
    }
    // scope overlay
    const scoped = w && (w.optic === 'sniper' || w.optic === 'scope4') && ars.ads > 0.86;
    const sc = $('#scope'); sc.classList.toggle('on', !!scoped); sc.classList.toggle('dmr', w?.optic === 'scope4');
    // compass
    const deg = ((-p.yaw * 180 / Math.PI) % 360 + 360) % 360; const cw = this.strip.parentElement.clientWidth;
    this.strip.style.transform = `translateX(${cw / 2 - (deg + 360) * this.cW}px)`; this.hd.textContent = String(Math.round(deg)).padStart(3, '0');
    const ow = this.objWorld;
    if (ow) { const b = (Math.atan2(ow.x - p.pos.x, -(ow.z - p.pos.z)) * 180 / Math.PI + 360) % 360; let rel = ((b - deg + 540) % 360) - 180; this.cObj.classList.remove('hide'); this.cObj.style.left = (deg + rel + 360) * this.cW + 'px'; } else this.cObj.classList.add('hide');
    // vitals + overlays
    this.health(p);
    const low = p.alive && p.health < 40 ? (1 - p.health / 40) : 0;
    $('#lowhp').style.opacity = settings.flash ? low * (0.75 + 0.25 * Math.sin(g.time * 6)) : low * 0.8;
    if (low > 0.3) { this.beatT -= dt; if (this.beatT <= 0) { this.beatT = 0.9; g.audio?.heartbeat(); } }
    $('#suppr').style.opacity = clamp(g.suppress || 0, 0, 0.9);
    $('#stormOv').style.opacity = g.inStorm ? 1 : 0;
    // grenade indicator
    const nd = g.grenades?.danger(p.pos.x, p.pos.z, 8.5); const ni = $('#nadeInd');
    if (nd) { ni.style.opacity = 1; const a = Math.atan2(nd.x - p.pos.x, -(nd.z - p.pos.z)) + p.yaw; const r = 95; const ic = ni.firstElementChild; ic.style.left = Math.sin(a) * r + 'px'; ic.style.top = -Math.cos(a) * r + 'px'; this.teach('nade'); } else ni.style.opacity = 0;
    // prompt timeout
    if (this.promptT !== undefined) { this.promptT -= dt; if (this.promptT <= 0) { $('#prompt').classList.remove('on'); this.promptT = undefined; this.promptHtml = null; } }
    this.drawMinimap(g);
    this.updateWorldLabels(dt, g);
  }
  project(x, y, z, cam) { _v.set(x, y, z).project(cam); if (_v.z > 1) return null; return [(_v.x * 0.5 + 0.5) * innerWidth, (-_v.y * 0.5 + 0.5) * innerHeight, _v.z]; }
  updateWorldLabels(dt, g) {
    const cam = g.camera; const P = g.player.pos;
    // markers
    const box = $('#markers'); const ms = this.markers;
    while (this.markEls.length < ms.length) { const d = document.createElement('div'); d.className = 'mk'; d.innerHTML = '<i></i><span></span>'; box.appendChild(d); this.markEls.push(d); }
    this.markEls.forEach((el, i) => {
      const m = ms[i]; if (!m) { el.style.display = 'none'; return; }
      const s = this.project(m.x, m.y, m.z, cam); const dist = Math.hypot(m.x - P.x, m.z - P.z);
      if (!s || (m.max && dist > m.max)) { el.style.display = 'none'; return; }
      el.style.display = 'block'; el.className = 'mk ' + (m.cls || ''); el.style.left = clamp(s[0], 20, innerWidth - 20) + 'px'; el.style.top = clamp(s[1], 40, innerHeight - 40) + 'px';
      el.lastElementChild.textContent = (m.label ? m.label + ' ' : '') + (m.noDist ? '' : Math.round(dist) + 'm');
    });
    // barks
    const bb = $('#barks');
    for (let i = this.barkEls.length - 1; i >= 0; i--) {
      const b = this.barkEls[i]; b.t -= dt;
      if (!b.el) { b.el = document.createElement('div'); b.el.className = 'bk ' + b.bot.team; b.el.textContent = b.text; bb.appendChild(b.el); }
      const s = b.bot.alive || b.t > 1.5 ? this.project(b.bot.x, b.bot.y + 2.15 * (b.bot.scale || 1), b.bot.z, cam) : null;
      if (!s || b.t <= 0) { if (b.t <= 0) { b.el.remove(); this.barkEls.splice(i, 1); } else b.el.style.opacity = 0; continue; }
      b.el.style.opacity = Math.min(1, b.t * 2); b.el.style.left = s[0] + 'px'; b.el.style.top = s[1] + 'px';
    }
  }
  drawMinimap(g) {
    if (!this.mmLayer) return; const c = this.mmx, W = this.mm.width, p = g.player, S = this.mmS, B = this.B; const zoom = (g.mapZoom ?? 2.6) / S;
    c.save(); c.clearRect(0, 0, W, W); c.translate(W / 2, W / 2); c.rotate(p.yaw); c.scale(zoom, zoom);
    c.drawImage(this.mmLayer, -(p.pos.x - B.minX) * S, -(p.pos.z - B.minZ) * S);
    const toM = (x, z) => [(x - p.pos.x) * S, (z - p.pos.z) * S];
    // storm
    if (g.storm) { const s = g.storm; c.strokeStyle = 'rgba(190,90,255,.9)'; c.lineWidth = 3 / zoom; let [x, z] = toM(s.cx, s.cz); c.beginPath(); c.arc(x, z, s.r * S, 0, 7); c.stroke(); c.strokeStyle = 'rgba(255,255,255,.6)'; c.setLineDash([6 / zoom, 6 / zoom]); [x, z] = toM(s.nx, s.nz); c.beginPath(); c.arc(x, z, s.nr * S, 0, 7); c.stroke(); c.setLineDash([]); }
    // allies always, enemies only when they fire (ping)
    const dot = (x, z, col, r = 4) => { const [a, b] = toM(x, z); c.fillStyle = col; c.beginPath(); c.arc(a, b, r / zoom, 0, 7); c.fill(); };
    const fr = this.colFr || '#3cc8ff', en = this.colEn || '#ff5a2e';
    for (const b of g.bots) if (b.alive && b.team === 'A') dot(b.x, b.z, fr, 4);
    for (const pg of this.pings) { pg.t -= 1 / 60; if (pg.t > 0) { c.globalAlpha = Math.min(1, pg.t); dot(pg.x, pg.z, pg.team === 'A' ? fr : en, 4.5); c.globalAlpha = 1; } }
    this.pings = this.pings.filter((x) => x.t > 0);
    for (const m of this.markers) if (m.mm !== false) { const [a, b] = toM(m.x, m.z); c.save(); c.translate(a, b); c.rotate(Math.PI / 4 - p.yaw); c.fillStyle = m.cls === 'buy' ? '#7ee0a0' : m.cls === 'loot' ? '#ddd' : '#ffb02e'; const r = (m.cls === 'loot' ? 3 : 5) / zoom; c.fillRect(-r, -r, r * 2, r * 2); c.restore(); }
    c.restore();
    // player arrow + view cone
    c.fillStyle = 'rgba(255,255,255,.1)'; c.beginPath(); c.moveTo(W / 2, W / 2); c.arc(W / 2, W / 2, W * 0.45, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(W / 2, W / 2 - 9); c.lineTo(W / 2 + 6, W / 2 + 7); c.lineTo(W / 2, W / 2 + 3); c.lineTo(W / 2 - 6, W / 2 + 7); c.fill();
  }
  buildBar(on, sel) { const b = $('#build'); b.classList.toggle('hide', !on); if (on) b.innerHTML = ['wall', 'floor', 'ramp'].map((k, i) => `<div class="${sel === k ? 'on' : ''}">${k.toUpperCase()}<br><span style="opacity:.6">${this.keyName(k)}</span></div>`).join(''); }
  clearTransient() { $('#killfeed').innerHTML = ''; $('#comms').innerHTML = ''; $('#barks').innerHTML = ''; this.barkEls = []; this.pings = []; this.markers = []; $('#markers').innerHTML = ''; this.markEls = []; $('#banner').classList.remove('on'); $('.tip', this.el).classList.remove('on'); this.objWorld = null; this.modeTop(''); this.objective('', ''); }
}
export function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
