// Skyharbor simulation — pure (no DOM / three.js). Galaxy, planet traits, city economy, tourism, reviews, events, goals.
// Everything is deterministic from state.seed + state.rngState so saves and node tests reproduce exactly.
import { mulberry32, hashStr, clamp } from './noise.js';
import { GRID, genTerrain } from './terrain.js';
import { LANDMARKS, LANDMARK_BY_ID, VISITOR_TYPES } from './landmarks.js';

export const VT = VISITOR_TYPES.map((v) => v.id);
export const HOURS_PER_DAY = 24;

// ---------------------------------------------------------------- planets
export const PLANET_TYPES = {
  ocean: { name: 'Ocean world', climate: 'temperate', blurb: 'Warm shallow seas, island chains and long tidal beaches.', feats: { tides: 0.8, twinMoons: 0.3, clearSkies: 0.2, ringshine: 0.15, auroras: 0.12 }, res: { metals: 0.3, spores: 0.2 } },
  desert: { name: 'Desert world', climate: 'arid', blurb: 'Copper dunes, mesas and a single precious oasis.', feats: { singingDunes: 0.75, clearSkies: 0.6, meteors: 0.4, twinMoons: 0.3 }, res: { metals: 0.5, helium3: 0.3 } },
  ice: { name: 'Ice world', climate: 'frozen', blurb: 'Glacier fjords under green auroras; nights that last for days.', feats: { auroras: 0.85, longNights: 0.6, clearSkies: 0.4, ringshine: 0.2 }, res: { ice: 1, helium3: 0.3 } },
  jungle: { name: 'Jungle world', climate: 'humid', blurb: 'Steaming canopy, slow rivers and forests that glow after dark.', feats: { glowFlora: 0.8, longNights: 0.3, tides: 0.15 }, res: { spores: 0.85 } },
  volcanic: { name: 'Volcanic world', climate: 'infernal', blurb: 'Basalt plains split by lava rivers; geothermal power everywhere.', feats: { lavaFalls: 0.8, geysers: 0.6, meteors: 0.3 }, res: { geothermal: 1, metals: 0.6 } },
  crystal: { name: 'Crystal world', climate: 'thinAir', blurb: 'Violet skies over fields of singing crystal.', feats: { clearSkies: 0.7, auroras: 0.3, twinMoons: 0.3 }, res: { crystal: 1 } },
  moon: { name: 'Gas-giant moon', climate: 'airless', blurb: 'A cratered moon with a banded giant filling half the sky.', feats: { giantRise: 1, ringshine: 0.6, clearSkies: 0.9, meteors: 0.4 }, res: { helium3: 0.7, ice: 0.4 } },
};
export const TYPE_IDS = Object.keys(PLANET_TYPES);
export const TRAIT_NAMES = {
  lowGravity: 'Low gravity', heavyGravity: 'Heavy gravity', temperate: 'Temperate', arid: 'Arid', frozen: 'Frozen', humid: 'Humid', infernal: 'Infernal heat',
  thinAir: 'Thin air', airless: 'Airless', longNights: 'Long nights', shortNights: 'Short nights', crystal: 'Crystal veins', metals: 'Rich metals',
  geothermal: 'Geothermal', ice: 'Water ice', spores: 'Luminous spores', helium3: 'Helium-3', auroras: 'Auroras', twinMoons: 'Twin moons',
  giantRise: 'Gas-giant rise', ringshine: 'Ringshine', meteors: 'Meteor showers', glowFlora: 'Glowing flora', tides: 'Great tides',
  singingDunes: 'Singing dunes', geysers: 'Geysers', clearSkies: 'Clear dark skies', lavaFalls: 'Lava falls', coast: 'Coastline', river: 'River',
};
export function genTraits(type, seed) {
  const rng = mulberry32(seed), T = PLANET_TYPES[type];
  const g = type === 'moon' ? (rng() < 0.8 ? 'low' : 'standard') : (rng() < 0.25 ? 'low' : rng() < 0.25 ? 'heavy' : 'standard');
  const day = rng() < (T.feats.longNights ? 0.6 : 0.2) ? 'long' : rng() < 0.2 ? 'short' : 'standard';
  const features = Object.entries(T.feats).filter(([k, p]) => k !== 'longNights' && rng() < p).map(([k]) => k);
  if (!features.length) features.push(Object.keys(T.feats)[0] === 'longNights' ? 'clearSkies' : Object.keys(T.feats)[0]);
  const resources = Object.entries(T.res).filter(([, p]) => rng() < p).map(([k]) => k);
  if (type === 'ocean' || type === 'desert' || type === 'crystal') features.push('coast');
  if (type === 'jungle' || type === 'volcanic') features.push('river');
  const gravity = g === 'low' ? +(0.35 + rng() * 0.3).toFixed(2) : g === 'heavy' ? +(1.3 + rng() * 0.4).toFixed(2) : +(0.85 + rng() * 0.25).toFixed(2);
  return { gravity, gravityClass: g, climate: T.climate, day, features, resources };
}
export function traitKeys(traits) {
  const k = new Set([traits.climate, ...traits.features, ...traits.resources]);
  if (traits.gravityClass === 'low') k.add('lowGravity');
  if (traits.gravityClass === 'heavy') k.add('heavyGravity');
  if (traits.day === 'long') k.add('longNights');
  if (traits.day === 'short') k.add('shortNights');
  return k;
}
export function landmarkBoost(def, keys) { let b = 1; for (const [k, m] of Object.entries(def.boosts || {})) if (keys.has(k)) b *= m; return Math.min(1.6, Math.max(0.6, b)); }

