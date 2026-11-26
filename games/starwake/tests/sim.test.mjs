// node games/starwake/tests/sim.test.mjs — pure-logic tests for economy, missions, outfitting, story, saves.
import * as S from '../sim.js';
import { buildSector, route, mapDist, SHIPS, COMMODITIES, STORY } from '../data.js';
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.error('FAIL', msg); } };

for (const seed of [7, 1, 42, 999]) {
  const sys = buildSector(seed);
  const ids = Object.keys(sys);
  ok(ids.length === 12, `12 systems (seed ${seed})`);
  for (const a of ids) if (!sys[a].hidden) ok(route(sys, 'calder', a), `route calder->${a} seed ${seed}`);
  ok(route(sys, 'calder', 'lacuna') === null, 'lacuna is off the gate network');
  const nf = sys.ninefold, lac = sys.lacuna;
  ok(mapDist(nf, lac) <= 24, `ninefold within wake drive range of lacuna (seed ${seed}: ${mapDist(nf, lac).toFixed(1)})`);
  for (const s of Object.values(sys)) for (const g of s.gates) ok(sys[g].gates.includes(s.id), 'links symmetric');
  ok(sys.tallow.stations[0].type === 'mining' && sys.calder.stations[0].type === 'tech', 'story stations fixed');
}

const sys = buildSector(7);
const p = S.newProfile(S.DEFAULT_CFG);
ok(p.credits === 1500 && p.ship.cls === 'magpie', 'new profile');
ok(S.shipStats(p).cargoMax === 20, 'magpie hold 20');
const agri = sys.sabine.stations[0], mine = sys.tallow.stations[0], tech = sys.calder.stations[0], pir = sys.gloam.stations[0];
const qa = S.quote(p, agri, 'food'), qm = S.quote(p, mine, 'food');
ok(qa.buy < qm.sell, `food cheap at agri (${qa.buy}) dear at mining (${qm.sell})`);
const qmach = S.quote(p, sys.hesper.stations[0], 'machinery');
ok(qmach.buy < S.quote(p, mine, 'machinery').sell, 'machinery industrial->mining profitable');
ok(!S.quote(p, tech, 'spirits').canSell && S.quote(p, pir, 'spirits').canBuy, 'contraband only on black markets');
ok(!S.quote(p, pir, 'relics').canBuy && S.quote(p, pir, 'relics').canSell, 'relics sell-only');
// supply/demand: buying raises price, selling lowers
const before = S.quote(p, agri, 'food').buy;
const b = S.buy(p, agri, 'food', 20);
ok(b.n === 20 && p.cargo.food === 20 && S.cargoFree(p) === 0, 'bought 20 food');
ok(S.quote(p, agri, 'food').buy >= before, 'buying raises price');
ok(S.buy(p, agri, 'food', 1).n === 0, 'hold full blocks buying');
const s1 = S.quote(p, mine, 'food').sell; const r = S.sell(p, mine, 'food', 20);
ok(r.n === 20 && !p.cargo.food && S.quote(p, mine, 'food').sell < s1, 'selling lowers price');
ok(r.got > b.spent, `trade run profitable (${b.spent} -> ${r.got})`);
// price drift changes with day, respects volatility 0
const p0 = S.quote(p, tech, 'electronics', 0).buy; S.advanceDay(p, 3); const p1 = S.quote(p, tech, 'electronics', 0).buy;
ok(Math.abs(p0 - p1) <= 2, 'volatility 0 = stable prices');
const v0 = S.quote(p, tech, 'electronics', 10).buy; S.advanceDay(p, 2); ok(v0 !== S.quote(p, tech, 'electronics', 10).buy, 'volatility 10 drifts');
// stock relaxes toward equilibrium
S.ensureMarket(p, mine).stock.food = 120; S.advanceDay(p, 10); ok(S.ensureMarket(p, mine).stock.food < 60, 'stock relaxes');
// intel
S.recordIntel(p, mine); ok(S.bestKnownSale(p, 'food').station === mine.id, 'intel recorded');

