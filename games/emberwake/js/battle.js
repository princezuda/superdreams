// Emberwake — pure turn-based battle simulation (no DOM / three). The 3D view animates the events it returns.
// Systems: round-based speed order (current + next round always visible), Boost Points (BP, spend 1–3 to
// multiply an action), Shields + weaknesses (Break = lose turns + take ×1.6), timed presses (attack bonus /
// block), telegraphed charged attacks that a Break cancels, boss phase changes.
import { HEROES, SKILLS, ITEMS, ENEMIES, PHYS, DIFFICULTY, TIMING, BREAK_MULT, WEAK_MULT, TUNE } from './data.js';
import { heroStats, skillsFor, count, take, learnWeak, gainXP, give } from './rules.js';

export const MAX_BP = 5, MAX_BOOST = 3;
let UID = 1;

export function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function heroUnit(s, id) {
  const st = heroStats(s, id), h = s.heroes[id];
  return { uid: UID++, side: 'party', id, name: HEROES[id].name, hp: h.hp, mhp: st.hp, mp: h.mp, mmp: st.mp, st, bp: 1, buffs: [],
    weapon: HEROES[id].weapon, skills: skillsFor(id, h.lv), defending: false, cover: false, boostedLast: false };
}
function enemyUnit(s, id, diff, slot) {
  const E = ENEMIES[id], D = DIFFICULTY[diff];
  const known = new Set(s.bestiary[id]?.weak || []);
  const hp = Math.round(E.hp * D.ehp * (E.boss ? TUNE.bossHp : TUNE.hp));
  return { uid: UID++, side: 'enemy', id, name: E.name, hp, mhp: hp, mp: 0, mmp: 0, st: { atk: E.atk, mag: E.mag, def: E.def, res: E.res, spd: E.spd },
    shield: E.shield, mshield: E.shield, weak: E.weak.slice(), known, broken: 0, brokenUntil: 0, buffs: [], charge: null, boss: !!E.boss, slot, bp: 0 };
}

export class Battle {
  constructor(s, enemyIds, { rng = Math.random, preemptive = false, boss = false, assist = 'off' } = {}) {
    this.s = s; this.rng = rng; this.diff = DIFFICULTY[s.difficulty] || DIFFICULTY.normal; this.boss = boss || enemyIds.some((e) => ENEMIES[e].boss);
    this.units = s.party.map((id) => heroUnit(s, id));
    enemyIds.forEach((e, i) => this.units.push(enemyUnit(s, e, s.difficulty, i)));
    for (const e of this.enemies()) (s.bestiary[e.id] ||= { weak: [], seen: 0, kills: 0 }).seen++;
    if (preemptive) for (const p of this.party()) p.bp = 2;
    this.preemptive = preemptive; this.round = 0; this.order = []; this.idx = 0; this.nextOrder = this.rollOrder(preemptive);
    this.over = null; this.log = []; this.rewards = null; this.turns = 0;
    this.newRound();
  }
  party() { return this.units.filter((u) => u.side === 'party'); }
  enemies() { return this.units.filter((u) => u.side === 'enemy' && !u.gone); }
  alive(side) { return this.units.filter((u) => u.side === side && u.hp > 0 && !u.gone); }
  unit(uid) { return this.units.find((u) => u.uid === uid); }
  // buffs multiply a stat; Rally's `atk` buff powers both physical and elemental offence
  stat(u, k) { let v = u.st[k]; for (const b of u.buffs) { if (b[k]) v *= b[k]; else if (k === 'mag' && b.atk) v *= b.atk; } return v; }