// ---------------------------------------------------------------- galaxy (the Lantern Cluster)
export const SOURCE_WORLDS = [
  { id: 'orrin', name: 'Orrin Prime', pos: [-58, 6, -40], demand: 330, mix: { sightseer: 0.35, scholar: 0.3, romantic: 0.15, thrill: 0.1, pilgrim: 0.1 }, dest: { name: 'the Grand Arcades', A: { sightseer: 9, scholar: 6, romantic: 3, thrill: 3, pilgrim: 2 }, base: 360, grow: 9 }, color: 0xffd27a, look: 'ocean' },
  { id: 'tessaly', name: 'Tessaly', pos: [62, -4, -52], demand: 280, mix: { romantic: 0.4, pilgrim: 0.25, sightseer: 0.2, scholar: 0.1, thrill: 0.05 }, dest: { name: 'the Tessaly Spires', A: { romantic: 9, pilgrim: 6, sightseer: 5, scholar: 3, thrill: 1 }, base: 420, grow: 12 }, color: 0xff9ad8, look: 'jungle' },
  { id: 'kethra', name: 'Kethra Reach', pos: [84, 9, 30], demand: 230, mix: { thrill: 0.45, sightseer: 0.25, scholar: 0.15, romantic: 0.1, pilgrim: 0.05 }, dest: null, color: 0xff8a4a, look: 'volcanic' },
  { id: 'nimbus', name: 'Nimbus Academy', pos: [-30, -10, 70], demand: 190, mix: { scholar: 0.55, sightseer: 0.2, thrill: 0.1, romantic: 0.1, pilgrim: 0.05 }, dest: null, color: 0x7ac8ff, look: 'ice' },
  { id: 'varo', name: 'Varo Deep', pos: [-92, 3, 22], demand: 250, mix: { romantic: 0.3, sightseer: 0.35, thrill: 0.15, scholar: 0.1, pilgrim: 0.1 }, dest: { name: 'the Coral Halls', A: { romantic: 6, sightseer: 6, thrill: 4, scholar: 3, pilgrim: 2 }, base: 300, grow: 8 }, color: 0x5ad8ff, look: 'ocean' },
  { id: 'holloway', name: 'Holloway', pos: [24, 12, 92], demand: 170, mix: { pilgrim: 0.6, romantic: 0.15, scholar: 0.15, sightseer: 0.1, thrill: 0 }, dest: null, color: 0xb9a0ff, look: 'moon' },
];
const SYS_NAMES = ['Aster', 'Brightwell', 'Calder', 'Dunmere', 'Elowen', 'Faro', 'Gilt', 'Halcyon', 'Isra', 'Juniper', 'Kestrel', 'Lumen', 'Marrow', 'Nadir', 'Oriel', 'Peregrine', 'Quill', 'Rook'];
export const START_POS = [0, 0, 0];
export function genGalaxy(seed, startType) {
  const rng = mulberry32(seed ^ 0x51ab);
  const types = [startType, ...TYPE_IDS.filter((t) => t !== startType)];
  const systems = [];
  for (let i = 0; i < 16; i++) {
    const type = i < types.length ? types[i] : TYPE_IDS[(rng() * TYPE_IDS.length) | 0];
    let pos;
    if (i === 0) pos = [14, 2, 10];
    else {
      for (let tries = 0; tries < 40; tries++) {
        const a = rng() * Math.PI * 2, r = 26 + Math.sqrt(rng()) * (i < 7 ? 40 : 82);
        pos = [Math.cos(a) * r, (rng() - 0.5) * 16, Math.sin(a) * r];
        const clash = [...systems.map((s) => s.pos), ...SOURCE_WORLDS.map((w) => w.pos)].some((q) => Math.hypot(q[0] - pos[0], q[1] - pos[1], q[2] - pos[2]) < 18);
        if (!clash) break;
      }
    }
    const pseed = (seed * 31 + i * 977) >>> 0;
    const star = ['#ffe6b0', '#fff4e0', '#ffc48a', '#bcd4ff', '#ffd0d0'][(rng() * 5) | 0];
    systems.push({ id: 's' + i, name: SYS_NAMES[i] + (type === 'moon' ? ' b-I' : ' ' + ['I', 'II', 'III', 'IV'][(rng() * 4) | 0]), pos, type, seed: pseed, star, scanned: false, traits: genTraits(type, pseed) });
  }
  return systems;
}
export const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// ---------------------------------------------------------------- buildings
// size = footprint cells (square). out/use per day. visitorCap: shop throughput. beds: hotel.
export const BUILDINGS = {
  road: { name: 'Road', cost: 20, size: 1, upkeep: 0.4, key: '1', blurb: 'Everything must touch a road. Drag to lay a line.' },
  housing: { name: 'Housing', cost: 900, size: 1, upkeep: 4, power: 3, water: 3, residents: [36, 80, 150], key: '2', blurb: 'Homes for residents (workers). Grows taller when the city is happy.' },
  shop: { name: 'Shops', cost: 1600, size: 1, upkeep: 8, power: 4, water: 2, jobs: 16, visitorCap: 90, key: '3', blurb: 'Visitors spend here; residents get happier.' },
  hotel: { name: 'Hotel', cost: 4200, size: 1, upkeep: 26, power: 8, water: 6, jobs: 22, beds: 110, key: '4', blurb: 'Beds for overnight visitors — they spend far more and review better.' },
  power: { name: 'Power plant', cost: 5200, size: 2, upkeep: 40, out: 160, jobs: 12, key: '5', blurb: 'Generates power for the city.' },
  water: { name: 'Water works', cost: 3200, size: 1, upkeep: 22, wout: 120, power: 4, jobs: 8, key: '6', blurb: 'Pumps and purifies water.' },
  spaceport: { name: 'Spaceport', cost: 14000, size: 3, upkeep: 70, power: 18, water: 4, jobs: 30, docks: 240, key: '7', blurb: 'Landing slots: every visitor arrives here. More ports = more visitors/day.' },
  transit: { name: 'Transit stop', cost: 2600, size: 1, upkeep: 16, power: 4, jobs: 4, radius: 6, key: '8', blurb: 'Maglev stop: landmarks within reach review much better.' },
  park: { name: 'Park', cost: 500, size: 1, upkeep: 2, water: 1, key: '9', blurb: 'Happiness for residents, a little charm for visitors.' },
};
export const BUILD_IDS = Object.keys(BUILDINGS);

