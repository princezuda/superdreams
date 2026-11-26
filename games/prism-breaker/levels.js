// Prism Breaker — 30 hand-made layouts across three worlds; every 10th level is a Prism Core boss.
// Legend: g glass (1 hit) · n neon (2) · s steel (3) · x crystal charge (explodes neighbours) · p power glass (always drops) · u unbreakable
export const WORLDS = [
  { name: 'Crystal Caverns', hue: 0.52, a: '#38e8ff', b: '#7a5cff', bg: [0x041a2a, 0x0b3a5a, 0x2a1a6e] },
  { name: 'Neon City', hue: 0.88, a: '#ff4fd8', b: '#6a5cff', bg: [0x14041e, 0x5a0f5a, 0x0d2a7a] },
  { name: 'Solar Core', hue: 0.08, a: '#ffb02e', b: '#ff3d5a', bg: [0x1a0804, 0x6a2a0a, 0x5a0a2a] },
];
export const LEVELS = [
  // ---------------------------------------------------------------- Crystal Caverns
  { name: 'First Light', layout: ['', '.ggggggggg.', '.ggggggggg.', '.ggggpgggg.', '.ggggggggg.'], tip: 'move' },
  { name: 'Geode', layout: ['.....g.....', '....ggg....', '...ggpgg...', '..ggggggg..', '...ggggg...', '....ggg....', '.....g.....'] },
  { name: 'Twin Peaks', layout: ['..n.....n..', '.ngn...ngn.', 'ngggn.ngggn', 'ggggggggggg', 'gggpgggpggg'], tip: 'neon' },
  { name: 'Strata', layout: ['nnnnnnnnnnn', '', 'ggggggggggg', '', 'nnnnnnnnnnn', '', 'gggggpggggg'] },
  { name: 'Crystal Bloom', layout: ['.g.g.g.g.g.', 'g.g.g.g.g.g', '.gxg.g.gxg.', 'g.g.g.g.g.g', '.g.gxgxg.g.', 'g.g.g.g.g.g'], tip: 'charge' },
  { name: 'Vault', layout: ['.sssssssss.', '.s.......s.', '.s.ggggg.s.', '.s.gnpng.s.', '.s.ggggg.s.'], tip: 'steel' },
  { name: 'Lattice', layout: ['gngngngngng', 'ngngngngngn', 'gngnpngngng', 'ngngngngngn', 'gngngngngng'] },
  { name: 'Ziggurat', layout: ['.....x.....', '....ggg....', '...nnnnn...', '..ggggggg..', '.nnnnpnnnn.', 's.s.s.s.s.s'] },
  { name: 'Hollows', layout: ['ggggggggggg', 'gu.ggggg.ug', 'gu.gnpng.ug', 'gu.ggggg.ug', 'gu.......ug'], tip: 'solid' },
  { name: 'Prism Core I', layout: ['', '', '', '', '', 'g.g.g.g.g.g', '.g.gpg.g.g.'], boss: { hp: 14, speed: 0.45 }, tip: 'boss' },
  // ---------------------------------------------------------------- Neon City
  { name: 'Skyline', layout: ['.n.......n.', '.n..n....n.', '.n..n..n.n.', 'nn.nn..n.nn', 'nngnn.gnnnn', 'gggggpggggg'] },
  { name: 'Circuit', layout: ['xnnnnnnnnnx', 'n.........n', 'n.ggggggg.n', 'n.g.....g.n', 'n.g.ppp.g.n', 'n.ggggggg.n', 'xnnnnnnnnnx'] },
  { name: 'Visitor', layout: ['..n.....n..', '...n...n...', '..nnnnnnn..', '.nn.nnn.nn.', 'nnnnnnnnnnn', 'n.nnnpnnn.n', 'n.n.....n.n', '...nn.nn...'] },
  { name: 'Zigzag', layout: ['ss.......ss', '.ss.....ss.', '..ss...ss..', '...ss.ss...', 'gggggpggggg', 'nnnnnnnnnnn'] },
  { name: 'Fuse Box', layout: ['xxxxxxxxxxx', 'g.g.g.g.g.g', 'nnnnnnnnnnn', 'g.g.g.g.g.g', 'xxxxxpxxxxx'] },
  { name: 'Fortress', layout: ['uuuu...uuuu', 'u.........u', 'u.nnnnnnn.u', 'u.nsssssn.u', 'u.nnnpnnn.u'] },
  { name: 'Neon Rain', layout: ['g.n.g.n.g.n', '.g.n.g.n.g.', 'n.g.n.g.n.g', '.n.g.n.g.n.', 'g.n.gpg.n.g', '.g.n.g.n.g.', 'n.g.n.g.n.g'] },
  { name: 'Heartline', layout: ['.nnn...nnn.', 'nnnnn.nnnnn', 'nnnnnnnnnnn', 'nnnnnpnnnnn', '.nnnnnnnnn.', '..nnnnnnn..', '...nnnnn...', '....nnn....', '.....n.....'] },
  { name: 'Steel Garden', layout: ['s.s.s.s.s.s', '.g.g.g.g.g.', 's.x.s.x.s.x', '.g.g.g.g.g.', 's.s.s.p.s.s'] },
  { name: 'Prism Core II', layout: ['', '', '', '', '', 'nn.nnpnn.nn', 'g.g.g.g.g.g'], boss: { hp: 20, speed: 0.6 } },
  // ---------------------------------------------------------------- Solar Core
  { name: 'Corona', layout: ['...nnnnn...', '..n.....n..', '.n..sss..n.', 'n..s.x.s..n', 'n..s.p.s..n', '.n..sss..n.', '..n.....n..', '...nnnnn...'] },
  { name: 'Furnace', layout: ['sssssssssss', 's.........s', 's.xxxxxxx.s', 's.........s', 's.nnnpnnn.s'] },
  { name: 'Flare', layout: ['x...x...x..', '.n.n.n.n.n.', '..g.g.g.g.g', '.n.n.n.n.n.', 'x...x.p.x..', '.s.s.s.s.s.'] },
  { name: 'Spiral', layout: ['nnnnnnnnnnn', '..........n', '.nnnnnnnn.n', '.n......n.n', '.n.ppg..n.n', '.n.nnnnnn.n', '.n........n', '.nnnnnnnnnn'] },
  { name: 'Gates', layout: ['ggggggggggg', 'uu..uuu..uu', 'nnnnnnnnnnn', 'u..uuuuu..u', '.s.s.s.s.s.', '.....p.....'] },
  { name: 'Sunburst', layout: ['x....n....x', '.x...n...x.', '..x..n..x..', '...x.n.x...', 'nnnnnpnnnnn', '...x.n.x...', '..x..n..x..'] },
  { name: 'Bulwark', layout: ['sssssssssss', 'nnnnnnnnnnn', 'nnnnnnnnnnn', 'ggggggggggg', 'gggggpggggg'] },
  { name: 'Facets', layout: ['..n.....n..', '.nsn...nsn.', 'nsxsn.nsxsn', '.nsn...nsn.', '..n..p..n..', '....nsn....', '...nsxsn...', '....nsn....'] },
  { name: 'Eclipse', layout: ['...uuuuu...', '.uu.....uu.', 'u..nnnnn..u', 'u.nsssssn.u', 'u.nsxpxsn.u', 'u..nnnnn..u', '.uu.....uu.', '..uu...uu..'] },
  { name: 'Prism Core III', layout: ['', '', '', '', '', 's.n.n.n.n.s', '.g.x.gpx.g.', 'g.g.g.g.g.g'], boss: { hp: 28, speed: 0.75, amp: 3.3 } },
];
export const TIPS = {
  move: 'Drag anywhere (or use ←/→) to move the paddle. Tap to launch.',
  neon: 'Neon bricks take two hits — the glow dims when they crack.',
  charge: 'Crystal charges explode, shattering everything around them.',
  steel: 'Steel needs three hits. Aim with the paddle edge for sharper angles.',
  solid: 'Gold frames are unbreakable — use them as bumpers.',
  boss: 'A Prism Core! Hit it to drain its light. Its orbs shrink your paddle — dodge them.',
};
