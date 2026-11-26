// Starwake — pure simulation: economy, missions, reputation, purchases, story state, save/load. No THREE; node-testable.
import { COMMODITIES, COMM, STATION_TYPES, SHIPS, GUNS, MARKS, GUN_PRICE, UPGRADES, POD_PRICE, POD_SIZE, MISSILE_PRICE, CELL_PRICE, REPAIR_PER_HP,
  STORY, FACTIONS, buildSector, route, mapDist, rng, hashStr, clamp, stationById, BAR_NAMES, VERSION } from './data.js';

export const DIFF = {
  easy: { label: 'Relaxed', enemyDmg: 0.55, enemyAcc: 0.5, assist: 0.85, regen: 1.5, spawn: 0.7 },
  normal: { label: 'Freelancer', enemyDmg: 1.0, enemyAcc: 0.8, assist: 0.45, regen: 1.0, spawn: 1.0 },
  hard: { label: 'Ace', enemyDmg: 1.4, enemyAcc: 1.0, assist: 0.12, regen: 0.8, spawn: 1.3 },
};
export const DEFAULT_CFG = {
  startCredits: 1500, startShip: 'magpie', seed: 7, pirateDensity: 5, volatility: 5, difficulty: 'normal',
  colors: { nebulaA: '#6a2a8e', nebulaB: '#13608a', accent: '#ffb347' }, story: true,
};

// ---------------------------------------------------------------- profile
export function newProfile(cfg = DEFAULT_CFG) {
  const cls = SHIPS[cfg.startShip] && !SHIPS[cfg.startShip].npc ? cfg.startShip : 'magpie';
  const p = {
    v: VERSION, seed: cfg.seed | 0, difficulty: DIFF[cfg.difficulty] ? cfg.difficulty : 'normal', credits: Math.max(0, cfg.startCredits | 0), day: 1,
    sys: 'calder', docked: null, lastStation: 'calderRing',
    ship: { cls, hull: 1, guns: { type: 'pulse', mk: 1 }, shields: 0, armour: 0, engines: 0, jump: 0, wakeDrive: false, pods: 0, missiles: SHIPS[cls].missiles, cells: 2 },
    cargo: {}, missions: [], nextMissionId: 1, rep: { concord: 5, hollows: 0, veil: -10 },
    story: { stage: cfg.story === false ? -1 : 0, branch: null, active: null, done: [] },
    markets: {}, intel: {}, visited: ['calder'], kills: 0, earned: 0, tutorial: { steer: false, throttle: false, target: false, fire: false, dock: false, market: false, map: false },
    taken: {},
  };
  p.ship.hull = shipStats(p).hull;
  return p;
}
export function shipStats(p) {
  const s = p.ship, d = SHIPS[s.cls];
  const sh = UPGRADES.shields.levels[s.shields].v, ar = UPGRADES.armour.levels[s.armour].v, en = UPGRADES.engines.levels[s.engines].v;
  return {
    cls: s.cls, name: d.name, hull: Math.round(d.hull * ar), shield: Math.round(d.shield * sh), regen: 14 * sh, speed: d.speed * en, boost: d.boost * en, turn: d.turn * (0.5 + en * 0.5),
    accel: d.accel * en, guns: d.guns, gun: GUNS[s.guns.type], gunMk: s.guns.mk, dmgMult: MARKS[s.guns.mk - 1].mult, missilesMax: d.missiles,
    cargoMax: d.cargo + s.pods * POD_SIZE, podsMax: d.pods, jumpRange: Math.max(UPGRADES.jump.levels[s.jump].v, s.wakeDrive ? 24 : 0), radius: d.radius,
  };
}
export const cargoUsed = (p) => Object.values(p.cargo).reduce((a, b) => a + b, 0) + p.missions.reduce((a, m) => a + (m.carry || 0), 0);
export const cargoFree = (p) => shipStats(p).cargoMax - cargoUsed(p);