export const DIFFICULTY = {
  relaxed: { demand: 1.3, cost: 0.8, money: 1.4, rivals: 0.85 },
  standard: { demand: 1.0, cost: 1.0, money: 1.0, rivals: 1.0 },
  tycoon: { demand: 0.85, cost: 1.15, money: 0.8, rivals: 1.15 },
};
export const SETTLE_COST = [0, 25000, 60000, 110000, 180000, 260000];
export const SCAN_COST = 800, SCAN_HOURS = 6;

export function newPlanetState(sys) {
  const terr = genTerrain(sys.type, sys.seed);
  return {
    sys: sys.id, type: sys.type, seed: sys.seed, name: sys.name, traits: sys.traits,
    grid: new Array(GRID * GRID).fill(0),      // 0 empty, -1 road, >0 building uid
    land: Array.from(terr.cells),               // 0 buildable, 1 water, 2 rough
    buildings: [], landmarks: [], nextId: 1,
    stats: { pop: 0, jobs: 0, employed: 0, power: 0, powerUse: 0, water: 0, waterUse: 0, happiness: 60, visitors: 0, overnight: 0, turnedAway: 0, beds: 0, docks: 0, rating: 3.0, income: 0, expenses: 0, spend: 0 },
    hist: [], reviews: [], today: { visitors: 0, income: 0, turned: 0 },
  };
}

export function newGame({ seed = 12345, planetType = 'ocean', money = 60000, mode = 'scenario', difficulty = 'standard', unlock = 'progress' } = {}) {
  const D = DIFFICULTY[difficulty] || DIFFICULTY.standard;
  const systems = genGalaxy(seed, planetType);
  return {
    version: 1, seed, rngState: seed ^ 0x9e37, mode, difficulty, unlockMode: unlock,
    money: Math.round(money * D.money * (mode === 'sandbox' ? 10 : 1)), day: 1, hour: 7, renown: 0, totalVisitors: 0,
    systems, planets: {}, settled: [], active: null, scans: [], events: [], milestones: {}, unlocked: unlockedFor({ unlockMode: unlock, renown: 0, milestones: {} }),
    tutorial: 0, log: [], rivals: SOURCE_WORLDS.filter((w) => w.dest).map((w) => ({ id: w.id, name: w.dest.name, world: w.name, visitors: w.dest.base })),
    eventFreq: 1, disasters: 'gentle', lastEventDay: 0, festivalsHeld: 0, won: false,
  };
}
export function unlockedFor(st) {
  if (st.unlockMode === 'all') return LANDMARKS.map((l) => l.id);
  return LANDMARKS.filter((l) => l.unlock.start || (l.unlock.renown != null && st.renown >= l.unlock.renown) || (l.unlock.milestone && st.milestones[l.unlock.milestone])).map((l) => l.id);
}
const rand = (st) => { const r = mulberry32(st.rngState); const v = r(); st.rngState = (st.rngState + 0x6D2B79F5) >>> 0; return v; };

// ---------------------------------------------------------------- galaxy actions
export function scanRange(st) { return 46 + st.settled.length * 22 + Math.min(40, st.renown / 600); }
export function inScanRange(st, sys) {
  if (!st.settled.length) return dist3(sys.pos, START_POS) <= 46;
  return st.settled.some((id) => dist3(st.systems.find((s) => s.id === id).pos, sys.pos) <= scanRange(st));
}
export function startScan(st, sysId) {
  const sys = st.systems.find((s) => s.id === sysId);
  if (!sys || sys.scanned) return { ok: false, reason: 'Already scanned' };
  if (st.scans.some((s) => s.sys === sysId)) return { ok: false, reason: 'Scan in progress' };
  if (!inScanRange(st, sys)) return { ok: false, reason: 'Out of scanner range — settle closer worlds first' };
  const cost = st.settled.length ? SCAN_COST : 0;
  if (st.money < cost) return { ok: false, reason: 'Not enough credits' };
  st.money -= cost;
  st.scans.push({ sys: sysId, hours: st.settled.length ? SCAN_HOURS : 1.5, total: st.settled.length ? SCAN_HOURS : 1.5 });
  return { ok: true, cost };
}
export function settleCost(st) { return Math.round(SETTLE_COST[Math.min(st.settled.length, SETTLE_COST.length - 1)] * (DIFFICULTY[st.difficulty]?.cost || 1)); }
export function settle(st, sysId, name) {
  const sys = st.systems.find((s) => s.id === sysId);
  if (!sys || !sys.scanned) return { ok: false, reason: 'Scan it first' };
  if (st.planets[sysId]) return { ok: false, reason: 'Already settled' };
  const cost = settleCost(st);
  if (st.money < cost) return { ok: false, reason: `Settling costs ${fmt(cost)}` };
  st.money -= cost;
  const p = newPlanetState(sys);
  if (name) p.name = name;
  st.planets[sysId] = p; st.settled.push(sysId); st.active = sysId;
  // a free starter spaceport + road stub near the centre, on buildable land
  const spot = findStarterSpot(p);
  if (spot) {
    placeBuilding(st, p, 'spaceport', spot.x, spot.z, { free: true, instant: true });
    for (let i = 0; i < 4; i++) if (canPlace(p, 'road', spot.x + 3, spot.z + i).ok) placeBuilding(st, p, 'road', spot.x + 3, spot.z + i, { free: true, instant: true });
  }
  return { ok: true, cost, planet: p };
}
function findStarterSpot(p) {
  const c = GRID / 2;
  for (let r = 0; r < GRID / 2; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const x = c - 4 + dx, z = c - 2 + dz;
    if (canPlace(p, 'spaceport', x, z).ok && [0, 1, 2, 3].every((i) => p.land[(z + i) * GRID + x + 3] === 0)) return { x, z };
  }
  return null;
}

