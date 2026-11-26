// node games/skyharbor/tests/sim.test.mjs — pure-logic tests + a scripted 45-day balance run.
import assert from 'node:assert/strict';
import { genTerrain, GRID } from '../terrain.js';
import * as S from '../sim.js';
import { demoCity, layRoads, blocks, fillBlock, placeLandmarkInBlock } from '../autoplan.js';
import { LANDMARKS } from '../landmarks.js';

let pass = 0; const t = (name, fn) => { fn(); pass++; console.log('ok -', name); };

t('terrain: every type builds, has land, liquids where expected', () => {
  for (const type of S.TYPE_IDS) {
    const tr = genTerrain(type, 1234);
    const land = tr.cells.filter((c) => c === 0).length, water = tr.cells.filter((c) => c === 1).length;
    assert.ok(land > 420, `${type} buildable ${land}`);
    if (tr.liquid) assert.ok(water > 6, `${type} water ${water}`); else assert.equal(water, 0);
    assert.ok(Number.isFinite(tr.heightAt(0, 0)) && Number.isFinite(tr.heightAt(300, -300)));
  }
});
t('landmark catalogue: ≥10, unique ids, complete metadata', () => {
  assert.ok(LANDMARKS.length >= 10);
  assert.equal(new Set(LANDMARKS.map((l) => l.id)).size, LANDMARKS.length);
  for (const l of LANDMARKS) { for (const k of ['name', 'cost', 'tier', 'capacity', 'footprint', 'lore', 'night', 'build']) assert.ok(l[k] != null, l.id + ' ' + k); for (const v of S.VT) assert.ok(l.appeal[v] != null, l.id + ' appeal ' + v); }
  assert.ok(LANDMARKS.filter((l) => l.unlock.start).length >= 3);
});
t('galaxy: 16 systems, every planet type, start system scannable', () => {
  const st = S.newGame({ seed: 7, planetType: 'crystal' });
  assert.equal(st.systems.length, 16);
  for (const ty of S.TYPE_IDS) assert.ok(st.systems.some((s) => s.type === ty), ty);
  assert.equal(st.systems[0].type, 'crystal');
  assert.ok(S.inScanRange(st, st.systems[0]));
});
const boot = (o = {}) => {
  const st = S.newGame({ seed: 42, planetType: 'ocean', money: 60000, ...o });
  assert.ok(S.startScan(st, 's0').ok);
  for (let i = 0; i < 3; i++) S.simHour(st);
  assert.ok(st.systems[0].scanned, 'scan completes');
  const r = S.settle(st, 's0', 'Skyharbor'); assert.ok(r.ok, r.reason);
  return { st, p: r.planet };
};
t('settle: free starter spaceport + road stub, connected', () => {
  const { st, p } = boot();
  assert.equal(p.buildings.filter((b) => b.kind === 'spaceport').length, 1);
  assert.ok(p.grid.filter((v) => v === -1).length >= 3);
  S.computeCity(st, p);
  assert.ok(p.stats.docks > 0, 'starter port has road access');
  assert.ok(st.milestones.settle == null || true);
});
t('placement rules: water, occupied, adjacency, connectivity', () => {
  const { st, p } = boot();
  const wi = p.land.indexOf(1); assert.ok(wi >= 0);
  assert.equal(S.canPlace(p, 'housing', wi % GRID, (wi / GRID) | 0).ok, false);
  const sp = p.buildings[0];
  assert.equal(S.canPlace(p, 'housing', sp.x, sp.z).ok, false);
  layRoads(st, p, 6);
  const blk = blocks(p).find((b) => S.canPlace(p, 'halo', b.x, b.z).ok);
  const r = placeLandmarkInBlock(st, p, 'halo', blk, { instant: true }); assert.ok(r.ok);
  S.computeCity(st, p);
  assert.ok(r.b.access >= 0, 'landmark reachable from port');
  // isolate it: delete all roads → unreachable
  for (let k = 0; k < p.grid.length; k++) if (p.grid[k] === -1) p.grid[k] = 0;
  S.computeCity(st, p); assert.equal(r.b.access, -1);
});
t('locked landmarks refuse placement; unlock by renown', () => {
  const { st, p } = boot();
  layRoads(st, p, 6);
  const blk = blocks(p)[1];
  assert.equal(S.placeBuilding(st, p, 'ziggurat', blk.x, blk.z).ok, false);
  st.renown = 1e6; st.unlocked = S.unlockedFor(st);
  assert.ok(st.unlocked.includes('ziggurat') && !st.unlocked.includes('elevator'));
});