  rollOrder(partyFirst = false) {
    // bosses with `turns: 2` appear twice per round (their second action is rolled separately)
    const list = [];
    for (const u of this.units) if (u.hp > 0 && !u.gone) for (let i = 0; i < (u.side === 'enemy' ? ENEMIES[u.id].turns || 1 : 1); i++) list.push({ uid: u.uid, k: u.st.spd * (0.85 + this.rng() * 0.3) * (i ? 0.7 : 1) + (partyFirst && u.side === 'party' ? 1000 : 0) });
    return list.sort((a, b) => b.k - a.k).map((x) => x.uid);
  }
  newRound() {
    this.round++; this.order = this.nextOrder; this.nextOrder = this.rollOrder(); this.idx = 0;
    for (const u of this.enemies()) if (u.brokenUntil && this.round > u.brokenUntil) { u.brokenUntil = 0; u.broken = 0; u.shield = u.mshield; this.log.push({ t: 'recover', dst: u.uid }); }
  }
  // living, non-broken unit whose turn it is (advances past skipped ones)
  current() {
    if (this.over) return null;
    for (let guard = 0; guard < 200; guard++) {
      if (this.idx >= this.order.length) this.newRound();
      const u = this.unit(this.order[this.idx]);
      if (!u || u.hp <= 0 || u.gone || (u.side === 'enemy' && u.brokenUntil)) { this.idx++; continue; }
      return u;
    }
    return null;
  }
  // upcoming turn strip for the HUD: [{uid, round}] current round remainder + next round
  queue(n = 10) {
    const out = [];
    for (let i = this.idx; i < this.order.length; i++) { const u = this.unit(this.order[i]); if (u && u.hp > 0 && !u.gone) out.push({ uid: u.uid, round: 0, skip: u.side === 'enemy' && !!u.brokenUntil }); }
    for (const id of this.nextOrder) { const u = this.unit(id); if (u && u.hp > 0 && !u.gone) out.push({ uid: u.uid, round: 1, skip: u.side === 'enemy' && u.brokenUntil >= this.round + 1 }); }
    return out.slice(0, n);
  }

  // start-of-turn bookkeeping. Returns events (BP gain, charge release warnings).
  beginTurn(u) {
    const ev = [];
    if (u.side === 'party') {
      u.defending = false; u.cover = false;
      if (u.bpGiven && !u.boostedLast && u.bp < MAX_BP) { u.bp++; ev.push({ t: 'bp', dst: u.uid, bp: u.bp }); }
      u.boostedLast = false; u.bpGiven = true;
    }
    return ev;
  }
  endTurn(u) {
    for (const b of u.buffs) b.turns--; u.buffs = u.buffs.filter((b) => b.turns > 0);
    this.idx++; this.turns++;
    this.checkEnd();
  }

