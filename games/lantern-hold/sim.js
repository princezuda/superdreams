// Lantern Hold — deterministic fixed-step simulation (no three.js, no DOM). The browser renders G; node tests drive it.
import { TOWERS, ENEMIES, HERO, LEVELS, DIFFICULTY, SELL_RATE, TARGET_MODES, starsFor } from './data.js';
import { buildPath, posAt, nearestOnPath, genPads, mulberry } from './paths.js';
import { makeWave } from './waves.js';

export const DT = 1 / 30;
const _p = {};
const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);

// ---------------------------------------------------------------- map preparation (cached)
const mapCache = new Map();
export function prepMap(L) {
  if (mapCache.has(L.id)) return mapCache.get(L.id);
  const paths = L.paths.map(buildPath);
  const hold = [paths[0].xs[paths[0].n - 1], paths[0].zs[paths[0].n - 1]];
  const pads = genPads(paths, L.pads, { lakes: L.lakes, lavas: L.lavas, hold });
  const spawns = paths.map((P, i) => ({ path: i, x: P.xs[0], z: P.zs[0] }));
  const m = { paths, hold, pads, spawns };
  mapCache.set(L.id, m); return m;
}

// ---------------------------------------------------------------- damage maths
export function mitigate(dmg, type, d, pierce = 0) {
  if (type === 'true') return dmg;
  if (type === 'magic') return dmg * (1 - (d.mres || 0));
  return dmg * (1 - Math.max(0, (d.armor || 0) - pierce));
}
export const towerStats = (t) => (t.branch ? TOWERS[t.type].branches[t.branch] : TOWERS[t.type].tiers[t.tier]);
export function upgradeOptions(t) {
  const D = TOWERS[t.type];
  if (t.branch) return [];
  if (t.tier < 2) return [{ key: 'up', cost: D.tiers[t.tier + 1].cost, name: `${D.short} ${['I', 'II', 'III'][t.tier + 1]}` }];
  return ['A', 'B'].map((b) => ({ key: b, cost: D.branches[b].cost, name: D.branches[b].name, blurb: D.branches[b].blurb }));
}
export function dpsOf(type, st) { // nominal single-target dps (UI + tests)
  if (st.beam) return st.dpsMax;
  if (TOWERS[type].kind === 'barracks') return 3 * st.dmg / st.rate;
  if (TOWERS[type].kind === 'aura') return st.dmg / st.rate + (st.flare ? st.flareDmg / st.flare : 0);
  const mult = (st.multi || 1) * (1 + (st.crit || 0) * ((st.critMul || 1) - 1));
  return st.dmg * mult / st.rate;
}

// ---------------------------------------------------------------- game creation
export function createGame(level, opts = {}) {
  const L = typeof level === 'number' ? LEVELS[level] : typeof level === 'string' ? LEVELS.find((l) => l.id === level) : level;
  const o = Object.assign({ difficulty: 'normal', endless: false, lives: null, goldMul: 1, hpMul: 1, speedMul: 1, waveGap: 25 }, opts);
  const diff = DIFFICULTY[o.difficulty] || DIFFICULTY.normal;
  const map = prepMap(L);
  const lives = o.lives ?? diff.lives;
  const G = {
    L, map, o, diff, t: 0, gold: Math.round(L.startGold * (o.endless ? 1.25 : 1) * o.goldMul), lives, maxLives: lives,
    wave: 0, total: o.endless ? Infinity : L.waves, waves: [], spawners: [], countdown: null, state: 'prep',
    enemies: [], emap: new Map(), towers: [], units: new Map(), soldiers: [], projectiles: [], zones: [],
    events: [], rng: mulberry(L.seed + 99), nextId: 1, stats: { kills: 0, leaked: 0, earned: 0, spent: 0, called: 0, bonus: 0 },
    padTower: new Array(map.pads.length).fill(0),
  };
  const P0 = map.paths[0]; posAt(P0, P0.len * L.hero, _p);
  const id = G.nextId++;
  G.hero = { id, isHero: true, x: _p.x, z: _p.z, px: _p.x, pz: _p.z, tx: _p.x, tz: _p.z, homeX: _p.x, homeZ: _p.z, moving: false,
    hp: HERO.hp, maxhp: HERO.hp, lvl: 1, xp: 0, cd: 0, abilityCd: 6, dead: 0, tgt: 0, engaged: false, yaw: 0, hurtT: 0, armor: HERO.armor };
  G.units.set(id, G.hero);
  return G;
}
export function getWave(G, i) {
  while (G.waves.length <= i) G.waves.push(makeWave(G.L, G.waves.length, { endless: G.o.endless }));
  return G.waves[i];
}
const ev = (G, e) => { if (G.events.length < 600) G.events.push(e); };

