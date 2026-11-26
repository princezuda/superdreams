// Lantern Hold — pure game data (no three.js). Towers, enemies, hero, campaign maps.
// Units: world units (map ≈ 30 × 21), seconds, gold. Shared by the browser game and node tests.

// ---------------------------------------------------------------- towers
// Every tower: tiers[0..2] (build + 2 upgrades), then a third upgrade picks one of two end-branches (A/B).
// dmgType: 'phys' (reduced by armour) | 'magic' (reduced by magic resist).
export const TOWERS = {
  archer: {
    name: 'Lantern Archers', short: 'Archers', dmgType: 'phys', air: true, kind: 'shooter',
    blurb: 'Fast arrows. Hits flying shades.',
    tiers: [
      { cost: 70, dmg: 8, rate: 0.75, range: 4.3 },
      { cost: 100, dmg: 13, rate: 0.65, range: 4.6 },
      { cost: 150, dmg: 20, rate: 0.55, range: 4.9 },
    ],
    branches: {
      A: { short: 'Starshot', name: 'Starshot Rangers', cost: 260, dmg: 22, rate: 0.5, range: 5.1, multi: 3, blurb: 'Looses three arrows at three different shades.' },
      B: { short: 'Hawkeye', name: 'Hawkeye Spire', cost: 280, dmg: 62, rate: 1.0, range: 6.6, pierce: 0.5, crit: 0.22, critMul: 3, blurb: 'Huge range, armour-piercing, critical shots.' },
    },
  },
  mortar: {
    name: 'Ember Kiln', short: 'Kiln', dmgType: 'phys', air: false, kind: 'shooter',
    blurb: 'Lobbed embers splash crowds. Ground only.',
    tiers: [
      { cost: 120, dmg: 20, rate: 2.5, range: 4.4, splash: 1.35 },
      { cost: 150, dmg: 34, rate: 2.4, range: 4.6, splash: 1.45 },
      { cost: 220, dmg: 54, rate: 2.3, range: 4.9, splash: 1.6 },
    ],
    branches: {
      A: { short: 'Bombard', name: 'Cinder Bombard', cost: 330, dmg: 90, rate: 2.4, range: 5.2, splash: 1.95, burn: 18, burnT: 3, blurb: 'Massive blasts that leave burning ground.' },
      B: { short: 'Cluster', name: 'Cluster Kiln', cost: 340, dmg: 62, rate: 2.0, range: 5.0, splash: 1.5, cluster: 4, clusterDmg: 28, blurb: 'Each shell bursts into four bomblets.' },
    },
  },
  prism: {
    name: 'Moonglass Prism', short: 'Prism', dmgType: 'magic', air: true, kind: 'shooter',
    blurb: 'Magic bolts melt armour-plated foes.',
    tiers: [
      { cost: 100, dmg: 24, rate: 1.4, range: 4.0 },
      { cost: 160, dmg: 42, rate: 1.35, range: 4.2 },
      { cost: 240, dmg: 68, rate: 1.3, range: 4.5 },
    ],
    branches: {
      A: { short: 'Lattice', name: 'Prism Lattice', cost: 360, dmg: 78, rate: 1.25, range: 4.7, chain: 4, chainFall: 0.8, blurb: 'Light arcs between up to five shades.' },
      B: { short: 'Sun Lens', name: 'Sun Lens', cost: 380, dmg: 45, rate: 0, range: 4.8, beam: true, dpsMax: 190, ramp: 3, blurb: 'A focusing beam that grows hotter the longer it holds.' },
    },
  },
  beacon: {
    name: 'Lantern Beacon', short: 'Beacon', dmgType: 'magic', air: true, kind: 'aura',
    blurb: 'Light slows shades and reveals the hidden.',
    tiers: [
      { cost: 90, dmg: 6, rate: 1.0, range: 3.2, slow: 0.25 },
      { cost: 120, dmg: 10, rate: 1.0, range: 3.6, slow: 0.32 },
      { cost: 180, dmg: 16, rate: 1.0, range: 4.0, slow: 0.4 },
    ],
    branches: {
      A: { short: 'Sunflare', name: 'Sunflare Beacon', cost: 300, dmg: 18, rate: 1.0, range: 4.2, slow: 0.42, flare: 6, flareDmg: 90, stun: 1.2, blurb: 'Every 6 s a flare stuns and scorches everything nearby.' },
      B: { short: 'Hearth', name: 'Hearth Beacon', cost: 280, dmg: 16, rate: 1.0, range: 5.4, slow: 0.45, mark: 0.3, blurb: 'Wide light; shades inside take +30% damage from everything.' },
    },
  },
  barracks: {
    name: 'Warden Hall', short: 'Wardens', dmgType: 'phys', air: false, kind: 'barracks',
    blurb: 'Three wardens hold the road. Set their rally point.',
    tiers: [
      { cost: 80, range: 2.8, hp: 90, dmg: 7, rate: 1.0, armor: 0, respawn: 10 },
      { cost: 120, range: 2.9, hp: 140, dmg: 11, rate: 1.0, armor: 0.15, respawn: 10 },
      { cost: 180, range: 3.0, hp: 210, dmg: 16, rate: 0.95, armor: 0.3, respawn: 9 },
    ],
    branches: {
      A: { short: 'Bulwark', name: 'Bulwark Wardens', cost: 300, range: 3.1, hp: 440, dmg: 20, rate: 0.9, armor: 0.6, respawn: 9, blurb: 'Shield-wall veterans who barely bleed.' },
      B: { short: 'Lancers', name: 'Lancer Wardens', cost: 320, range: 3.1, hp: 250, dmg: 44, rate: 0.85, armor: 0.3, respawn: 8, blurb: 'Long spears that skewer brutes.' },
    },
  },
};
export const TOWER_IDS = Object.keys(TOWERS);
export const SELL_RATE = 0.6;
export const TARGET_MODES = ['first', 'strong', 'close'];

