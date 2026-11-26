// Emberwake — pure game data (no DOM, no three). Imported by the browser build AND the node tests.
// Damage types: three weapon types + three elements. Every enemy has 2–3 weaknesses (the break system).

export const TYPES = {
  blade: { name: 'Blade', col: '#e8eef8' }, blunt: { name: 'Blunt', col: '#d9b48a' }, pierce: { name: 'Pierce', col: '#b8e0c8' },
  fire: { name: 'Fire', col: '#ff8a3c' }, frost: { name: 'Frost', col: '#8fd8ff' }, bolt: { name: 'Bolt', col: '#ffe15a' },
};
export const PHYS = new Set(['blade', 'blunt', 'pierce']);

// ---------------------------------------------------------------- party
export const HEROES = {
  rook: {
    name: 'Rook', full: 'Rook Callow', role: 'Striker', title: 'Wickwarden apprentice', weapon: 'blade',
    blurb: 'Lantern-blade and too much nerve. Hits hard with Blade and Fire.',
    base: { hp: 66, mp: 16, atk: 14, mag: 11, def: 9, res: 8, spd: 12 },
    grow: { hp: 9.5, mp: 2.2, atk: 2.3, mag: 1.6, def: 1.5, res: 1.2, spd: 1.0 },
    skills: [[1, 'cinder'], [3, 'twincut'], [6, 'flarearc'], [9, 'rally'], [12, 'sunder'], [15, 'emberwake']],
    start: { weapon: 'w_wick', armor: 'a_jerkin', charm: null },
  },
  bram: {
    name: 'Bram', full: 'Bram Okoro', role: 'Guardian', title: 'Miner of Mossbarrow', weapon: 'blunt',
    blurb: 'A wall with a hammer. Breaks shields with Blunt and Bolt, guards allies.',
    base: { hp: 86, mp: 12, atk: 13, mag: 8, def: 13, res: 9, spd: 8 },
    grow: { hp: 12, mp: 1.8, atk: 2.1, mag: 1.2, def: 2.0, res: 1.3, spd: 0.7 },
    skills: [[1, 'rockbreak'], [1, 'standfast'], [4, 'spark'], [7, 'quake'], [10, 'ironwill'], [12, 'thunderclap'], [15, 'mountain']],
    start: { weapon: 'h_pick', armor: 'a_leather', charm: null },
  },
  ines: {
    name: 'Ines', full: 'Ines Marr', role: 'Tidecaller', title: 'Tide-reader of Saltmere', weapon: 'pierce',
    blurb: 'Harpoon-staff and sea magic. Heals, revives, and pierces with Frost.',
    base: { hp: 54, mp: 24, atk: 10, mag: 14, def: 7, res: 11, spd: 13 },
    grow: { hp: 7.6, mp: 3.2, atk: 1.5, mag: 2.4, def: 1.1, res: 1.8, spd: 1.2 },
    skills: [[1, 'mend'], [1, 'rimelance'], [3, 'volley'], [5, 'tidecall'], [7, 'rekindle'], [9, 'hail'], [11, 'ward'], [14, 'glacial']],
    start: { weapon: 's_driftwood', armor: 'a_oilskin', charm: null },
  },
};
export const PARTY_ORDER = ['rook', 'bram', 'ines'];

