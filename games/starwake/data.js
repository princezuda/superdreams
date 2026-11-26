// Starwake — pure game data (no THREE, node-testable): factions, commodities, ships, outfits, sector generation, story.
export const VERSION = 1;

export function rng(seed) { // mulberry32
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------------------------------------------------------------- factions (original)
export const FACTIONS = {
  concord: { id: 'concord', name: 'Meridian Concord', short: 'Concord', color: '#5fb4ff', blurb: 'The chartered government-corporation that runs the core lanes. Orderly, taxed, patrolled.' },
  hollows: { id: 'hollows', name: 'Free Hollows Compact', short: 'Hollows', color: '#ffb347', blurb: 'Miners and growers of the outer rocks, bound by co-op charters and stubbornness.' },
  veil: { id: 'veil', name: 'Red Veil Syndicate', short: 'Red Veil', color: '#ff4d5e', blurb: 'Smugglers, raiders and fixers. They keep their word, mostly, and their cut, always.' },
  wake: { id: 'wake', name: 'Shepherds', short: 'Shepherds', color: '#6ff7e8', blurb: 'Ancient drones that tend the Starwake. Nobody knows who built them.' },
};
// how a faction regards another (used for NPC vs NPC hostility)
export const FACTION_HOSTILE = { concord: ['veil', 'wake'], hollows: ['veil', 'wake'], veil: ['concord', 'hollows', 'wake'], wake: ['concord', 'hollows', 'veil'] };

// ---------------------------------------------------------------- commodities
export const COMMODITIES = [
  { id: 'water', name: 'Water Ice', base: 22 },
  { id: 'food', name: 'Food Rations', base: 34 },
  { id: 'ore', name: 'Raw Ore', base: 48 },
  { id: 'fuel', name: 'Fuel Cells', base: 64 },
  { id: 'alloys', name: 'Alloys', base: 118 },
  { id: 'medical', name: 'Medical Kits', base: 156 },
  { id: 'machinery', name: 'Machinery', base: 190 },
  { id: 'electronics', name: 'Electronics', base: 268 },
  { id: 'luxury', name: 'Luxury Goods', base: 410 },
  { id: 'spirits', name: 'Void Spirits', base: 330, illegal: true },
  { id: 'relics', name: 'Wake Relics', base: 720, rare: true },
];
export const COMM = Object.fromEntries(COMMODITIES.map((c) => [c.id, c]));
// station archetypes: produce (cheap, stocked) / consume (expensive, wanted)
export const STATION_TYPES = {
  mining: { name: 'Mining', produce: ['ore', 'water'], consume: ['food', 'machinery', 'medical', 'electronics', 'spirits'], light: '#ffb070' },
  agri: { name: 'Agricultural', produce: ['food', 'luxury', 'water'], consume: ['machinery', 'electronics', 'fuel', 'medical'], light: '#9dff9a' },
  industrial: { name: 'Industrial', produce: ['alloys', 'machinery', 'fuel'], consume: ['ore', 'water', 'food', 'electronics'], light: '#ffd27a' },
  tech: { name: 'Tech', produce: ['electronics', 'medical'], consume: ['alloys', 'food', 'luxury', 'ore'], light: '#7ad8ff' },
  pirate: { name: 'Pirate base', produce: ['spirits'], consume: ['medical', 'luxury', 'food', 'electronics', 'machinery', 'relics'], light: '#ff6a6a' },
};

// ---------------------------------------------------------------- ships (forward = -Z, metres, m/s, rad/s)
export const SHIPS = {
  magpie: { id: 'magpie', name: 'Magpie', role: 'Light freighter', price: 18000, hull: 230, shield: 110, speed: 210, boost: 430, turn: 1.55, accel: 120, guns: 2, missiles: 4, cargo: 20, pods: 2, radius: 9, blurb: 'Your aunt\'s old hauler. Dented, reliable, two guns and a hold full of memories.' },
  kite: { id: 'kite', name: 'Kite', role: 'Interceptor', price: 32000, hull: 170, shield: 120, speed: 270, boost: 540, turn: 2.15, accel: 170, guns: 3, missiles: 6, cargo: 8, pods: 1, radius: 8, blurb: 'A needle with engines. Out-turns anything in the Reach and carries almost nothing.' },
  ox: { id: 'ox', name: 'Ox', role: 'Heavy hauler', price: 42000, hull: 420, shield: 150, speed: 165, boost: 330, turn: 1.0, accel: 80, guns: 2, missiles: 2, cargo: 60, pods: 4, radius: 16, blurb: 'Container spine, four engines, no shame. The trader\'s ship.' },
  halberd: { id: 'halberd', name: 'Halberd', role: 'Heavy fighter', price: 64000, hull: 360, shield: 190, speed: 205, boost: 410, turn: 1.45, accel: 120, guns: 4, missiles: 10, cargo: 16, pods: 1, radius: 11, blurb: 'Twin-boom gunship built for bounty work. Hits like a falling station.' },
  // NPC-only classes
  jackal: { id: 'jackal', name: 'Jackal', role: 'Raider', hull: 120, shield: 70, speed: 240, boost: 470, turn: 1.9, accel: 150, guns: 2, missiles: 0, radius: 8, npc: true },
  marauder: { id: 'marauder', name: 'Marauder', role: 'Heavy raider', hull: 260, shield: 150, speed: 190, boost: 380, turn: 1.25, accel: 110, guns: 3, missiles: 2, radius: 11, npc: true },
  barge: { id: 'barge', name: 'Barge', role: 'Freighter', hull: 700, shield: 200, speed: 90, boost: 140, turn: 0.45, accel: 40, guns: 1, missiles: 0, radius: 34, npc: true },
  shepherd: { id: 'shepherd', name: 'Shepherd', role: 'Ancient drone', hull: 150, shield: 160, speed: 230, boost: 420, turn: 2.0, accel: 160, guns: 2, missiles: 0, radius: 9, npc: true },
  capital: { id: 'capital', name: 'Capital ship', role: 'Cruiser', hull: 2600, shield: 0, speed: 30, boost: 40, turn: 0.08, accel: 8, guns: 0, missiles: 0, radius: 120, npc: true },
};
export const PLAYER_SHIPS = ['magpie', 'kite', 'ox', 'halberd'];

// ---------------------------------------------------------------- outfits
export const GUNS = {
  pulse: { id: 'pulse', name: 'Pulse Laser', speed: 1500, dmg: 9, rof: 7.5, energy: 4, range: 1600, vsShield: 1.35, vsHull: 0.8, color: '#ff5a3c', blurb: 'Fast bolts, strong against shields.' },
  driver: { id: 'driver', name: 'Mass Driver', speed: 1050, dmg: 17, rof: 3.6, energy: 6, range: 1500, vsShield: 0.7, vsHull: 1.45, color: '#7ab8ff', blurb: 'Heavy slugs that punch armour. Lead your shots.' },
  ion: { id: 'ion', name: 'Ion Repeater', speed: 1800, dmg: 6, rof: 11, energy: 3.2, range: 1400, vsShield: 1.7, vsHull: 0.55, color: '#7dffcf', blurb: 'Hosepipe of ions. Strips shields, tickles hulls.' },
};
export const MARKS = [
  { mk: 1, name: 'Mk I', mult: 1.0, price: 0 },
  { mk: 2, name: 'Mk II', mult: 1.3, price: 4200 },
  { mk: 3, name: 'Mk III', mult: 1.65, price: 11000 },
];
export const GUN_PRICE = { pulse: 1800, driver: 2600, ion: 3400 };
export const UPGRADES = {
  shields: { name: 'Shield Generator', blurb: 'Bigger shield capacity and faster recharge.', levels: [{ n: 'Mk I', v: 1, p: 0 }, { n: 'Mk II', v: 1.35, p: 3800 }, { n: 'Mk III', v: 1.75, p: 9500 }, { n: 'Mk IV', v: 2.2, p: 19000 }] },
  armour: { name: 'Armour Plating', blurb: 'More hull. Slightly heavier.', levels: [{ n: 'Light', v: 1, p: 0 }, { n: 'Plate', v: 1.4, p: 3200 }, { n: 'Composite', v: 1.85, p: 8800 }, { n: 'Ceramite', v: 2.4, p: 17500 }] },
  engines: { name: 'Engine Tuning', blurb: 'Top speed, boost and turn rate.', levels: [{ n: 'Stock', v: 1, p: 0 }, { n: 'Tuned', v: 1.12, p: 3000 }, { n: 'Racing', v: 1.25, p: 8200 }, { n: 'Overdrive', v: 1.38, p: 16000 }] },
  jump: { name: 'Jump Drive', blurb: 'Jump straight to systems in range, skipping gates. Uses fuel cells.', levels: [{ n: 'None', v: 0, p: 0 }, { n: 'Mk I (16 ly)', v: 16, p: 6500 }, { n: 'Mk II (26 ly)', v: 26, p: 15000 }] },
};
export const POD_PRICE = 2400, POD_SIZE = 10, MISSILE_PRICE = 120, CELL_PRICE = 40, REPAIR_PER_HP = 4;

// ---------------------------------------------------------------- sector
// Hand-authored graph (positions jittered by seed). Story-critical systems keep their station types.
const SYSTEM_DEFS = [
  { id: 'calder', name: "Calder's Rest", x: 28, y: 30, faction: 'concord', danger: 0, star: 'gold', stations: [{ id: 'calderRing', name: 'Calder Ring', type: 'tech', fixed: true }], planets: ['terran'], asteroids: false },
  { id: 'hesper', name: 'Hesper', x: 46, y: 17, faction: 'concord', danger: 1, star: 'white', stations: [{ id: 'hesperYards', name: 'Hesper Yards', type: 'industrial' }], planets: ['ocean', 'barren'], asteroids: false },
  { id: 'ironmere', name: 'Ironmere', x: 33, y: 48, faction: 'concord', danger: 1, star: 'orange', stations: [{ id: 'ironFoundry', name: 'Ironmere Foundry', type: 'industrial', fixed: true }], planets: ['lava'], asteroids: true },
  { id: 'carrow', name: 'Carrow', x: 10, y: 20, faction: 'concord', danger: 2, star: 'blue', stations: [{ id: 'carrowStation', name: 'Carrow Watch', type: 'tech' }], planets: ['ice'], asteroids: false },
  { id: 'tallow', name: 'Tallow', x: 15, y: 60, faction: 'hollows', danger: 2, star: 'red', stations: [{ id: 'tallowDeep', name: 'Tallow Deep', type: 'mining', fixed: true }], planets: ['barren'], asteroids: true },
  { id: 'vesk', name: 'Vesk', x: 52, y: 39, faction: 'hollows', danger: 3, star: 'orange', stations: [{ id: 'veskOutpost', name: 'Vesk Claim', type: 'mining' }], planets: ['gas'], asteroids: true },
  { id: 'sabine', name: 'Sabine Drift', x: 67, y: 12, faction: 'hollows', danger: 2, star: 'gold', stations: [{ id: 'sabineGreens', name: 'Sabine Greens', type: 'agri' }], planets: ['terran', 'barren'], asteroids: false },
  { id: 'morrow', name: 'Morrow', x: 80, y: 29, faction: 'hollows', danger: 2, star: 'white', stations: [{ id: 'morrowHaven', name: 'Morrow Haven', type: 'agri' }], planets: ['desert'], asteroids: true },
  { id: 'ninefold', name: 'Ninefold', x: 62, y: 56, faction: 'none', danger: 4, star: 'blue', stations: [], planets: ['gas'], asteroids: true },
  { id: 'gloam', name: 'Gloam', x: 82, y: 49, faction: 'veil', danger: 4, star: 'red', stations: [{ id: 'gloamHollow', name: 'Gloam Hollow', type: 'pirate', fixed: true }], planets: ['ice'], asteroids: true },
  { id: 'redhaven', name: 'Redhaven', x: 93, y: 64, faction: 'veil', danger: 5, star: 'red', stations: [{ id: 'redSpire', name: 'Redhaven Spire', type: 'pirate', fixed: true }], planets: ['lava', 'barren'], asteroids: false },
  { id: 'lacuna', name: 'Lacuna', x: 76, y: 74, faction: 'wake', danger: 4, star: 'wake', stations: [], planets: [], asteroids: true, hidden: true },
];
export const LINKS = [['calder', 'hesper'], ['calder', 'ironmere'], ['calder', 'carrow'], ['carrow', 'tallow'], ['ironmere', 'tallow'], ['ironmere', 'vesk'], ['hesper', 'vesk'], ['hesper', 'sabine'], ['sabine', 'morrow'], ['vesk', 'morrow'], ['vesk', 'ninefold'], ['morrow', 'gloam'], ['ninefold', 'gloam'], ['gloam', 'redhaven'], ['ninefold', 'redhaven']];
export const STAR_TYPES = {
  gold: { color: '#ffe2a8', light: '#fff0d8', size: 1.0 }, white: { color: '#f4f6ff', light: '#f2f4ff', size: 0.9 },
  orange: { color: '#ffb072', light: '#ffd2a8', size: 1.15 }, red: { color: '#ff6a48', light: '#ffb49a', size: 1.6 },
  blue: { color: '#a8c8ff', light: '#dce8ff', size: 0.8 }, wake: { color: '#8ffff0', light: '#c8fff8', size: 1.3 },
};
export const PLANET_TYPES = ['terran', 'ocean', 'desert', 'ice', 'lava', 'barren', 'gas'];

export function buildSector(seed = 7) {
  const r = rng(seed * 9973 + 17);
  const systems = {};
  const pTypes = PLANET_TYPES;
  for (const d of SYSTEM_DEFS) {
    const s = structuredClone(d);
    s.x = clamp(d.x + (r() - 0.5) * 6, 4, 96); s.y = clamp(d.y + (r() - 0.5) * 6, 4, 76);
    if (!d.hidden && d.id !== 'calder' && d.danger > 0) s.danger = clamp(d.danger + Math.round((r() - 0.5) * 1.2), 1, 5);
    s.hue = r(); // nebula variation
    s.planets = d.planets.map((t, i) => {
      const type = seed === 7 || i > 0 ? t : (r() < 0.6 ? t : pTypes[Math.floor(r() * pTypes.length)]);
      return { type, seed: Math.floor(r() * 1e6), radius: type === 'gas' ? 5200 + r() * 1800 : 2600 + r() * 1400, dist: 14000 + r() * 9000 + i * 9000, az: r() * Math.PI * 2, el: (r() - 0.5) * 0.5, rings: type === 'gas' && r() < 0.7, moon: r() < 0.35 };
    });
    s.stations = d.stations.map((st) => ({ ...st, type: st.fixed || seed === 7 ? st.type : (r() < 0.75 ? st.type : ['mining', 'agri', 'industrial', 'tech'][Math.floor(r() * 4)]), faction: st.type === 'pirate' ? 'veil' : (d.faction === 'none' ? 'hollows' : d.faction) }));
    s.sunAz = r() * Math.PI * 2; s.sunEl = 0.15 + r() * 0.4;
    s.fieldAz = r() * Math.PI * 2; s.fieldDist = 3800 + r() * 1500;
    s.gates = [];
    systems[s.id] = s;
  }
  systems.lacuna.x = Math.min(96, systems.ninefold.x + 13); systems.lacuna.y = Math.min(78, systems.ninefold.y + 16); // always inside wake-drive range of Ninefold
  for (const [a, b] of LINKS) { systems[a].gates.push(b); systems[b].gates.push(a); }
  // gate position: direction on the map toward the neighbour, mapped into the XZ plane
  for (const s of Object.values(systems)) {
    s.gatePos = {};
    for (const g of s.gates) {
      const o = systems[g]; const dx = o.x - s.x, dy = o.y - s.y, L = Math.hypot(dx, dy) || 1;
      s.gatePos[g] = [dx / L * 6500, ((hashStr(s.id + g) % 1000) / 1000 - 0.5) * 1200, dy / L * 6500];
    }
  }
  return systems;
}
export const mapDist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function route(systems, from, to) { // BFS over gate links (hidden systems unreachable)
  if (from === to) return [from];
  const prev = { [from]: null }; const q = [from];
  while (q.length) { const c = q.shift(); for (const n of systems[c].gates) if (!(n in prev)) { prev[n] = c; if (n === to) { const path = [to]; let p = c; while (p) { path.unshift(p); p = prev[p]; } return path; } q.push(n); } }
  return null;
}
export const stationById = (systems, id) => { for (const s of Object.values(systems)) for (const st of s.stations) if (st.id === id) return { sys: s, st }; return null; };

// ---------------------------------------------------------------- characters (portraits are drawn procedurally from these)
export const PEOPLE = {
  ferro: { name: 'Doc Ferro', faction: 'hollows', skin: '#8a5a3c', hair: '#d8d8d8', hairStyle: 'short', eyes: '#ffcf6a', accent: '#ffb347', title: 'Hollows engineer' },
  venn: { name: 'Cmdr. Asha Venn', faction: 'concord', skin: '#c9946e', hair: '#1c1c28', hairStyle: 'bun', eyes: '#7ad0ff', accent: '#5fb4ff', title: 'Concord Navy' },
  quill: { name: 'Mara Quill', faction: 'veil', skin: '#e2b99a', hair: '#b0203a', hairStyle: 'long', eyes: '#ff8a8a', accent: '#ff4d5e', title: 'Red Veil fixer' },
  ines: { name: 'Ines Calloway', faction: 'hollows', skin: '#d6a47e', hair: '#6a4a2e', hairStyle: 'long', eyes: '#9fe8ff', accent: '#6ff7e8', title: 'Your aunt' },
  control: { name: 'Traffic Control', faction: 'concord', skin: '#a07858', hair: '#303040', hairStyle: 'helmet', eyes: '#7ad0ff', accent: '#5fb4ff', title: 'Station control' },
  pirate: { name: 'Raider', faction: 'veil', skin: '#b08a70', hair: '#202020', hairStyle: 'mohawk', eyes: '#ff5050', accent: '#ff4d5e', title: 'Red Veil' },
  trader: { name: 'Freighter captain', faction: 'hollows', skin: '#7a5238', hair: '#a07030', hairStyle: 'short', eyes: '#ffd890', accent: '#ffb347', title: 'Hauler' },
  patrol: { name: 'Patrol leader', faction: 'concord', skin: '#e0b090', hair: '#c0a060', hairStyle: 'helmet', eyes: '#7ad0ff', accent: '#5fb4ff', title: 'Concord patrol' },
};
export const BAR_NAMES = ['Old Hesk', 'Juno Tamm', 'Pilot Rourke', 'Sister Oyelaran', 'Twelve-Fingers Pell', 'Marisol Ade', 'Kade Vonn', 'Tomas Reyl', 'Ilse Morrow', 'Dex Ambrose'];

// ---------------------------------------------------------------- story (5 missions, branch at 3, ending varies by rep)
export const STORY = [
  { id: 's1', doneBy: 'ferro', title: 'The Shard', giver: 'ines', at: 'calderRing', target: { sys: 'tallow', station: 'tallowDeep' }, reward: 2200, rep: { hollows: 8 },
    brief: 'Your aunt Ines left you the Magpie and a sealed data shard humming with a light nobody can name. Her note says: "Get this to Doc Ferro at Tallow Deep. Trust nobody else with it." Tallow is two jumps out (via Ironmere or Carrow).',
    done: 'Ferro turns the shard over in scarred hands. "She found it. The Starwake is real." He plugs it in and the room fills with a slow ribbon of light.' },
  { id: 's2', doneBy: 'ferro', title: 'Wake Buoys', giver: 'ferro', at: 'tallowDeep', target: { sys: 'vesk', patrol: 3 }, reward: 3200, rep: { hollows: 10 },
    brief: 'The shard holds positions of three wake buoys Ines seeded in Vesk. Fly to each and let them sync. Red Veil scouts have been sniffing round Vesk; expect company.',
    done: 'The buoys sang together for a second, then pointed somewhere that is not on any chart. Ferro calls it the Lacuna.' },
  { id: 's3c', doneBy: 'venn', title: 'Convoy Lumen', giver: 'venn', at: 'tallowDeep', branch: 'concord', target: { sys: 'ironmere', escort: true }, reward: 4800, rep: { concord: 18, veil: -15 },
    brief: '"The Concord will fund the expedition," Cmdr. Venn says, "if our science barge Lumen reaches the Ironmere gate to Vesk in one piece. The Veil know what she carries." Escort the Lumen from Ironmere Foundry to the Vesk gate.',
    done: 'Lumen jumps clean. Venn sends a terse "Well flown" and a transfer with more zeros than you expected.' },
  { id: 's3v', doneBy: 'quill', title: 'Lift the Core', giver: 'quill', at: 'tallowDeep', branch: 'veil', target: { sys: 'ironmere', raid: true }, reward: 4800, rep: { veil: 36, concord: -20 },
    brief: '"The Concord want to fence the wake off and sell tickets," Mara Quill smiles. "Their barge Lumen carries a survey core. Crack it in Ironmere, grab the core, and the Veil owes you." Destroy the Lumen and its escort and scoop the core.',
    done: 'Quill weighs the core like a gemstone. "Now nobody owns the way in except us. And you."' },
  { id: 's4', doneBy: 'ines', title: 'Into the Lacuna', giver: 'ferro', at: 'tallowDeep', target: { sys: 'lacuna', wreck: true }, reward: 3000, rep: { hollows: 10 }, gift: 'wakeDrive',
    brief: 'Ferro has tuned a jump drive to the buoy song and bolted it into your ship, no charge. "The Lacuna is off the gate network. Get within 24 ly (Ninefold is closest), open the sector map and jump. Ines\' last beacon is in there."',
    done: 'Ines\' ship Larkspur drifts cold in the wake. Her last log: "It isn\'t a road. It\'s a seed. Whoever holds it decides what grows."' },
  { id: 's5', doneBy: 'ferro', title: 'Starwake', giver: 'ines', at: 'lacuna', target: { sys: 'lacuna', finale: true }, reward: 12000, rep: {},
    brief: 'A capital ship is burning into the Lacuna to seize the wake. Knock down its three shield generators, then gut its core. Your allies are inbound.',
    done: 'The capital ship breaks apart against the light. The wake settles, quiet and patient, waiting to see what you do with it.' },
];
export const STORY_OBJ = {
  s1: 'Deliver the shard to Doc Ferro at Tallow Deep (Tallow)',
  s2: 'Sync the three wake buoys in Vesk',
  s3c: 'Escort the CNS Lumen from Ironmere Foundry to the Vesk gate',
  s3v: 'Intercept the CNS Lumen near Ironmere Foundry and take the survey core',
  s4: 'Reach Ninefold, open the map (M) and jump to the Lacuna; find the Larkspur',
  s5: 'Defend the Heart',
};
export const ENDINGS = {
  concord: 'The Concord charts the Starwake as a protected lane. Patrols keep the Veil out and the fees keep the patrols paid. Venn offers you a captain\'s commission; Ferro sends a single word: "Careful."',
  veil: 'The Veil holds the only key to the Lacuna. Mara Quill toasts you in every bar from Gloam to Redhaven. The Concord has your face on a poster now, which you take as a compliment.',
  hollows: 'You broadcast the buoy song to every ship in the Reach. Nobody owns the Starwake now. Ferro laughs until he coughs. "Ines would have done exactly that."',
};

export const TIPS = [
  'Shields regenerate after three seconds without taking hits. Break off, boost, come back.',
  'Fly through the lead pip, not the ship. Your bolts need time to travel.',
  'Mining stations pay well for food and machinery. Agri stations want machinery and electronics.',
  'Destroyed raiders sometimes drop cargo pods. Fly over them to scoop.',
  'Autopilot (Z) will drop out if hostiles come within 3 km.',
  'Concord patrols scan for Void Spirits. Smugglers fly fast ships for a reason.',
];