// ---------------------------------------------------------------- enemies (shadow creatures — they dissolve into motes, no gore)
export const ENEMIES = {
  gloomling: { name: 'Gloomling', hp: 62, speed: 1.15, armor: 0, mres: 0, gold: 8, lives: 1, melee: 5, threat: 1, size: 0.34, gap: 0.9,
    lore: 'A scrap of dusk with teeth. Comes in crowds.', tip: 'Anything works. Kilns love crowds.' },
  hound: { name: 'Dusk Hound', hp: 48, speed: 2.1, armor: 0, mres: 0, gold: 7, lives: 1, melee: 6, threat: 1.1, size: 0.36, gap: 0.6,
    lore: 'Fast and hungry. Outruns slow shells.', tip: 'Beacons slow them; wardens stop them cold.' },
  brute: { name: 'Shale Brute', hp: 330, speed: 0.72, armor: 0.6, mres: 0, gold: 24, lives: 2, melee: 22, threat: 5, size: 0.62, gap: 2.2,
    lore: 'Shadow wrapped in slate plates. Arrows bounce off.', tip: 'ARMOURED: use Prism magic or Hawkeye piercing shots.' },
  moth: { name: 'Moth Wraith', hp: 92, speed: 1.4, armor: 0, mres: 0.1, gold: 12, lives: 1, melee: 0, threat: 2, size: 0.4, gap: 1.1, flying: true,
    lore: 'Flies over the road. Wardens and kilns cannot reach it.', tip: 'FLYING: Archers, Prisms and the hero hit flyers.' },
  blob: { name: 'Murk Blob', hp: 210, speed: 0.85, armor: 0.1, mres: 0, gold: 14, lives: 1, melee: 10, threat: 4, size: 0.55, gap: 1.8, split: { type: 'mite', n: 3 },
    lore: 'Pops into three mites when it bursts.', tip: 'SPLITS: splash damage clears the mites.' },
  mite: { name: 'Murk Mite', hp: 38, speed: 1.5, armor: 0, mres: 0, gold: 3, lives: 1, melee: 3, threat: 0.45, size: 0.24, gap: 0.5, child: true,
    lore: 'What is left of a Murk Blob.', tip: 'Splash damage.' },
  stalker: { name: 'Veil Stalker', hp: 150, speed: 1.45, armor: 0.2, mres: 0, gold: 16, lives: 1, melee: 12, threat: 3, size: 0.45, gap: 1.6, stealth: true,
    lore: 'Invisible outside lantern light. Towers cannot target it.', tip: 'STEALTH: a Beacon or the hero\'s lantern reveals it.' },
  warlock: { name: 'Hollow Cantor', hp: 230, speed: 0.8, armor: 0, mres: 0.75, gold: 22, lives: 1, melee: 8, threat: 4, size: 0.48, gap: 2.4, heal: { every: 4, amt: 40, r: 2.6 },
    lore: 'Sings shadows back together. Shrugs off magic.', tip: 'MAGIC-RESIST + HEALER: focus it with Archers, Kilns or Wardens.' },
  boss: { name: 'Eclipse Colossus', hp: 3600, speed: 0.42, armor: 0.35, mres: 0.35, gold: 500, lives: 15, melee: 80, threat: 60, size: 1.5, gap: 1, boss: true, summon: { every: 9, type: 'gloomling', n: 3 },
    lore: 'The night itself, walking. Summons gloomlings as it goes.', tip: 'BOSS: cannot be blocked; stuns are halved. Everything you have.' },
};
export const ENEMY_IDS = Object.keys(ENEMIES);