// ---------------------------------------------------------------- waves
function hpScale(G, wi) {
  let s = (G.o.endless ? 0.8 : G.L.hpMul) * G.diff.hp * G.o.hpMul * (1 + (G.L.hpGrow ?? 0.07) * wi);
  if (G.o.endless) s *= 1 + Math.max(0, wi - 8) * 0.06;
  return s;
}
function startWave(G) {
  const w = getWave(G, G.wave);
  const hs = hpScale(G, G.wave);
  for (const g of w.groups) G.spawners.push({ type: g.type, path: Math.min(g.path, G.map.paths.length - 1), left: g.count, gap: g.gap, t: g.delay, hs });
  ev(G, { t: 'wave', i: G.wave, boss: w.boss });
  G.wave++; G.countdown = null; G.state = 'play';
}
export function callBonus(G) { return G.countdown == null ? 0 : Math.round(G.countdown * 1.25 + 2); }
export function canCall(G) { return (G.state === 'prep' || (G.state === 'play' && G.countdown != null)) && G.wave < G.total; }
export function callWave(G) {
  if (!canCall(G)) return -1;
  const bonus = G.state === 'prep' ? 0 : callBonus(G);
  G.gold += bonus; G.stats.bonus += bonus; if (bonus) G.stats.called++;
  startWave(G); ev(G, { t: 'call', bonus });
  return bonus;
}
export function nextWaveInfo(G) { return G.wave < G.total ? getWave(G, G.wave) : null; }

// ---------------------------------------------------------------- enemies
function spawnEnemy(G, type, path, s, hs, lane) {
  const d = ENEMIES[type], id = G.nextId++;
  const hp = Math.round(d.hp * hs);
  const e = { id, type, d, path, s, lane: lane ?? (G.rng() - 0.5) * (d.boss ? 0 : 0.62), hp, maxhp: hp, hs,
    x: 0, z: 0, y: d.flying ? 1.35 : 0, px: 0, pz: 0, yaw: 0, slow: 0, stunT: 0, burnT: 0, burnDps: 0, mark: 0, heldBy: 0, atkCd: 1,
    revealed: !d.stealth, healT: d.heal ? d.heal.every * 0.6 : 0, summonT: d.summon ? d.summon.every * 0.7 : 0, flashT: 0, age: 0, alive: true };
  place(G, e); e.px = e.x; e.pz = e.z;
  G.enemies.push(e); G.emap.set(id, e);
  return e;
}
function place(G, e) {
  const P = G.map.paths[e.path]; posAt(P, e.s, _p);
  // lanes taper to 0 at the ends so crowds enter from and exit into a single point
  const taper = Math.min(1, e.s / 1.5, (P.len - e.s) / 1.5);
  e.x = _p.x - _p.tz * e.lane * taper; e.z = _p.z + _p.tx * e.lane * taper; e.yaw = Math.atan2(_p.tx, _p.tz);
}
export function damage(G, e, dmg, type, pierce = 0, src = null) {
  if (!e.alive) return 0;
  let m = mitigate(dmg, type, e.d, pierce);
  if (e.mark > 0) m *= 1 + e.mark;
  e.hp -= m; if (src !== 'burn' && src !== 'beam') e.flashT = 0.12; // continuous damage does not strobe
  if (e.hp <= 0) kill(G, e, src);
  return m;
}
function kill(G, e, src) {
  e.alive = false; e.hp = 0;
  const gold = Math.round(e.d.gold * G.diff.gold * G.o.goldMul);
  G.gold += gold; G.stats.earned += gold; G.stats.kills++;
  const h = G.hero;
  if (!h.dead && (src === 'hero' || dist2(h.x, h.z, e.x, e.z) < 20)) gainXp(G, e.d.gold);
  ev(G, { t: 'death', id: e.id, type: e.type, x: e.x, y: e.y, z: e.z, gold, boss: !!e.d.boss });
  if (e.d.split) for (let k = 0; k < e.d.split.n; k++) {
    const m = spawnEnemy(G, e.d.split.type, e.path, Math.max(0, e.s - 0.25 * k + 0.25), e.hs, (k - 1) * 0.3);
    m.stunT = 0.35; ev(G, { t: 'split', x: e.x, z: e.z });
  }
}
function gainXp(G, n) {
  const h = G.hero; h.xp += n;
  while (h.lvl < 5 && h.xp >= HERO.xp[h.lvl]) {
    h.lvl++; const f = 1 + HERO.perLevel * (h.lvl - 1);
    h.maxhp = Math.round(HERO.hp * f); h.hp = h.maxhp; ev(G, { t: 'heroLevel', lvl: h.lvl });
  }
}
const heroMul = (G) => 1 + HERO.perLevel * (G.hero.lvl - 1);

