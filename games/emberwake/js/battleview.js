// Emberwake — battle presentation. The pure Battle sim decides; this file stages it: a regional diorama,
// side-on sprites (party right, foes left), a readable turn strip, shields + weakness icons, Boost pips,
// timed-press rings (attack bonus / block), damage numbers, Break shatter, victory + level-up screens.
// FABLE: battle choreography — every lunge/cast/hurt below is a placeholder tween; a keyed animation pass
// (wind-ups, follow-through, per-skill VFX timing, camera cuts) replaces them.
import * as THREE from 'three/webgpu';
import { Battle, MAX_BP, MAX_BOOST, applyRewards } from './battle.js';
import { HEROES, SKILLS, ITEMS, ENEMIES, TYPES, TIMING, DIFFICULTY, GROUPS } from './data.js';
import { MAPS } from './maps.js';
import { CAST } from './story.js';
import { Actor, spriteLight } from './actors.js';
import { buildWorld } from './world.js';
import { U } from './render.js';
import { I } from './input.js';
import { tween, ease, shake, flash, settings } from '/shared/sd-kit.js';
import { typeIcon, portrait } from './ui.js';
import { count } from './rules.js';

const X0 = 300, Z0 = 0;
const PARTY_POS = [[16.6, 7.5], [17.7, 8.9], [18.8, 10.3]];
const FOE_POS = [[7.4, 8.4], [5.2, 6.8], [5.4, 10.4], [3.2, 8.6]];
const BOSS_POS = [6.2, 8.2];
const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export class BattleView {
  constructor(app) {
    this.app = app; this.root = new THREE.Group(); this.root.position.set(X0, 0, Z0); app.scene.add(this.root); this.root.visible = false;
    document.body.insertAdjacentHTML('beforeend', `<div id="battle" class="ew hidden"><div class="turns"></div><div class="bmsg"></div><div class="tags"></div><div class="pops"></div>
      <div class="party panel"></div><div class="cmd panel hidden"></div><div class="sub panel hidden"></div><div class="tip hidden"></div><div class="ring hidden"><i></i><b></b></div>
      <div class="boostbtns"><button class="bb" data-d="-1" aria-label="Less boost">−</button><span>BOOST</span><button class="bb" data-d="1" aria-label="More boost">+</button></div></div>`);
    this.el = document.getElementById('battle');
    this.q = (s) => this.el.querySelector(s);
    this.el.querySelectorAll('.bb').forEach((b) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.adjBoost(+b.dataset.d); }));
    this.el.addEventListener('pointerdown', (e) => { if (this.ringActive && !e.target.closest('.panel')) { e.preventDefault(); this.ringPress = true; } });
  }
  get sp() { return this.app.fast ? 1000 : this.app.opts.battleSpeed || 1; }
  wait(s) { if (this.app.fast) return Promise.resolve(); return tween(s / this.sp, () => {}); }
  scr(x, y, z) { const v = new THREE.Vector3(x + X0, y, z + Z0).project(this.app.camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; }
  aScr(a, dy = 0.5) { return this.scr(a.px, a.py + a.actor.h * dy, a.pz); }

  // ------------------------------------------------------------------ setup / teardown
  async run(group, opts = {}) {
    const A = this.app, s = A.s, ids = GROUPS[group];
    const region = MAPS[s.map]?.region || 'field';
    this.group = group; this.opts = opts; this.tut = !!opts.tut; this.tutStep = {};
    this.b = new Battle(s, ids, { preemptive: opts.preemptive, boss: opts.boss });
    // stage
    for (const c of [...this.root.children]) { this.root.remove(c); c.traverse?.((o) => o.geometry?.dispose()); }
    const st = this.stage = buildWorld('stage_' + region, s.flags); this.root.add(st.group);
    this.lights = st.lights.map((l) => ({ ...l, x: l.x + X0, z: l.z + Z0 }));
    A.lighting.apply(MAPS['stage_' + region].light === 'night' && s.flags.boss3 ? 'dawn' : MAPS['stage_' + region].light);
    spriteLight.value = { cave: 0.6, crystal: 0.6, night: 0.55 }[MAPS['stage_' + region].light] ?? 0.38;
    A.fx.setFlames(st.flames.map(([x, y, z, k, t]) => [x + X0, y, z + Z0, k, t]));
    A.fx.setAmbient(null);
    // actors
    this.units = new Map();
    this.b.party().forEach((u, i) => this.addUnit(u, PARTY_POS[i]));
    this.b.enemies().forEach((u) => this.addUnit(u, this.b.boss && ids.length === 1 ? BOSS_POS : FOE_POS[u.slot]));
    this.boost = 0; this.ui();
    this.el.classList.remove('hidden'); A.field.root.visible = false; this.root.visible = true;
    this.cam = { x: 12, z: 8.6, y: 1.1, dist: this.b.boss ? 16.5 : 14.5, pitch: 0.36, t: 0 };
    this.updateCamera(0, true);
    // entrance
    for (const v of this.units.values()) { const dx = v.u.side === 'party' ? 4 : -4; const tx = v.px; v.px += dx; tween(0.55 / Math.min(this.sp, 2), (k) => (v.px = tx + dx * (1 - k)), { ease: ease.outCubic }); }
    await this.wait(0.5);
    if (opts.preemptive) { await this.msg('First strike! Your party moves first, and every foe\'s guard is shaken.'); for (const e of this.b.enemies()) e.shield = Math.max(1, e.shield - 1); this.ui(); }
    if (this.b.boss) await this.msg(`${this.b.enemies()[0].name}!`, 1.2);
    // FABLE: per-region battle music starts here (boss themes for boss1–3)
    const result = await this.loop();
    return result;
  }
  addUnit(u, pos) {
    let actor;
    if (u.side === 'party') { actor = new Actor({ look: CAST[u.id].look, key: u.id, scale: 1.12 }); }
    else { actor = new Actor({ monster: ENEMIES[u.id].sprite, scale: 1.05 }); }
    actor.tilt(0.36); this.root.add(actor.group);
    const v = { u, actor, px: pos[0], pz: pos[1], py: 0, hx: pos[0], hz: pos[1], bob: Math.random() * 6, flashT: 0, fly: ['thornbat', 'moth', 'shade', 'lamp', 'eel'].includes(ENEMIES[u.id]?.sprite) };
    if (u.side === 'party') actor.pose = 'idle0';
    this.units.set(u.uid, v); this.syncActor(v); return v;
  }
  end() {
    this.el.classList.add('hidden'); this.root.visible = false; this.app.field.root.visible = true;
    for (const v of this.units?.values() || []) v.actor.dispose();
    this.q('.tags').innerHTML = ''; this.q('.pops').innerHTML = '';
  }

  // ------------------------------------------------------------------ main loop
  async loop() {
    const b = this.b;
    while (!b.over) {
      const u = b.current(); if (!u) break;
      b.beginTurn(u); this.active = u.uid; this.ui();
      if (u.side === 'party') {
        const act = this.app.auto ? b.autoAction(u) : await this.command(u);
        if (!act) continue;
        if (act.kind === 'flee') { const ev = b.resolve({ ...act, actor: u.uid }); const e = ev[0]; await this.msg(e.ok ? 'You slip away!' : e.boss ? 'There is no escaping this fight!' : 'Couldn\'t get away!', 0.9); if (e.ok) { for (const v of this.units.values()) if (v.u.side === 'party') tween(0.5, (k) => (v.px = v.hx + k * 6)); await this.wait(0.5); break; } }
        else await this.partyAct(u, act);
      } else await this.enemyAct(u);
      b.endTurn(u); this.ui();
      await this.wait(0.12);
    }
    this.active = null; this.q('.cmd').classList.add('hidden'); this.q('.sub').classList.add('hidden');
    return b.over || 'fled';
  }

  // ------------------------------------------------------------------ party command menu
  command(u) {
    const A = this.app, ui = A.ui, b = this.b;
    this.boost = 0; this.cmdUnit = u;
    if (this.tut && !this.tutStep.cmd) { this.tutStep.cmd = 1; this.tip('<b>Your turn.</b> Pick <b>Attack</b>. Each foe shows a <b>shield</b> number and its weaknesses (<b>?</b> until found). Hit a weakness to chip the shield.'); }
    if (this.tut && u.bp >= 2 && !this.tutStep.boost) { this.tutStep.boost = 1; this.tip('You have <b>Boost Points</b> (the glowing pips). Press <b>R / RB / +</b> to spend up to 3 — an attack then strikes extra times, a skill hits much harder.'); }
    return new Promise((res) => {
      const cmd = this.q('.cmd'); const skills = u.skills.map((k) => SKILLS[k]);
      const items = Object.keys(A.s.inv).filter((k) => ITEMS[k] && ITEMS[k].kind !== 'key');
      cmd.innerHTML = `<div class="who">${esc(u.name)}</div>
        <button class="mi" data-c="attack">${typeIcon(u.weapon)} Attack</button><button class="mi" data-c="skills" ${skills.length ? '' : 'disabled'}>✦ Skills</button>
        <button class="mi" data-c="items" ${items.length ? '' : 'disabled'}>❖ Items</button><button class="mi" data-c="defend">⛨ Defend <small>+1 BP</small></button><button class="mi" data-c="flee">↶ Flee</button>`;
      cmd.classList.remove('hidden'); this.boostVisible(true);
      const done = (a) => { ui.pop(); cmd.classList.add('hidden'); this.q('.sub').classList.add('hidden'); this.boostVisible(false); this.clearTarget(); res(a); };
      const P = ui.push({ el: cmd, onCancel: false, onBoost: (d) => this.adjBoost(d) });
      cmd.querySelectorAll('.mi').forEach((btn) => (btn.onclick = async () => {
        const c = btn.dataset.c;
        if (c === 'attack') { const t = await this.pickTarget('enemy'); if (t != null) done({ kind: 'attack', actor: u.uid, target: t, boost: this.boost }); }
        else if (c === 'defend') done({ kind: 'defend', actor: u.uid });
        else if (c === 'flee') done({ kind: 'flee', actor: u.uid });
        else if (c === 'skills') { const k = await this.subList(u, 'skills'); if (k) { const sk = SKILLS[k]; const t = await this.pickTarget(sk.target); if (t !== null) done({ kind: 'skill', actor: u.uid, skill: k, target: t, boost: this.boost }); } }
        else if (c === 'items') { const k = await this.subList(u, 'items'); if (k) { const it = ITEMS[k]; const t = await this.pickTarget(it.kind === 'bomb' ? 'enemies' : it.kind === 'healall' ? 'allies' : it.kind === 'revive' ? 'koally' : 'ally'); if (t !== null) done({ kind: 'item', actor: u.uid, item: k, target: t, boost: 0 }); } }
      }));
      ui.focus(P);
      this._cmdDone = done;
    });
  }
  subList(u, kind) {
    const ui = this.app.ui, sub = this.q('.sub'), s = this.app.s;
    return new Promise((res) => {
      if (kind === 'skills') sub.innerHTML = u.skills.map((k) => { const sk = SKILLS[k]; const ok = u.mp >= sk.mp; return `<button class="mi row ${ok ? '' : 'dim'}" data-k="${k}" ${ok ? '' : 'disabled'}><span>${sk.type in TYPES ? typeIcon(sk.type) : '<i class="ty ty-sup">✦</i>'} ${esc(sk.name)}</span><span class="n">${sk.mp} MP</span></button>`; }).join('') + '<div class="desc"></div>';
      else sub.innerHTML = Object.keys(s.inv).filter((k) => ITEMS[k] && ITEMS[k].kind !== 'key').map((k) => `<button class="mi row" data-k="${k}"><span>${ITEMS[k].type ? typeIcon(ITEMS[k].type) : '<i class="ty ty-sup">❖</i>'} ${esc(ITEMS[k].name)}</span><span class="n">×${s.inv[k]}</span></button>`).join('') + '<div class="desc"></div>';
      sub.classList.remove('hidden');
      const fin = (k) => { ui.pop(); sub.classList.add('hidden'); res(k); };
      const P = ui.push({ el: sub, onCancel: () => fin(null), onBoost: (d) => this.adjBoost(d), onFocus: (it) => { sub.querySelector('.desc').textContent = (kind === 'skills' ? SKILLS : ITEMS)[it.dataset.k]?.desc || ''; } });
      sub.querySelectorAll('.mi').forEach((b) => (b.onclick = () => fin(b.dataset.k)));
      ui.focus(P);
    });
  }
  // target picker: arrows cycle, confirm picks, tapping a sprite picks it. Returns uid, 0 for group targets, or null.
  pickTarget(kind) {
    const b = this.b, ui = this.app.ui;
    if (kind === 'enemies' || kind === 'allies' || kind === 'self' || kind === 'random') return this.confirmGroup(kind);
    const list = kind === 'enemy' ? b.alive('enemy') : kind === 'koally' ? b.party().filter((p) => p.hp <= 0) : b.alive('party');
    if (!list.length) { this.app.sfx.error?.(); return Promise.resolve(null); }
    return new Promise((res) => {
      const holder = document.createElement('div'); holder.className = 'pick';
      holder.innerHTML = list.map((u) => `<button class="mi tgt" data-u="${u.uid}" aria-label="${esc(u.name)}"></button>`).join(''); this.q('.tags').appendChild(holder);
      const place = () => holder.querySelectorAll('.tgt').forEach((el) => { const v = this.units.get(+el.dataset.u); const p = this.aScr(v, 0.55); el.style.transform = `translate(${p.x}px,${p.y}px)`; el.style.width = el.style.height = Math.max(54, v.actor.h * 26) + 'px'; });
      place(); this._placePick = place;
      const fin = (uid) => { ui.pop(); holder.remove(); this._placePick = null; this.clearTarget(); res(uid); };
      // default to the foe whose weakness you know and whose shield is lowest
      let idx = 0; if (kind === 'enemy') { let best = 1e9; list.forEach((u, i) => { const sc = (u.brokenUntil ? -10 : 0) + u.shield; if (sc < best) { best = sc; idx = i; } }); }
      const P = ui.push({ el: holder, idx, grid: 1, onCancel: () => fin(null), onBoost: (d) => this.adjBoost(d), onLR: (d) => { const L = ui.items(P); P.idx = (P.idx + d + L.length) % L.length; ui.focus(P); this.app.sfx.cursor?.(); }, onFocus: (it) => this.showTarget(+it.dataset.u) });
      holder.querySelectorAll('.tgt').forEach((el) => (el.onclick = () => fin(+el.dataset.u)));
      ui.focus(P);
    });
  }
  confirmGroup(kind) {
    const ui = this.app.ui;
    return new Promise((res) => {
      const holder = document.createElement('div'); holder.className = 'pick group'; holder.innerHTML = `<button class="mi tgtall">${kind === 'self' ? 'Use on self' : kind === 'allies' ? 'All allies' : kind === 'random' ? 'Random foes' : 'All foes'} — confirm</button>`; this.q('.tags').appendChild(holder);
      for (const v of this.units.values()) if ((kind === 'allies' || kind === 'self') ? v.u.side === 'party' && v.u.hp > 0 && (kind !== 'self' || v.u.uid === this.cmdUnit.uid) : v.u.side === 'enemy' && v.u.hp > 0) v.targeted = true;
      const fin = (ok) => { ui.pop(); holder.remove(); this.clearTarget(); res(ok ? 0 : null); };
      const P = ui.push({ el: holder, onCancel: () => fin(false), onBoost: (d) => this.adjBoost(d) });
      holder.querySelector('.mi').onclick = () => fin(true); ui.focus(P);
    });
  }
  showTarget(uid) { for (const v of this.units.values()) v.targeted = v.u.uid === uid; this.ui(); }
  clearTarget() { for (const v of this.units.values()) v.targeted = false; this.ui(); }
  adjBoost(d) { const u = this.cmdUnit; if (!u || !this.active) return; const nb = Math.max(0, Math.min(MAX_BOOST, u.bp, this.boost + d)); if (nb !== this.boost) { this.boost = nb; this.app.sfx.boost?.(nb); const v = this.units.get(u.uid); this.app.fx.burst('fire', v.px + X0, v.py + 0.8, v.pz + Z0, 6 * nb, { speed: 1.5, size: 0.1 }); } else this.app.sfx.error?.(); this.ui(); }
  boostVisible(on) { this.q('.boostbtns').classList.toggle('show', on); }

  // ------------------------------------------------------------------ timed press
  // ring closes over `dur`; press as it lands. Returns 0 miss · 1 good · 2 great. Early presses lock out (no mashing).
  timing(pos, dur, label) {
    const mode = this.app.opts.timing, A = this.app;
    if (A.fast || A.auto) return Promise.resolve(A.autoTiming ?? 1);
    const ring = this.q('.ring');
    ring.style.transform = `translate(${pos.x}px,${pos.y}px)`; ring.querySelector('b').textContent = label; ring.classList.remove('hidden', 'great', 'good', 'miss'); ring.classList.add('live');
    const D = DIFFICULTY[A.s.difficulty] || DIFFICULTY.normal, wide = (mode === 'wide' ? 1.8 : 1) * D.window;
    const great = TIMING.windowGreat * wide, good = TIMING.windowGood * wide;
    dur = Math.max(0.45, dur);
    I.take('confirm'); this.ringPress = false; this.ringActive = true;
    return new Promise((res) => {
      let t = 0, done = false; const inner = ring.querySelector('i');
      const fin = (q) => { if (done) return; done = true; this.ringActive = false; ring.classList.remove('live'); ring.classList.add(['miss', 'good', 'great'][q]); if (q === 2) A.s.stats.greats++; A.sfx[q === 2 ? 'great' : q === 1 ? 'good' : 'whiff']?.(); setTimeout(() => ring.classList.add('hidden'), 380); res(q); };
      tween(dur + good + 0.02, (k, raw) => {
        t = raw * (dur + good + 0.02);
        const r = Math.max(0, 1 - t / dur); inner.style.transform = `scale(${1 + r * 1.6})`; inner.style.opacity = String(0.35 + 0.65 * (1 - r));
        if (mode === 'auto' && t >= dur) fin(2);
        if (I.take('confirm') || this.ringPress) { this.ringPress = false; const e = Math.abs(t - dur); fin(e <= great ? 2 : e <= good ? 1 : 0); }
      }, { ease: (x) => x }).then(() => fin(0));
    });
  }

  // ------------------------------------------------------------------ party action choreography
  async partyAct(u, a) {
    const b = this.b, v = this.units.get(u.uid), A = this.app;
    const sk = a.kind === 'skill' ? SKILLS[a.skill] : null, it = a.kind === 'item' ? ITEMS[a.item] : null;
    const name = sk ? sk.name : it ? it.name : a.kind === 'defend' ? 'Defend' : null;
    if (a.boost) { await this.msg(`Boost ×${a.boost}!`, 0.45); A.sfx.boostGo?.(); this.app.fx.burst('fire', v.px + X0, v.py + 0.9, v.pz + Z0, 24, { speed: 2 }); }
    if (name && a.kind !== 'defend') this.msg(name, 0.9);
    let timing = 0, ev;
    if (a.kind === 'defend') { v.actor.pose = 'guard'; A.sfx.guard?.(); ev = b.resolve(a); this.app.fx.ring('gold', v.px + X0, v.py + 0.1, v.pz + Z0, 0.8); await this.wait(0.35); }
    else if (a.kind === 'attack' || (sk && sk.target === 'enemy' && ['blade', 'blunt', 'pierce'].includes(sk.type))) {
      const tv = this.units.get(this.b.retarget(a.target)?.uid) || [...this.units.values()].find((x) => x.u.side === 'enemy' && x.u.hp > 0);
      v.actor.pose = 'ready'; A.sfx.dash?.();
      const sx = v.px, sz = v.pz, tx = tv.px + (tv.actor.w * 0.4 + 0.9), tz = tv.pz + 0.15;
      const run = tween(0.42 / this.sp, (k) => { v.px = sx + (tx - sx) * k; v.pz = sz + (tz - sz) * k; }, { ease: ease.inOutCubic });
      timing = await this.timing(this.aScr(tv, 0.5), 0.42 / this.sp + 0.25, a.boost ? `×${a.boost + 1}` : '');
      await run;
      v.actor.pose = 'attack';
      ev = b.resolve(a, { timing });
      await this.playHits(ev, v);
      await this.wait(0.15);
      v.actor.pose = 'ready';
      await tween(0.3 / this.sp, (k) => { v.px = tx + (sx - tx) * k; v.pz = tz + (sz - tz) * k; }, { ease: ease.inOutCubic });
    } else {
      // casts, heals, buffs, items
      v.actor.pose = 'cast'; A.sfx.cast?.(sk?.type);
      const ty = sk?.type in TYPES ? sk.type : it?.type || (sk?.type === 'heal' || sk?.type === 'revive' || it ? 'heal' : 'gold');
      for (let i = 0; i < 3; i++) this.app.fx.burst(ty, v.px + X0, v.py + 1.4, v.pz + Z0, 6, { speed: 0.8, up: 2, g: 0 });
      const offensive = sk ? sk.power && !['heal'].includes(sk.type) : it?.kind === 'bomb';
      if (offensive) {
        const tv = this.units.get(a.target) || [...this.units.values()].find((x) => x.u.side === 'enemy' && x.u.hp > 0);
        timing = await this.timing(this.aScr(tv, 0.5), 0.7 / this.sp + 0.2, a.boost ? `×${1 + 0.6 * a.boost}` : '');
      } else await this.wait(0.45);
      ev = b.resolve(a, { timing });
      await this.playHits(ev, v);
      await this.wait(0.2);
    }
    v.actor.pose = u.hp > 0 ? (a.kind === 'defend' ? 'guard' : 'idle0') : 'ko';
    if (this.tut && ev.some((e) => e.reveal) && !this.tutStep.weak) { this.tutStep.weak = 1; await this.tipWait('<b>Weakness found!</b> Weak hits deal more damage and knock a point off the foe\'s <b>shield</b>. Empty it to <b>BREAK</b> them: they lose their next turn and take heavy damage.'); }
    if (this.tut && ev.some((e) => e.broke) && !this.tutStep.brk) { this.tutStep.brk = 1; await this.tipWait('<b>BREAK!</b> A broken foe skips turns and takes ×1.6 damage. Pour your Boost into it now.'); }
  }
  async enemyAct(u) {
    const b = this.b, v = this.units.get(u.uid), A = this.app;
    if (u.brokenUntil) return;
    const plan = b.enemyPlan(u);
    if (plan.kind === 'charge') { const ev = b.resolve(plan); A.sfx.charge?.(); v.charging = true; this.app.fx.burst('shadow', v.px + X0, v.py + 1, v.pz + Z0, 30, { speed: 1.5, up: 1 }); await this.msg(ev[0]?.tell || `${u.name} gathers power…`, 1.6); if (!this.tutStep.charge) { this.tutStep.charge = 1; this.tip('<b>A big attack is coming next round.</b> Break this foe\'s shield before it acts to cancel it — or Defend to halve the blow.'); } this.ui(); return; }
    const act = plan.act;
    if (this.tut && !this.tutStep.block) { this.tutStep.block = 1; await this.tipWait('Enemies attack too. When the <b>!</b> ring closes on your hero, press <b>A / Enter / tap</b> to <b>Block</b> and take much less damage.'); }
    this.msg(act.name, 0.9);
    const targets = (plan.targets || []).map((id) => this.units.get(id)).filter(Boolean);
    let block = {};
    if (act.summon || act.buff) { A.sfx.cast?.(); this.app.fx.burst(act.summon ? 'heal' : 'gold', v.px + X0, v.py + 1, v.pz + Z0, 20); await this.wait(0.5); }
    else if (act.debuff) { A.sfx.cast?.(); await this.wait(0.5); }
    else {
      const phys = act.kind === 'phys' && act.target !== 'all';
      const t0 = targets[0];
      const sx = v.px, sz = v.pz;
      let run = null;
      if (phys && t0) { const tx = t0.px - (v.actor.w * 0.4 + 0.8), tz = t0.pz; run = tween(0.45 / this.sp, (k) => { v.px = sx + (tx - sx) * k; v.pz = sz + (tz - sz) * k; }, { ease: ease.inOutCubic }); A.sfx.dash?.(); }
      else { v.charging = false; A.sfx.cast?.(act.type); for (let i = 0; i < 3; i++) this.app.fx.burst(act.type in TYPES ? act.type : 'shadow', v.px + X0, v.py + 1.2, v.pz + Z0, 8, { speed: 1.2, g: 0 }); }
      const pos = act.target === 'all' ? this.scr(PARTY_POS[1][0], 1.2, PARTY_POS[1][1]) : this.aScr(t0 || targets[0], 0.5);
      const q = await this.timing(pos, (phys ? 0.45 : 0.75) / this.sp + 0.2, 'BLOCK');
      if (run) await run;
      for (const t of targets) block[t.u.uid] = q;
      if (q && this.tut) this.tutStep.blocked = 1;
    }
    v.charging = false;
    const ev = b.resolve(plan, { block });
    await this.playHits(ev, v);
    if (Math.abs(v.px - v.hx) > 0.05) { const sx = v.px, sz = v.pz; await tween(0.3 / this.sp, (k) => { v.px = sx + (v.hx - sx) * k; v.pz = sz + (v.hz - sz) * k; }); }
  }
  // apply the sim's events to the stage
  async playHits(ev, src) {
    const A = this.app;
    for (const e of ev) {
      if (e.t === 'hit') {
        const v = this.units.get(e.dst); if (!v) continue;
        const ty = e.type in TYPES ? e.type : 'blade';
        this.app.fx.burst(ty, v.px + X0, v.py + v.actor.h * 0.5, v.pz + Z0, e.weak ? 26 : 14, { speed: e.weak ? 3.5 : 2.4 });
        v.flashT = 0.12; v.knock = (v.u.side === 'party' ? 1 : -1) * (e.weak ? 0.35 : 0.2);
        if (v.u.side === 'party') { v.actor.pose = 'hurt'; setTimeout(() => { if (v.u.hp > 0 && v.actor.pose === 'hurt') v.actor.pose = 'idle0'; }, 380 / Math.min(this.sp, 3)); }
        A.sfx.hit?.(e.weak, ty); shake(e.weak || e.broke ? 0.14 : 0.07);
        this.pop(v, e.amt, e.weak ? 'weak' : e.block === 2 ? 'blocked' : e.block === 1 ? 'guard' : v.u.side === 'party' ? 'hurt' : '', e.weak ? 'WEAK' : e.block === 2 ? 'BLOCK!' : e.block === 1 ? 'Guard' : e.timing === 2 ? 'GREAT' : e.timing === 1 ? 'Good' : '');
        if (e.reveal) this.popText(v, `${TYPES[e.reveal].name} weakness!`, 'reveal');
        if (e.broke) { await this.breakFX(v, e.cancel); }
        this.ui();
        await this.wait(e.aoe ? 0.08 : 0.22);
      } else if (e.t === 'heal' || e.t === 'revive' || e.t === 'mp') {
        const v = this.units.get(e.dst); if (!v) continue; this.app.fx.burst('heal', v.px + X0, v.py + 0.6, v.pz + Z0, 18, { up: 2.5, g: 0.5 }); A.sfx.heal?.();
        this.pop(v, e.amt, e.t === 'mp' ? 'mp' : 'heal', e.t === 'revive' ? 'REVIVE' : ''); if (e.t === 'revive') v.actor.pose = 'idle0'; this.ui(); await this.wait(0.15);
      } else if (e.t === 'buff') { const v = this.units.get(e.dst); if (v) { const up = Object.entries(e.buff).filter(([k]) => k !== 'turns').map(([k, m]) => `${k.toUpperCase()} ${m > 1 ? '▲' : '▼'}`).join(' '); this.popText(v, up, Object.values(e.buff).some((m) => m < 1 && m > 0) ? 'debuff' : 'buff'); } A.sfx.buff?.(); await this.wait(0.12); }
      else if (e.t === 'ko') { const v = this.units.get(e.dst); if (!v) continue; A.sfx.ko?.(v.u.side); if (v.u.side === 'enemy') { this.app.fx.burst('shadow', v.px + X0, v.py + v.actor.h * 0.4, v.pz + Z0, 30, { speed: 1.8, up: 2 }); tween(0.6 / Math.min(this.sp, 2), (k) => { v.actor.uAlpha.value = 1 - k; v.sink = k * 0.4; }); } else v.actor.pose = 'ko'; await this.wait(0.25); }
      else if (e.t === 'summon') { const u = this.b.unit(e.unit); const nv = this.addUnit(u, FOE_POS[e.slot] || FOE_POS[3]); nv.actor.uAlpha.value = 0; tween(0.5, (k) => (nv.actor.uAlpha.value = k)); this.app.fx.burst('heal', nv.px + X0, 0.5, nv.pz + Z0, 20); await this.wait(0.4); }
      else if (e.t === 'phase') { const v = this.units.get(e.dst); flash('#ffffff', 300, 0.7); shake(0.3); A.sfx.phase?.(); this.app.fx.burst('shadow', v.px + X0, v.py + 1.5, v.pz + Z0, 60, { speed: 3, up: 3 }); v.actor.group.visible = false; const old = v.actor; const nv = new Actor({ monster: ENEMIES[v.u.id].sprite, scale: 1.05 }); nv.tilt(0.36); this.root.add(nv.group); v.actor = nv; old.group.removeFromParent(); old.dispose(); await this.msg(`${e.name}!`, 1.4); await this.app.ui.say('morrowOld', 'Enough. If you will not let it rest, then let the Long Night take ME instead!'); }
      else if (e.t === 'covered') { const v = this.units.get(e.src); if (v) { this.popText(v, 'Cover!', 'buff'); A.sfx.guard?.(); } }
      else if (e.t === 'cover') { const v = this.units.get(e.src); if (v) { v.actor.pose = 'guard'; this.app.fx.ring('gold', v.px + X0, 0.1, v.pz + Z0, 1); } }
      else if (e.t === 'defend') { this.ui(); }
      else if (e.t === 'msg') await this.msg(e.text, 0.8);
    }
    this.ui();
  }
  async breakFX(v, cancel) {
    const A = this.app; A.sfx.break?.(); flash('#ffe8c0', 160, 0.45); shake(0.22);
    this.app.fx.burst('break', v.px + X0, v.py + v.actor.h * 0.55, v.pz + Z0, 48, { speed: 5, up: 3, size: 0.18 });
    const el = document.createElement('div'); el.className = 'breaktxt'; el.textContent = 'BREAK!'; const p = this.aScr(v, 0.6); el.style.transform = `translate(${p.x}px,${p.y}px)`; this.q('.pops').appendChild(el); setTimeout(() => el.remove(), 1300);
    // FABLE: break choreography — hit-stop, slow-mo zoom on the shattered foe, shield-glass shards flying
    await this.wait(0.35);
    if (cancel) await this.msg(`${v.u.name}'s attack is broken off!`, 1.0);
  }

  // ------------------------------------------------------------------ HUD
  ui() {
    const b = this.b, s = this.app.s;
    // party panel
    this.q('.party').innerHTML = b.party().map((u) => { const act = u.uid === this.active; const bp = Array.from({ length: MAX_BP }, (_, i) => `<i class="${i < u.bp ? (act && i >= u.bp - this.boost ? 'spend' : 'on') : ''}"></i>`).join(''); return `<div class="pr ${act ? 'act' : ''} ${u.hp <= 0 ? 'ko' : ''} ${this.units.get(u.uid)?.targeted ? 'tgt' : ''}"><img src="${portrait(u.id)}" alt=""><div class="pn">${u.name}${u.buffs.length ? ' <small>' + u.buffs.map((x) => Object.keys(x).filter((k) => k !== 'turns').map((k) => k + (x[k] > 1 ? '▲' : '▼')).join('')).join(' ') + '</small>' : ''}${u.defending ? ' <small>⛨</small>' : ''}</div><div class="bars"><div class="bar hp ${u.hp < u.mhp * 0.3 ? 'low' : ''}"><i style="width:${u.hp / u.mhp * 100}%"></i><span>${u.hp}</span></div><div class="bar mp"><i style="width:${u.mmp ? u.mp / u.mmp * 100 : 0}%"></i><span>${u.mp}</span></div></div><div class="bp">${bp}</div></div>`; }).join('');
    // enemy tags
    const tags = this.q('.tags'); let holder = tags.querySelector('.etags'); if (!holder) { holder = document.createElement('div'); holder.className = 'etags'; tags.prepend(holder); }
    holder.innerHTML = b.units.filter((u) => u.side === 'enemy' && !u.gone && u.hp > 0).map((u) => `<div class="etag ${u.brokenUntil ? 'broken' : ''} ${this.units.get(u.uid)?.targeted ? 'tgt' : ''} ${u.charge ? 'charging' : ''}" data-u="${u.uid}"><div class="en">${esc(u.name)}</div><div class="ehp"><i style="width:${u.hp / u.mhp * 100}%"></i></div><div class="erow"><span class="shield">${u.brokenUntil ? '✕' : u.shield}</span>${u.weak.map((t) => (u.known.has(t) ? typeIcon(t) : typeIcon('unknown'))).join('')}</div>${u.charge ? `<div class="warn">⚠ ${esc(u.charge.name)}</div>` : ''}${u.brokenUntil ? '<div class="warn brk">BROKEN</div>' : ''}</div>`).join('');
    this.placeTags();
    // turn strip
    const q = b.queue(10);
    this.q('.turns').innerHTML = q.map((x, i) => { const u = b.unit(x.uid); const prev = q[i - 1]; return `${prev && prev.round !== x.round ? '<span class="nx">NEXT</span>' : ''}<span class="tk ${u.side} ${i === 0 ? 'now' : ''} ${x.skip ? 'skip' : ''}">${u.side === 'party' ? `<img src="${portrait(u.id)}" alt="">` : `<b>${esc(u.name.replace(/^The /, '').slice(0, 2))}</b>`}</span>`; }).join('');
  }
  placeTags() {
    this.q('.tags').querySelectorAll('.etag').forEach((el) => { const v = this.units.get(+el.dataset.u); if (!v) return; const p = this.scr(v.px, v.py - 0.05, v.pz + 0.4); el.style.transform = `translate(${Math.round(p.x)}px,${Math.round(p.y)}px)`; });
  }
  pop(v, amt, cls, label) { const el = document.createElement('div'); el.className = 'dmg ' + cls; el.innerHTML = `${label ? `<small>${label}</small>` : ''}${amt}`; const p = this.aScr(v, 0.75); el.style.transform = `translate(${p.x + (Math.random() - 0.5) * 30}px,${p.y}px)`; this.q('.pops').appendChild(el); setTimeout(() => el.remove(), 1100); }
  popText(v, t, cls) { const el = document.createElement('div'); el.className = 'dmg txt ' + cls; el.textContent = t; const p = this.aScr(v, 1.05); el.style.transform = `translate(${p.x}px,${p.y}px)`; this.q('.pops').appendChild(el); setTimeout(() => el.remove(), 1300); }
  msg(t, dur = 1.0) { const el = this.q('.bmsg'); el.textContent = t; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); clearTimeout(this._mt); this._mt = setTimeout(() => el.classList.remove('show'), (dur * 1000) / Math.min(this.sp, 2) + 300); return this.wait(dur * 0.6); }
  tip(html) { const el = this.q('.tip'); el.innerHTML = html; el.classList.remove('hidden'); clearTimeout(this._tt); this._tt = setTimeout(() => el.classList.add('hidden'), 9000); }
  tipWait(html) {
    if (this.app.fast || this.app.auto) return Promise.resolve();
    const el = this.q('.tip'); el.innerHTML = html + '<div class="ok">▶ ' + this.app.ui.keyGlyph() + '</div>'; el.classList.remove('hidden'); clearTimeout(this._tt);
    return new Promise((res) => { const ui = this.app.ui; const P = ui.push({ el, sel: '.ok', onCancel: () => { ui.pop(); el.classList.add('hidden'); res(); } }); el.querySelector('.ok').classList.add('mi'); ui.refresh(P); el.querySelector('.ok').onclick = () => { ui.pop(); el.classList.add('hidden'); res(); }; });
  }

  // ------------------------------------------------------------------ per-frame
  update(dt, t) {
    if (!this.root.visible) return;
    for (const v of this.units.values()) {
      v.bob += dt; v.flashT -= dt; v.actor.uFlash.value = v.flashT > 0 ? 1 : 0;
      v.knock = (v.knock || 0) * Math.exp(-dt * 10);
      const broken = v.u.brokenUntil;
      v.actor.uTint.value.setRGB(broken ? 0.62 : 1, broken ? 0.66 : 1, broken ? 0.85 : 1);
      if (v.u.side === 'enemy') { v.actor.setFrame(v.flashT > 0 ? 3 : v.charging || v.u.charge ? 2 : Math.floor(v.bob * 2.2) % 2, false); }
      else if (v.u.hp > 0 && (v.actor.pose === 'idle0' || v.actor.pose === 'idle1')) v.actor.pose = Math.floor(v.bob * 1.6) % 2 ? 'idle1' : 'idle0';
      if (v.u.side === 'party') v.actor.animate(dt);
      const fly = v.fly ? 0.45 + Math.sin(v.bob * 3) * 0.12 : 0;
      v.py = fly - (v.sink || 0);
      v.actor.group.position.set(v.px + v.knock, v.py, v.pz);
      v.actor.shadow.position.y = 0.03 - v.py;
      if (v.u.charge && Math.random() < dt * 20) this.app.fx.burst('shadow', v.px + X0 + (Math.random() - 0.5) * v.actor.w * 0.6, v.py + Math.random() * v.actor.h * 0.6, v.pz + Z0, 1, { speed: 0.3, up: 1, g: -0.5 });
      if (broken && Math.random() < dt * 8) this.app.fx.burst('gold', v.px + X0 + Math.sin(t * 5) * 0.4, v.py + v.actor.h * 0.95, v.pz + Z0 + Math.cos(t * 5) * 0.2, 1, { speed: 0.2, up: 0.2, g: 0, life: 0.4 });
    }
    this.placeTags(); this._placePick?.();
    this.updateCamera(dt);
    this.app.lighting.assign(this.lights, this.cam.x + X0, this.cam.z, null);
  }
  updateCamera(dt, snap) {
    const C = this.cam, cam = this.app.camera; C.t += dt;
    const portrait = this.app.aspect < 1;
    // gently lean toward whoever is acting
    const act = this.active && this.units.get(this.active); const lx = act ? (act.px - 12) * 0.12 : 0;
    const tx = 12 + lx; C.x += (tx - C.x) * (snap ? 1 : 1 - Math.exp(-dt * 2));
    const dist = C.dist * (portrait ? 1.25 : 1), br = settings.reducedMotion ? 0 : Math.sin(C.t * 0.4) * 0.15;
    cam.fov = portrait ? 52 : 30; cam.aspect = this.app.aspect; cam.updateProjectionMatrix();
    cam.position.set(C.x + X0 + br, C.y + Math.sin(C.pitch) * dist, C.z + Z0 + Math.cos(C.pitch) * dist);
    cam.lookAt(C.x + X0, C.y, C.z + Z0);
    this.app.lighting.follow(C.x + X0, C.z + Z0);
    U.focusY.value = 0.52; U.focusBand.value = 0.26; U.playerViewZ.value = -999;
  }

  // ------------------------------------------------------------------ victory
  async victory() {
    const A = this.app, b = this.b; b.commit();
    const r = applyRewards(A.s, b);
    for (const v of this.units.values()) if (v.u.side === 'party' && v.u.hp > 0) v.actor.pose = 'victory';
    A.sfx.victory?.();
    // FABLE: victory fanfare + party victory animations
    const ups = r.ups.map((u) => `<div class="lv"><img src="${portrait(u.id)}" alt=""><b>${HEROES[u.id].name}</b> reached <b>Lv ${u.lv}</b>${u.learned.length ? ` — learned <b>${u.learned.map((k) => SKILLS[k].name).join(', ')}</b>` : ''}<small>${Object.entries(u.gains).filter(([, v]) => v).map(([k, v]) => `${k.toUpperCase()}+${v}`).join(' ')}</small></div>`).join('');
    const o = A.ui.openOverlay(`<div class="victory panel"><h2>Victory</h2><div class="rw"><span><b>${r.xp}</b> EXP</span><span><b>${r.gold}</b> gold</span></div>${r.drops.length ? `<div class="drops">Found: ${r.drops.map((d) => ITEMS[d].name).join(', ')}</div>` : ''}${ups}<button class="mi primary">Continue</button></div>`, 'vicwrap');
    if (A.fast || A.auto) { A.ui.closeOverlay(); return r; }
    await new Promise((res) => { const P = A.ui.push({ el: o, onCancel: () => { A.ui.pop(); res(); } }); o.querySelector('.mi').onclick = () => { A.ui.pop(); res(); }; A.ui.focus(P); });
    A.ui.closeOverlay();
    return r;
  }
}
