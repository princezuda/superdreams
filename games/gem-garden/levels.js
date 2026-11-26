// Gem Garden — 40 hand-designed levels in four garden zones. Layout legend:
// '.' cell  'x' hole  'v' vine  'V' double vine  'b' bramble  'B' double bramble  's' seed start
// Move budgets are designed per zone; score/collect targets + star thresholds come from tests/tune.mjs (a seeded
// 60% goal-aware / 40% biggest-match bot, 24 deals per level) with hand adjustments for the first levels and finales.
// tip: coach bubble shown on level start. plant: reward that grows in the garden map.
const F = '........';
const full = () => Array(8).fill(F);

export const ZONES = [
  { name: 'Meadow', from: 1, to: 10, sky: ['#bfe6ff', '#fff3d6'], ground: '#8fd16a', accent: '#ffcf4d' },
  { name: 'Orchard', from: 11, to: 20, sky: ['#ffd9b0', '#fff0dc'], ground: '#a7c957', accent: '#ff8c42' },
  { name: 'Lily Pond', from: 21, to: 30, sky: ['#b8f0e8', '#e9fff7'], ground: '#6cc6a0', accent: '#5ad2f4' },
  { name: 'Moon Garden', from: 31, to: 40, sky: ['#2a2a5c', '#7b5ea7'], ground: '#3d6b5c', accent: '#d7b4ff' },
];