// ---------------------------------------------------------------- city placement
export function sizeOf(kind) { return BUILDINGS[kind]?.size ?? LANDMARK_BY_ID[kind]?.footprint ?? 1; }
export function costOf(st, kind, p) {
  const base = BUILDINGS[kind]?.cost ?? LANDMARK_BY_ID[kind]?.cost ?? 0;
  const keys = p ? traitKeys(p.traits) : new Set();
  let m = DIFFICULTY[st.difficulty]?.cost || 1;
  if (keys.has('heavyGravity')) m *= 1.15; if (keys.has('lowGravity')) m *= 0.92; if (keys.has('airless') && kind === 'housing') m *= 1.2;
  return Math.round(base * m);
}
export function canPlace(p, kind, x, z) {
  const s = sizeOf(kind);
  if (x < 0 || z < 0 || x + s > GRID || z + s > GRID) return { ok: false, reason: 'Outside the city zone' };
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
    const k = (z + j) * GRID + x + i;
    if (p.land[k] === 1 && kind !== 'road') return { ok: false, reason: 'Can’t build on water (roads can bridge it)' };
    if (p.land[k] === 2) return { ok: false, reason: 'Ground too rough' };
    if (p.grid[k] !== 0) return { ok: false, reason: 'Space occupied' };
  }
  return { ok: true };
}
export function frontage(x, z, s) { // the 4·s edge-adjacent cells around a footprint (no diagonals)
  const out = [];
  for (let i = 0; i < s; i++) out.push([x + i, z - 1], [x + i, z + s], [x - 1, z + i], [x + s, z + i]);
  return out.filter(([cx, cz]) => cx >= 0 && cz >= 0 && cx < GRID && cz < GRID);
}
export function roadAdjacent(p, x, z, s) { return frontage(x, z, s).some(([cx, cz]) => p.grid[cz * GRID + cx] === -1); }
export function placeBuilding(st, p, kind, x, z, { free = false, instant = false, rot = 0 } = {}) {
  const ok = canPlace(p, kind, x, z); if (!ok.ok) return ok;
  const bridge = kind === 'road' && p.land[z * GRID + x] === 1;
  const cost = free ? 0 : costOf(st, kind, p) * (bridge ? 6 : 1);
  if (st.money < cost && st.mode !== 'sandbox') return { ok: false, reason: 'Not enough credits' };
  const isLm = !!LANDMARK_BY_ID[kind];
  if (isLm && !st.unlocked.includes(kind)) return { ok: false, reason: 'Landmark locked' };
  st.money -= cost;
  const s = sizeOf(kind);
  if (kind === 'road') { p.grid[z * GRID + x] = -1; p.stats.dirty = true; return { ok: true, cost, kind, bridge }; }
  const uid = p.nextId++;
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) p.grid[(z + j) * GRID + x + i] = uid;
  const b = { uid, kind, x, z, s, level: 1, built: instant ? 1 : 0, seed: (p.seed + uid * 7919) >>> 0, rot, age: 0 };
  if (isLm) Object.assign(b, { rating: LANDMARK_BY_ID[kind].tier, visits: 0, total: 0, lm: true, festival: 0 });
  (isLm ? p.landmarks : p.buildings).push(b);
  p.stats.dirty = true;
  return { ok: true, cost, kind, b };
}
export function bulldoze(st, p, x, z) {
  const v = p.grid[z * GRID + x];
  if (v === 0) return { ok: false, reason: 'Nothing here' };
  if (v === -1) { p.grid[z * GRID + x] = 0; p.stats.dirty = true; st.money += 5; return { ok: true, kind: 'road' }; }
  const list = p.buildings.find((b) => b.uid === v) ? p.buildings : p.landmarks;
  const b = list.find((q) => q.uid === v);
  if (b.kind === 'spaceport' && p.buildings.filter((q) => q.kind === 'spaceport').length === 1) return { ok: false, reason: 'Keep at least one spaceport' };
  for (let k = 0; k < p.grid.length; k++) if (p.grid[k] === v) p.grid[k] = 0;
  list.splice(list.indexOf(b), 1);
  st.money += Math.round(costOf(st, b.kind, p) * 0.25);
  p.stats.dirty = true;
  return { ok: true, kind: b.kind, b };
}
export function upgradeSpaceport(st, p, b) { /* reserved for Fable/content pass */ return { ok: false }; }

// connectivity: BFS over road cells from every spaceport-adjacent road; returns distance (cells) per road cell
export function roadNetwork(p) {
  const dist = new Int16Array(GRID * GRID).fill(-1); const q = [];
  for (const b of p.buildings) if (b.kind === 'spaceport' && b.built >= 1) {
    for (const [cx, cz] of frontage(b.x, b.z, b.s)) { const k = cz * GRID + cx; if (p.grid[k] === -1 && dist[k] < 0) { dist[k] = 0; q.push(k); } }
  }
  for (let h = 0; h < q.length; h++) {
    const k = q[h], x = k % GRID, z = (k / GRID) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= GRID || nz >= GRID) continue; const n = nz * GRID + nx; if (p.grid[n] === -1 && dist[n] < 0) { dist[n] = dist[k] + 1; q.push(n); } }
  }
  return dist;
}
function accessOf(p, net, b) { // shortest road distance from a spaceport to this building's frontage; -1 = unreachable
  let best = -1;
  for (const [cx, cz] of frontage(b.x, b.z, b.s)) { const d = net[cz * GRID + cx]; if (d >= 0 && (best < 0 || d < best)) best = d; }
  return best;
}