// ---------------------------------------------------------------- reputation
export const repTier = (v) => (v <= -30 ? 'Hostile' : v < -10 ? 'Unfriendly' : v < 10 ? 'Neutral' : v < 30 ? 'Friendly' : 'Allied');
export function addRep(p, delta) { for (const k in delta) if (k in p.rep) p.rep[k] = clamp(Math.round(p.rep[k] + delta[k]), -100, 100); }
export function hostileToPlayer(p, fac) {
  if (fac === 'wake') return true;
  if (fac === 'veil') return p.rep.veil < 25;
  if (fac === 'concord') return p.rep.concord <= -25;
  if (fac === 'hollows') return p.rep.hollows <= -30;
  return false;
}
export const canDock = (p, st) => (st.faction === 'veil' ? p.rep.veil > -40 : st.faction === 'concord' ? p.rep.concord > -45 : p.rep.hollows > -45);

// ---------------------------------------------------------------- economy
const STOCK_MAX = 120;
const role = (type, cid) => { const t = STATION_TYPES[type]; return t.produce.includes(cid) ? 'p' : t.consume.includes(cid) ? 'c' : 'o'; };
export function trades(st, cid) {
  const c = COMM[cid];
  if (c.illegal) return st.type === 'pirate' || (st.faction === 'hollows' && st.type === 'mining');
  if (c.rare) return st.type === 'pirate' || st.type === 'tech';
  return true;
}
export const canBuyHere = (st, cid) => trades(st, cid) && !COMM[cid].rare; // relics are only found, never sold
function eqFrac(st, cid) { const r = role(st.type, cid); return r === 'p' ? 0.85 : r === 'c' ? 0.12 : 0.4; }
export function ensureMarket(p, st) {
  let m = p.markets[st.id];
  if (!m) {
    const r = rng(hashStr(st.id) ^ (p.seed * 131));
    m = p.markets[st.id] = { day: p.day, stock: {} };
    for (const c of COMMODITIES) if (trades(st, c.id)) m.stock[c.id] = Math.round(STOCK_MAX * clamp(eqFrac(st, c.id) + (r() - 0.5) * 0.2, 0.02, 1));
  }
  const days = p.day - m.day;
  if (days > 0) { // relax toward equilibrium
    const k = 1 - Math.pow(0.82, days);
    for (const cid in m.stock) m.stock[cid] = Math.round(m.stock[cid] + (STOCK_MAX * eqFrac(st, cid) - m.stock[cid]) * k);
    m.day = p.day;
  }
  return m;
}
export function midPrice(p, st, cid, stock, volatility = 5) {
  const c = COMM[cid], r = role(st.type, cid);
  const typeF = r === 'p' ? 0.72 : r === 'c' ? 1.34 : 1.0;
  const h = hashStr(st.id + cid + p.seed);
  const stationF = 0.93 + (h % 1000) / 1000 * 0.14;
  const ph1 = (h % 628) / 100, ph2 = ((h >>> 10) % 628) / 100;
  const vol = clamp(volatility, 0, 10) / 10 * 0.36;
  const drift = vol * (0.6 * Math.sin(p.day * 0.9 + ph1) + 0.4 * Math.sin(p.day * 0.31 + ph2));
  const supplyF = 1.25 - 0.5 * clamp(stock / STOCK_MAX, 0, 1.2);
  const pirateF = st.type === 'pirate' && !c.illegal ? 1.12 : 1;
  return c.base * typeF * stationF * (1 + drift) * supplyF * pirateF;
}
export function quote(p, st, cid, volatility) {
  const m = ensureMarket(p, st); const stock = m.stock[cid] ?? 0;
  const mid = midPrice(p, st, cid, stock, volatility);
  return { buy: Math.max(1, Math.round(mid * 1.05)), sell: Math.max(1, Math.round(mid * 0.95)), stock, canBuy: canBuyHere(st, cid) && stock > 0, canSell: trades(st, cid) };
}
export function buy(p, st, cid, n = 1, volatility) {
  let bought = 0, spent = 0; const m = ensureMarket(p, st);
  for (let i = 0; i < n; i++) {
    const q = quote(p, st, cid, volatility);
    if (!q.canBuy || p.credits < q.buy || cargoFree(p) < 1) break;
    p.credits -= q.buy; spent += q.buy; m.stock[cid] -= 1; p.cargo[cid] = (p.cargo[cid] || 0) + 1; bought++;
  }
  return { n: bought, spent };
}
export function sell(p, st, cid, n = 1, volatility) {
  let sold = 0, got = 0; const m = ensureMarket(p, st);
  for (let i = 0; i < n; i++) {
    const q = quote(p, st, cid, volatility);
    if (!q.canSell || !(p.cargo[cid] > 0)) break;
    p.credits += q.sell; got += q.sell; p.earned += q.sell; m.stock[cid] = (m.stock[cid] || 0) + 1; p.cargo[cid] -= 1; sold++;
    if (!p.cargo[cid]) delete p.cargo[cid];
  }
  return { n: sold, got };
}
export function recordIntel(p, st, volatility) {
  const prices = {};
  for (const c of COMMODITIES) if (trades(st, c.id)) { const q = quote(p, st, c.id, volatility); prices[c.id] = { buy: q.canBuy ? q.buy : null, sell: q.sell }; }
  p.intel[st.id] = { day: p.day, prices };
}
export function bestKnownSale(p, cid, exceptId) {
  let best = null;
  for (const id in p.intel) { if (id === exceptId) continue; const pr = p.intel[id].prices[cid]; if (pr && (!best || pr.sell > best.sell)) best = { station: id, sell: pr.sell, day: p.intel[id].day }; }
  return best;
}