function targetable(e, air) { return e.alive && e.revealed && (air || !e.d.flying); }
// returns up to n targets inside range, ordered by priority mode
export function findTargets(G, x, z, range, air, mode, n = 1, out = []) {
  out.length = 0;
  for (const e of G.enemies) {
    if (!targetable(e, air)) continue;
    const r = range + e.d.size * 0.4;
    if (dist2(x, z, e.x, e.z) > r * r) continue;
    out.push(e);
  }
  if (out.length > 1) {
    const rem = (e) => G.map.paths[e.path].len - e.s;
    if (mode === 'strong') out.sort((a, b) => b.hp - a.hp || rem(a) - rem(b));
    else if (mode === 'close') out.sort((a, b) => dist2(x, z, a.x, a.z) - dist2(x, z, b.x, b.z));
    else out.sort((a, b) => rem(a) - rem(b));
  }
  if (out.length > n) out.length = n;
  return out;
}
const _t = [];

// ---------------------------------------------------------------- towers
export function build(G, pad, type) {
  const D = TOWERS[type];
  if (!D || pad < 0 || pad >= G.map.pads.length) return { ok: false, reason: 'bad' };
  if (G.padTower[pad]) return { ok: false, reason: 'occupied' };
  const cost = D.tiers[0].cost;
  if (G.gold < cost) return { ok: false, reason: 'gold' };
  if (G.state === 'won' || G.state === 'lost') return { ok: false, reason: 'over' };
  G.gold -= cost; G.stats.spent += cost;
  const p = G.map.pads[pad], id = G.nextId++;
  const t = { id, type, pad, x: p.x, z: p.z, tier: 0, branch: null, cd: 0.4, mode: 'first', spent: cost, aimYaw: 0, fireT: 0, lock: 0, beamTgt: 0, flareT: 2, kills: 0, rally: null };
  G.towers.push(t); G.padTower[pad] = id;
  if (D.kind === 'barracks') { t.rally = defaultRally(G, t); for (let k = 0; k < 3; k++) addSoldier(G, t, k); }
  ev(G, { t: 'build', id, type, x: t.x, z: t.z });
  return { ok: true, id, tower: t };
}
export const towerById = (G, id) => G.towers.find((t) => t.id === id);
export function upgrade(G, id, branch = null) {
  const t = towerById(G, id); if (!t) return { ok: false, reason: 'bad' };
  const opts = upgradeOptions(t); if (!opts.length) return { ok: false, reason: 'max' };
  const o = t.tier < 2 ? opts[0] : opts.find((x) => x.key === branch);
  if (!o) return { ok: false, reason: 'branch' };
  if (G.gold < o.cost) return { ok: false, reason: 'gold' };
  G.gold -= o.cost; G.stats.spent += o.cost; t.spent += o.cost;
  if (t.tier < 2) t.tier++; else t.branch = branch;
  if (TOWERS[t.type].kind === 'barracks') { const st = towerStats(t); for (const s of G.soldiers) if (s.tower === t.id) { s.maxhp = st.hp; s.hp = st.hp; } }
  ev(G, { t: 'upgrade', id, type: t.type, tier: t.tier, branch: t.branch, x: t.x, z: t.z });
  return { ok: true };
}
export const sellValue = (t) => Math.floor(t.spent * SELL_RATE);
export function sell(G, id) {
  const i = G.towers.findIndex((t) => t.id === id); if (i < 0) return { ok: false };
  const t = G.towers[i], v = sellValue(t);
  G.gold += v; G.towers.splice(i, 1); G.padTower[t.pad] = 0;
  for (const s of G.soldiers.filter((s) => s.tower === id)) removeUnit(G, s);
  G.soldiers = G.soldiers.filter((s) => s.tower !== id);
  ev(G, { t: 'sell', id, x: t.x, z: t.z, gold: v });
  return { ok: true, gold: v };
}
export function setMode(G, id, mode) { const t = towerById(G, id); if (t && TARGET_MODES.includes(mode)) { t.mode = mode; return true; } return false; }
function defaultRally(G, t) {
  let best = null;
  for (const P of G.map.paths) { const n = nearestOnPath(P, t.x, t.z); if (!best || n.d < best.d) best = n; }
  return { x: best.x, z: best.z };
}
export function setRally(G, id, x, z) {
  const t = towerById(G, id); if (!t || !t.rally) return false;
  const st = towerStats(t);
  let best = null;
  for (const P of G.map.paths) { const n = nearestOnPath(P, x, z); if (!best || n.d < best.d) best = n; }
  if (!best || best.d > 1.6) return false;
  if (Math.hypot(best.x - t.x, best.z - t.z) > st.range + 0.3) return false;
  t.rally = { x: best.x, z: best.z };
  for (const s of G.soldiers) if (s.tower === id) { releaseUnit(G, s); }
  ev(G, { t: 'rally', id, x: best.x, z: best.z });
  return true;
}
const SLOT = [[0, 0], [0.5, 0.32], [-0.5, 0.32]];
function addSoldier(G, t, slot) {
  const st = towerStats(t), id = G.nextId++;
  const s = { id, tower: t.id, slot, x: t.x, z: t.z, px: t.x, pz: t.z, hp: st.hp, maxhp: st.hp, cd: 0, tgt: 0, dead: 0, engaged: false, yaw: 0, armor: st.armor, hurtT: 0 };
  G.soldiers.push(s); G.units.set(id, s); return s;
}
function removeUnit(G, u) { releaseUnit(G, u); G.units.delete(u.id); }
function releaseUnit(G, u) {
  if (u.tgt) { const e = G.emap.get(u.tgt); if (e && e.heldBy === u.id) e.heldBy = 0; }
  u.tgt = 0; u.engaged = false;
}