// ---------------------------------------------------------------- skills
// target: enemy | enemies | ally | allies | self | koally | random
// power: 10 = a plain attack's strength. shield: extra shield damage per weak hit. hits: number of hits.
export const SKILLS = {
  cinder: { name: 'Cinder Slash', mp: 4, type: 'fire', target: 'enemy', power: 15, desc: 'A burning cut. Fire damage to one foe.' },
  twincut: { name: 'Twin Cut', mp: 5, type: 'blade', target: 'enemy', power: 8, hits: 2, desc: 'Two quick Blade strikes — strips 2 shield on a weak foe.' },
  flarearc: { name: 'Flare Arc', mp: 8, type: 'fire', target: 'enemies', power: 11, desc: 'A sweeping ring of flame. Fire damage to all foes.' },
  rally: { name: 'Rally Flame', mp: 9, type: 'buff', target: 'allies', buff: { atk: 1.3, turns: 3 }, desc: 'Raise the party\'s attack for 3 turns.' },
  sunder: { name: 'Sunder Edge', mp: 11, type: 'blade', target: 'enemy', power: 24, debuff: { def: 0.75, turns: 3 }, desc: 'A heavy Blade blow that cracks armour (lowers defence).' },
  emberwake: { name: 'Emberwake', mp: 20, type: 'fire', target: 'enemies', power: 26, shield: 1, desc: 'The Wickwarden\'s final rite. Huge Fire damage to all foes.' },

  rockbreak: { name: 'Rockbreaker', mp: 4, type: 'blunt', target: 'enemy', power: 14, shield: 1, desc: 'A crushing Blunt blow. Strips an extra shield point on a weak foe.' },
  standfast: { name: 'Stand Fast', mp: 4, type: 'cover', target: 'self', desc: 'Guard: take single-target hits meant for allies (half damage) until your next turn.' },
  spark: { name: 'Spark Hammer', mp: 5, type: 'bolt', target: 'enemy', power: 14, desc: 'The hammer-head crackles. Bolt damage to one foe.' },
  quake: { name: 'Quake', mp: 8, type: 'blunt', target: 'enemies', power: 10, desc: 'Slam the ground. Blunt damage to all foes.' },
  ironwill: { name: 'Iron Will', mp: 7, type: 'heal', target: 'self', power: 0, pct: 0.35, buff: { def: 1.4, turns: 3 }, desc: 'Recover 35% HP and raise your defence.' },
  thunderclap: { name: 'Thunderclap', mp: 10, type: 'bolt', target: 'enemies', power: 13, desc: 'A storm in a hammer. Bolt damage to all foes.' },
  mountain: { name: 'Mountainfall', mp: 14, type: 'blunt', target: 'enemy', power: 28, shield: 2, desc: 'Everything Bram has. Massive Blunt damage, +2 shield.' },

  mend: { name: 'Mend', mp: 5, type: 'heal', target: 'ally', power: 12, flat: 26, desc: 'Close wounds with seawater. Restore one ally\'s HP.' },
  rimelance: { name: 'Rime Lance', mp: 4, type: 'frost', target: 'enemy', power: 14, desc: 'A spear of ice. Frost damage to one foe.' },
  volley: { name: 'Harpoon Volley', mp: 6, type: 'pierce', target: 'random', power: 7, hits: 3, desc: 'Three Pierce strikes at random foes.' },
  tidecall: { name: 'Tidecall', mp: 9, type: 'heal', target: 'allies', power: 8, flat: 22, desc: 'A warm tide. Restore the whole party\'s HP.' },
  rekindle: { name: 'Rekindle', mp: 10, type: 'revive', target: 'koally', pct: 0.5, desc: 'Relight a fallen ally with half their HP.' },
  hail: { name: 'Hailstorm', mp: 9, type: 'frost', target: 'enemies', power: 11, desc: 'Frost damage to all foes.' },
  ward: { name: 'Ward Song', mp: 9, type: 'buff', target: 'allies', buff: { def: 1.35, res: 1.35, turns: 3 }, desc: 'Raise the party\'s defence and resistance for 3 turns.' },
  glacial: { name: 'Glacial Spear', mp: 13, type: 'frost', target: 'enemy', power: 28, shield: 1, desc: 'A spear of the deep cold. Massive Frost damage.' },
};

