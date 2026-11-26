// Emberwake — map data (pure). Tiles are ASCII rows (x = column, z = row, row 0 is the far/north edge).
// Tile legend (shared by every map):
//  .  grass        ,  dirt path     :  cobbles      _  planks (bridge/dock)   s  sand      f  flowers (walkable)
//  ~  water        #  cliff block   T  broadleaf    P  pine                   b  bush      F  fence
//  r  cave floor   R  cave wall     m  glow-moss    c  crystal (blocked)      o  roots (blocked)
//  =  stone floor  W  stone wall    S  stairs (walk between heights)          x  thornwall (blocked until thornsGone)
//  (space) void — nothing, not walkable (spire edges)
// heights: optional digit rows; world height = digit * 0.75 (walls/cliffs add their own height).

export const WALK = new Set(['.', ',', ':', '_', 's', 'f', 'r', 'm', '=', 'S']);
export const H_STEP = 0.75;

function grid(W, H, fill) { return Array.from({ length: H }, () => Array(W).fill(fill)); }
function rnd(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- overworld (generated, deterministic)
function overworldTiles() {
  const W = 48, H = 36, g = grid(W, H, '.'), R = rnd(1234);
  const set = (x, z, c) => { if (x >= 0 && z >= 0 && x < W && z < H) g[z][x] = c; };
  const rect = (x0, z0, x1, z1, c) => { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) set(x, z, c); };
  const ell = (cx, cz, rx, rz, c) => { for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (((x + 0.5 - cx) / rx) ** 2 + ((z + 0.5 - cz) / rz) ** 2 < 1) set(x, z, c); };
  // west forest + scattered woods
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const r = R();
    if (x < 17 && r < 0.5) set(x, z, r < 0.25 ? 'P' : 'T');
    else if (r < 0.06) set(x, z, 'T'); else if (r < 0.1) set(x, z, 'f'); else if (r < 0.12) set(x, z, 'b');
  }
  // north mountains with a ragged edge
  for (let x = 12; x < 41; x++) { const d = 2 + Math.floor(R() * 2.2); rect(x, 0, x, d, '#'); }
  // cliff spine between the west and the east (the only pass is the Thornwall)
  for (let z = 3; z < 16; z++) { const w = 17 + Math.floor(R() * 2), e = 22 + Math.floor(R() * 2); rect(w, z, e, z, '#'); }
  // Mossbarrow hill
  rect(4, 0, 13, 4, '#'); rect(5, 5, 12, 5, '#');
  // lake + beach
  ell(24, 28, 9.5, 5.5, 's'); ell(24, 28.3, 8.4, 4.6, '~');
  rect(15, 19, 23, 22, 'T'); for (let x = 15; x < 24; x++) if (R() < 0.35) set(x, 19, 'P');
  // river from the mountains down to the lake
  for (let z = 3; z < 24; z++) { const x = 29 + Math.round(Math.sin(z * 0.45) * 1.2); set(x, z, '~'); set(x + 1, z, '~'); }
  // the sea, a beach, the lighthouse headland
  for (let z = 0; z < H; z++) { const coast = 42 + Math.round(Math.sin(z * 0.35) * 1.3); rect(coast, z, W - 1, z, '~'); set(coast - 1, z, 's'); set(coast - 2, z, R() < 0.5 ? 's' : g[z][coast - 2]); }
  rect(37, 1, 45, 7, '.'); rect(37, 0, 46, 0, '#'); rect(44, 1, 46, 7, '#'); rect(38, 3, 43, 5, '#'); // headland + lighthouse rock
  for (let x = 37; x < 46; x++) set(x, 8, 's');
  // Saltmere clearing
  rect(33, 21, 41, 29, '.'); rect(34, 23, 40, 27, ',');
  // Kindlewick clearing (bottom-left)
  rect(3, 27, 13, 34, '.'); rect(5, 29, 11, 33, ':');
  // roads (2 wide)
  const road = (x0, z0, x1, z1) => { for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) { if ('~#'.includes(g[z][x])) continue; set(x, z, ','); } };
  road(8, 6, 9, 30); road(8, 17, 36, 18); road(35, 8, 36, 25); road(35, 8, 41, 9);
  // bridge over the river where the road crosses
  for (let z = 17; z <= 18; z++) for (let x = 26; x < 33; x++) if (g[z][x] === '~') set(x, z, '_');
  // Mossbarrow cave mouth + clear in front
  set(8, 5, ','); set(9, 5, ','); rect(6, 6, 11, 8, ','); rect(7, 6, 10, 7, ',');
  // grotto mouth below the lighthouse
  rect(40, 6, 41, 7, ',');
  rect(11, 8, 13, 9, '.'); rect(10, 8, 10, 8, ',');
  // Thornwall
  rect(19, 16, 21, 19, 'x'); rect(17, 15, 23, 15, '#'); rect(16, 19, 24, 20, 'T');
  // borders
  rect(0, 0, 0, H - 1, 'P'); rect(0, H - 1, W - 1, H - 1, 'P'); rect(0, 0, 11, 0, 'P');
  for (let z = 30; z < H; z++) for (let x = 12; x < 34; x++) if (g[z][x] !== '~' && g[z][x] !== 's' && R() < 0.75) set(x, z, R() < 0.5 ? 'P' : 'T');
  return g.map((r) => r.join(''));
}

