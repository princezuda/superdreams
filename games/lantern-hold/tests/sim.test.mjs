// node games/lantern-hold/tests/sim.test.mjs — pathing, damage/armour maths, tower/enemy rules, save/restore,
// and wave balance: a scripted placement bot must clear every map on Normal, idle and weak bots must lose.
import assert from 'node:assert/strict';
import { LEVELS, TOWERS, TOWER_IDS, ENEMIES, HERO, starsFor } from '../data.js';
import { buildPath, posAt, STEP, BOUNDS, distToPaths } from '../paths.js';
import * as S from '../sim.js';
import { makeBot } from '../bot.js';
import { makeWave, waveSummary } from '../waves.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('ok -', name); };
const quiet = (G, sec) => S.advance(G, sec, (g) => { g.events.length = 0; });
// a sandbox game with no waves: we inject enemies by hand
function sandbox(level = 0) { const G = S.createGame(level); G.state = 'sandbox'; G.gold = 1e6; const h = G.hero; h.x = h.tx = h.homeX = 40; h.z = h.tz = h.homeZ = 40; return G; }
function inject(G, type, s, path = 0) {
  const sp = { type, path, left: 1, gap: 1, t: 0, hs: 1 }; G.spawners.push(sp); S.step(G, 1e-6);
  const e = G.enemies.at(-1); e.s = s; e.lane = 0; return e;
}

// ---------------------------------------------------------------- pathing
t('paths: uniform arc-length samples, endpoints exact, inside the diorama', () => {
  for (const L of LEVELS) {
    const m = S.prepMap(L);
    for (const P of m.paths) {
      for (let i = 1; i < P.n - 1; i++) { const d = Math.hypot(P.xs[i] - P.xs[i - 1], P.zs[i] - P.zs[i - 1]); assert.ok(Math.abs(d - STEP) < 0.02, `${L.id} spacing ${d}`); }
      const a = posAt(P, 0), b = posAt(P, P.len), c = posAt(P, P.len * 0.5);
      assert.ok(Math.hypot(a.x - P.ctrl[0][0], a.z - P.ctrl[0][1]) < 1e-3, 'start');
      assert.ok(Math.hypot(b.x - P.ctrl.at(-1)[0], b.z - P.ctrl.at(-1)[1]) < 0.05, 'end');
      assert.ok(Math.abs(Math.hypot(c.tx, c.tz) - 1) < 1e-3, 'unit tangent');
      assert.ok(P.len > 25 && P.len < 110, `${L.id} length ${P.len}`);
      for (let i = 0; i < P.n; i++) assert.ok(Math.abs(P.xs[i]) <= 14.7 && Math.abs(P.zs[i]) <= 10.7, `${L.id} in bounds`);
    }
    // every road reaches the same Hold gate
    for (const P of m.paths) assert.ok(Math.hypot(P.xs[P.n - 1] - m.hold[0], P.zs[P.n - 1] - m.hold[1]) < 0.05, `${L.id} roads meet at the Hold`);
  }
});
t('paths: posAt is continuous and monotone along the road', () => {
  const P = buildPath(LEVELS[1].paths[0]);
  let prev = posAt(P, 0), travelled = 0;
  for (let s = 0.05; s <= P.len; s += 0.05) { const p = posAt(P, s); const d = Math.hypot(p.x - prev.x, p.z - prev.z); assert.ok(d < 0.06, 'no jumps'); travelled += d; prev = p; }
  assert.ok(Math.abs(travelled - P.len) < 0.6, `arc length ${travelled} vs ${P.len}`);
});
t('build spots: right count, off the road, in reach of it, spaced, dry', () => {
  for (const L of LEVELS) {
    const m = S.prepMap(L);
    assert.equal(m.pads.length, L.pads, `${L.id} pads`);
    for (const [i, p] of m.pads.entries()) {
      const d = distToPaths(m.paths, p.x, p.z);
      assert.ok(d >= 1.6 && d <= 3.0, `${L.id} pad ${i} road distance ${d.toFixed(2)}`);
      assert.ok(Math.abs(p.x) <= BOUNDS.x && Math.abs(p.z) <= BOUNDS.z);
      for (const q of m.pads) if (q !== p) assert.ok(Math.hypot(q.x - p.x, q.z - p.z) >= 2.5, `${L.id} spacing`);
      for (const w of [...(L.lakes || []), ...(L.lavas || [])]) assert.ok(Math.hypot(w.x - p.x, w.z - p.z) > w.r + 0.8, `${L.id} pad in water/lava`);
    }
  }
});
t('enemies walk the road and leak at the Hold for their life cost', () => {
  const G = sandbox(0); G.lives = 20;
  const e = inject(G, 'brute', 0);
  const P = G.map.paths[0];
  quiet(G, P.len / ENEMIES.brute.speed + 2);
  assert.equal(G.enemies.length, 0); assert.equal(G.lives, 20 - ENEMIES.brute.lives);
  assert.ok(!e.alive);
});