// missions
const board = S.missionBoard(p, sys, tech);
ok(board.length >= 3, `board has missions (${board.length})`);
for (const m of board) { ok(m.reward > 0 && m.title && m.desc && m.sys, `mission ok ${m.type}`); ok(sys[m.sys], 'target system exists'); }
const cargoM = board.find((m) => m.carry);
if (cargoM) { const a = S.acceptMission(p, cargoM); ok(a.ok && S.cargoUsed(p) === cargoM.carry, 'mission cargo occupies hold'); ok(!S.missionBoard(p, sys, tech).find((m) => m.id === cargoM.id), 'taken mission leaves board'); const cr = p.credits; S.completeMission(p, p.missions[0]); ok(p.credits === cr + cargoM.reward, 'mission pays'); }
// boards at all stations, many days, never throw
for (let d = 1; d < 30; d++) { p.day = d; for (const s of Object.values(sys)) for (const st of s.stations) S.missionBoard(p, sys, st); }
ok(true, 'boards generate across days');

// outfitting
const q = S.newProfile({ ...S.DEFAULT_CFG, startCredits: 100000 });
ok(S.buyUpgrade(q, 'shields', 2).ok && S.shipStats(q).shield > SHIPS.magpie.shield, 'shield upgrade');
ok(S.buyGuns(q, 'driver', 2).ok && S.shipStats(q).gun.id === 'driver', 'gun swap');
ok(S.buyPod(q).ok && S.shipStats(q).cargoMax === 30, 'cargo pod');
const ti = S.tradeInValue(q); ok(ti > 10000, 'trade-in counts upgrades');
const c0 = q.credits; ok(S.buyShip(q, 'halberd').ok && q.credits === c0 - (SHIPS.halberd.price - ti), 'ship purchase with trade-in');
q.ship.hull = 10; ok(S.repair(q).ok && q.ship.hull === S.shipStats(q).hull, 'repair');
ok(!S.buyShip(S.newProfile(S.DEFAULT_CFG), 'halberd').ok, 'cannot afford halberd at start');

// story branching on rep
const st = S.newProfile(S.DEFAULT_CFG);
ok(S.storyOffers(st, 'calderRing')[0].id === 's1', 'story starts at Calder Ring');
S.startStory(st, STORY[0]); S.finishStory(st); ok(st.story.stage === 1, 'stage 1');
S.startStory(st, STORY[1]); S.finishStory(st);
ok(S.storyOffers(st, 'tallowDeep').length === 2, 'both branches offered at neutral rep');
st.rep.concord = -40; ok(S.storyOffers(st, 'tallowDeep').map((m) => m.id).join() === 's3v', 'concord branch closed when hostile');
st.rep.concord = 5; st.rep.veil = -60; ok(S.storyOffers(st, 'tallowDeep').map((m) => m.id).join() === 's3c', 'veil branch closed when hostile');
S.startStory(st, STORY[2]); S.finishStory(st); ok(st.story.branch === 'concord' && st.story.stage === 3, 'branch recorded');
S.startStory(st, STORY[4]); ok(st.ship.wakeDrive && S.shipStats(st).jumpRange >= 24, 'wake drive gifted');
S.finishStory(st); ok(st.story.active === 's5', 'finale chains');
S.finishStory(st); ok(st.story.stage === 5 && S.endingKey(st) === 'concord', 'ending key');
st.rep.hollows = 90; ok(S.endingKey(st) === 'hollows', 'hollows ending when Hollows rep dominates');

// save round-trip
const js = JSON.stringify(S.serialize(st)); const back = S.deserialize(JSON.parse(js));
ok(back && back.story.stage === 5 && back.ship.cls === st.ship.cls && back.credits === st.credits, 'save round-trip');
ok(S.deserialize({ junk: 1 }) === null, 'reject bad save');
ok(S.hostileToPlayer(S.newProfile(S.DEFAULT_CFG), 'veil') && !S.hostileToPlayer(S.newProfile(S.DEFAULT_CFG), 'concord'), 'default hostility');
ok(COMMODITIES.length >= 10, 'commodity count');

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