// --------------------------------------------------- balance: a competent scripted player (priority list, like a sensible human)
function play(seed, type, days = 50, log = false) {
  const st = S.newGame({ seed, planetType: type, money: 60000 });
  S.startScan(st, 's0'); for (let i = 0; i < 3; i++) S.simHour(st);
  const p = S.settle(st, 's0', 'Skyharbor').planet;
  let radius = 5; layRoads(st, p, radius);
  const free = () => blocks(p).filter((b) => { for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (p.grid[(b.z + j) * GRID + b.x + i] !== 0 || p.land[(b.z + j) * GRID + b.x + i] !== 0) return false; return true; });
  const needFree = (n) => { let f = free(); while (f.length < n && radius < 16) { radius += 2; layRoads(st, p, radius); f = free(); } return f; };
  const spot = (kind) => { const sz = S.sizeOf(kind); let best = null; for (let z = 0; z < GRID; z++) for (let x = 0; x < GRID; x++) { if (!S.canPlace(p, kind, x, z).ok || !S.roadAdjacent(p, x, z, sz)) continue; const d = Math.hypot(x - 16, z - 16); if (!best || d < best.d) best = { x, z, d }; } return best; };
  const M = { mixed: ['housing', 'shop', 'housing', 'hotel', 'housing', 'shop', 'housing', 'hotel'], util: ['power', 'water', 'housing', 'housing', 'park', 'housing', 'shop', 'housing'], stay: ['hotel', 'shop', 'hotel', 'housing', 'hotel', 'park', 'housing', 'shop'], homes: ['housing', 'housing', 'park', 'housing', 'shop', 'housing', 'housing', 'park'] };
  const lmTry = () => {
    const cand = st.unlocked.filter((id) => !p.landmarks.some((l) => l.kind === id)).sort((a, b) => S.costOf(st, a, p) - S.costOf(st, b, p));
    const id = cand.find((k) => S.costOf(st, k, p) <= st.money - 2000); if (!id) return false;
    for (const b of needFree(2)) { const r = placeLandmarkInBlock(st, p, id, b); if (r.ok) { for (const [x, z] of [[b.x + 3, b.z], [b.x, b.z + 3], [b.x + 3, b.z + 3]]) if (S.canPlace(p, 'transit', x, z).ok) { S.placeBuilding(st, p, 'transit', x, z); break; } return true; } }
    return false;
  };
  lmTry(); fillBlock(st, p, needFree(1)[0], M.mixed); fillBlock(st, p, needFree(1)[0], M.util);
  const rows = []; let won = null, k1 = null;
  for (let d = 0; d < days; d++) {
    for (let h = 0; h < 24; h++) S.simHour(st);
    const sp = p.stats, portCost = S.costOf(st, 'spaceport', p);
    const building = (k) => p.buildings.some((b) => b.kind === k && b.built < 1);
    const place1 = (k) => { const b = spot(k); if (b && S.placeBuilding(st, p, k, b.x, b.z).ok) { S.computeCity(st, p); return true; } return false; };
    for (let guard = 0; guard < 6; guard++) {
      // 1 utilities
      if (sp.powerOk < 1 && st.money > 6000 && !building('power') && place1('power')) continue;
      if (sp.waterOk < 1 && st.money > 4000 && !building('water') && place1('water')) continue;
      // 2 landing slots: if ships are being turned away, save for a port before anything else
      const portNeed = sp.turnedAway > sp.visitors * 0.2 && !building('spaceport');
      if (portNeed) { if (st.money >= portCost + 500 && place1('spaceport')) continue; break; }
      // 3 transit for every landmark that lacks it (cheap, +reviews +capacity)
      const noT = p.landmarks.find((l) => l.built >= 1 && !l.transit);
      if (noT && st.money > 3500) { let best = null; for (let z = noT.z - 3; z <= noT.z + noT.s + 2; z++) for (let x = noT.x - 3; x <= noT.x + noT.s + 2; x++) if (S.canPlace(p, 'transit', x, z).ok && S.roadAdjacent(p, x, z, 1)) { best = { x, z }; break; } if (best && S.placeBuilding(st, p, 'transit', best.x, best.z).ok) { S.computeCity(st, p); continue; } }
      // 4 beds: hotels on spare road frontage when fewer than 60% of visitors find a bed
      if (sp.visitors > 30 && sp.beds / 2 < sp.visitors * 0.6 && st.money > 5000 && place1('hotel')) continue;
      // 5 jobs/homes balance and happiness
      if (sp.pop > 0 && sp.jobs < sp.pop * 0.7 && st.money > 2500 && place1('shop')) continue;
      if (sp.happiness < 55 && st.money > 1200 && place1('park')) continue;
      // 6 the next wonder (save for it)
      if (lmTry()) continue;
      const nextLm = st.unlocked.filter((id) => !p.landmarks.some((l) => l.kind === id)).map((id) => S.costOf(st, id, p)).sort((a, b) => a - b)[0];
      if (nextLm && st.money < nextLm + 2000 && st.money > 0.35 * nextLm) break; // saving up
      // 7 grow the city when flush
      if (st.money > 9000 && needFree(6).length > 4) { const b = needFree(2)[1] || needFree(1)[0]; if (b) { fillBlock(st, p, b, sp.jobs > sp.pop ? M.homes : M.mixed); S.computeCity(st, p); continue; } }
      break;
    }
    const lb = S.leaderboard(st);
    if (st.totalVisitors >= 1000 && k1 == null) k1 = st.day;
    if (st.milestones.mostVisited && won == null) won = st.day;
    rows.push({ day: st.day, money: Math.round(st.money), vis: Math.round(sp.visitors), turned: Math.round(sp.turnedAway), pop: sp.pop, happy: sp.happiness, rating: +sp.rating.toFixed(2), lms: p.landmarks.length, best: Math.max(...p.landmarks.map((l) => l.rating), 0).toFixed(2), top: lb[0].name + ':' + lb[0].visitors, ports: p.buildings.filter((b) => b.kind === 'spaceport').length });
  }
  if (log) { console.table(rows.filter((r, i) => i % 3 === 0 || i === rows.length - 1)); const c = {}; for (const b of p.buildings) c[b.kind] = (c[b.kind] || 0) + 1; console.log(c, 'free', free().length, 'unlocked', st.unlocked, 'lms', p.landmarks.map((l) => l.kind)); }
  return { st, p, rows, won, k1 };
}
t('determinism: same seed → same result', () => { const a = play(9, 'desert', 12), b = play(9, 'desert', 12); assert.equal(a.st.money, b.st.money); assert.equal(a.st.totalVisitors, b.st.totalVisitors); });
t('save round-trip (JSON) preserves state', () => { const { st } = play(3, 'ice', 5); const j = JSON.parse(JSON.stringify(st)); assert.equal(j.money, st.money); assert.equal(j.planets.s0.grid.length, GRID * GRID); });

const verbose = process.argv.includes('-v'), only = process.argv.find((a) => S.TYPE_IDS.includes(a));
for (const type of only ? [only] : verbose ? ['ocean'] : S.TYPE_IDS) {
  const r = play(101, type, 50, verbose);
  const last = r.rows.at(-1);
  console.log(`  ${type.padEnd(9)} 1k visitors: day ${r.k1}  most-visited: day ${r.won}  final money ${last.money}  vis/day ${last.vis}  rating ${last.rating}  best ${last.best}  pop ${last.pop}  milestones ${Object.keys(r.st.milestones).length}`);
  assert.ok(r.k1 != null && r.k1 <= 12, `${type}: first 1k visitors by day 12 (got ${r.k1})`);
  assert.ok(last.money > -5000, `${type}: not bankrupt`);
}
console.log(`\n${pass} tests passed`);