// ---------------------------------------------------------------- outfitting
export function tradeInValue(p) {
  const s = p.ship; let v = (SHIPS[s.cls].price || 0) * 0.6;
  for (const k of ['shields', 'armour', 'engines', 'jump']) v += UPGRADES[k].levels[s[k]].p * 0.5;
  v += (GUN_PRICE[s.guns.type] + MARKS[s.guns.mk - 1].price) * SHIPS[s.cls].guns * 0.4 * (s.guns.type === 'pulse' && s.guns.mk === 1 ? 0 : 1);
  v += s.pods * POD_PRICE * 0.5;
  return Math.round(v);
}
export function shipPrice(p, cls) { return Math.max(0, SHIPS[cls].price - tradeInValue(p)); }
export function buyShip(p, cls) {
  const d = SHIPS[cls]; if (!d || d.npc || cls === p.ship.cls) return { ok: false, why: 'Already flying it' };
  const cost = shipPrice(p, cls);
  if (p.credits < cost) return { ok: false, why: 'Not enough credits' };
  const missionCarry = p.missions.reduce((a, m) => a + (m.carry || 0), 0);
  const used = Object.values(p.cargo).reduce((a, b) => a + b, 0) + missionCarry;
  if (used > d.cargo) return { ok: false, why: `Hold too small for your cargo (${used} > ${d.cargo})` };
  p.credits -= cost;
  const wake = p.ship.wakeDrive;
  p.ship = { cls, hull: 1, guns: { type: 'pulse', mk: 1 }, shields: 0, armour: 0, engines: 0, jump: 0, wakeDrive: wake, pods: 0, missiles: d.missiles, cells: p.ship.cells };
  p.ship.hull = shipStats(p).hull;
  return { ok: true, cost };
}
export function upgradeCost(p, kind, level) {
  const L = UPGRADES[kind].levels; if (!L[level]) return null;
  return Math.max(0, L[level].p - Math.round(L[p.ship[kind]].p * 0.5));
}
export function buyUpgrade(p, kind, level) {
  const cur = p.ship[kind]; if (level === cur) return { ok: false, why: 'Already fitted' };
  const cost = upgradeCost(p, kind, level); if (cost == null) return { ok: false, why: 'Unknown' };
  if (p.credits < cost) return { ok: false, why: 'Not enough credits' };
  const before = shipStats(p).hull; p.credits -= cost; p.ship[kind] = level;
  if (kind === 'armour') { const after = shipStats(p).hull; p.ship.hull = Math.min(after, Math.round(p.ship.hull * after / before)); }
  return { ok: true, cost };
}
export function gunCost(p, type, mk) {
  const n = SHIPS[p.ship.cls].guns, cur = p.ship.guns;
  const refund = cur.type === 'pulse' && cur.mk === 1 ? 0 : Math.round((GUN_PRICE[cur.type] + MARKS[cur.mk - 1].price) * n * 0.5);
  return Math.max(0, (GUN_PRICE[type] + MARKS[mk - 1].price) * n - refund);
}
export function buyGuns(p, type, mk) {
  if (p.ship.guns.type === type && p.ship.guns.mk === mk) return { ok: false, why: 'Already fitted' };
  const cost = gunCost(p, type, mk); if (p.credits < cost) return { ok: false, why: 'Not enough credits' };
  p.credits -= cost; p.ship.guns = { type, mk }; return { ok: true, cost };
}
export function buyPod(p) {
  if (p.ship.pods >= SHIPS[p.ship.cls].pods) return { ok: false, why: 'No free pod mounts' };
  if (p.credits < POD_PRICE) return { ok: false, why: 'Not enough credits' };
  p.credits -= POD_PRICE; p.ship.pods++; return { ok: true, cost: POD_PRICE };
}
export function buyMissiles(p, n) {
  const max = SHIPS[p.ship.cls].missiles; const k = Math.min(n, max - p.ship.missiles, Math.floor(p.credits / MISSILE_PRICE));
  if (k <= 0) return { ok: false, why: p.ship.missiles >= max ? 'Racks full' : 'Not enough credits' };
  p.credits -= k * MISSILE_PRICE; p.ship.missiles += k; return { ok: true, n: k };
}
export function buyCells(p, n) {
  const k = Math.min(n, 8 - p.ship.cells, Math.floor(p.credits / CELL_PRICE));
  if (k <= 0) return { ok: false, why: p.ship.cells >= 8 ? 'Tanks full' : 'Not enough credits' };
  p.credits -= k * CELL_PRICE; p.ship.cells += k; return { ok: true, n: k };
}
export function repairCost(p) { return Math.ceil((shipStats(p).hull - p.ship.hull) * REPAIR_PER_HP); }
export function repair(p) {
  const max = shipStats(p).hull; const missing = max - p.ship.hull; if (missing <= 0) return { ok: false, why: 'Hull is fine' };
  const hp = Math.min(missing, Math.floor(p.credits / REPAIR_PER_HP)); if (hp <= 0) return { ok: false, why: 'Not enough credits' };
  p.credits -= Math.ceil(hp * REPAIR_PER_HP); p.ship.hull += hp; return { ok: true, hp };
}