export const LEVELS = [
  // ---------------------------------------------------------------- Meadow
  { moves: 12, colors: 4, goals: [{ type: 'score', target: 9000 }], stars: [9000, 30000, 45000], tip: 'swap', plant: 'tulip' },
  { moves: 15, colors: 5, goals: [{ type: 'score', target: 8000 }], stars: [8000, 15000, 21000], tip: 'cascade', plant: 'daisy' },
  { moves: 15, colors: 5, goals: [{ type: 'score', target: 8800 }], stars: [8800, 15900, 20000], tip: 'line', plant: 'tulip2',
    layout: ['x......x', F, F, F, F, F, F, 'x......x'] },
  { moves: 16, colors: 5, goals: [{ type: 'vines' }], stars: [0, 18400, 25200], tip: 'vines', plant: 'sunflower',
    layout: [F, F, '.vvvvvv.', '.vvvvvv.', '.vvvvvv.', '.vvvvvv.', F, F] },
  { moves: 16, colors: 5, goals: [{ type: 'score', target: 9300 }], stars: [9300, 13000, 19500], tip: 'bomb', plant: 'bush',
    layout: ['xx....xx', 'x......x', F, F, F, F, 'x......x', 'xx....xx'] },
  { moves: 18, colors: 5, goals: [{ type: 'vines' }], stars: [0, 19100, 28100], plant: 'lavender',
    layout: ['...vv...', '..vvvv..', '.vv..vv.', 'vv....vv', 'vv....vv', '.vv..vv.', '..vvvv..', '...vv...'] },
  { moves: 16, colors: 5, goals: [{ type: 'score', target: 7500 }], stars: [7500, 12800, 15300], tip: 'prism', plant: 'daisy2',
    layout: ['xx....xx', 'xx....xx', F, F, F, F, 'xx....xx', 'xx....xx'] },
  { moves: 18, colors: 5, goals: [{ type: 'vines' }], stars: [0, 21900, 31500], plant: 'rose',
    layout: [F, '.vvvvvv.', '.v....v.', '.v.VV.v.', '.v.VV.v.', '.v....v.', '.vvvvvv.', F] },
  { moves: 24, colors: 5, goals: [{ type: 'seeds', n: 2 }], stars: [0, 18800, 27000], tip: 'seeds', plant: 'birdbath',
    layout: ['..s..s..', F, F, F, F, F, F, F] },
  { moves: 30, colors: 5, goals: [{ type: 'vines' }, { type: 'seeds', n: 2 }], stars: [0, 29200, 34100], plant: 'oak',
    layout: ['.s....s.', F, F, F, F, F, 'vvvvvvvv', F] },
  // ---------------------------------------------------------------- Orchard
  { moves: 15, colors: 5, goals: [{ type: 'brambles' }], stars: [0, 14400, 19300], tip: 'brambles', plant: 'apple',
    layout: [F, '.bb..bb.', F, '...bb...', F, '.bb..bb.', F, F] },
  { moves: 16, colors: 5, goals: [{ type: 'collect', c: 0, n: 46 }], stars: [0, 18300, 25200], tip: 'collect', plant: 'strawberry' },
  { moves: 24, colors: 5, goals: [{ type: 'seeds', n: 3 }], stars: [0, 20300, 31700], plant: 'pear',
    layout: ['...s....', F, 'b......b', 'b......b', F, F, F, F] },
  { moves: 21, colors: 5, goals: [{ type: 'vines' }], stars: [0, 22100, 31700], plant: 'pumpkin',
    layout: [F, F, F, F, F, F, 'vvvvvvvv', 'vvvvvvvv'] },
  { moves: 18, colors: 6, goals: [{ type: 'score', target: 5400 }], stars: [5400, 11400, 14800], tip: 'six', plant: 'cherry' },
  { moves: 20, colors: 5, goals: [{ type: 'brambles' }, { type: 'vines' }], stars: [0, 19400, 32800], plant: 'beehive',
    layout: [F, '..vvvv..', '.vBbbBv.', '.vb..bv.', '.vb..bv.', '.vBbbBv.', '..vvvv..', F] },
  { moves: 18, colors: 5, goals: [{ type: 'collect', c: 2, n: 57 }, { type: 'collect', c: 4, n: 55 }], stars: [0, 23600, 32200], plant: 'sunflower2' },
  { moves: 26, colors: 5, goals: [{ type: 'seeds', n: 2 }], stars: [0, 20000, 22700], plant: 'scarecrow',
    layout: ['..s..s..', '........', 'x......x', '.x....x.', '.x....x.', 'x......x', F, F] },
  { moves: 24, colors: 5, goals: [{ type: 'vines' }], stars: [0, 30400, 37300], plant: 'plum',
    layout: ['vv....vv', 'v......v', '..VVVV..', '..VVVV..', '..VVVV..', '..VVVV..', 'v......v', 'vv....vv'] },
  { moves: 26, colors: 5, goals: [{ type: 'brambles' }, { type: 'seeds', n: 3 }, { type: 'vines' }], stars: [0, 24000, 35700], plant: 'windmill',
    layout: ['..s..s..', F, 'bb....bb', F, F, '...vv...', '..vvvv..', 'vvvvvvvv'] },
  // ---------------------------------------------------------------- Lily Pond
  { moves: 18, colors: 5, goals: [{ type: 'score', target: 12700 }], stars: [12700, 17000, 21400], tip: 'shapes', plant: 'lily',
    layout: ['xx....xx', 'x......x', F, F, F, F, 'x......x', 'xx....xx'] },
  { moves: 22, colors: 5, goals: [{ type: 'vines' }], stars: [0, 7400, 9900], plant: 'reeds',
    layout: ['...xx...', '.v.xx.v.', 'vvvxxvvv', '...xx...', '...xx...', 'vvvxxvvv', '.v.xx.v.', '...xx...'] },
  { moves: 20, colors: 5, goals: [{ type: 'collect', c: 4, n: 29 }], stars: [0, 10400, 14100], plant: 'frog',
    layout: ['x......x', F, '..x..x..', F, F, '..x..x..', F, 'x......x'] },
  { moves: 24, colors: 5, goals: [{ type: 'seeds', n: 2 }], stars: [0, 12600, 17000], plant: 'lily2',
    layout: ['...ss...', '........', 'x......x', 'xx....xx', 'xxx..xxx', 'xx....xx', 'x......x', '........'] },
  { moves: 28, colors: 5, goals: [{ type: 'vines' }], stars: [0, 5400, 9000], plant: 'bridge',
    layout: ['xx....xx', 'x.vvvv.x', '.v.xx.v.', '.vxxxxv.', '.vxxxxv.', '.v.xx.v.', 'x.vvvv.x', 'xx....xx'] },
  { moves: 20, colors: 5, goals: [{ type: 'brambles' }, { type: 'collect', c: 1, n: 34 }], stars: [0, 19100, 26000], plant: 'heron',
    layout: [F, '...bb...', '..b..b..', '.b....b.', '.b....b.', '..b..b..', '...bb...', F] },
  { moves: 28, colors: 5, goals: [{ type: 'seeds', n: 3 }], stars: [0, 27800, 33400], plant: 'fountain',
    layout: ['..s..s..', F, F, F, F, F, F, F] },
  { moves: 26, colors: 5, goals: [{ type: 'vines' }], stars: [0, 37700, 49600], plant: 'lotus',
    layout: ['V.V.V.V.', '.V.V.V.V', 'V.V.V.V.', '.V.V.V.V', 'V.V.V.V.', '.V.V.V.V', 'V.V.V.V.', '.V.V.V.V'] },
  { moves: 20, colors: 5, goals: [{ type: 'collect', c: 0, n: 62 }, { type: 'collect', c: 3, n: 60 }, { type: 'collect', c: 4, n: 60 }], stars: [0, 22900, 36200], plant: 'dragonfly' },
  { moves: 34, colors: 5, goals: [{ type: 'vines' }, { type: 'seeds', n: 2 }], stars: [0, 17800, 25500], plant: 'pavilion',
    layout: ['.s.xx.s.', '...xx...', 'v......v', 'vv....vv', 'vv....vv', 'v......v', '...xx...', '...xx...'] },
  // ---------------------------------------------------------------- Moon Garden
  { moves: 20, colors: 6, goals: [{ type: 'score', target: 8100 }], stars: [8100, 11800, 14700], tip: 'night', plant: 'moonflower' },
  { moves: 22, colors: 5, goals: [{ type: 'brambles' }], stars: [0, 22300, 27000], plant: 'lantern',
    layout: [F, 'BBB..BBB', F, '.bb..bb.', '.bb..bb.', F, 'bbb..bbb', F] },
  { moves: 24, colors: 5, goals: [{ type: 'vines' }], stars: [0, 37600, 42200], plant: 'willow',
    layout: [F, F, 'VVVVVVVV', 'VVVVVVVV', 'VVVVVVVV', 'VVVVVVVV', F, F] },
  { moves: 30, colors: 5, goals: [{ type: 'seeds', n: 4 }, { type: 'brambles' }], stars: [0, 25800, 33000], plant: 'owl',
    layout: ['.s.ss.s.', F, '.b.bb.b.', F, F, '.b....b.', F, F] },
  { moves: 22, colors: 6, goals: [{ type: 'collect', c: 5, n: 28 }], stars: [0, 10700, 15900], plant: 'crystal' },
  { moves: 29, colors: 5, goals: [{ type: 'vines' }], stars: [0, 22900, 30000], plant: 'stargazer',
    layout: ['xxx..xxx', 'xx.vv.xx', 'vvvVVvvv', '.vVVVVv.', 'x.vVVv.x', 'x.vvvv.x', '.vv..vv.', 'vv.xx.vv'] },
  { moves: 32, colors: 5, goals: [{ type: 'seeds', n: 3 }, { type: 'vines' }, { type: 'brambles' }], stars: [0, 31500, 42300], plant: 'arch',
    layout: ['..s..s..', F, '.bb..bb.', F, F, F, 'vvvvvvvv', 'VVVVVVVV'] },
  { moves: 36, colors: 6, goals: [{ type: 'vines' }], stars: [0, 18900, 25200], plant: 'peacock',
    layout: [F, F, F, F, F, 'vvvvvvvv', 'VVVVVVVV', 'vvvvvvvv'] },
  { moves: 33, colors: 5, goals: [{ type: 'vines' }, { type: 'seeds', n: 3 }], stars: [0, 19800, 28000], plant: 'heart',
    layout: ['.s.xx.s.', 'v.vxxv.v', 'vvVvvVvv', 'vv.VV.vv', '.vvVVvv.', 'x.vvvv.x', 'xx.vv.xx', 'xxx..xxx'] },
  { moves: 40, colors: 6, goals: [{ type: 'vines' }, { type: 'brambles' }, { type: 'seeds', n: 2 }], stars: [0, 22500, 25300], plant: 'moontree',
    layout: ['..s..s..', '..b..b..', 'v......v', 'vB.vv.Bv', 'v..vv..v', 'v......v', '.vvvvvv.', 'vvvvvvvv'] },
];

// Plants reward per level, grouped by drawing routine (see garden.js).
export const tipText = {
  swap: 'Swipe a gem to swap it with a neighbour — line up 3 of a kind!',
  cascade: 'Gems that fall into new matches cascade — each chain scores more.',
  line: 'Match 4 in a row to grow a Line Gem. Match it to clear a whole line!',
  vines: 'Vines wrap some tiles. Clear the gems on top of them to free the soil.',
  bomb: 'Match in an L or T shape to make a Bloom Bomb.',
  prism: 'Match 5 in a row for a Prism — swap it with any gem to clear that colour!',
  seeds: 'Seeds can\'t be matched. Clear gems beneath them to drop them to the bottom.',
  brambles: 'Brambles block the soil. Make matches right next to them to break them.',
  collect: 'Collect gems of the shown colours by matching them.',
  six: 'Six colours now — look for Line Gems and combos to keep things moving.',
  shapes: 'The pond reshapes the board. Gems fall across the gaps.',
  night: 'Night falls on the Moon Garden. Try swapping two special gems together!',
};