// ---------------------------------------------------------------- city aggregate (recomputed when dirty or hourly)
export function computeCity(st, p) {
  const keys = traitKeys(p.traits);
  const net = roadNetwork(p);
  const S = { pop: 0, jobs: 0, power: 0, powerUse: 0, water: 0, waterUse: 0, beds: 0, docks: 0, shopCap: 0, parks: 0, upkeep: 0, transit: [], unconnected: 0 };
  const all = [...p.buildings, ...p.landmarks];
  for (const b of all) {
    const d = BUILDINGS[b.kind] || LANDMARK_BY_ID[b.kind];
    b.road = roadAdjacent(p, b.x, b.z, b.s);
    b.access = accessOf(p, net, b);
    if (b.built < 1) continue;
    S.upkeep += (d.upkeep || 0) * (b.kind === 'housing' ? b.level : 1);
    if (!b.road) { S.unconnected++; continue; }
    S.powerUse += (d.power || 0) * (b.kind === 'housing' ? b.level : 1) * (keys.has('frozen') && b.kind === 'housing' ? 1.25 : 1);
    S.waterUse += (d.water || 0) * (b.kind === 'housing' ? b.level : 1);
    S.jobs += d.jobs || 0;
    if (b.kind === 'housing') S.pop += d.residents[b.level - 1];
    if (b.kind === 'power') S.power += d.out * (keys.has('geothermal') ? 1.35 : 1) * (keys.has('infernal') ? 1.15 : 1);
    if (b.kind === 'water') S.water += d.wout * (keys.has('arid') ? 0.65 : 1) * (keys.has('ice') ? 1.3 : 1) * (keys.has('airless') ? 0.8 : 1);
    if (b.kind === 'hotel') S.beds += d.beds;
    if (b.kind === 'spaceport' && b.access >= 0) S.docks += d.docks;
    if (b.kind === 'shop') S.shopCap += d.visitorCap;
    if (b.kind === 'park') S.parks++;
    if (b.kind === 'transit') S.transit.push(b);
  }
  // a little solar/fuel-cell baseline so a brand-new colony is not dead on arrival
  S.power += 30; S.water += 24;
  S.powerOk = S.powerUse <= 0 ? 1 : clamp(S.power / S.powerUse, 0, 1);
  S.waterOk = S.waterUse <= 0 ? 1 : clamp(S.water / S.waterUse, 0, 1);
  S.employed = Math.min(S.pop, S.jobs);
  S.staffing = S.jobs <= 0 ? 1 : clamp(0.35 + 0.65 * S.employed / S.jobs, 0, 1); // shortfall filled by commuters from orbit
  const unemployment = S.pop <= 0 ? 0 : 1 - S.employed / S.pop;
  const crowd = S.pop > 0 ? (p.stats.visitors || 0) / Math.max(60, S.pop) : 0;
  let happy = 62 + Math.min(18, S.parks * 2.2 * (keys.has('humid') ? 1.3 : 1)) - unemployment * 28 - (1 - S.powerOk) * 30 - (1 - S.waterOk) * 30 - Math.max(0, crowd - 2.5) * 4;
  if (keys.has('infernal')) happy -= 5; if (keys.has('temperate')) happy += 4;
  S.happiness = clamp(Math.round(happy), 0, 100);
  for (const l of p.landmarks) {
    l.transit = S.transit.some((t) => Math.max(Math.abs(t.x - (l.x + l.s / 2)), Math.abs(t.z - (l.z + l.s / 2))) <= BUILDINGS.transit.radius);
  }
  Object.assign(p.stats, S, { dirty: false });
  return p.stats;
}

// ---------------------------------------------------------------- tourism
export function planetAppeal(st, p) {
  const keys = traitKeys(p.traits);
  const A = Object.fromEntries(VT.map((t) => [t, 0]));
  for (const l of p.landmarks) {
    if (l.built < 1 || l.access < 0) continue;
    const d = LANDMARK_BY_ID[l.kind], boost = landmarkBoost(d, keys), q = clamp(l.rating, 1, 5) / 3.5;
    const fest = l.festival > 0 ? (d.festivalBoost || 1.3) : 1;
    for (const t of VT) A[t] += d.appeal[t] * (d.tier / 4) * boost * q * fest * 1.4;
  }
  const charm = Math.min(3, p.stats.parks * 0.25 + (p.stats.shopCap > 0 ? 1 : 0));
  for (const t of VT) if (A[t] > 0) A[t] += charm;
  return A;
}
function eventMult(st, p) { let m = 1; for (const e of st.events) if (e.planet === p.sys) m *= e.mult || 1; return m; }
export function rivalAppeal(st, w) { const D = DIFFICULTY[st.difficulty] || DIFFICULTY.standard; const g = 2.4 + (st.day - 1) * 0.06; return Object.fromEntries(VT.map((t) => [t, (w.dest.A[t] || 0) * g * D.rivals])); }
const STAY_HOME = 4.5;