  // ------------------------------------------------------------ enemy AI (pure)
  enemyPlan(u) {
    // a charged move is released on the unit's first action of a LATER round, so the party always gets a window to Break it
    if (u.charge && this.round > u.chargeRound) { const act = u.charge; return { kind: 'enemy', actor: u.uid, act, targets: this.pickTargets(act), released: true }; }
    const E = ENEMIES[u.id];
    let acts = E.acts.filter((a) => (!a.summon || this.enemies().filter((e) => e.hp > 0).length < 3) && !(a.charge && u.charge));
    const lowHp = u.hp < u.mhp * 0.5;
    const ws = acts.map((a) => a.w * (a.charge && lowHp ? 1.5 : 1));
    let r = this.rng() * ws.reduce((a, b) => a + b, 0), act = acts[0];
    for (let i = 0; i < acts.length; i++) { r -= ws[i]; if (r <= 0) { act = acts[i]; break; } }
    if (act.charge) return { kind: 'charge', actor: u.uid, act };
    return { kind: 'enemy', actor: u.uid, act, targets: this.pickTargets(act) };
  }
  pickTargets(act) {
    const al = this.alive('party'); if (!al.length) return [];
    if (act.target === 'all') return al.map((u) => u.uid);
    if (act.buff || act.summon) return [];
    if (act.debuff) return al.map((u) => u.uid);
    // slight preference for wounded targets (reads as a cunning enemy, never a death-spiral: capped)
    const w = al.map((u) => 1 + 0.6 * (1 - u.hp / u.mhp));
    let r = this.rng() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < al.length; i++) { r -= w[i]; if (r <= 0) return [al[i].uid]; }
    return [al[0].uid];
  }
  // party member who would intercept a single-target hit on `t`
  coverFor(t) { if (t.side !== 'party') return null; return this.alive('party').find((p) => p.cover && p.uid !== t.uid) || null; }

  // ------------------------------------------------------------ resolve an action → events
  // input.timing: 0 miss | 1 good | 2 great (party attacks); input.block: {uid: 0|1|2} (enemy attacks)
  resolve(a, input = {}) {
    const ev = [], u = this.unit(a.actor);
    if (!u || this.over) return ev;
    const D = this.diff;
    if (a.kind === 'defend') { u.defending = true; if (u.bp < MAX_BP) u.bp++; ev.push({ t: 'defend', dst: u.uid, bp: u.bp }); }
    else if (a.kind === 'flee') {
      const ps = this.alive('party'), es = this.alive('enemy');
      const avg = (l) => l.reduce((x, y) => x + y.st.spd, 0) / Math.max(1, l.length);
      const p = this.boss ? 0 : Math.max(0.35, Math.min(0.95, 0.6 + (avg(ps) - avg(es)) * 0.03));
      const ok = this.rng() < p; ev.push({ t: 'flee', ok, boss: this.boss }); if (ok) this.over = 'fled';
    } else if (a.kind === 'charge') {
      u.charge = a.act; u.chargeRound = this.round; ev.push({ t: 'charge', src: u.uid, name: a.act.name, tell: a.act.tell || `${u.name} is gathering power…` });
    } else if (a.kind === 'enemy') this.resolveEnemy(u, a, input, ev, D);
    else this.resolveParty(u, a, input, ev);
    this.log.push(...ev);
    this.checkEnd();
    return ev;
  }

  resolveParty(u, a, input, ev) {
    const boost = Math.max(0, Math.min(a.boost || 0, MAX_BOOST, u.bp));
    if (boost) { u.bp -= boost; u.boostedLast = true; ev.push({ t: 'boost', src: u.uid, n: boost }); }
    const timing = input.timing ?? 0;
    if (a.kind === 'attack') {
      const tgt = this.retarget(a.target);
      for (let i = 0; i < 1 + boost && tgt && tgt.hp > 0; i++) this.hit(u, tgt, { type: u.weapon, power: 10, kind: 'phys', timing, first: i === 0 }, ev);
      return;
    }
    if (a.kind === 'item') return this.useItem(u, a, ev, boost);
    if (a.kind !== 'skill') return;
    const sk = SKILLS[a.skill]; if (!sk || u.mp < sk.mp) { ev.push({ t: 'msg', text: 'Not enough MP.' }); return; }
    u.mp -= sk.mp; ev.push({ t: 'skill', src: u.uid, skill: a.skill, name: sk.name });
    const mult = 1 + 0.6 * boost;
    if (sk.type === 'heal') {
      const tg = sk.target === 'allies' ? this.alive('party') : sk.target === 'self' ? [u] : [this.unit(a.target)].filter((x) => x && x.hp > 0);
      for (const t of tg) { const amt = Math.round(((sk.flat || 0) + (sk.power || 0) / 10 * this.stat(u, 'mag') + (sk.pct || 0) * t.mhp) * mult * (0.95 + this.rng() * 0.1)); const before = t.hp; t.hp = Math.min(t.mhp, t.hp + amt); ev.push({ t: 'heal', dst: t.uid, amt: t.hp - before }); }
      if (sk.buff) this.addBuff(u, sk.buff, ev);
      return;
    }
    if (sk.type === 'revive') { const t = this.unit(a.target); if (t && t.side === 'party' && t.hp <= 0) { t.hp = Math.max(1, Math.round(t.mhp * Math.min(1, sk.pct * mult))); t.buffs = []; ev.push({ t: 'revive', dst: t.uid, amt: t.hp }); } else ev.push({ t: 'msg', text: 'No effect.' }); return; }
    if (sk.type === 'buff') { for (const t of this.alive('party')) this.addBuff(t, { ...sk.buff, turns: sk.buff.turns + boost }, ev); return; }
    if (sk.type === 'cover') { u.cover = true; u.defending = true; ev.push({ t: 'cover', src: u.uid }); return; }
    // damage skill
    const kind = PHYS.has(sk.type) ? 'phys' : 'mag';
    const hits = sk.hits || 1;
    if (sk.target === 'enemies') { for (const t of this.alive('enemy')) this.hit(u, t, { type: sk.type, power: sk.power * mult, kind, timing, extraShield: sk.shield, first: true, aoe: true }, ev); }
    else if (sk.target === 'random') { for (let i = 0; i < hits * (1 + boost); i++) { const al = this.alive('enemy'); if (!al.length) break; this.hit(u, al[Math.floor(this.rng() * al.length)], { type: sk.type, power: sk.power, kind, timing, first: true }, ev); } }
    else { const t = this.retarget(a.target); for (let i = 0; i < hits && t && t.hp > 0; i++) this.hit(u, t, { type: sk.type, power: sk.power * mult, kind, timing, extraShield: i === 0 ? sk.shield : 0, first: true }, ev); if (sk.debuff && t && t.hp > 0) this.addBuff(t, sk.debuff, ev); }
  }
  retarget(uid) { const t = this.unit(uid); if (t && t.hp > 0 && !t.gone) return t; const al = this.alive(t?.side || 'enemy'); return al[0] || null; }
  addBuff(t, b, ev) { t.buffs = t.buffs.filter((x) => !Object.keys(b).some((k) => k !== 'turns' && x[k])); t.buffs.push({ ...b }); ev.push({ t: 'buff', dst: t.uid, buff: { ...b } }); }

  useItem(u, a, ev, boost) {
    const it = ITEMS[a.item]; if (!it || !count(this.s, a.item)) { ev.push({ t: 'msg', text: 'None left.' }); return; }
    take(this.s, a.item); ev.push({ t: 'item', src: u.uid, item: a.item, name: it.name });
    const t = this.unit(a.target);
    if (it.kind === 'heal' && t && t.hp > 0) { const b = t.hp; t.hp = Math.min(t.mhp, t.hp + it.amt); ev.push({ t: 'heal', dst: t.uid, amt: t.hp - b }); }
    else if (it.kind === 'healall') for (const p of this.alive('party')) { const b = p.hp; p.hp = Math.min(p.mhp, p.hp + it.amt); ev.push({ t: 'heal', dst: p.uid, amt: p.hp - b }); }
    else if (it.kind === 'mp' && t) { const b = t.mp; t.mp = Math.min(t.mmp, t.mp + it.amt); ev.push({ t: 'mp', dst: t.uid, amt: t.mp - b }); }
    else if (it.kind === 'revive' && t && t.hp <= 0) { t.hp = Math.max(1, Math.round(t.mhp * it.pct)); ev.push({ t: 'revive', dst: t.uid, amt: t.hp }); }
    else if (it.kind === 'bomb') for (const e of this.alive('enemy')) this.hit(u, e, { type: it.type, flat: it.dmg * (1 + 0.5 * boost), kind: 'item', timing: 0, first: true, aoe: true }, ev);
    else ev.push({ t: 'msg', text: 'No effect.' });
  }

  // one hit from a party member on an enemy
  hit(u, t, o, ev) {
    const weak = t.weak.includes(o.type);
    let dmg;
    if (o.flat) dmg = o.flat * 60 / (60 + this.stat(t, 'res') * 0.5);
    else {
      const A = o.kind === 'phys' ? this.stat(u, 'atk') : this.stat(u, 'mag'), Df = o.kind === 'phys' ? this.stat(t, 'def') : this.stat(t, 'res');
      dmg = o.power / 10 * A * 60 / (60 + Df);
    }
    dmg *= 0.92 + this.rng() * 0.16;
    if (weak) dmg *= WEAK_MULT;
    if (t.brokenUntil) dmg *= BREAK_MULT;
    dmg *= TIMING.attack[o.timing] ?? 1;
    dmg = Math.max(1, Math.round(dmg));
    const e = { t: 'hit', src: u.uid, dst: t.uid, amt: dmg, type: o.type, weak, timing: o.timing, aoe: !!o.aoe, broke: false };
    if (weak && !t.known.has(o.type)) { t.known.add(o.type); learnWeak(this.s, t.id, o.type); e.reveal = o.type; }
    t.hp = Math.max(0, t.hp - dmg);
    if (weak && !t.brokenUntil && t.hp > 0) {
      t.shield = Math.max(0, t.shield - 1 - (o.extraShield || 0));
      if (t.shield === 0) {
        // broken before acting this round → loses this round + next; after acting → loses next round
        const actedThisRound = this.order.indexOf(t.uid) < this.idx;
        t.brokenUntil = this.round + 1; t.broken = actedThisRound ? 1 : 2;
        e.broke = true; this.s.stats.breaks++;
        if (t.charge) { t.charge = null; e.cancel = true; }
      }
    }
    e.shield = t.shield;
    ev.push(e);
    if (t.hp <= 0) this.kill(t, ev);
  }
  kill(t, ev) {
    const E = ENEMIES[t.id];
    if (t.side === 'enemy' && E.phase2 && !t.phased) {
      const P = ENEMIES[E.phase2], hp = Math.round(P.hp * this.diff.ehp * TUNE.bossHp);
      Object.assign(t, { id: E.phase2, name: P.name, hp, mhp: hp, st: { atk: P.atk, mag: P.mag, def: P.def, res: P.res, spd: P.spd }, shield: P.shield, mshield: P.shield, weak: P.weak.slice(), known: new Set(this.s.bestiary[E.phase2]?.weak || []), brokenUntil: 0, broken: 0, buffs: [], charge: null, phased: true });
      ev.push({ t: 'phase', dst: t.uid, name: P.name });
      return;
    }
    ev.push({ t: 'ko', dst: t.uid, side: t.side });
    if (t.side === 'enemy') { const b = this.s.bestiary[t.id] ||= { weak: [], seen: 0, kills: 0 }; b.kills++; t.charge = null; }
    else { t.buffs = []; t.cover = false; t.defending = false; }
  }

  resolveEnemy(u, a, input, ev, D) {
    const act = a.act; if (a.released) u.charge = null;
    ev.push({ t: 'act', src: u.uid, name: act.name, released: !!a.released });
    if (act.summon) {
      const slot = [0, 1, 2, 3].find((i) => !this.enemies().some((e) => e.slot === i && e.hp > 0)) ?? 3;
      const nu = enemyUnit(this.s, act.summon, this.s.difficulty, slot); this.units.push(nu); this.nextOrder.push(nu.uid);
      ev.push({ t: 'summon', unit: nu.uid, id: act.summon, slot }); return;
    }
    if (act.buff) { this.addBuff(u, act.buff, ev); return; }
    if (act.debuff) { for (const id of a.targets) { const t = this.unit(id); if (t && t.hp > 0) this.addBuff(t, act.debuff, ev); } return; }
    for (const id of a.targets) {
      let t = this.unit(id); if (!t || t.hp <= 0) { t = this.alive('party')[0]; if (!t) break; }
      let covered = false;
      if (act.target !== 'all') { const c = this.coverFor(t); if (c) { ev.push({ t: 'covered', src: c.uid, dst: t.uid }); t = c; covered = true; } }
      const phys = act.kind === 'phys';
      const A = phys ? this.stat(u, 'atk') : this.stat(u, 'mag'), Df = phys ? this.stat(t, 'def') : this.stat(t, 'res');
      let dmg = act.power / 10 * A * 60 / (60 + Df) * (0.92 + this.rng() * 0.16) * D.edmg * TUNE.dmg;
      if (t.defending) dmg *= 0.5;
      if (covered) dmg *= 0.8;
      const q = input.block?.[t.uid] ?? 0;
      dmg *= TIMING.block[q] ?? 1;
      dmg = Math.max(1, Math.round(dmg));
      t.hp = Math.max(0, t.hp - dmg);
      ev.push({ t: 'hit', src: u.uid, dst: t.uid, amt: dmg, type: act.type, block: q, defending: t.defending, aoe: act.target === 'all' });
      if (act.drain) { const b = u.hp; u.hp = Math.min(u.mhp, u.hp + Math.round(dmg * 0.5)); ev.push({ t: 'heal', dst: u.uid, amt: u.hp - b }); }
      if (t.hp <= 0) this.kill(t, ev);
    }
  }

  checkEnd() {
    if (this.over) return this.over;
    if (!this.alive('enemy').length) { this.over = 'win'; this.computeRewards(); }
    else if (!this.alive('party').length) this.over = 'lose';
    return this.over;
  }
  computeRewards() {
    let xp = 0, gold = 0; const drops = [];
    for (const e of this.units.filter((x) => x.side === 'enemy')) {
      const E = ENEMIES[e.id]; const base = E.phase2 ? ENEMIES[E.phase2] : E;
      xp += E.xp; gold += E.gold;
      for (const [it, p] of E.drops || []) if (this.rng() < p) drops.push(it);
      void base;
    }
    this.rewards = { xp: Math.round(xp * this.diff.xp), gold: Math.round(gold * this.diff.gold), drops };
  }
  // write HP/MP back into the save state (party is fully restored to 1 HP if the battle was won with them KO'd)
  commit() {
    for (const p of this.party()) { const h = this.s.heroes[p.id]; h.hp = this.over === 'win' ? Math.max(1, p.hp) : p.hp; h.mp = p.mp; }
    this.s.stats.battles++; if (this.over === 'win') this.s.stats.wins++; if (this.over === 'fled') this.s.stats.flees++;
  }

  // ------------------------------------------------------------ party autopilot (tests, auto-battle hook)
  autoAction(u) {
    const al = this.alive('party'), ko = this.party().filter((p) => p.hp <= 0), es = this.alive('enemy');
    const has = (k) => u.skills.includes(k) && u.mp >= SKILLS[k].mp;
    if (ko.length) { if (has('rekindle')) return { kind: 'skill', actor: u.uid, skill: 'rekindle', target: ko[0].uid }; if (count(this.s, 'ash')) return { kind: 'item', actor: u.uid, item: 'ash', target: ko[0].uid }; }
    const low = al.filter((p) => p.hp < p.mhp * 0.4);
    if (low.length >= 2 && has('tidecall')) return { kind: 'skill', actor: u.uid, skill: 'tidecall', boost: u.bp >= 3 ? 1 : 0 };
    if (low.length && has('mend')) return { kind: 'skill', actor: u.uid, skill: 'mend', target: low.sort((a, b) => a.hp / a.mhp - b.hp / b.mhp)[0].uid };
    if (u.hp < u.mhp * 0.35 && has('ironwill')) return { kind: 'skill', actor: u.uid, skill: 'ironwill' };
    const crit = al.filter((p) => p.hp < p.mhp * 0.28);
    if (crit.length) { if (count(this.s, 'draught')) return { kind: 'item', actor: u.uid, item: 'draught', target: crit[0].uid }; if (count(this.s, 'tonic')) return { kind: 'item', actor: u.uid, item: 'tonic', target: crit[0].uid }; }
    const charging = es.find((e) => e.charge);
    if (charging && u.id === 'bram' && has('standfast') && charging.charge.target !== 'all') return { kind: 'skill', actor: u.uid, skill: 'standfast' };
    // offence: score every option by expected damage (+ value of shield damage on a charging foe)
    const opts = [{ kind: 'attack', type: u.weapon, power: 10, target: 'enemy', ph: true }];
    for (const k of u.skills) { const sk = SKILLS[k]; if (sk.power && sk.type !== 'heal' && u.mp >= sk.mp) opts.push({ kind: 'skill', skill: k, type: sk.type, power: sk.power * (sk.hits || 1), target: sk.target, ph: PHYS.has(sk.type), sh: (sk.hits || 1) + (sk.shield || 0), mp: sk.mp }); }
    let best = null;
    for (const o of opts) for (const t of (o.target === 'enemy' ? es : [es[0]])) {
      const group = o.target === 'enemies' ? es : o.target === 'random' ? es : [t];
      let score = 0;
      for (const e of group) {
        const A = o.ph ? this.stat(u, 'atk') : this.stat(u, 'mag'), Df = o.ph ? this.stat(e, 'def') : this.stat(e, 'res');
        let d = o.power / 10 * A * 60 / (60 + Df) * (o.target === 'random' ? 1 / group.length : 1);
        const w = e.weak.includes(o.type) && (e.known.has(o.type) || this.rng() < 0.35);
        if (w) d *= WEAK_MULT; if (e.brokenUntil) d *= BREAK_MULT;
        score += Math.min(d, e.hp) + (w && !e.brokenUntil ? (e.charge ? 60 : 12) * (o.sh || 1) / Math.max(1, e.shield) : 0);
      }
      score -= (o.mp || 0) * (u.mp < u.mmp * 0.3 ? 3 : 0.6);
      if (!best || score > best.score) best = { ...o, tgt: t, score };
    }
    let boost = 0; const t = best.tgt;
    if (t.brokenUntil && u.bp >= 2) boost = Math.min(MAX_BOOST, u.bp);
    else if (u.bp >= MAX_BP) boost = 1;
    else if (t.charge && t.weak.includes(best.type) && u.bp >= 2 && t.shield <= 1 + (best.kind === 'attack' ? u.bp : 0)) boost = Math.min(MAX_BOOST, u.bp, best.kind === 'attack' ? t.shield - 1 : 2);
    return best.kind === 'attack' ? { kind: 'attack', actor: u.uid, target: t.uid, boost } : { kind: 'skill', actor: u.uid, skill: best.skill, target: t.uid, boost };
  }
}

// convenience: run a whole battle headlessly (tests + `__cam.game.autoBattle`)
export function simulate(s, enemyIds, { rng = Math.random, timing = () => 1, block = () => 1, preemptive = false, maxTurns = 600 } = {}) {
  const b = new Battle(s, enemyIds, { rng, preemptive });
  while (!b.over && b.turns < maxTurns) {
    const u = b.current(); if (!u) break;
    b.beginTurn(u);
    if (u.side === 'party') { const a = b.autoAction(u); b.resolve(a, { timing: timing() }); }
    else { const plan = b.enemyPlan(u); const blk = {}; for (const id of plan.targets || []) blk[id] = block(); b.resolve(plan, { block: blk }); }
    b.endTurn(u);
  }
  return b;
}

// Apply a won battle's rewards to the save (pure). Returns {xp, gold, drops, ups}.
export function applyRewards(s, b) {
  const r = b.rewards || { xp: 0, gold: 0, drops: [] };
  s.gold += r.gold; for (const d of r.drops) give(s, d, 1);
  const ups = gainXP(s, r.xp);
  return { ...r, ups };
}