// ---------------------------------------------------------------- hero commands
export function moveHero(G, x, z) {
  const h = G.hero; if (h.dead) return false;
  x = Math.max(-13.5, Math.min(13.5, x)); z = Math.max(-9.2, Math.min(9.2, z));
  releaseUnit(G, h); h.tx = x; h.tz = z; h.moving = true;
  ev(G, { t: 'heroMove', x, z });
  return true;
}
export function heroAbility(G) {
  const h = G.hero, A = HERO.ability;
  if (h.dead || h.abilityCd > 0 || G.state === 'won' || G.state === 'lost') return false;
  h.abilityCd = A.cd;
  const m = heroMul(G);
  for (const e of G.enemies) {
    if (!e.alive || dist2(h.x, h.z, e.x, e.z) > (A.r + e.d.size * 0.4) ** 2) continue;
    e.stunT = Math.max(e.stunT, A.stun * (e.d.boss ? 0.5 : 1));
    if (e.d.stealth) e.revealT = 3;
    damage(G, e, A.dmg * m, 'magic', 0, 'hero');
  }
  ev(G, { t: 'dawn', x: h.x, z: h.z, r: A.r });
  return true;
}

// ---------------------------------------------------------------- blocking (wardens + hero)
function blockerThink(G, b, homeX, homeZ, alert, leash, speed, dt) {
  let e = b.tgt ? G.emap.get(b.tgt) : null;
  if (e && (!e.alive || dist2(e.x, e.z, homeX, homeZ) > leash * leash || (e.d.stealth && !e.revealed))) { releaseUnit(G, b); e = null; }
  if (!e) {
    let best = null, bs = Infinity; const a2 = alert * alert;
    for (const c of G.enemies) {
      if (!c.alive || c.d.flying || c.d.boss || !c.revealed) continue;
      const d = dist2(c.x, c.z, homeX, homeZ); if (d > a2) continue;
      const sc = d + (c.heldBy ? 50 : 0); // prefer foes nobody is holding yet
      if (sc < bs) { bs = sc; best = c; }
    }
    if (best) { e = best; b.tgt = e.id; }
  }
  b.engaged = false;
  if (e) {
    const dx = e.x - b.x, dz = e.z - b.z, d = Math.hypot(dx, dz);
    b.yaw = Math.atan2(dx, dz);
    if (d > 0.42) { const mv = Math.min(speed * dt, d - 0.4); b.x += dx / d * mv; b.z += dz / d * mv; }
    if (d <= 0.62) {
      b.engaged = true;
      if (!e.heldBy) e.heldBy = b.id;
    }
    return e;
  }
  const dx = homeX - b.x, dz = homeZ - b.z, d = Math.hypot(dx, dz);
  if (d > 0.05) { const k = Math.min(1, speed * dt / d); b.x += dx * k; b.z += dz * k; b.yaw = Math.atan2(dx, dz); }
  return null;
}