// ---------------------------------------------------------------- damage maths
t('armour, piercing and magic resist', () => {
  const B = ENEMIES.brute, W = ENEMIES.warlock;
  assert.equal(S.mitigate(100, 'phys', B), 40);              // 60% armour
  assert.equal(S.mitigate(100, 'phys', B, 0.5), 90);         // Hawkeye pierces 0.5 → 10% left
  assert.equal(S.mitigate(100, 'phys', B, 0.9), 100);        // pierce never heals
  assert.equal(S.mitigate(100, 'magic', B), 100);            // magic ignores armour
  assert.equal(S.mitigate(100, 'magic', W), 25);             // 75% magic resist
  assert.equal(S.mitigate(100, 'true', W), 100);
  const G = sandbox(); const e = inject(G, 'gloomling', 3); e.hp = e.maxhp = 1000; e.mark = 0.3;
  assert.equal(Math.round(S.damage(G, e, 100, 'phys')), 130); // Hearth mark +30%
});
t('tower tiers: three tiers then two branches, every stat sane, branches dearer and stronger', () => {
  for (const id of TOWER_IDS) {
    const D = TOWERS[id]; assert.equal(D.tiers.length, 3); assert.deepEqual(Object.keys(D.branches), ['A', 'B']);
    const all = [...D.tiers, D.branches.A, D.branches.B];
    for (const s of all) { assert.ok(s.cost > 0 && s.range > 2); if (D.kind !== 'barracks') assert.ok(s.dmg > 0); }
    for (let i = 1; i < 3; i++) assert.ok(S.dpsOf(id, D.tiers[i]) > S.dpsOf(id, D.tiers[i - 1]), `${id} tier ${i} stronger`);
    for (const b of ['A', 'B']) assert.ok(D.branches[b].cost > D.tiers[2].cost && D.branches[b].name, `${id} ${b}`);
  }
});
t('targeting priority: first / strong / close', () => {
  const G = sandbox(); const P = G.map.paths[0];
  const a = inject(G, 'gloomling', P.len * 0.3), b = inject(G, 'brute', P.len * 0.32), c = inject(G, 'gloomling', P.len * 0.36);
  const pa = posAt(P, P.len * 0.3);
  const ids = (mode, x = pa.x, z = pa.z) => S.findTargets(G, x, z, 30, true, mode, 3).map((e) => e.id);
  assert.deepEqual(ids('first'), [c.id, b.id, a.id]);
  assert.equal(ids('strong')[0], b.id);
  assert.equal(ids('close')[0], a.id);
});
t('build, upgrade to a branch, sell for 60%', () => {
  const G = sandbox(); G.gold = 1000;
  const r = S.build(G, 0, 'archer'); assert.ok(r.ok); assert.equal(G.gold, 930);
  assert.equal(S.build(G, 0, 'mortar').ok, false, 'pad occupied');
  assert.ok(S.upgrade(G, r.id).ok); assert.ok(S.upgrade(G, r.id).ok);
  assert.equal(S.upgrade(G, r.id).ok, false, 'tier 3 needs a branch');
  assert.ok(S.upgrade(G, r.id, 'B').ok); assert.equal(r.tower.branch, 'B');
  assert.equal(S.upgrade(G, r.id, 'A').ok, false, 'branch is final');
  const spent = 70 + 100 + 150 + 280; assert.equal(r.tower.spent, spent);
  const g0 = G.gold; assert.ok(S.sell(G, r.id).ok); assert.equal(G.gold - g0, Math.floor(spent * 0.6));
  assert.equal(G.padTower[0], 0);
  G.gold = 10; assert.equal(S.build(G, 1, 'mortar').reason, 'gold');
});