// ---------------------------------------------------------------- items + equipment
// kind: heal | mp | revive | bomb | key
export const ITEMS = {
  tonic: { name: 'Ember Tonic', kind: 'heal', amt: 60, price: 18, desc: 'Restores 60 HP to one ally.' },
  draught: { name: 'Hearth Draught', kind: 'heal', amt: 180, price: 60, desc: 'Restores 180 HP to one ally.' },
  salts: { name: 'Spark Salts', kind: 'mp', amt: 20, price: 40, desc: 'Restores 20 MP to one ally.' },
  ash: { name: 'Rekindle Ash', kind: 'revive', pct: 0.4, price: 90, desc: 'Revives a fallen ally with 40% HP.' },
  feast: { name: 'Picnic Basket', kind: 'healall', amt: 90, price: 110, desc: 'Restores 90 HP to the whole party.' },
  cinderbomb: { name: 'Cinder Bomb', kind: 'bomb', type: 'fire', dmg: 55, price: 30, desc: 'Fire damage to all foes. Exploits weakness.' },
  frostvial: { name: 'Frost Vial', kind: 'bomb', type: 'frost', dmg: 60, price: 34, desc: 'Frost damage to all foes.' },
  boltjar: { name: 'Bolt Jar', kind: 'bomb', type: 'bolt', dmg: 65, price: 38, desc: 'Bolt damage to all foes.' },
  darts: { name: 'Gull Darts', kind: 'bomb', type: 'pierce', dmg: 50, price: 26, desc: 'Pierce damage to all foes.' },
  shard: { name: 'Kindlewick Shard', kind: 'key', desc: 'The shrine\'s ember. It is warm, and it hums when you face east.' },
  lens: { name: 'Tidewatch Lens', kind: 'key', desc: 'The lighthouse lens-key, salt-crusted.' },
};
// slot: weapon (for a specific hero) | armor | charm
export const EQUIP = {
  w_wick: { name: 'Wick Blade', slot: 'weapon', who: 'rook', atk: 4, price: 0 },
  w_brand: { name: 'Hearth Brand', slot: 'weapon', who: 'rook', atk: 10, mag: 2, price: 160 },
  w_tidecutter: { name: 'Tidecutter', slot: 'weapon', who: 'rook', atk: 18, mag: 4, price: 520 },
  w_dawnedge: { name: 'Dawnedge', slot: 'weapon', who: 'rook', atk: 27, mag: 8, price: 0 },
  h_pick: { name: 'Miner\'s Pick', slot: 'weapon', who: 'bram', atk: 5, price: 0 },
  h_maul: { name: 'Iron Maul', slot: 'weapon', who: 'bram', atk: 11, price: 170 },
  h_anchor: { name: 'Anchor Hammer', slot: 'weapon', who: 'bram', atk: 19, def: 3, price: 540 },
  s_driftwood: { name: 'Driftwood Harpoon', slot: 'weapon', who: 'ines', atk: 5, mag: 5, price: 0 },
  s_coral: { name: 'Coral Harpoon', slot: 'weapon', who: 'ines', atk: 10, mag: 12, price: 500 },
  s_moon: { name: 'Moontide Staff', slot: 'weapon', who: 'ines', atk: 14, mag: 20, price: 0 },
  a_jerkin: { name: 'Patched Jerkin', slot: 'armor', def: 3, res: 2, price: 0 },
  a_leather: { name: 'Leather Coat', slot: 'armor', def: 6, res: 3, hp: 10, price: 90 },
  a_oilskin: { name: 'Oilskin Cloak', slot: 'armor', def: 5, res: 6, price: 120 },
  a_chain: { name: 'Lantern Mail', slot: 'armor', def: 12, res: 6, hp: 25, price: 380 },
  a_tidecoat: { name: 'Tidewoven Coat', slot: 'armor', def: 9, res: 13, hp: 15, price: 420 },
  c_ember: { name: 'Ember Pin', slot: 'charm', atk: 3, mag: 3, price: 140 },
  c_feather: { name: 'Gull Feather', slot: 'charm', spd: 4, price: 160 },
  c_hearth: { name: 'Hearthstone', slot: 'charm', hp: 40, def: 2, price: 260 },
  c_tide: { name: 'Tide Pearl', slot: 'charm', mp: 15, res: 4, price: 300 },
  c_wick: { name: 'Odile\'s Wick', slot: 'charm', atk: 4, mag: 4, spd: 2, hp: 20, price: 0 },
};