// ---------------------------------------------------------------- step
export function step(G, dt = DT) {
  if (G.state === 'won' || G.state === 'lost') return;
  G.t += dt;
  const live = G.state === 'play';
  // spawners
  for (let i = G.spawners.length - 1; i >= 0; i--) {
    const sp = G.spawners[i]; sp.t -= dt;
    while (sp.t <= 0 && sp.left > 0) {
      const e = spawnEnemy(G, sp.type, sp.path, 0, sp.hs); sp.left--; sp.t += sp.gap;
      if (e.d.boss) ev(G, { t: 'boss', id: e.id });
      ev(G, { t: 'spawn', id: e.id, type: e.type, path: sp.path });
    }
    if (sp.left <= 0) G.spawners.splice(i, 1);
  }
  // pass A: status resets, reveal, auras
  const h = G.hero;
  for (const e of G.enemies) {
    e.px = e.x; e.pz = e.z; e.slow = 0; e.mark = 0; e.age += dt;
    if (e.flashT > 0) e.flashT -= dt;
    if (e.revealT > 0) e.revealT -= dt;
    e.revealed = !e.d.stealth || e.revealT > 0 || (!h.dead && dist2(h.x, h.z, e.x, e.z) < HERO.reveal * HERO.reveal);
  }
  for (const t of G.towers) {
    if (TOWERS[t.type].kind !== 'aura') continue;
    const st = towerStats(t), r2 = st.range * st.range; let any = false;
    for (const e of G.enemies) {
      if (!e.alive || dist2(t.x, t.z, e.x, e.z) > r2) continue;
      any = true; e.revealed = true; e.slow = Math.max(e.slow, e.d.boss ? st.slow * 0.5 : st.slow); if (st.mark) e.mark = Math.max(e.mark, st.mark);
    }
    t.active = any;
  }
  // towers
  for (const t of G.towers) towerStep(G, t, dt);
  // enemies: move, heal, summon, burn
  for (const e of G.enemies) {
    if (!e.alive) continue;
    if (e.burnT > 0) { e.burnT -= dt; damage(G, e, e.burnDps * dt, 'magic', 0, 'burn'); if (!e.alive) continue; }
    if (e.d.heal) { e.healT -= dt; if (e.healT <= 0) { e.healT = e.d.heal.every; let n = 0; for (const o of G.enemies) if (o.alive && o !== e && o.hp < o.maxhp && dist2(o.x, o.z, e.x, e.z) < e.d.heal.r ** 2) { o.hp = Math.min(o.maxhp, o.hp + e.d.heal.amt * e.hs); n++; } if (n) ev(G, { t: 'heal', id: e.id, x: e.x, z: e.z, r: e.d.heal.r }); } }
    if (e.d.summon) { e.summonT -= dt; if (e.summonT <= 0) { e.summonT = e.d.summon.every; for (let k = 0; k < e.d.summon.n; k++) spawnEnemy(G, e.d.summon.type, e.path, Math.max(0, e.s - 0.6 - k * 0.45), e.hs * 0.7, (k - 1) * 0.35); ev(G, { t: 'summon', x: e.x, z: e.z }); } }
    let held = false;
    if (e.heldBy) {
      const u = G.units.get(e.heldBy);
      if (!u || u.dead || u.hp <= 0) e.heldBy = 0;
      else if (dist2(u.x, u.z, e.x, e.z) < 0.7 * 0.7) {
        held = true;
        e.atkCd -= dt;
        if (e.atkCd <= 0 && e.stunT <= 0) { e.atkCd = 1; hurtUnit(G, u, e.d.melee); }
      }
    }
    if (e.stunT > 0) { e.stunT -= dt; continue; }
    if (held) continue;
    e.s += e.d.speed * G.o.speedMul * (1 - e.slow) * dt;
    const P = G.map.paths[e.path];
    if (e.s >= P.len) {
      e.alive = false; G.lives = Math.max(0, G.lives - e.d.lives); G.stats.leaked += e.d.lives;
      ev(G, { t: 'leak', id: e.id, type: e.type, lives: e.d.lives, x: e.x, z: e.z });
      continue;
    }
    place(G, e);
  }
  // wardens
  for (const s of G.soldiers) {
    s.px = s.x; s.pz = s.z; if (s.hurtT > 0) s.hurtT -= dt;
    const t = towerById(G, s.tower), st = towerStats(t);
    s.armor = st.armor;
    if (s.dead > 0) { s.dead -= dt; if (s.dead <= 0) { s.hp = s.maxhp = st.hp; s.x = t.x; s.z = t.z; ev(G, { t: 'respawn', id: s.id }); } continue; }
    const hx = t.rally.x + SLOT[s.slot][0], hz = t.rally.z + SLOT[s.slot][1];
    const e = blockerThink(G, s, hx, hz, 1.9, 3.0, 2.4, dt);
    if (e && s.engaged) { s.cd -= dt; if (s.cd <= 0) { s.cd = st.rate; damage(G, e, st.dmg, 'phys', 0, 'warden'); ev(G, { t: 'swing', id: s.id }); } }
    else if (!e && s.hp < s.maxhp) s.hp = Math.min(s.maxhp, s.hp + s.maxhp * 0.06 * dt);
  }
  heroStep(G, dt);
  // projectiles
  for (let i = G.projectiles.length - 1; i >= 0; i--) if (projStep(G, G.projectiles[i], dt)) G.projectiles.splice(i, 1);
  // burning ground
  for (let i = G.zones.length - 1; i >= 0; i--) {
    const z = G.zones[i]; z.t -= dt;
    for (const e of G.enemies) if (e.alive && !e.d.flying && dist2(z.x, z.z, e.x, e.z) < z.r * z.r) { e.burnT = Math.max(e.burnT, 0.5); e.burnDps = Math.max(e.burnDps, z.dps); }
    if (z.t <= 0) G.zones.splice(i, 1);
  }
  // cleanup
  if (G.enemies.some((e) => !e.alive)) {
    for (const e of G.enemies) if (!e.alive) { G.emap.delete(e.id); }
    G.enemies = G.enemies.filter((e) => e.alive);
  }
  // wave flow
  if (live) {
    if (G.countdown != null) { G.countdown -= dt; if (G.countdown <= 0) startWave(G); }
    else if (G.spawners.length === 0 && G.wave < G.total) G.countdown = G.o.waveGap;
  }
  if (G.lives <= 0) { G.state = 'lost'; ev(G, { t: 'lost' }); return; }
  if (G.state === 'play' && G.wave >= G.total && G.spawners.length === 0 && G.enemies.length === 0) {
    G.state = 'won'; G.stars = starsFor(G.lives, G.maxLives); ev(G, { t: 'won', stars: G.stars });
  }
}
function hurtUnit(G, u, dmg) {
  u.hp -= dmg * (1 - (u.armor || 0)); u.hurtT = 0.15;
  if (u.hp <= 0) {
    u.hp = 0; releaseUnit(G, u);
    if (u.isHero) { u.dead = HERO.respawn; u.moving = false; ev(G, { t: 'heroDown', x: u.x, z: u.z }); }
    else { const t = towerById(G, u.tower); u.dead = towerStats(t).respawn; ev(G, { t: 'wardenDown', x: u.x, z: u.z }); }
  }
}
function heroStep(G, dt) {
  const h = G.hero; h.px = h.x; h.pz = h.z;
  if (h.abilityCd > 0) h.abilityCd -= dt;
  if (h.hurtT > 0) h.hurtT -= dt;
  if (h.dead > 0) {
    h.dead -= dt;
    if (h.dead <= 0) { h.dead = 0; h.hp = h.maxhp; h.x = h.tx = h.homeX = G.map.hold[0] - 1.2; h.z = h.tz = h.homeZ = G.map.hold[1]; ev(G, { t: 'heroUp' }); }
    return;
  }
  const m = heroMul(G);
  if (h.moving) {
    const dx = h.tx - h.x, dz = h.tz - h.z, d = Math.hypot(dx, dz);
    if (d < 0.05) { h.moving = false; h.homeX = h.tx; h.homeZ = h.tz; }
    else { const k = Math.min(1, HERO.speed * dt / d); h.x += dx * k; h.z += dz * k; h.yaw = Math.atan2(dx, dz); }
    h.engaged = false;
  } else {
    const e = blockerThink(G, h, h.homeX, h.homeZ, HERO.alert, 3.2, HERO.speed, dt);
    h.cd -= dt;
    if (e && h.engaged) { if (h.cd <= 0) { h.cd = HERO.meleeRate; damage(G, e, HERO.melee * m, 'phys', 0, 'hero'); ev(G, { t: 'heroSwing' }); } }
    else if (h.cd <= 0) {
      const tg = findTargets(G, h.x, h.z, HERO.range, true, 'first', 1, _t)[0];
      if (tg) { h.cd = HERO.rate; h.yaw = Math.atan2(tg.x - h.x, tg.z - h.z); fire(G, { kind: 'wisp', x: h.x, y: 1.1, z: h.z, tgt: tg.id, speed: 10, dmg: HERO.dmg * m, type: 'magic', src: 'hero' }); }
    }
    if (!e && h.hp < h.maxhp) h.hp = Math.min(h.maxhp, h.hp + h.maxhp * HERO.regen * dt);
  }
}