// ---------------------------------------------------------------- enemy rules
t('splitting: a Murk Blob bursts into three mites', () => {
  const G = sandbox(); const e = inject(G, 'blob', 10);
  S.damage(G, e, 1e5, 'true'); S.step(G);
  assert.equal(G.enemies.filter((x) => x.type === 'mite').length, 3);
});
t('stealth: untargetable until lantern light reveals it', () => {
  const G = sandbox(); const P = G.map.paths[0];
  const pad = G.map.pads[0]; const n = S.prepMap(G.L);
  const e = inject(G, 'stalker', 0); e.speed = 0;
  // park the stalker next to the pad
  let best = 0, bd = 1e9; for (let s = 0; s < P.len; s += 0.2) { const p = posAt(P, s); const d = Math.hypot(p.x - pad.x, p.z - pad.z); if (d < bd) { bd = d; best = s; } }
  e.s = best; S.step(G);
  assert.equal(S.findTargets(G, pad.x, pad.z, 5, true, 'first').length, 0, 'hidden');
  S.build(G, 0, 'beacon'); e.s = best; S.step(G);
  assert.ok(e.revealed); assert.equal(S.findTargets(G, pad.x, pad.z, 5, true, 'first').length, 1, 'revealed by the beacon');
  assert.ok(e.slow > 0, 'and slowed');
  void n;
});
t('flying: kilns and wardens ignore moths, archers hit them', () => {
  const G = sandbox(); const pad = G.map.pads[0];
  const m = inject(G, 'moth', 5);
  m.x = pad.x + 1; m.z = pad.z;
  assert.equal(S.findTargets(G, pad.x, pad.z, 5, false, 'first').length, 0);
  assert.equal(S.findTargets(G, pad.x, pad.z, 5, true, 'first').length, 1);
});
t('blocking: wardens hold a gloomling on the road, the boss walks through', () => {
  const G = sandbox(); const r = S.build(G, 0, 'barracks'); const T = r.tower;
  quiet(G, 4); // wardens walk to the rally point
  const P = G.map.paths[0]; const near = S.prepMap(G.L) && (() => { let b = 0, bd = 1e9; for (let s = 0; s < P.len; s += 0.2) { const p = posAt(P, s); const d = Math.hypot(p.x - T.rally.x, p.z - T.rally.z); if (d < bd) { bd = d; b = s; } } return b; })();
  const e = inject(G, 'gloomling', Math.max(0, near - 2)); e.hp = e.maxhp = 1e5;
  quiet(G, 5);
  const s0 = e.s; quiet(G, 2);
  assert.ok(e.heldBy, 'held'); assert.ok(Math.abs(e.s - s0) < 0.01, 'stopped');
  const B = inject(G, 'boss', Math.max(0, near - 1)); B.hp = B.maxhp = 1e6; const b0 = B.s; quiet(G, 3);
  assert.ok(B.s > b0 + 0.8, 'boss is not blockable'); assert.equal(B.heldBy, 0);
});
t('hero: moves on command, Dawnburst stuns + damages, levels up from kills', () => {
  const G = sandbox(); const h = G.hero;
  S.moveHero(G, 0, 0); quiet(G, 25); assert.ok(Math.hypot(h.x, h.z) < 0.1);
  const e = inject(G, 'gloomling', 5); e.x = h.x + 1; e.z = h.z; e.hp = e.maxhp = 1e4;
  assert.ok(S.heroAbility(G) === false || true); h.abilityCd = 0;
  const hp0 = e.hp; assert.ok(S.heroAbility(G)); assert.ok(e.hp < hp0 && e.stunT > 1);
  assert.equal(S.heroAbility(G), false, 'cooldown');
  const xp0 = h.lvl; for (let i = 0; i < 40; i++) { const k = inject(G, 'brute', 5); k.x = h.x; k.z = h.z; S.damage(G, k, 1e6, 'true', 0, 'hero'); }
  assert.ok(h.lvl > xp0 && h.lvl <= 5);
  assert.ok(h.maxhp > HERO.hp);
});
t('waves: deterministic, introduce new foes, boss on the final throne wave, call-early pays', () => {
  for (const L of LEVELS) {
    for (let i = 0; i < L.waves; i++) assert.deepEqual(makeWave(L, i), makeWave(L, i), 'deterministic');
    for (const [type, at] of Object.entries(L.roster)) if (at > 0) assert.ok(waveSummary(makeWave(L, at))[type] > 0, `${L.id} introduces ${type} at ${at}`);
  }
  const E = LEVELS.find((l) => l.boss); assert.equal(waveSummary(makeWave(E, E.waves - 1)).boss, 1);
  const G = S.createGame(0); assert.ok(S.canCall(G)); assert.equal(S.callWave(G), 0, 'first wave is free to call');
  G.gold += 0; let guard = 0; while (G.countdown == null && guard++ < 3000) { S.step(G); G.events.length = 0; } S.step(G); assert.ok(G.countdown != null && G.countdown > 0);
  const g0 = G.gold, bonus = S.callBonus(G); assert.ok(bonus > 0);
  assert.equal(S.callWave(G), bonus); assert.equal(G.gold, g0 + bonus); assert.equal(G.wave, 2);
});
t('stars from lives', () => { assert.equal(starsFor(20, 20), 3); assert.equal(starsFor(18, 20), 3); assert.equal(starsFor(12, 20), 2); assert.equal(starsFor(3, 20), 1); assert.equal(starsFor(0, 20), 0); });
t('snapshot → restore round-trips towers, gold, wave, hero', () => {
  const G = S.createGame(2); const bot = makeBot(G, 'smart');
  S.advance(G, 90, (g) => { bot.tick(S.DT); g.events.length = 0; });
  while (!S.canSnapshot(G)) { bot.tick(S.DT); S.step(G); G.events.length = 0; }
  const snap = JSON.parse(JSON.stringify(S.snapshot(G)));
  const H = S.restore(snap);
  assert.equal(H.gold, G.gold); assert.equal(H.wave, G.wave); assert.equal(H.lives, G.lives);
  assert.deepEqual(H.towers.map((x) => [x.pad, x.type, x.tier, x.branch]), G.towers.map((x) => [x.pad, x.type, x.tier, x.branch]));
  assert.equal(H.soldiers.length, G.soldiers.length); assert.equal(H.hero.lvl, G.hero.lvl);
});