export const SHOPS = {
  kindle_items: { name: 'Pell\'s Provisions', stock: ['tonic', 'salts', 'ash', 'cinderbomb'] },
  kindle_smith: { name: 'Harrow Smithy', stock: ['w_brand', 'h_maul', 'a_leather', 'a_oilskin', 'c_ember'] },
  salt_items: { name: 'The Brine Barrel', stock: ['tonic', 'draught', 'salts', 'ash', 'feast', 'frostvial', 'boltjar', 'darts', 'cinderbomb'] },
  salt_smith: { name: 'Gullwing Arms', stock: ['w_tidecutter', 'h_anchor', 's_coral', 'a_chain', 'a_tidecoat', 'c_feather', 'c_hearth', 'c_tide'] },
  spire_cart: { name: 'Wandering Wagon', stock: ['tonic', 'draught', 'salts', 'ash', 'feast', 'cinderbomb', 'frostvial', 'boltjar', 'darts'] },
};
export const INNS = { kindle: 12, salt: 24 };

// ---------------------------------------------------------------- enemies
// acts: kind phys|mag, type, power, target one|all, w weight, charge = turns of windup (telegraphed; a Break cancels it)
export const ENEMIES = {
  gloomcap: { name: 'Gloomcap', sprite: 'gloomcap', hp: 34, atk: 11, mag: 8, def: 5, res: 4, spd: 7, shield: 2, weak: ['fire', 'blade'], xp: 7, gold: 6, drops: [['tonic', 0.25]],
    acts: [{ name: 'Cap Bonk', kind: 'phys', type: 'blunt', power: 10, w: 3 }, { name: 'Spore Puff', kind: 'mag', type: 'frost', power: 9, w: 1 }] },
  thornbat: { name: 'Thornbat', sprite: 'thornbat', hp: 26, atk: 12, mag: 6, def: 4, res: 5, spd: 15, shield: 2, weak: ['fire', 'pierce', 'bolt'], xp: 7, gold: 5, drops: [['tonic', 0.2]],
    acts: [{ name: 'Thorn Dive', kind: 'phys', type: 'pierce', power: 10, w: 1 }] },
  bristleboar: { name: 'Bristleboar', sprite: 'boar', hp: 62, atk: 15, mag: 5, def: 8, res: 4, spd: 9, shield: 3, weak: ['blade', 'bolt'], xp: 13, gold: 12, drops: [['tonic', 0.35]],
    acts: [{ name: 'Gore', kind: 'phys', type: 'pierce', power: 11, w: 3 }, { name: 'Stampede', kind: 'phys', type: 'blunt', power: 13, target: 'all', charge: 1, w: 1 }] },
  rootling: { name: 'Rootling', sprite: 'rootling', hp: 44, atk: 13, mag: 10, def: 7, res: 6, spd: 6, shield: 3, weak: ['fire', 'blunt'], xp: 10, gold: 9, drops: [['salts', 0.15]],
    acts: [{ name: 'Lash', kind: 'phys', type: 'blade', power: 10, w: 3 }, { name: 'Sap Drain', kind: 'mag', type: 'frost', power: 9, drain: true, w: 1 }] },
  rootmother: { name: 'The Rootmother', sprite: 'rootmother', boss: true, turns: 2, hp: 480, atk: 17, mag: 15, def: 9, res: 8, spd: 8, shield: 6, weak: ['fire', 'blade', 'bolt'], xp: 90, gold: 120, drops: [],
    acts: [{ name: 'Bramble Lash', kind: 'phys', type: 'blade', power: 15, w: 3 }, { name: 'Choking Spores', kind: 'mag', type: 'frost', power: 12, target: 'all', w: 2 },
      { name: 'Deep Root Crush', kind: 'phys', type: 'blunt', power: 30, target: 'all', charge: 1, w: 1.4, tell: 'The ground heaves — roots coil beneath the party!' }, { name: 'Sprout', summon: 'gloomcap', w: 1 }] },

  brinecrab: { name: 'Brine Crab', sprite: 'crab', hp: 96, atk: 22, mag: 10, def: 18, res: 9, spd: 9, shield: 4, weak: ['blunt', 'bolt'], xp: 30, gold: 32, drops: [['tonic', 0.3]],
    acts: [{ name: 'Pincer', kind: 'phys', type: 'blade', power: 11, w: 3 }, { name: 'Shell Up', buff: { def: 1.5, turns: 2 }, w: 1 }] },
  lanterneel: { name: 'Lantern Eel', sprite: 'eel', hp: 78, atk: 20, mag: 20, def: 10, res: 10, spd: 16, shield: 3, weak: ['pierce', 'frost'], xp: 29, gold: 28, drops: [['salts', 0.25]],
    acts: [{ name: 'Bite', kind: 'phys', type: 'pierce', power: 10, w: 2 }, { name: 'Lure Flash', kind: 'mag', type: 'bolt', power: 11, target: 'all', w: 1 }] },
  driftshade: { name: 'Driftshade', sprite: 'shade', hp: 70, atk: 14, mag: 23, def: 22, res: 8, spd: 12, shield: 3, weak: ['fire', 'pierce'], xp: 30, gold: 26, drops: [['ash', 0.12]],
    acts: [{ name: 'Cold Touch', kind: 'mag', type: 'frost', power: 11, w: 3 }, { name: 'Wail', kind: 'mag', type: 'frost', power: 8, target: 'all', w: 1 }] },
  glasswing: { name: 'Glasswing', sprite: 'moth', hp: 64, atk: 19, mag: 19, def: 12, res: 16, spd: 18, shield: 3, weak: ['blunt', 'fire'], xp: 28, gold: 27, drops: [['salts', 0.2]],
    acts: [{ name: 'Prism Dust', kind: 'mag', type: 'bolt', power: 10, target: 'all', w: 1 }, { name: 'Wing Slice', kind: 'phys', type: 'blade', power: 11, w: 2 }] },
  brinewarden: { name: 'The Brinewarden', sprite: 'brinewarden', boss: true, turns: 2, hp: 1350, atk: 30, mag: 24, def: 22, res: 15, spd: 11, shield: 8, weak: ['bolt', 'blunt', 'pierce'], xp: 420, gold: 450, drops: [],
    acts: [{ name: 'Crushing Claw', kind: 'phys', type: 'blunt', power: 16, w: 3 }, { name: 'Brine Spray', kind: 'mag', type: 'frost', power: 13, target: 'all', w: 2 },
      { name: 'Tidal Surge', kind: 'mag', type: 'frost', power: 30, target: 'all', charge: 1, w: 1.3, tell: 'The Brinewarden draws the tide back… a wave is coming!' }, { name: 'Harden Shell', buff: { def: 1.5, turns: 2 }, w: 0.7 }] },

  sentinel: { name: 'Dusk Sentinel', sprite: 'sentinel', hp: 170, atk: 34, mag: 14, def: 30, res: 16, spd: 10, shield: 5, weak: ['blunt', 'bolt'], xp: 72, gold: 34, drops: [['draught', 0.2]],
    acts: [{ name: 'Halberd Sweep', kind: 'phys', type: 'blade', power: 10, target: 'all', w: 1 }, { name: 'Pike Thrust', kind: 'phys', type: 'pierce', power: 13, w: 2 }] },
  hound: { name: 'Umbral Hound', sprite: 'hound', hp: 130, atk: 34, mag: 18, def: 18, res: 15, spd: 20, shield: 4, weak: ['fire', 'blade'], xp: 66, gold: 28, drops: [['tonic', 0.3]],
    acts: [{ name: 'Rend', kind: 'phys', type: 'blade', power: 12, w: 3 }, { name: 'Howl', debuff: { def: 0.8, turns: 2 }, w: 1 }] },
  hollowlamp: { name: 'Hollow Lamp', sprite: 'lamp', hp: 115, atk: 20, mag: 34, def: 16, res: 26, spd: 14, shield: 4, weak: ['fire', 'pierce', 'frost'], xp: 68, gold: 32, drops: [['salts', 0.3]],
    acts: [{ name: 'Snuff', kind: 'mag', type: 'frost', power: 12, w: 2 }, { name: 'Gloam Burst', kind: 'mag', type: 'bolt', power: 10, target: 'all', w: 1 }] },
  morrow: { name: 'Morrow, the Snuffer', sprite: 'morrow', boss: true, turns: 2, hp: 1800, atk: 38, mag: 38, def: 26, res: 26, spd: 17, shield: 8, weak: ['fire', 'blade', 'frost'], xp: 0, gold: 0, drops: [],
    phase2: 'morrow2',
    acts: [{ name: 'Snuffing Cane', kind: 'phys', type: 'blunt', power: 16, w: 3 }, { name: 'Gloaming', kind: 'mag', type: 'frost', power: 13, target: 'all', w: 2 },
      { name: 'Last Light Out', kind: 'mag', type: 'frost', power: 32, target: 'all', charge: 1, w: 1.2, tell: 'Morrow cups his hands around the dark. Every lamp in the room gutters…' }] },
  morrow2: { name: 'Morrow, Long Night', sprite: 'morrow2', boss: true, turns: 2, hp: 1900, atk: 42, mag: 42, def: 26, res: 26, spd: 19, shield: 10, weak: ['bolt', 'pierce', 'blunt'], xp: 0, gold: 0, drops: [],
    acts: [{ name: 'Night Talon', kind: 'phys', type: 'blade', power: 16, w: 3 }, { name: 'Starless', kind: 'mag', type: 'frost', power: 14, target: 'all', w: 2 },
      { name: 'Eclipse', kind: 'mag', type: 'frost', power: 36, target: 'all', charge: 1, w: 1.3, tell: 'The Ember itself dims. Morrow is drawing every shadow in the spire into one blow!' },
      { name: 'Dusk Feast', kind: 'mag', type: 'frost', power: 15, drain: true, w: 1 }] },
};