function fire(G, p) { p.id = G.nextId++; p.px = p.x; p.py = p.y; p.pz = p.z; p.t = 0; G.projectiles.push(p); return p; }
function towerStep(G, t, dt) {
  const D = TOWERS[t.type], st = towerStats(t);
  t.cd -= dt; if (t.fireT > 0) t.fireT -= dt;
  if (D.kind === 'barracks') {
    for (const s of G.soldiers) if (s.tower === t.id && s.maxhp !== st.hp && s.dead <= 0) { const f = s.hp / s.maxhp; s.maxhp = st.hp; s.hp = st.hp * f; }
    return;
  }
  if (D.kind === 'aura') {
    if (t.cd <= 0 && t.active) {
      t.cd = st.rate; t.fireT = 0.3;
      for (const e of G.enemies) if (e.alive && dist2(t.x, t.z, e.x, e.z) < st.range * st.range) damage(G, e, st.dmg, 'magic', 0, 'beam');
      ev(G, { t: 'pulse', id: t.id });
    }
    if (st.flare) {
      t.flareT -= dt;
      if (t.flareT <= 0 && t.active) {
        t.flareT = st.flare;
        for (const e of G.enemies) if (e.alive && dist2(t.x, t.z, e.x, e.z) < st.range * st.range) { e.stunT = Math.max(e.stunT, st.stun * (e.d.boss ? 0.5 : 1)); damage(G, e, st.flareDmg, 'magic', 0, t.id); }
        ev(G, { t: 'flare', id: t.id, x: t.x, z: t.z, r: st.range });
      }
    }
    return;
  }
  if (st.beam) {
    let e = t.beamTgt ? G.emap.get(t.beamTgt) : null;
    if (e && (!targetable(e, D.air) || dist2(t.x, t.z, e.x, e.z) > (st.range + 0.3) ** 2)) e = null;
    if (!e) { e = findTargets(G, t.x, t.z, st.range, D.air, t.mode, 1, _t)[0]; t.lock *= 0.4; }
    if (e) {
      t.beamTgt = e.id; t.lock += dt; t.aimYaw = Math.atan2(e.x - t.x, e.z - t.z);
      const dps = st.dmg + (st.dpsMax - st.dmg) * Math.min(1, t.lock / st.ramp);
      damage(G, e, dps * dt, 'magic', 0, 'beam'); if (!e.alive) t.kills++;
    } else { t.beamTgt = 0; t.lock = 0; }
    return;
  }
  if (t.cd > 0) return;
  const tg = findTargets(G, t.x, t.z, st.range, D.air, t.mode, st.multi || 1, _t);
  if (!tg.length) return;
  t.cd = st.rate; t.fireT = 0.25;
  t.aimYaw = Math.atan2(tg[0].x - t.x, tg[0].z - t.z);
  ev(G, { t: 'fire', id: t.id, type: t.type });
  if (t.type === 'archer') {
    for (const e of tg) {
      let dmg = st.dmg, crit = false;
      if (st.crit && G.rng() < st.crit) { dmg *= st.critMul; crit = true; }
      fire(G, { kind: crit ? 'bolt' : 'arrow', x: t.x, y: 1.9, z: t.z, tgt: e.id, speed: crit ? 22 : 16, dmg, type: 'phys', pierce: st.pierce || 0, src: t.id });
    }
  } else if (t.type === 'mortar') {
    const e = tg[0];
    const dd = Math.hypot(e.x - t.x, e.z - t.z), T = 0.85 + dd * 0.05;
    let tx = e.x, tz = e.z;
    if (!e.heldBy && e.stunT <= 0) { const P = G.map.paths[e.path]; posAt(P, Math.min(P.len, e.s + e.d.speed * G.o.speedMul * (1 - e.slow) * T), _p); tx = _p.x - _p.tz * e.lane; tz = _p.z + _p.tx * e.lane; }
    fire(G, { kind: 'shell', x: t.x, y: 1.4, z: t.z, fx: t.x, fy: 1.4, fz: t.z, tx, tz, T, h: 2.2 + dd * 0.25, dmg: st.dmg, r: st.splash, burn: st.burn, burnT: st.burnT, cluster: st.cluster, clusterDmg: st.clusterDmg, src: t.id });
  } else if (t.type === 'prism') {
    if (st.chain) {
      const hit = [tg[0]]; let cur = tg[0];
      for (let k = 0; k < st.chain; k++) {
        let nb = null, bd = 2.4 * 2.4;
        for (const o of G.enemies) if (targetable(o, true) && !hit.includes(o)) { const d = dist2(cur.x, cur.z, o.x, o.z); if (d < bd) { bd = d; nb = o; } }
        if (!nb) break; hit.push(nb); cur = nb;
      }
      const pts = [[t.x, 2.3, t.z], ...hit.map((e) => [e.x, e.y + 0.35, e.z])];
      let dmg = st.dmg; for (const e of hit) { damage(G, e, dmg, 'magic', 0, t.id); dmg *= st.chainFall; }
      ev(G, { t: 'chain', id: t.id, pts });
    } else fire(G, { kind: 'orb', x: t.x, y: 2.3, z: t.z, tgt: tg[0].id, speed: 11, dmg: st.dmg, type: 'magic', src: t.id });
  }
}
function projStep(G, p, dt) {
  p.px = p.x; p.py = p.y; p.pz = p.z; p.t += dt;
  if (p.kind === 'shell' || p.kind === 'bomblet') {
    const k = Math.min(1, p.t / p.T);
    p.x = p.fx + (p.tx - p.fx) * k; p.z = p.fz + (p.tz - p.fz) * k; p.y = p.fy * (1 - k) + 0.05 + 4 * p.h * k * (1 - k);
    if (k < 1) return false;
    for (const e of G.enemies) {
      if (!e.alive || e.d.flying) continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z) - e.d.size * 0.3;
      if (d > p.r) continue;
      damage(G, e, p.dmg * (d < p.r * 0.5 ? 1 : 0.6), 'phys', 0, p.src);
    }
    if (p.burn) G.zones.push({ x: p.x, z: p.z, r: p.r * 0.75, dps: p.burn, t: p.burnT });
    if (p.cluster) for (let k2 = 0; k2 < p.cluster; k2++) {
      const a = G.rng() * Math.PI * 2, rr = 0.6 + G.rng() * 0.9;
      fire(G, { kind: 'bomblet', x: p.x, y: 0.1, z: p.z, fx: p.x, fy: 0.1, fz: p.z, tx: p.x + Math.cos(a) * rr, tz: p.z + Math.sin(a) * rr, T: 0.45, h: 0.8, dmg: p.clusterDmg, r: 0.85, src: p.src });
    }
    ev(G, { t: 'impact', kind: p.kind, x: p.x, z: p.z, r: p.r, burn: !!p.burn });
    return true;
  }
  const e = G.emap.get(p.tgt);
  if (e && e.alive) { p.tx = e.x; p.ty = e.y + 0.32 + e.d.size * 0.3; p.tz = e.z; }
  else if (p.tx == null) return true;
  const dx = p.tx - p.x, dy = p.ty - p.y, dz = p.tz - p.z, d = Math.hypot(dx, dy, dz), mv = p.speed * dt;
  if (d <= mv + 0.05) {
    if (e && e.alive) { damage(G, e, p.dmg, p.type, p.pierce || 0, p.src); ev(G, { t: 'hit', kind: p.kind, x: p.tx, y: p.ty, z: p.tz }); }
    return true;
  }
  p.x += dx / d * mv; p.y += dy / d * mv; p.z += dz / d * mv;
  if (p.t > 4) return true;
  return false;
}