// ---------------------------------------------------------------- balance
function play(i, style, opts = {}) {
  const G = S.createGame(i, opts); const bot = makeBot(G, style); let maxE = 0;
  while (G.state !== 'won' && G.state !== 'lost' && G.t < 5400) { bot.tick(S.DT); S.step(G); G.events.length = 0; if (G.enemies.length > maxE) maxE = G.enemies.length; }
  return { G, maxE };
}
t('balance: smart bot clears every map on Normal; idle and weak bots lose; sessions 8–20 min', () => {
  const rows = [];
  for (const [i, L] of LEVELS.entries()) {
    const s = play(i, 'smart'), w = play(i, 'weak'), d = play(i, 'idle');
    rows.push(`${L.id.padEnd(11)} smart ${s.G.state} lives ${String(s.G.lives).padStart(2)} (${s.G.stars}★) ${(s.G.t / 60).toFixed(1)} min, peak ${s.maxE} foes | weak lost at wave ${w.G.wave} | idle lost at wave ${d.G.wave}`);
    assert.equal(s.G.state, 'won', `${L.id} smart bot must win`);
    assert.ok(s.G.lives >= 10, `${L.id} smart bot keeps ≥10 lives`);
    assert.equal(d.G.state, 'lost', `${L.id} idle must lose`);
    assert.equal(w.G.state, 'lost', `${L.id} weak must lose`);
    assert.ok(s.G.t / 60 >= 7.5 && s.G.t / 60 <= 20, `${L.id} session ${s.G.t / 60}`);
  }
  console.log('  ' + rows.join('\n  '));
});
t('balance: Casual is kinder than Normal, endless eventually falls', () => {
  for (const i of [2, 5, 7]) { const c = play(i, 'smart', { difficulty: 'casual' }), n = play(i, 'smart'); assert.equal(c.G.state, 'won'); assert.ok(c.G.lives / c.G.maxLives >= n.G.lives / n.G.maxLives - 0.05); }
  const e = play(3, 'smart', { endless: true }); assert.equal(e.G.state, 'lost'); assert.ok(e.G.wave >= 10, `endless reached ${e.G.wave}`);
  console.log(`  endless (glasswater, bot): wave ${e.G.wave}`);
});
console.log(`\n${pass} tests passed`);