// ---------------------------------------------------------------- hero
export const HERO = {
  name: 'Captain Wren', title: 'the Lamplighter',
  hp: 420, dmg: 16, rate: 0.85, range: 3.1, melee: 22, meleeRate: 0.8, speed: 2.9, armor: 0.25, alert: 2.0,
  regen: 0.04, respawn: 14, reveal: 2.4,
  ability: { name: 'Dawnburst', cd: 30, dmg: 150, r: 2.7, stun: 1.6 },
  xp: [0, 70, 180, 340, 560], // level thresholds (Lv1..Lv5)
  perLevel: 0.15,
};

// ---------------------------------------------------------------- campaign
// Paths: polylines (centripetal Catmull-Rom smoothed). All paths of a map end at the Hold gate.
// pads: number of build spots generated along the road (paths.js#genPads, deterministic).
const L3tail = [[-2, 0.5], [2, 0.5], [5.5, -2.2], [9, -1], [11, 3], [14.6, 4]];
const L5tail = [[1.5, 0], [5.5, -1.4], [8.5, 2.6], [11.5, 3.6], [14.6, 3]];
const L7tail = [[8.5, -0.6], [11.5, 0.2], [14.6, 0]];
const L8tail = [[3.5, 0], [7, 1.8], [10.5, 0.4], [14.6, 0.4]];

export const BIOMES = {
  forest: { name: 'Twilight Forest' },
  frozen: { name: 'Frozen Lake' },
  ember: { name: 'Ember Ruins' },
};