// ---------------------------------------------------------------- missions
const NAMES_A = ['Grin', 'Hatchet', 'Lark', 'Cinder', 'Moss', 'Rook', 'Vela', 'Tusk', 'Wren', 'Brass', 'Nails', 'Ghost'];
const NAMES_B = ['Haskel', 'Moreau', 'Vance', 'Okoro', 'Strand', 'Kell', 'Dray', 'Abara', 'Lisk', 'Fenn'];
const SHIP_NAMES = ['Hollow Song', 'Patient Ox', 'Brightwater', 'Second Chance', 'Low Tide', 'Ember Mule', 'Quiet Harvest', 'Long Haul'];
export function missionBoard(p, systems, st, cfg = DEFAULT_CFG) {
  const here = stationById(systems, st.id).sys;
  const bucket = Math.floor(p.day);
  const r = rng(hashStr(st.id) ^ (bucket * 7919) ^ (p.seed * 31));
  const list = [];
  const reachable = Object.values(systems).filter((s) => !s.hidden && route(systems, here.id, s.id));
  const near = (maxJ) => reachable.filter((s) => { const rt = route(systems, here.id, s.id); return rt && rt.length - 1 <= maxJ; });
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const fac = st.faction;
  const types = fac === 'veil' ? ['smuggle', 'bounty', 'cargo', 'raid', 'smuggle'] : fac === 'concord' ? ['cargo', 'bounty', 'patrol', 'escort', 'cargo', 'bounty'] : ['cargo', 'bounty', 'escort', 'patrol', 'smuggle', 'cargo'];
  const n = 4 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const type = pick(types);
    const id = `${st.id}-${bucket}-${i}`;
    if (p.taken[id]) continue;
    const m = { id, type, from: st.id, giver: fac, status: 'offer' };
    if (type === 'cargo' || type === 'smuggle') {
      const dests = near(3).flatMap((s) => s.stations.filter((x) => x.id !== st.id && (type === 'cargo' ? x.faction !== 'veil' || fac === 'veil' : x.type === 'pirate' || (x.type === 'mining' && x.faction === 'hollows'))).map((x) => ({ s, x })));
      if (!dests.length) continue;
      const d = pick(dests); const jumps = route(systems, here.id, d.s.id).length - 1;
      const units = type === 'smuggle' ? 4 + Math.floor(r() * 5) : 5 + Math.floor(r() * 10);
      const cid = type === 'smuggle' ? 'spirits' : pick(['medical', 'machinery', 'food', 'electronics', 'alloys', 'water']);
      Object.assign(m, { sys: d.s.id, station: d.x.id, carry: units, cid, jumps, title: type === 'smuggle' ? `Quiet run to ${d.x.name}` : `Haul ${COMM[cid].name} to ${d.x.name}`,
        desc: type === 'smuggle' ? `${units} crates of Void Spirits for ${d.x.name} in ${d.s.name}. Concord patrols will scan for them; keep your distance.` : `${units} units of sealed ${COMM[cid].name.toLowerCase()} to ${d.x.name} in ${d.s.name} (${jumps} jump${jumps === 1 ? '' : 's'}).`,
        reward: Math.round((type === 'smuggle' ? 900 + units * 70 + jumps * 260 : 180 + units * 22 + jumps * 230 + d.s.danger * 90) / 10) * 10,
        rep: type === 'smuggle' ? { veil: 6, concord: -2 } : { [fac === 'none' ? 'hollows' : fac]: 4 } });
    } else if (type === 'bounty' || type === 'raid') {
      const cands = near(2).filter((s) => s.danger >= 1 && s.id !== 'lacuna');
      if (!cands.length) continue;
      const s = pick(cands); const jumps = route(systems, here.id, s.id).length - 1;
      const targetFac = fac === 'veil' ? (type === 'raid' ? 'hollows' : 'concord') : 'veil';
      const name = `${pick(NAMES_A)} ${pick(NAMES_B)}`;
      const lvl = clamp(s.danger + Math.floor(r() * 2), 1, 5);
      const ships = targetFac === 'veil' ? (lvl >= 3 ? ['marauder', 'jackal', 'jackal'] : ['marauder', 'jackal']) : targetFac === 'concord' ? ['kite', 'kite'] : ['barge', 'ox'];
      Object.assign(m, { sys: s.id, jumps, lvl, targetFac, ships, nav: navPoint(r), target: name,
        title: type === 'raid' ? `Hit the convoy in ${s.name}` : `Bounty: ${name}`,
        desc: type === 'raid' ? `A Hollows convoy is moving freight through ${s.name}. Hit it and keep what drops.` : targetFac === 'concord' ? `Concord patrol leader ${name} has been squeezing our runners in ${s.name}. Remove the problem.` : `Red Veil raider ${name} and wingmen were last seen in ${s.name}. Threat level ${lvl}.`,
        reward: Math.round((650 + lvl * 480 + jumps * 180) / 10) * 10,
        rep: targetFac === 'veil' ? { [fac === 'none' ? 'hollows' : fac]: 5, veil: -4 } : targetFac === 'concord' ? { veil: 7, concord: -8 } : { veil: 5, hollows: -8 } });
    } else if (type === 'escort') {
      if (!here.gates.length) continue;
      const g = pick(here.gates);
      Object.assign(m, { sys: here.id, gate: g, ship: pick(SHIP_NAMES), lvl: Math.max(1, here.danger),
        title: `Escort the ${'freighter'} to the ${systems[g].name} gate`, desc: `The hauler waits at the station and leaves when you launch. Keep it alive to the ${systems[g].name} jump gate. Raiders expected.`,
        reward: Math.round((900 + Math.max(1, here.danger) * 380) / 10) * 10, rep: { [fac === 'none' ? 'hollows' : fac]: 6, veil: -2 } });
      m.title = `Escort ${m.ship} to the ${systems[g].name} gate`;
    } else if (type === 'patrol') {
      const cands = near(1).filter((s) => s.faction === here.faction || s.faction === 'none' || s.id === here.id);
      const s = pick(cands.length ? cands : [here]); const jumps = route(systems, here.id, s.id).length - 1;
      Object.assign(m, { sys: s.id, jumps, navs: [navPoint(r), navPoint(r), navPoint(r)], visited: [false, false, false], lvl: Math.max(1, s.danger),
        title: `Patrol ${s.name}`, desc: `Sweep three nav points in ${s.name} and deal with anything hostile you find.`,
        reward: Math.round((550 + Math.max(1, s.danger) * 300 + jumps * 160) / 10) * 10, rep: { [fac === 'none' ? 'hollows' : fac]: 5 } });
    }
    list.push(m);
  }
  return list;
}
export function navPoint(r) { const a = r() * Math.PI * 2, d = 2600 + r() * 3200; return [Math.cos(a) * d, (r() - 0.5) * 1400, Math.sin(a) * d]; }
export function acceptMission(p, m) {
  if (p.missions.length >= 4) return { ok: false, why: 'You can only juggle four contracts at once' };
  if (m.carry && cargoFree(p) < m.carry) return { ok: false, why: `Needs ${m.carry} free cargo space` };
  const a = structuredClone(m); a.status = 'active'; p.missions.push(a); p.taken[m.id] = true; return { ok: true, m: a };
}
export function completeMission(p, m) {
  m.status = 'done'; p.credits += m.reward; p.earned += m.reward; addRep(p, m.rep || {});
  p.missions = p.missions.filter((x) => x !== m); return m.reward;
}
export function failMission(p, m, why = 'failed') { m.status = why; addRep(p, Object.fromEntries(Object.entries(m.rep || {}).filter(([, v]) => v > 0).map(([k, v]) => [k, -Math.ceil(v / 2)]))); p.missions = p.missions.filter((x) => x !== m); }
export function deliverables(p, stationId) { return p.missions.filter((m) => (m.type === 'cargo' || m.type === 'smuggle') && m.station === stationId); }