// daily demand by visitor type headed for each player planet (before capacity)
export function demandFor(st) {
  const D = DIFFICULTY[st.difficulty] || DIFFICULTY.standard;
  const growth = 1 + (st.day - 1) * 0.028;
  const dests = [];
  for (const id of st.settled) { const p = st.planets[id]; const sys = st.systems.find((s) => s.id === id); dests.push({ p, pos: sys.pos, A: planetAppeal(st, p), mult: eventMult(st, p) }); }
  for (const w of SOURCE_WORLDS) if (w.dest) dests.push({ rival: w, pos: w.pos, A: rivalAppeal(st, w), mult: 1 });
  const out = new Map(dests.filter((d) => d.p).map((d) => [d.p.sys, { total: 0, byType: Object.fromEntries(VT.map((t) => [t, 0])), bySource: {} }]));
  const rivalVisits = {};
  for (const w of SOURCE_WORLDS) {
    for (const t of VT) {
      const N = w.demand * 1.25 * (w.mix[t] || 0) * growth * D.demand;
      if (N <= 0) continue;
      let sum = STAY_HOME; const sc = [];
      for (const d of dests) { const f = 1 / (1 + dist3(w.pos, d.pos) / 75); const s = d.A[t] * f * d.mult; sc.push(s); sum += s; }
      dests.forEach((d, i) => {
        const v = N * sc[i] / sum;
        if (d.p) { const o = out.get(d.p.sys); o.total += v; o.byType[t] += v; o.bySource[w.id] = (o.bySource[w.id] || 0) + v; }
        else rivalVisits[d.rival.id] = (rivalVisits[d.rival.id] || 0) + v;
      });
    }
  }
  return { out, rivalVisits };
}

// One in-game hour of tourism + economy for every settled planet. Visitors arrive mostly by day.
export function simHour(st) {
  const hourW = HOUR_WEIGHT[Math.floor(st.hour) % 24];
  const { out, rivalVisits } = demandFor(st);
  for (const id of st.settled) {
    const p = st.planets[id];
    if (p.stats.dirty || !p.stats.powerOk) computeCity(st, p);
    const S = p.stats, dem = out.get(id);
    const want = dem.total * hourW;
    const cap = S.docks / 24 * (S.powerOk * 0.5 + 0.5);
    const arrive = Math.min(want, cap);
    const turned = Math.max(0, want - cap);
    const nightStay = Math.min(arrive, S.beds / 2 / 24 * S.staffing);
    // spread arrivals across landmarks by appeal-weighted share
    const reach = p.landmarks.filter((l) => l.built >= 1 && l.access >= 0);
    let landmarkVisits = 0;
    if (reach.length) {
      const keys = traitKeys(p.traits);
      const w = reach.map((l) => { const d = LANDMARK_BY_ID[l.kind]; let s = 0; for (const t of VT) s += (dem.byType[t] / Math.max(1e-6, dem.total)) * d.appeal[t]; return Math.max(0.1, s * landmarkBoost(d, keys) * (l.festival > 0 ? 1.5 : 1)); });
      const ws = w.reduce((a, b) => a + b, 0);
      reach.forEach((l, i) => { const v = arrive * 1.6 * w[i] / ws; l.visits += v; l.total += v; landmarkVisits += v; });
    }
    const shopV = Math.min(arrive * 0.85, S.shopCap / 24 * S.staffing);
    const income = arrive * 6 + nightStay * 34 + shopV * 12 + landmarkVisits * 6;
    const taxes = S.employed * 0.11;
    const upkeep = S.upkeep * (st.money < 0 ? 0.6 : 1.5) / 24;
    const delta = income + taxes - upkeep;
    st.money += delta;
    p.today.visitors += arrive; p.today.turned += turned; p.today.income += delta; p.today.overnight = (p.today.overnight || 0) + nightStay; p.today.want = (p.today.want || 0) + want;
    st.totalVisitors += arrive; st.renown += arrive * (0.6 + p.stats.rating / 6);
  }
  for (const r of st.rivals) r.today = (r.today || 0) + (rivalVisits[r.id] || 0) * hourW;
  // scans
  for (const s of st.scans) s.hours -= 1;
  const done = st.scans.filter((s) => s.hours <= 0);
  st.scans = st.scans.filter((s) => s.hours > 0);
  for (const s of done) { const sys = st.systems.find((q) => q.id === s.sys); sys.scanned = true; st.log.push({ t: 'scan', sys: sys.id }); }
  // construction progress
  for (const id of st.settled) for (const b of [...st.planets[id].buildings, ...st.planets[id].landmarks]) if (b.built < 1) { b.built = Math.min(1, b.built + (b.lm ? 1 / 10 : 1 / 2)); if (b.built >= 1) { st.planets[id].stats.dirty = true; st.log.push({ t: b.lm ? 'landmarkDone' : 'built', planet: id, uid: b.uid, kind: b.kind }); } }
  st.hour += 1;
  if (st.hour >= 24) { st.hour -= 24; simDay(st); }
}
// arrival shape over the day (sums to 1)
export const HOUR_WEIGHT = (() => { const w = []; for (let h = 0; h < 24; h++) w.push(0.25 + Math.max(0, Math.sin((h - 5) / 16 * Math.PI))); const s = w.reduce((a, b) => a + b, 0); return w.map((x) => x / s); })();