// ---------------------------------------------------------------- maps
export const MAPS = {
  kindlewick: {
    name: 'Kindlewick', kind: 'town', light: 'dusk', region: 'field', inn: 'kindle',
    tiles: [
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TT..f....TTT,,,,,,,,TTT.....f.TT',
      'T.......T..,,,,,,,,,..T.......PT',
      'T..........,::::::::,.........PT',
      'T.f........,::::::::,..........T',
      'T..........,::::::::,.........fT',
      'T..........,::::::::,..........T',
      'T....,,,,,,,::::::::,,,,,,,....T',
      'T....,...:::::::::::::::..,....T',
      'Tb...,...:::::::::::::::..,...bT',
      'T....,...:::::::::::::::..,....T',
      'T..,,,,,,:::::::::::::::,,,,,..T',
      'T........:::::::::::::::.......T',
      'T........:::::::::::::::.......T',
      'Tf.......:::::::::::::::......fT',
      'T........:::::::::::::::.......T',
      'T....,,,,,,,,,,:::,,,,,,,,,....T',
      'T....,........,:::,........,...T',
      'T....,........,,:,,........,...T',
      'T.............,,:,,............T',
      'TT.....f......,,:,,.....f.....TT',
      '~~~~~~~~~~~~~~_____~~~~~~~~~~~~~',
      'TT.....b......,,:,,......b....TT',
      'TTT...........,,:,,..........TTT',
      'TTTTTTTTTTTTTT,,:,,TTTTTTTTTTTTT',
      'TTTTTTTTTTTTTT,,,,,TTTTTTTTTTTTT',
    ],
    buildings: [
      { k: 'house', x: 2, z: 2, w: 5, d: 4, roof: '#7a3b2e', wall: 'plaster', door: 4.5, sign: null, name: 'cottage' },
      { k: 'house', x: 24, z: 2, w: 6, d: 5, roof: '#2f4f6e', wall: 'plaster', door: 27, sign: 'inn', name: 'inn', floors: 2 },
      { k: 'house', x: 2, z: 9, w: 5, d: 4, roof: '#4f6b34', wall: 'timber', door: 4.5, sign: 'items' },
      { k: 'house', x: 24, z: 9, w: 6, d: 4, roof: '#5a4a44', wall: 'stone', door: 26, sign: 'smith', forge: true },
      { k: 'house', x: 2, z: 16, w: 4, d: 4, roof: '#8a5a2a', wall: 'timber', door: 3.5 },
      { k: 'house', x: 27, z: 16, w: 4, d: 4, roof: '#6e3048', wall: 'plaster', door: 28.5 },
      { k: 'shrine', x: 13, z: 2, w: 6, d: 5 },
    ],
    props: [
      { k: 'well', x: 11, z: 14 }, { k: 'lamp', x: 9.5, z: 8.5 }, { k: 'lamp', x: 22.5, z: 8.5 }, { k: 'lamp', x: 9.5, z: 15.5 }, { k: 'lamp', x: 22.5, z: 15.5 },
      { k: 'lamp', x: 14.2, z: 20.4 }, { k: 'lamp', x: 18.8, z: 20.4 }, { k: 'bunting', x0: 9.5, z0: 8.5, x1: 22.5, z1: 8.5 }, { k: 'bunting', x0: 9.5, z0: 15.5, x1: 22.5, z1: 15.5 },
      { k: 'bunting', x0: 9.5, z0: 8.5, x1: 9.5, z1: 15.5 }, { k: 'bunting', x0: 22.5, z0: 8.5, x1: 22.5, z1: 15.5 },
      { k: 'stall', x: 19, z: 13, c: '#c84a3a' }, { k: 'barrel', x: 7.3, z: 10.3 }, { k: 'barrel', x: 7.4, z: 11 }, { k: 'crate', x: 23.4, z: 13.5 },
      { k: 'anvil', x: 23.2, z: 12.2 }, { k: 'board', x: 12.5, z: 9 }, { k: 'fence', x0: 1, z0: 7, x1: 4, z1: 7 }, { k: 'flowerbox', x: 6.6, z: 6 },
      { k: 'crate', x: 29.5, z: 7.5 }, { k: 'cart', x: 21.5, z: 18.5 }, { k: 'haystack', x: 7, z: 18.4 }, { k: 'lantern_post', x: 16.5, z: 7.6 },
    ],
    npcs: [
      { id: 'odile', x: 16.5, z: 7.8, cast: 'odile', face: 'down', script: 'odile' },
      { id: 'pell', x: 4.5, z: 13.7, cast: 'pell', face: 'down', script: 'pell' },
      { id: 'harrow', x: 26.5, z: 13.7, cast: 'harrow', face: 'down', script: 'harrow' },
      { id: 'innkeep', x: 27.5, z: 7.7, cast: 'marta', face: 'down', script: 'innKindle' },
      { id: 'kid', x: 13, z: 12, cast: 'kid', wander: 2.5, script: 'kidKindle' },
      { id: 'elder', x: 20.5, z: 11.5, cast: 'elder', face: 'left', script: 'elderKindle' },
      { id: 'farmer', x: 8, z: 19, cast: 'farmer', wander: 1.5, script: 'farmerKindle' },
      { id: 'stallgirl', x: 19, z: 14, cast: 'lark', face: 'down', script: 'larkKindle' },
      { id: 'cat', x: 6.5, z: 7.2, cast: 'cat', wander: 1.2, script: 'cat', small: true },
      { id: 'morrowSpy', x: 26.5, z: 1.6, cast: 'morrow', face: 'down', script: null, cond: (f) => f.introStarted && !f.intro },
      { id: 'dawnMorrow', x: 18.2, z: 8.2, cast: 'morrowOld', face: 'left', script: 'epilogueMorrow', cond: (f) => f.ending },
      { id: 'dawnBram', x: 12.5, z: 10.5, cast: 'bram', face: 'right', script: 'epilogueBram', cond: (f) => f.ending },
      { id: 'dawnInes', x: 14, z: 10.7, cast: 'ines', face: 'left', script: 'epilogueInes', cond: (f) => f.ending },
    ],
    enemies: [{ id: 'thief', x: 12, z: 10.5, group: 'tut', sprite: 'gloomcap', cond: (f) => f.intro && !f.tut, script: 'tutorial', still: true }],
    chests: [{ id: 'k1', x: 1.5, z: 5.5, gold: 30 }, { id: 'k2', x: 29.5, z: 20.2, item: 'tonic', n: 2 }],
    exits: [{ x: 14, z: 25, w: 5, d: 1, to: 'overworld', at: [8.5, 28.8], dir: 'up', cond: (f) => f.tut, block: 'Odile told you to see her before you leave.' }],
    triggers: [{ id: 'intro', x: 0, z: 0, w: 32, d: 26, script: 'intro', once: true, cond: (f) => !f.intro }],
    start: [5, 7.6],
  },

  overworld: {
    name: 'The Hearthmere', kind: 'field', light: 'dusk', region: 'field',
    tiles: overworldTiles(),
    props: [
      { k: 'village', x: 8, z: 31 }, { k: 'cave', x: 8.5, z: 4.6 }, { k: 'town', x: 37, z: 25 }, { k: 'lighthouse', x: 41, z: 3.8 },
      { k: 'grotto', x: 40.5, z: 6.5 }, { k: 'sign', x: 10.6, z: 16, text: 'East: Saltmere · North: Mossbarrow Hollow' }, { k: 'sign', x: 33.6, z: 16.2, text: 'South: Saltmere · North: the Tidewatch Light' },
      { k: 'windmill', x: 14, z: 25 }, { k: 'ruin', x: 26, z: 11.5 }, { k: 'spire', x: 56, z: -14 }, { k: 'stones', x: 31.5, z: 13 },
    ],
    npcs: [
      { id: 'traveller', x: 12.5, z: 18.6, cast: 'traveller', face: 'left', script: 'traveller' },
      { id: 'thornMan', x: 17.5, z: 18.2, cast: 'woodcutter', face: 'right', script: 'thornMan', cond: (f) => !f.thornsGone },
    ],
    enemies: [
      { id: 'o1', x: 8.5, z: 22, group: 'g1', sprite: 'gloomcap' }, { id: 'o2', x: 10.5, z: 12, group: 'g4', sprite: 'thornbat' },
      { id: 'o3', x: 14.5, z: 17.5, group: 'g3', sprite: 'boar' }, { id: 'o4', x: 26, z: 20.5, group: 'o2', sprite: 'boar', cond: (f) => f.thornsGone },
      { id: 'o5', x: 33, z: 11, group: 'c1', sprite: 'crab', cond: (f) => f.thornsGone }, { id: 'o6', x: 39, z: 13, group: 'c3', sprite: 'moth', cond: (f) => f.thornsGone },
    ],
    chests: [{ id: 'ow1', x: 12.5, z: 8.5, item: 'cinderbomb', n: 2 }, { id: 'ow2', x: 25.5, z: 9.5, gold: 80 }, { id: 'ow3', x: 39.5, z: 7.5, item: 'c_feather', n: 1 }],
    exits: [
      { x: 7, z: 31, w: 4, d: 2, to: 'kindlewick', at: [16.5, 23.4], dir: 'up', label: 'Kindlewick' },
      { x: 8, z: 5, w: 2, d: 1, to: 'mossbarrow', at: [15.5, 28.2], dir: 'up', label: 'Mossbarrow Hollow' },
      { x: 36, z: 24, w: 3, d: 2, to: 'saltmere', at: [2.5, 13.5], dir: 'right', label: 'Saltmere', cond: (f) => f.chapter2, block: 'The shard is cold in your pocket. You should bring it home to Odile before going further.' },
      { x: 40, z: 6, w: 2, d: 1, to: 'saltglass', at: [15.5, 28.2], dir: 'up', label: 'Saltglass Grotto', cond: (f) => f.ines, block: 'The grotto mouth is flooded at this tide. Someone in Saltmere would know the safe path.' },
    ],
    triggers: [{ id: 'thornLook', x: 18, z: 16, w: 1, d: 4, script: 'thornLook', cond: (f) => !f.thornsGone }],
    start: [8.5, 28.5],
  },

  mossbarrow: {
    name: 'Mossbarrow Hollow', kind: 'dungeon', light: 'cave', region: 'forest',
    tiles: [
      'RRRRRRRRRRRRRRRRRRRRRRRRRRRRRR',
      'RRRRRRRRRRrrrrrrrrrrRRRRRRRRRR',
      'RRRRRRRRrrrrrrrrrrrrrrRRRRRRRR',
      'RRRRRRRrrrrrrrrrrrrrrrrRRRRRRR',
      'RRRRRRRrrrrrrmrrrrrrrrrRRRRRRR',
      'RRRRRRRrrrrrrrrrrrmrrrrRRRRRRR',
      'RRRRRRRRrrrrrrrrrrrrrrRRRRRRRR',
      'RRRRRRRRRRRoorrrroooRRRRRRRRRR',
      'RRRRRRRRRRRRRrrrrRRRRRRRRRRRRR',
      'RRRrrrrRRRRRRrrrrRRRRRRrrrrRRR',
      'RRrrrrrrrRRRrrrrrrRRRRrrrrrrRR',
      'RRrrmrrrrrrrrrrrrrrrrrrrrmrrRR',
      'RRrrrrrRRRRRrrrrrrRRRRRrrrrrRR',
      'RRRrrRRRRRRRRrrrrRRRRRRRRrrRRR',
      'RRRrrRRRRRRRR~~~~RRRRRRRRrrRRR',
      'RRRrrrrRRRRR~~__~~RRRRRrrrrRRR',
      'RRRRrrmrrRR~~~__~~~RRrrrrRRRRR',
      'RRRRRRrrrrrr~~__~~rrrrrRRRRRRR',
      'RRRRRRRRrrrrrr__rrrrrrRRRRRRRR',
      'RRRRRRRRRRrrrrrrrrrrRRRRRRRRRR',
      'RRRRRRRRRRRrrrrrrrrRRRRRRRRRRR',
      'RRRRRRRRRRRRrrrrrrRRRRRRRRRRRR',
      'RRRRRRRRRRrrrrrrrrrrRRRRRRRRRR',
      'RRRRRRRRRrrrrrrrrrrrrRRRRRRRRR',
      'RRRRRRRRRrrrrmrrrrrrrRRRRRRRRR',
      'RRRRRRRRRrrrrrrrrrrrrRRRRRRRRR',
      'RRRRRRRRRRrrrrrrrrrrRRRRRRRRRR',
      'RRRRRRRRRRRRRrrrrRRRRRRRRRRRRR',
      'RRRRRRRRRRRRRrrrrRRRRRRRRRRRRR',
      'RRRRRRRRRRRRRRrrRRRRRRRRRRRRRR',
    ],
    props: [
      { k: 'roots', x: 15, z: 7.2, w: 4, cond: (f) => !f.rootsOpen }, { k: 'mushrooms', x: 4.5, z: 11.5 }, { k: 'mushrooms', x: 25.5, z: 11.5 }, { k: 'mushrooms', x: 13.5, z: 24.5 },
      { k: 'mushrooms', x: 6.5, z: 16.5 }, { k: 'mushrooms', x: 13.5, z: 4.5 }, { k: 'mushrooms', x: 18.5, z: 5.5 }, { k: 'crystal', x: 22, z: 17.5, c: '#ffb070' },
      { k: 'beam', x: 15, z: 3.5 }, { k: 'heart', x: 15, z: 2.4, cond: (f) => !f.boss1 }, { k: 'cartwreck', x: 11.5, z: 23.8 },
    ],
    npcs: [
      { id: 'bramNpc', x: 17.5, z: 22.5, cast: 'bram', face: 'left', script: 'bramMeet', cond: (f) => !f.bram },
    ],
    enemies: [
      { id: 'm1', x: 15.5, z: 19.5, group: 'g5', sprite: 'rootling' }, { id: 'm2', x: 5.5, z: 10.8, group: 'g2', sprite: 'gloomcap' },
      { id: 'm3', x: 24.5, z: 10.8, group: 'g6', sprite: 'boar' }, { id: 'm4', x: 15, z: 9.5, group: 'g7', sprite: 'rootling' },
      { id: 'm5', x: 25.5, z: 15.5, group: 'g4', sprite: 'thornbat' },
      { id: 'boarA', x: 15.5, z: 22.2, group: 'gbram', sprite: 'boar', cond: (f) => f.bramTalk && !f.bram, still: true, script: 'bramFight' },
      { id: 'rootmother', x: 15, z: 3.2, group: 'boss1', sprite: 'rootmother', boss: true, still: true, cond: (f) => !f.boss1, script: 'boss1' },
    ],
    chests: [{ id: 'mb1', x: 4.5, z: 16.3, item: 'w_brand', n: 1 }, { id: 'mb2', x: 26.5, z: 15.5, item: 'tonic', n: 3 }, { id: 'mb3', x: 20.5, z: 2.5, item: 'ash', n: 1 }, { id: 'mb4', x: 10.5, z: 24.5, gold: 60 }],
    shrines: [{ id: 'ms1', x: 15.5, z: 11.6 }],
    exits: [{ x: 13, z: 29, w: 4, d: 1, to: 'overworld', at: [8.5, 7.2], dir: 'down' }],
    triggers: [{ id: 'mbEnter', x: 10, z: 22, w: 11, d: 5, script: 'mbEnter', once: true, cond: (f) => !f.bramTalk }, { id: 'rootGate', x: 13, z: 8, w: 4, d: 1, script: 'rootGate', cond: (f) => !f.rootsOpen }],
    blockers: [{ x: 13, z: 7, w: 4, d: 1, cond: (f) => !f.rootsOpen }],
    start: [15.5, 28.2],
  },

  saltmere: {
    name: 'Saltmere', kind: 'town', light: 'bluedusk', region: 'coast', inn: 'salt',
    tiles: [
      'PPPPPPPPPPPPPPPPPPPPPPPPPP~~~~~~',
      'PPP....TT....b.....TT....s~~~~~~',
      'PP...........................s~~',
      'P..f........................ss~~',
      'P.......,,,,,,,,,,,,,,,,,,,,,s~~',
      'P.......,::::::::::::::::::,,s~~',
      'P.......,::::::::::::::::::,ss~~',
      'P..b....,::::::::::::::::::,s~~~',
      'P.......,::::::::::::::::::,s~~~',
      'P.......,::::::::::::::::::,s~~~',
      'Pf......,::::::::::::::::::,s~~~',
      'P.......,::::::::::::::::::,s~~~',
      ',,,,,,,,,::::::::::::::::::,,___',
      ',,,,,,,,,::::::::::::::::::,,___',
      'P.......,::::::::::::::::::,s~~~',
      'P.......,,,,,,,,,,,,,,,,,,,,s~~~',
      'P.f.......sssssss.......sssss~~~',
      'PP......ssss~~~ss..........s~~~~',
      'PPP...sss~~~~~~~~ssssssssss~~~~~',
      'PP..ss~~~~~~~~_____~~~~~~~~~~~~~',
      'Pss~~~~~~~~~~~_____~~~~~~~~~~~~~',
      's~~~~~~~~~~~~~_____~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~_____~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    ],
    buildings: [
      { k: 'house', x: 9, z: 1, w: 5, d: 3, roof: '#3d6a8a', wall: 'plaster', door: 11.5, sign: 'inn', name: 'inn', floors: 2 },
      { k: 'house', x: 15, z: 1, w: 4, d: 3, roof: '#a3523a', wall: 'timber', door: 16.5, sign: 'items' },
      { k: 'house', x: 20, z: 1, w: 5, d: 3, roof: '#4a5a6a', wall: 'stone', door: 22, sign: 'smith' },
      { k: 'house', x: 1, z: 5, w: 5, d: 3, roof: '#6a8a9a', wall: 'plaster', door: 3.5, name: 'marr', stilts: false },
      { k: 'house', x: 2, z: 15, w: 4, d: 2, roof: '#8a6a3a', wall: 'timber', door: 3.5 },
      { k: 'house', x: 21, z: 16, w: 4, d: 2, roof: '#5a7a5a', wall: 'timber', door: 22.5, stilts: true },
    ],
    props: [
      { k: 'lamp', x: 8.6, z: 5 }, { k: 'lamp', x: 27.4, z: 5 }, { k: 'lamp', x: 8.6, z: 14.6 }, { k: 'lamp', x: 27.4, z: 14.6 }, { k: 'lamp', x: 14.3, z: 18.6 }, { k: 'lamp', x: 19.7, z: 18.6 },
      { k: 'fountain', x: 18, z: 9.5 }, { k: 'boat', x: 16.5, z: 22.6, big: true }, { k: 'boat', x: 30.5, z: 9.3 }, { k: 'boat', x: 9.5, z: 20.5 },
      { k: 'nets', x: 26, z: 16.4 }, { k: 'barrel', x: 26.8, z: 11.6 }, { k: 'barrel', x: 27.2, z: 12.3 }, { k: 'crate', x: 29.4, z: 11.2 }, { k: 'crate', x: 30.3, z: 14.2 },
      { k: 'stall', x: 12.5, z: 9, c: '#3a7ac8' }, { k: 'stall', x: 23, z: 9, c: '#c8a03a' }, { k: 'lighthouse_far', x: 31, z: -9 }, { k: 'bunting', x0: 8.6, z0: 5, x1: 27.4, z1: 5 },
      { k: 'post', x: 28.5, z: 11.6 }, { k: 'post', x: 28.5, z: 14.4 }, { k: 'post', x: 13.6, z: 19.2 }, { k: 'post', x: 19.4, z: 19.2 },
    ],
    npcs: [
      { id: 'brineKeep', x: 16.5, z: 4.6, cast: 'gus', face: 'down', script: 'brineShop' },
      { id: 'armsKeep', x: 22, z: 4.6, cast: 'sera', face: 'down', script: 'armsShop' },
      { id: 'innSalt', x: 11.5, z: 4.6, cast: 'marta2', face: 'down', script: 'innSalt' },
      { id: 'hask', x: 16.5, z: 19.5, cast: 'hask', face: 'up', script: 'hask' },
      { id: 'inesNpc', x: 3.5, z: 9, cast: 'ines', face: 'down', script: 'inesMeet', cond: (f) => !f.ines },
      { id: 'teodor', x: 4.6, z: 9.2, cast: 'teodor', face: 'down', script: 'teodor', cond: (f) => f.boss2 },
      { id: 'fisher', x: 28.5, z: 13, cast: 'fisher', face: 'right', script: 'fisher' },
      { id: 'gullkid', x: 15, z: 12, cast: 'kid2', wander: 3, script: 'gullkid' },
      { id: 'oldsal', x: 20.5, z: 13.5, cast: 'elder2', face: 'left', script: 'oldsal' },
      { id: 'gull1', x: 25, z: 7.5, cast: 'gull', wander: 2, script: 'gull', small: true },
    ],
    chests: [{ id: 'sm1', x: 1.5, z: 3.5, item: 'salts', n: 2 }, { id: 'sm2', x: 30.5, z: 12.5, gold: 120 }],
    exits: [
      { x: 0, z: 12, w: 1, d: 2, to: 'overworld', at: [34.2, 24.5], dir: 'left' },
    ],
    triggers: [{ id: 'saltArrive', x: 0, z: 11, w: 6, d: 4, script: 'saltArrive', once: true, cond: (f) => !f.saltArrive }],
    start: [2.5, 13],
  },

  saltglass: {
    name: 'Saltglass Grotto', kind: 'dungeon', light: 'crystal', region: 'grotto', floor: { r: 'grotto' },
    tiles: [
      'RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR',
      'RRRRRRRRRRRrrrrrrrrrrRRRRRRRRRRR',
      'RRRRRRRRRrrrrrrrrrrrrrrRRRRRRRRR',
      'RRRRRRRRrrrrrrrrrrrrrrrrRRRRRRRR',
      'RRRRRRRRrr~~~rrrrrr~~~rrRRRRRRRR',
      'RRRRRRRRrrrrrrrrrrrrrrrrRRRRRRRR',
      'RRRRRRRRRrrrrrrrrrrrrrrRRRRRRRRR',
      'RRRRRRRRRRRRRrrrrrRRRRRRRRRRRRRR',
      'RRRRRRRRRRRRRRrrrRRRRRRRRRRRRRRR',
      'RRRRrrrrrrRRRRrrrRRRRrrrrrrrRRRR',
      'RRRrrrcrrrrRRRrrrRRRrrrrcrrrrRRR',
      'RRRrrrrrrrrrrrrrrrrrrrrrrrrrrRRR',
      'RRRrr~~~~rrrRRRRRRRrrr~~~~~rrRRR',
      'RRRrr~~~~~rRRRRRRRRRr~~~~~~rrRRR',
      'RRRrrr~~~rrRRRRRRRRRrr~~~~rrrRRR',
      'RRRRrrrrrrRRRRRRRRRRRrrrrrrrRRRR',
      'RRRRRRrr_RRRRRRRRRRRRRR_rrRRRRRR',
      'RRRRRRrr_rRRRRRRRRRRRRr_rrRRRRRR',
      'RRRRRRrrrrrrrrrrrrrrrrrrrrRRRRRR',
      'RRRRRRRrrrrrrcrrrrrrcrrrrRRRRRRR',
      'RRRRRRRRRRrrrrrrrrrrrrRRRRRRRRRR',
      'RRRRRRRRRRRRrrrrrrrrRRRRRRRRRRRR',
      'RRRRRRRRRRRRR~~__~~RRRRRRRRRRRRR',
      'RRRRRRRRRRRR~~~__~~~RRRRRRRRRRRR',
      'RRRRRRRRRRRRRrr__rrRRRRRRRRRRRRR',
      'RRRRRRRRRRRRrrrrrrrrRRRRRRRRRRRR',
      'RRRRRRRRRRRrrrrrrrrrrRRRRRRRRRRR',
      'RRRRRRRRRRRRrrrrrrrrRRRRRRRRRRRR',
      'RRRRRRRRRRRRRRrrrrRRRRRRRRRRRRRR',
      'RRRRRRRRRRRRRRrrrrRRRRRRRRRRRRRR',
    ],
    props: [
      { k: 'crystal', x: 6.5, z: 10.5, c: '#7fe8ff', big: true }, { k: 'crystal', x: 24.5, z: 10.5, c: '#b08cff', big: true }, { k: 'crystal', x: 13.5, z: 19.5, c: '#7fe8ff' },
      { k: 'crystal', x: 20.5, z: 19.5, c: '#9cfff0' }, { k: 'crystal', x: 9.5, z: 3.5, c: '#7fe8ff' }, { k: 'crystal', x: 22.5, z: 3.5, c: '#b08cff' },
      { k: 'focus', x: 16, z: 2.4 }, { k: 'beam', x: 16, z: 2.5 }, { k: 'shells', x: 15, z: 26.5 }, { k: 'shells', x: 4.5, z: 15 }, { k: 'shells', x: 26.5, z: 15 },
    ],
    npcs: [{ id: 'teodorTrapped', x: 22.5, z: 2.6, cast: 'teodor', face: 'left', script: 'teodorTrapped', cond: (f) => !f.boss2 }],
    enemies: [
      { id: 'sg1', x: 15.5, z: 25.5, group: 'c1', sprite: 'crab' }, { id: 'sg2', x: 10.5, z: 18.5, group: 'c2', sprite: 'eel' }, { id: 'sg3', x: 22.5, z: 18.2, group: 'c3', sprite: 'moth' },
      { id: 'sg4', x: 6.5, z: 11, group: 'c4', sprite: 'crab' }, { id: 'sg5', x: 24, z: 11.5, group: 'c5', sprite: 'shade' }, { id: 'sg6', x: 15.5, z: 9.5, group: 'c6', sprite: 'eel' },
      { id: 'brinewarden', x: 16, z: 4.6, group: 'boss2', sprite: 'brinewarden', boss: true, still: true, cond: (f) => !f.boss2, script: 'boss2' },
    ],
    chests: [{ id: 'sg_c1', x: 4.5, z: 10.5, item: 'a_tidecoat', n: 1 }, { id: 'sg_c2', x: 27.5, z: 10.2, item: 'boltjar', n: 3 }, { id: 'sg_c3', x: 7.5, z: 17.5, item: 'draught', n: 2 }, { id: 'sg_c4', x: 25.5, z: 17.5, item: 'c_tide', n: 1 }],
    shrines: [{ id: 'sgs', x: 15.5, z: 11.4 }],
    exits: [{ x: 14, z: 29, w: 4, d: 1, to: 'overworld', at: [40.6, 8.6], dir: 'down' }],
    triggers: [{ id: 'sgEnter', x: 12, z: 24, w: 8, d: 4, script: 'sgEnter', once: true, cond: (f) => !f.sgEnter }],
    start: [15.5, 28.2],
  },

  lanternspire: {
    name: 'Lanternspire', kind: 'dungeon', light: 'night', region: 'spire',
    tiles: [
      '                              ',
      '         ============         ',
      '        ==============        ',
      '       ================       ',
      '       ================       ',
      '       ================       ',
      '        ==============        ',
      '              SS              ',
      '   ========================   ',
      '   ========================   ',
      '   =======    ==    =======   ',
      '   =======   ====   =======   ',
      '   =======   ====   =======   ',
      '   ========================   ',
      '                       SS     ',
      '   ========================   ',
      '   ======  ========  ======   ',
      '   ======  ========  ======   ',
      '   ========================   ',
      '   ========================   ',
      '    SS                        ',
      '   ========================   ',
      '   ========================   ',
      '   =======  ======  =======   ',
      '   ========================   ',
      '   ========================   ',
      '   ===WW============WW=====   ',
      '            SSSS              ',
      '      ______________          ',
      '      ______________          ',
      '~~~~~~______________~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    ],
    heights: [0, 4, 4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0].map((h) => String(h).repeat(30)),
    props: [
      { k: 'ember', x: 15, z: 2.4 }, { k: 'brazier', x: 8.5, z: 4.5 }, { k: 'brazier', x: 21.5, z: 4.5 }, { k: 'brazier', x: 3.5, z: 8.5 }, { k: 'brazier', x: 26.5, z: 8.5 },
      { k: 'brazier', x: 3.5, z: 18.5 }, { k: 'brazier', x: 26.5, z: 18.5 }, { k: 'brazier', x: 3.5, z: 21.5 }, { k: 'brazier', x: 26.5, z: 21.5 }, { k: 'brazier', x: 16.5, z: 13.5 },
      { k: 'pillar', x: 7.5, z: 3.5 }, { k: 'pillar', x: 22.5, z: 3.5 }, { k: 'pillar', x: 10.5, z: 1.5 }, { k: 'pillar', x: 19.5, z: 1.5 },
      { k: 'statue', x: 7, z: 26.5 }, { k: 'statue', x: 21, z: 26.5 }, { k: 'boat', x: 24, z: 30.6, big: true }, { k: 'wagon', x: 18.4, z: 29.4 }, { k: 'spirebody', x: 15, z: -6 },
    ],
    npcs: [{ id: 'wagoner', x: 17.2, z: 28.6, cast: 'wagoner', face: 'down', script: 'wagon' }],
    enemies: [
      { id: 'ls1', x: 9, z: 22.5, group: 's1', sprite: 'sentinel' }, { id: 'ls2', x: 20, z: 24.5, group: 's2', sprite: 'hound' }, { id: 'ls3', x: 7, z: 17.5, group: 's3', sprite: 'lamp' },
      { id: 'ls4', x: 22, z: 18.5, group: 's4', sprite: 'sentinel' }, { id: 'ls5', x: 6.5, z: 10.5, group: 's5', sprite: 'hound' }, { id: 'ls6', x: 22, z: 11.5, group: 's3', sprite: 'lamp' },
      { id: 'morrowBoss', x: 15, z: 4.2, group: 'boss3', sprite: 'morrow', boss: true, still: true, cond: (f) => f.reveal && !f.boss3, script: 'boss3' },
    ],
    chests: [{ id: 'ls_c1', x: 3.5, z: 15.5, item: 'feast', n: 1 }, { id: 'ls_c2', x: 26.5, z: 15.5, item: 'w_dawnedge', n: 1 }, { id: 'ls_c3', x: 3.5, z: 12.5, item: 's_moon', n: 1 }, { id: 'ls_c4', x: 26.5, z: 12.5, item: 'draught', n: 2 }, { id: 'ls_c5', x: 12.5, z: 16.5, item: 'ash', n: 2 }],
    shrines: [{ id: 'lss1', x: 10.5, z: 24.5 }, { id: 'lss2', x: 15.5, z: 11.6 }],
    exits: [],
    triggers: [{ id: 'spireArrive', x: 6, z: 27, w: 14, d: 3, script: 'spireArrive', once: true, cond: (f) => !f.spireArrive }, { id: 'reveal', x: 12, z: 6, w: 6, d: 2, script: 'reveal', once: true, cond: (f) => !f.reveal }],
    start: [12.5, 29],
  },
};

// tiles under a building footprint are blocked; door handled by NPCs/props (no interiors in this compact build)
export function mapInfo(id) {
  const M = MAPS[id];
  if (!M._info) {
    const H = M.tiles.length, W = M.tiles[0].length;
    const blocked = new Uint8Array(W * H);
    for (const b of M.buildings || []) for (let z = b.z; z < b.z + b.d; z++) for (let x = b.x; x < b.x + b.w; x++) if (x >= 0 && z >= 0 && x < W && z < H) blocked[z * W + x] = 1;
    M._info = { W, H, blocked };
  }
  return M._info;
}
export function tileAt(id, x, z) { const M = MAPS[id], r = M.tiles[Math.floor(z)]; return r ? r[Math.floor(x)] ?? ' ' : ' '; }
export function heightAt(id, x, z) { const M = MAPS[id]; if (!M.heights) return 0; const r = M.heights[Math.floor(z)]; const c = r ? r[Math.floor(x)] : '0'; return (+(c || 0)) * H_STEP; }
// walkability for a point, given flags (dynamic blockers like the Thornwall and the root gate)
export function walkable(id, x, z, f = {}) {
  const M = MAPS[id], { W, H, blocked } = mapInfo(id);
  const tx = Math.floor(x), tz = Math.floor(z);
  if (tx < 0 || tz < 0 || tx >= W || tz >= H) return false;
  const c = M.tiles[tz][tx];
  if (c === 'x') return !!f.thornsGone;
  if (!WALK.has(c) || blocked[tz * W + tx]) return false;
  for (const b of M.blockers || []) if (b.cond(f) && tx >= b.x && tx < b.x + b.w && tz >= b.z && tz < b.z + b.d) return false;
  return true;
}
// can a walker step from (x0,z0) to (x1,z1)? heights must match unless one side is a stair tile
export function canStep(id, x0, z0, x1, z1, f) {
  if (!walkable(id, x1, z1, f)) return false;
  const h0 = heightAt(id, x0, z0), h1 = heightAt(id, x1, z1);
  if (Math.abs(h0 - h1) < 0.01) return true;
  const s0 = tileAt(id, x0, z0) === 'S', s1 = tileAt(id, x1, z1) === 'S';
  return (s0 || s1) && Math.abs(h0 - h1) <= H_STEP + 0.01;
}

// stairs ramp toward their lower neighbour; returns {dx,dz} pointing DOWNHILL, or null
export function stairDir(id, tx, tz) {
  const h = heightAt(id, tx + 0.5, tz + 0.5);
  for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const c = tileAt(id, tx + dx + 0.5, tz + dz + 0.5);
    if (WALK.has(c) && c !== 'S' && Math.abs(heightAt(id, tx + dx + 0.5, tz + dz + 0.5) - (h - H_STEP)) < 0.01) return { dx, dz };
  }
  return null;
}
// smooth walking height (stairs interpolate)
export function groundY(id, x, z) {
  const tx = Math.floor(x), tz = Math.floor(z), h = heightAt(id, x, z);
  if (tileAt(id, x, z) !== 'S') return tileAt(id, x, z) === '_' ? 0.08 + h : h;
  const d = stairDir(id, tx, tz); if (!d) return h;
  const fx = x - tx, fz = z - tz;
  const t = d.dz === 1 ? fz : d.dz === -1 ? 1 - fz : d.dx === 1 ? fx : 1 - fx; // 0 at uphill edge → 1 at downhill edge
  return h - H_STEP * t;
}

// battle stages: tiny generated dioramas per region (party stands right, foes left)
const STAGE_W = 24, STAGE_H = 16;
function stage(fill, fn) { const g = Array.from({ length: STAGE_H }, () => Array(STAGE_W).fill(fill)); fn(g); return g.map((r) => r.join('')); }
export const STAGES = {
  field: { light: 'dusk', tiles: stage('.', (g) => { for (let x = 0; x < STAGE_W; x++) { g[0][x] = 'T'; g[1][x] = x % 3 ? 'T' : 'P'; g[2][x] = x % 4 === 1 ? 'T' : '.'; } for (let x = 0; x < STAGE_W; x++) { g[8][x] = ','; g[9][x] = ','; } for (const [x, z] of [[3, 4], [19, 5], [7, 13], [16, 12], [21, 10]]) g[z][x] = 'f'; for (let x = 0; x < STAGE_W; x++) { g[15][x] = 'T'; } g[3][12] = 'b'; }) },
  forest: { light: 'cave', tiles: stage('r', (g) => { for (let x = 0; x < STAGE_W; x++) { g[0][x] = 'R'; g[1][x] = 'R'; g[2][x] = x % 5 ? 'R' : 'r'; g[15][x] = 'R'; } for (const [x, z] of [[4, 5], [18, 4], [10, 12], [20, 11], [2, 10]]) g[z][x] = 'm'; g[3][7] = 'o'; g[3][16] = 'o'; }) },
  coast: { light: 'bluedusk', tiles: stage('s', (g) => { for (let x = 0; x < STAGE_W; x++) { g[0][x] = '~'; g[1][x] = '~'; g[2][x] = '~'; g[3][x] = x % 6 ? 's' : '~'; g[15][x] = 'P'; g[14][x] = x % 3 ? '.' : 'P'; } }) },
  grotto: { light: 'crystal', tiles: stage('r', (g) => { for (let x = 0; x < STAGE_W; x++) { g[0][x] = 'R'; g[1][x] = 'R'; g[2][x] = '~'; g[3][x] = x % 4 ? 'r' : '~'; g[15][x] = 'R'; } g[4][4] = 'c'; g[5][19] = 'c'; g[12][2] = 'c'; g[13][21] = 'c'; }) },
  spire: { light: 'night', tiles: stage('=', (g) => { for (let x = 0; x < STAGE_W; x++) { g[0][x] = ' '; g[1][x] = ' '; g[2][x] = x > 3 && x < 20 ? 'W' : ' '; g[15][x] = ' '; g[14][x] = x % 7 === 3 ? ' ' : '='; } }) },
};
for (const [k, S] of Object.entries(STAGES)) MAPS['stage_' + k] = { name: 'Battle', kind: 'stage', light: S.light, tiles: S.tiles, floor: k === 'grotto' ? { r: 'grotto' } : null, props: k === 'spire' ? [{ k: 'brazier', x: 5, z: 4 }, { k: 'brazier', x: 19, z: 4 }, { k: 'emberFar', x: 12, z: -10 }] : k === 'grotto' ? [{ k: 'crystal', x: 4.5, z: 4.5, c: '#7fe8ff' }, { k: 'crystal', x: 19.5, z: 5.5, c: '#b08cff' }] : k === 'forest' ? [{ k: 'mushrooms', x: 4.5, z: 5.5 }, { k: 'mushrooms', x: 18.5, z: 4.5 }] : [], start: [12, 8] };