export function advance(G, seconds, onStep = null) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n && G.state !== 'won' && G.state !== 'lost'; i++) { step(G, DT); onStep?.(G); }
}

// ---------------------------------------------------------------- save / restore (between waves only — simple, robust)
export function canSnapshot(G) { return (G.state === 'prep' || (G.state === 'play' && G.countdown != null)) && G.enemies.length === 0 && G.spawners.length === 0; }
export function snapshot(G) {
  return { v: 1, level: G.L.id, o: G.o, gold: G.gold, lives: G.lives, maxLives: G.maxLives, wave: G.wave, state: G.state, stats: G.stats, t: G.t,
    towers: G.towers.map((t) => ({ pad: t.pad, type: t.type, tier: t.tier, branch: t.branch, mode: t.mode, spent: t.spent, rally: t.rally })),
    hero: { x: G.hero.x, z: G.hero.z, lvl: G.hero.lvl, xp: G.hero.xp } };
}
export function restore(snap) {
  const G = createGame(snap.level, snap.o);
  Object.assign(G, { gold: snap.gold, lives: snap.lives, maxLives: snap.maxLives, wave: snap.wave, state: snap.state, stats: { ...snap.stats }, t: snap.t });
  for (let i = 0; i < snap.wave; i++) getWave(G, i);
  for (const s of snap.towers) {
    const g0 = G.gold; G.gold = 1e9; const r = build(G, s.pad, s.type); G.gold = g0;
    const t = r.tower; t.tier = s.tier; t.branch = s.branch; t.mode = s.mode; t.spent = s.spent;
    if (s.rally) t.rally = s.rally;
    for (const so of G.soldiers) if (so.tower === t.id) { so.hp = so.maxhp = towerStats(t).hp; }
  }
  G.stats.spent = snap.stats.spent;
  const h = G.hero; h.x = h.tx = h.homeX = h.px = snap.hero.x; h.z = h.tz = h.homeZ = h.pz = snap.hero.z; h.lvl = snap.hero.lvl; h.xp = snap.hero.xp;
  h.maxhp = h.hp = Math.round(HERO.hp * (1 + HERO.perLevel * (h.lvl - 1)));
  if (G.state === 'play') G.countdown = G.o.waveGap;
  G.events.length = 0;
  return G;
}