const REVIEW = {
  great: ['“{lm} at night is unreal. Worth every light-year.”', '“I cried a little at {lm}. Don’t tell my crew.”', '“Best stopover in the cluster. {lm} alone is worth it.”', '“Came for a day, stayed for four. {lm}!”'],
  trait: ['“Seeing {lm} under the {trait} changed me.”', '“{trait} + {lm} = the photo of my life.”'],
  crowd: ['“Gorgeous, but I queued for hours at {lm}.”', '“{lm} is beautiful. So were the 900 people in front of me.”'],
  nobed: ['“Nowhere to sleep. Spent the night on the shuttle.”', '“Lovely world, zero hotel rooms.”'],
  transit: ['“Long, dusty walk from the spaceport to {lm}.”', '“Wish there was a maglev out to {lm}.”'],
  turned: ['“Circled for a day — no landing slot!”', '“Spaceport full. Diverted to {rival}.”'],
  unhappy: ['“Locals seemed tired of tourists.”', '“Half the city was blacked out.”'],
  meh: ['“Pleasant. Not sure I’d fly back for {lm}.”', '“Nice enough. {lm} needs more around it.”'],
};
function pickReview(st, kind, vars) { const arr = REVIEW[kind]; let s = arr[Math.floor(rand(st) * arr.length)]; for (const [k, v] of Object.entries(vars)) s = s.replace('{' + k + '}', v); return s; }

export function simDay(st) {
  st.day += 1;
  const sources = SOURCE_WORLDS.map((w) => w.name);
  for (const id of st.settled) {
    const p = st.planets[id];
    computeCity(st, p);
    const S = p.stats, keys = traitKeys(p.traits);
    const vis = p.today.visitors, turned = p.today.turned, over = p.today.overnight || 0;
    S.visitors = vis; S.turnedAway = turned; S.overnight = over; S.income = p.today.income;
    p.hist.push({ d: st.day - 1, v: Math.round(vis), i: Math.round(p.today.income), t: Math.round(turned) });
    if (p.hist.length > 60) p.hist.shift();
    // landmark satisfaction → ratings (EMA) + one review each
    const lodging = vis > 1 ? clamp(over / vis, 0, 1) : 1;
    let rsum = 0, rw = 0;
    for (const l of p.landmarks) {
      if (l.built < 1) continue;
      const d = LANDMARK_BY_ID[l.kind], boost = landmarkBoost(d, keys);
      const crowd = l.visits / (d.capacity * (l.transit ? 1.25 : 1));
      let s = d.tier + (boost - 1) * 1.3 + (l.transit ? 0.35 : -0.15) + (S.happiness - 60) / 80 + (lodging - 0.6) * 0.6 - Math.max(0, crowd - 1) * 1.4 - (turned > vis * 0.6 && vis > 20 ? 0.25 : 0) + (l.festival > 0 ? 0.3 : 0);
      if (l.access < 0) s = 1.5;
      s = clamp(s, 1, 5);
      if (l.visits > 0.5) l.rating = clamp(l.rating + (s - l.rating) * 0.22, 1, 5);
      l.lastSat = s; l.lastVisits = l.visits; l.crowd = crowd;
      if (l.visits > 2) {
        let kind = 'meh';
        if (turned > vis * 0.6 && rand(st) < 0.5) kind = 'turned';
        else if (crowd > 1.15) kind = 'crowd';
        else if (lodging < 0.35 && rand(st) < 0.6) kind = 'nobed';
        else if (!l.transit && rand(st) < 0.35) kind = 'transit';
        else if (S.happiness < 45) kind = 'unhappy';
        else if (s >= 4.2) kind = boost > 1.15 && rand(st) < 0.6 ? 'trait' : 'great';
        const traitK = Object.keys(d.boosts).find((k) => keys.has(k) && d.boosts[k] > 1);
        const vt = VT[Math.floor(rand(st) * VT.length)];
        p.reviews.unshift({ d: st.day - 1, lm: l.uid, stars: Math.round(s * 2) / 2, text: pickReview(st, kind, { lm: d.name, trait: TRAIT_NAMES[traitK]?.toLowerCase() || 'stars', rival: st.rivals[0]?.name || 'elsewhere' }), who: VISITOR_TYPES.find((v) => v.id === vt).name.replace(/s$/, ''), from: sources[Math.floor(rand(st) * sources.length)], kind });
      }
      rsum += l.rating * Math.max(1, l.visits); rw += Math.max(1, l.visits);
      l.visits = 0; if (l.festival > 0) l.festival--;
    }
    p.reviews = p.reviews.slice(0, 40);
    S.rating = rw ? rsum / rw : 3;
    // housing growth: happy, powered, watered, with jobs around → taller homes
    if (S.happiness >= 55 && S.powerOk > 0.95 && S.waterOk > 0.95) {
      const cand = p.buildings.filter((b) => b.kind === 'housing' && b.built >= 1 && b.road && b.level < 3);
      const n = Math.max(1, Math.floor(cand.length * 0.25));
      for (let i = 0; i < n && cand.length; i++) { const b = cand.splice(Math.floor(rand(st) * cand.length), 1)[0]; if (S.jobs > S.pop * 0.7 || b.level === 1) { b.level++; st.log.push({ t: 'grow', planet: id, uid: b.uid }); } }
    }
    p.today = { visitors: 0, income: 0, turned: 0, overnight: 0, want: 0 };
    computeCity(st, p);
  }
  for (const r of st.rivals) { r.visitors = Math.round(r.today || r.visitors); r.today = 0; }
  // gentle safety net: one Cluster Authority grant the first time the treasury goes negative (teaches, never punishes)
  if (st.money < 0 && !st.grantUsed && st.settled.length) { st.grantUsed = true; st.money += 20000; st.log.push({ t: 'grant', amount: 20000 }); }
  st.events = st.events.filter((e) => --e.days > 0);
  rollEvents(st);
  st.unlocked = unlockedFor(st);
  checkMilestones(st);
}