export const LEVELS = [
  {
    id: 'mosswood', name: 'Mosswood Crossing', biome: 'forest', seed: 11, waves: 12, startGold: 280, pads: 10,
    desc: 'The first lanterns of the valley. Learn the road.',
    paths: [[[-14.6, -5], [-9, -5.4], [-6, -2], [-6, 2.6], [-2, 5.2], [2, 3], [2.6, -1.6], [6, -4.2], [10, -2.2], [11, 2], [14.6, 2.6]]],
    roster: { gloomling: 0, hound: 2, brute: 5 }, budget: [10, 1.09], hpMul: 1.61, hero: 0.62,
  },
  {
    id: 'firefly', name: 'Firefly Hollow', biome: 'forest', seed: 23, waves: 14, startGold: 300, pads: 12,
    desc: 'A long, winding hollow. Moth wraiths take to the air.',
    paths: [[[-14.6, 6.5], [-9, 6.6], [-7, 2.2], [-10, -2], [-8, -6.2], [-3, -6.6], [0, -3], [-1, 1.6], [2, 5.6], [6, 5.2], [7.2, 0.2], [6.2, -4.2], [10, -6.4], [13, -3.4], [13.4, 0.8], [14.6, 1.2]]],
    roster: { gloomling: 0, hound: 1, moth: 3, brute: 6, blob: 8 }, budget: [12, 1.09], hpMul: 1.15, hero: 0.55,
  },
  {
    id: 'oldmill', name: 'Old Mill Fork', biome: 'forest', seed: 37, waves: 14, startGold: 320, pads: 13,
    desc: 'Two roads meet at the mill. Hold the fork.',
    paths: [
      [[-14.6, -6.2], [-10, -6.2], [-7, -3], [-4.5, -0.4], ...L3tail],
      [[-5.5, 10.6], [-5.6, 6.4], [-3.8, 3], ...L3tail],
    ],
    roster: { gloomling: 0, hound: 0, blob: 2, moth: 4, brute: 5, stalker: 8 }, budget: [14, 1.09], hpMul: 1.14, hero: 0.7,
  },
  {
    id: 'glasswater', name: 'Glasswater', biome: 'frozen', seed: 41, waves: 15, startGold: 340, pads: 13,
    desc: 'The road circles the frozen lake. Light the shore.',
    paths: [[[-14.6, -7.2], [-6, -7.2], [0, -7], [5, -5.8], [7, -1.8], [5.6, 2.8], [1, 4.4], [-3.5, 4.2], [-7.4, 2.6], [-8.6, 6.6], [-3, 8.4], [4, 8.2], [9.6, 5.6], [11, 0.6], [14.6, -0.6]]],
    lakes: [{ x: -0.5, z: -1.4, r: 3.4 }],
    roster: { gloomling: 0, hound: 0, stalker: 1, moth: 2, blob: 4, brute: 6, warlock: 8 }, budget: [15, 1.09], hpMul: 0.78, hero: 0.6,
  },
  {
    id: 'rime', name: 'Rime Lighthouse', biome: 'frozen', seed: 53, waves: 15, startGold: 360, pads: 14,
    desc: 'Shades come over the ice from north and south.',
    paths: [
      [[-14.6, -6.4], [-9, -6.6], [-5.6, -3.6], [-2, -3.6], ...L5tail],
      [[-14.6, 6.4], [-9, 6.8], [-5.6, 3.6], [-2, 3.4], ...L5tail],
    ],
    lakes: [{ x: -9.4, z: 0, r: 2.6 }, { x: 8.8, z: -6.2, r: 2.4 }],
    roster: { gloomling: 0, hound: 0, moth: 0, brute: 2, warlock: 4, stalker: 6, blob: 8 }, budget: [16, 1.09], hpMul: 0.86, hero: 0.72,
  },
  {
    id: 'frostfang', name: 'Frostfang Pass', biome: 'frozen', seed: 67, waves: 16, startGold: 380, pads: 14,
    desc: 'Three switchbacks down the mountain. Every turn is a chance.',
    paths: [[[-14.6, -7.6], [-3, -7.6], [3, -6.8], [4.4, -4.4], [1.2, -2.6], [-7, -2.6], [-9.2, 0.4], [-6.6, 3.1], [3, 3.1], [7, 4.4], [8.2, 7.6], [11.8, 8.2], [14.6, 7.4]]],
    lakes: [{ x: 9.6, z: -3.8, r: 3.0 }],
    roster: { gloomling: 0, hound: 0, brute: 0, moth: 2, stalker: 3, blob: 5, warlock: 7 }, budget: [17, 1.09], hpMul: 0.88, hero: 0.55,
  },
  {
    id: 'cinder', name: 'Cinder Steps', biome: 'ember', seed: 79, waves: 18, startGold: 400, pads: 15,
    desc: 'Old ruins over cooling lava. Two roads, no rest.',
    paths: [
      [[-5.6, -10.6], [-5.8, -6.4], [-2, -4.4], [3, -5.2], [6.8, -3.6], ...L7tail],
      [[-14.6, 3.2], [-9.2, 3.2], [-6.2, 6.4], [-1, 6.8], [3, 4.2], [6.2, 1.6], ...L7tail],
    ],
    lavas: [{ x: -10, z: -4.6, r: 2.6 }, { x: 1.4, z: 0.8, r: 1.6 }, { x: 10.6, z: 6.2, r: 2.2 }],
    roster: { gloomling: 0, hound: 0, brute: 0, moth: 0, warlock: 2, blob: 3, stalker: 4 }, budget: [18, 1.09], hpMul: 0.82, hero: 0.8,
  },
  {
    id: 'eclipse', name: 'Eclipse Throne', biome: 'ember', seed: 97, waves: 20, startGold: 440, pads: 16, boss: true,
    desc: 'Three roads to the throne. The Colossus wakes on the last wave.',
    paths: [
      [[-14.6, -2], [-10, -1.2], [-7, -3.6], [-3, -2.2], [0.4, -0.6], ...L8tail],
      [[-1, -10.6], [-0.4, -7.2], [3.6, -6.2], [5, -3.2], ...L8tail],
      [[-4.4, 10.6], [-4.2, 7.2], [-0.4, 5.2], [2.6, 3.2], ...L8tail],
    ],
    lavas: [{ x: -9.6, z: 5, r: 2.8 }, { x: 9.4, z: -6, r: 2.4 }, { x: 10, z: 6.4, r: 2 }],
    roster: { gloomling: 0, hound: 0, brute: 0, moth: 0, stalker: 0, warlock: 0, blob: 0 }, budget: [19, 1.09], hpMul: 0.64, hero: 0.82,
  },
];

export const DIFFICULTY = {
  casual: { label: 'Casual', hp: 0.75, gold: 1.15, lives: 25 },
  normal: { label: 'Normal', hp: 1.0, gold: 1.0, lives: 20 },
  veteran: { label: 'Veteran', hp: 1.22, gold: 0.92, lives: 20 },
};

// Stars: lives left at the end (out of the level's lives).
export function starsFor(lives, maxLives) {
  if (lives <= 0) return 0;
  const f = lives / maxLives;
  return f >= 0.9 ? 3 : f >= 0.5 ? 2 : 1;
}