// encounter groups (visible enemies on the field carry a group id)
export const GROUPS = {
  tut: ['gloomcap', 'gloomcap'],
  g1: ['gloomcap', 'thornbat'], g2: ['gloomcap', 'gloomcap', 'thornbat'], g3: ['bristleboar'], g4: ['thornbat', 'thornbat'],
  g5: ['rootling', 'gloomcap'], g6: ['bristleboar', 'thornbat'], g7: ['rootling', 'rootling'], gbram: ['bristleboar', 'bristleboar'],
  boss1: ['rootmother'],
  c1: ['brinecrab'], c2: ['lanterneel', 'driftshade'], c3: ['glasswing', 'glasswing'], c4: ['brinecrab', 'glasswing'], c5: ['driftshade', 'driftshade', 'lanterneel'],
  c6: ['lanterneel', 'lanterneel'], o2: ['bristleboar', 'rootling', 'thornbat'],
  boss2: ['brinewarden'],
  s1: ['sentinel'], s2: ['hound', 'hound'], s3: ['hollowlamp', 'hound'], s4: ['sentinel', 'hollowlamp'], s5: ['hound', 'hollowlamp', 'hollowlamp'],
  boss3: ['morrow'],
};

// ---------------------------------------------------------------- progression
export const MAX_LEVEL = 25;
export const xpToNext = (L) => Math.round(10 + 6 * Math.pow(L, 1.55));
export const DIFFICULTY = {
  easy: { label: 'Story', ehp: 0.75, edmg: 0.65, xp: 1.3, gold: 1.2, window: 1.7 },
  normal: { label: 'Normal', ehp: 1, edmg: 1, xp: 1, gold: 1, window: 1 },
  hard: { label: 'Hard', ehp: 1.25, edmg: 1.25, xp: 0.9, gold: 1, window: 0.75 },
};
// timed-press multipliers (Great = perfect window, Good = wider window)
export const TIMING = { attack: [1, 1.2, 1.5], block: [1, 0.7, 0.45], windowGood: 0.16, windowGreat: 0.065 };
export const BREAK_MULT = 1.6, WEAK_MULT = 1.3;
// global tuning knobs (balance was set with tests/balance runs of the reference walkthrough)
export const TUNE = { hp: 1.45, bossHp: 1.4, dmg: 1.3 };