// ---------------------------------------------------------------- events (festivals by player; sky events + gentle disasters by chance)
export const EVENT_TYPES = {
  festival: { name: 'Festival', mult: 1.5, days: 2, blurb: 'Fireworks and music — visitors flood in.' },
  eclipse: { name: 'Eclipse', mult: 1.35, days: 1, blurb: 'The giant swallows the sun. Observatories and moon monuments fill up.', needs: ['giantRise', 'twinMoons'] },
  meteors: { name: 'Meteor shower', mult: 1.3, days: 2, blurb: 'Streaks all night: sky-watchers arrive in droves.' },
  auroraStorm: { name: 'Aurora storm', mult: 1.4, days: 1, blurb: 'The whole sky ripples green and violet.', needs: ['auroras'] },
  dustStorm: { name: 'Dust storm', mult: 0.7, days: 1, disaster: true, blurb: 'Visibility near zero; ships wait in orbit.', needs: ['arid'] },
  solarFlare: { name: 'Solar flare', mult: 0.85, days: 1, disaster: true, blurb: 'Power grid strained; half the windows go dark.' },
};
export function rollEvents(st) {
  if (!st.settled.length || st.day - st.lastEventDay < 3) return;
  const freq = st.eventFreq ?? 1;
  if (freq <= 0 || rand(st) > 0.22 * freq) return;
  const id = st.settled[Math.floor(rand(st) * st.settled.length)], p = st.planets[id], keys = traitKeys(p.traits);
  const pool = Object.entries(EVENT_TYPES).filter(([k, e]) => k !== 'festival' && (!e.needs || e.needs.some((n) => keys.has(n))) && (!e.disaster || st.disasters !== 'off'));
  if (!pool.length) return;
  const weights = pool.map(([, e]) => (e.disaster ? (st.disasters === 'frequent' ? 1.4 : 0.45) : 1));
  let r = rand(st) * weights.reduce((a, b) => a + b, 0), k = 0; while ((r -= weights[k]) > 0) k++;
  const [type, e] = pool[Math.min(k, pool.length - 1)];
  st.events.push({ type, planet: id, days: e.days, mult: e.mult, name: e.name });
  st.lastEventDay = st.day;
  st.log.push({ t: 'event', type, planet: id });
}
export const FESTIVAL_COST = 3000;
export function holdFestival(st, p, l) {
  if (l.festival > 0) return { ok: false, reason: 'Festival already running' };
  const cost = Math.round(FESTIVAL_COST * (1 + st.festivalsHeld * 0.25));
  if (st.money < cost) return { ok: false, reason: `Festivals cost ${fmt(cost)}` };
  st.money -= cost; l.festival = 2; st.festivalsHeld++;
  st.events.push({ type: 'festival', planet: p.sys, days: 2, mult: 1.25, name: 'Festival at ' + LANDMARK_BY_ID[l.kind].name });
  st.milestones.festival ??= st.day;
  return { ok: true, cost };
}

// ---------------------------------------------------------------- goals
export const MILESTONES = [
  { id: 'settle', name: 'First light', desc: 'Settle your first world', test: (st) => st.settled.length >= 1 },
  { id: 'firstLandmark', name: 'A reason to come', desc: 'Complete your first landmark', test: (st) => allLandmarks(st).some((l) => l.built >= 1) },
  { id: 'visitors1k', name: 'First 1,000 visitors', desc: 'Welcome 1,000 visitors in total', test: (st) => st.totalVisitors >= 1000 },
  { id: 'pop1k', name: 'A real city', desc: 'Reach 1,000 residents on one world', test: (st) => st.settled.some((id) => st.planets[id].stats.pop >= 1000) },
  { id: 'festival', name: 'Lanterns up', desc: 'Host a festival at a landmark', test: (st) => !!st.milestones.festival },
  { id: 'fiveStar', name: 'Five stars', desc: 'A landmark rated 4.75★ or better', test: (st) => allLandmarks(st).some((l) => l.rating >= 4.75) },
  { id: 'threePlanets', name: 'Three worlds', desc: 'Settle three planets (unlocks the Skyhook)', test: (st) => st.settled.length >= 3 },
  { id: 'visitors10k', name: 'Ten thousand', desc: 'Welcome 10,000 visitors in total', test: (st) => st.totalVisitors >= 10000 },
  { id: 'mostVisited', name: 'Brightest harbour', desc: 'Skyharbor is the most-visited world in the cluster', test: (st) => isMostVisited(st), finale: true },
];
export const allLandmarks = (st) => st.settled.flatMap((id) => st.planets[id].landmarks);
export function leaderboard(st) {
  const rows = st.rivals.map((r) => ({ name: r.name, world: r.world, visitors: r.visitors || 0, you: false }));
  for (const id of st.settled) { const p = st.planets[id]; rows.push({ name: p.name, world: p.name, visitors: Math.round(p.stats.visitors || 0), you: true, home: id === st.settled[0] }); }
  return rows.sort((a, b) => b.visitors - a.visitors);
}
export function isMostVisited(st) { if (!st.settled.length) return false; const lb = leaderboard(st); return lb[0].you && lb[0].home && lb[0].visitors > 0; }
export function checkMilestones(st) {
  const got = [];
  for (const m of MILESTONES) if (!st.milestones[m.id] && m.test(st)) { st.milestones[m.id] = st.day; got.push(m); st.log.push({ t: 'milestone', id: m.id }); }
  if (got.length) st.unlocked = unlockedFor(st);
  if (st.milestones.mostVisited && st.mode === 'scenario') st.won = true;
  return got;
}
export function nextUnlock(st) {
  return LANDMARKS.filter((l) => !st.unlocked.includes(l.id) && l.unlock.renown != null).sort((a, b) => a.unlock.renown - b.unlock.renown)[0] || null;
}

export const fmt = (n) => (n < 0 ? '−' : '') + '¤' + Math.abs(Math.round(n)).toLocaleString('en-US');
export const fmtN = (n) => Math.round(n).toLocaleString('en-US');
export { LANDMARKS, LANDMARK_BY_ID, VISITOR_TYPES, hashStr };