// ---------------------------------------------------------------- story
export function storyStep(p) { return p.story.stage >= 0 && p.story.stage < 5 ? p.story.stage : null; }
export function storyOffers(p, stationId) {
  const st = p.story; if (st.stage < 0 || st.active) return [];
  if (st.stage === 0 && stationId === 'calderRing') return [STORY[0]];
  if (st.stage === 1 && stationId === 'tallowDeep') return [STORY[1]];
  if (st.stage === 2 && stationId === 'tallowDeep') {
    const o = [];
    if (p.rep.concord >= -15) o.push(STORY[2]);
    if (p.rep.veil >= -40) o.push(STORY[3]);
    if (!o.length) o.push(p.rep.concord >= p.rep.veil ? STORY[2] : STORY[3]);
    return o;
  }
  if (st.stage === 3 && stationId === 'tallowDeep') return [STORY[4]];
  return [];
}
export function startStory(p, mission) {
  p.story.active = mission.id;
  if (mission.branch) p.story.branch = mission.branch;
  if (mission.gift === 'wakeDrive') { p.ship.wakeDrive = true; p.ship.cells = Math.max(p.ship.cells, 3); }
  if (mission.id === 's1') { /* the shard rides in the hold */ }
}
export function finishStory(p) {
  const m = STORY.find((s) => s.id === p.story.active); if (!m) return null;
  p.story.done.push(m.id); p.story.active = null; p.story.stage += 1; p.credits += m.reward; p.earned += m.reward; addRep(p, m.rep);
  if (m.id === 's4') { p.story.active = 's5'; } // the finale chains straight on inside the Lacuna
  return m;
}
export function endingKey(p) {
  const b = p.story.branch || 'concord';
  if (p.rep.hollows > Math.max(p.rep.concord, p.rep.veil) + 12) return 'hollows';
  return b;
}

// ---------------------------------------------------------------- time + save
export function advanceDay(p, d = 1) { p.day = Math.round((p.day + d) * 100) / 100; }
export function serialize(p) { return JSON.parse(JSON.stringify(p)); }
export function deserialize(o) {
  if (!o || typeof o !== 'object' || !o.ship || !SHIPS[o.ship.cls]) return null;
  const base = newProfile(DEFAULT_CFG);
  const p = Object.assign(base, o);
  p.rep = Object.assign({ concord: 0, hollows: 0, veil: 0 }, o.rep); p.tutorial = Object.assign(base.tutorial, o.tutorial || {});
  return p;
}
export { buildSector, route, mapDist, FACTIONS, STORY, BAR_NAMES };
