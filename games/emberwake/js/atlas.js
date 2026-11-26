// Emberwake — one 512² pixel-art atlas for every static surface (terrain tops/sides, walls, roofs, props, alpha cards).
// 32px content per tile (≈ the sprites' texel density), 8px edge extrusion so mipmaps never bleed between tiles.
export const SLOT = 48, PAD = 8, TS = 32, COLS = 10, AW = 512;
export const T = {};
const NAMES = ['grass1', 'grass2', 'grass3', 'flowers', 'dirt', 'cobble', 'planks', 'sand', 'cave', 'moss',
  'stone', 'riverbed', 'cliff', 'rocktop', 'cavewall', 'cavetop', 'brick', 'stonetop', 'dirtside', 'sandside',
  'plaster', 'timber', 'housestone', 'roof', 'door', 'window', 'bark', 'leaves', 'pine', 'wood',
  'iron', 'crystal', 'thorn', 'hay', 'awning', 'signItems', 'signSmith', 'signInn', 'stairs', 'roots',
  'stripes', 'foundation', 'chest', 'cardGrass', 'cardRed', 'cardYellow', 'cardBlue', 'cardReed', 'cardMush', 'fence',
  'gold', 'shells', 'statue', 'grotto', 'void', 'mossstone', 'thatch', 'cloth', 'darkwood', 'ember'];
NAMES.forEach((n, i) => (T[n] = i));

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Paint helpers operate on a 32×32 tile in the context `c` at (0,0) of a temp canvas.
function painter(c, seed) {
  const R = rng(seed);
  const px = (x, y, col, w = 1, h = 1) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  const fill = (col) => px(0, 0, TS, TS, col) || px(0, 0, col, TS, TS);
  const speck = (cols, n, w = 1, h = 1) => { for (let i = 0; i < n; i++) px((R() * TS) | 0, (R() * TS) | 0, cols[(R() * cols.length) | 0], w, h); };
  const clear = () => c.clearRect(0, 0, TS, TS);
  return { R, px, fill: (col) => px(0, 0, col, TS, TS), speck, clear };
}

const DRAW = {
  grass1(p) { p.fill('#5f9a3c'); p.speck(['#6fae44', '#558c34', '#7cbc4c'], 140); p.speck(['#4a7e2e'], 30, 1, 2); p.speck(['#8ccc58'], 12); },
  grass2(p) { p.fill('#5a9438'); p.speck(['#6aa842', '#4e8630', '#78b84a'], 150); for (let i = 0; i < 9; i++) { const x = (p.R() * 30) | 0, y = (p.R() * 28) | 0; p.px(x, y, '#82c452', 1, 2); p.px(x + 1, y + 1, '#4a7e2e', 1, 2); } },
  grass3(p) { p.fill('#63a03e'); p.speck(['#70b046', '#57903a', '#4c8030'], 150); p.speck(['#8a8a4a', '#7a6a3a'], 8, 2, 1); },
  flowers(p) { DRAW.grass2(p); for (let i = 0; i < 10; i++) { const x = (p.R() * 29) | 0, y = (p.R() * 29) | 0, c = ['#f0e070', '#f08aa0', '#ffffff', '#a0b8ff'][(p.R() * 4) | 0]; p.px(x + 1, y, c); p.px(x, y + 1, c); p.px(x + 2, y + 1, c); p.px(x + 1, y + 2, c); p.px(x + 1, y + 1, '#e8a030'); } },
  dirt(p) { p.fill('#a07a4e'); p.speck(['#b08a5a', '#8e6a42', '#9a744a', '#c09a66'], 220); p.speck(['#6e5236'], 22, 2, 1); p.speck(['#d0b080'], 6); },
  cobble(p) {
    p.fill('#6e6862');
    for (let r = 0; r < 5; r++) for (let k = 0; k < 5; k++) {
      const w = 5 + ((p.R() * 3) | 0), h = 5 + ((p.R() * 2) | 0), x = k * 7 + (r % 2) * 3 - 2 + ((p.R() * 2) | 0), y = r * 7 + ((p.R() * 2) | 0) - 1;
      const base = ['#a49c92', '#9a928a', '#aaa296', '#958d85', '#a8a08c'][(p.R() * 5) | 0];
      p.px(x + 1, y + 1, base, w, h); p.px(x + 1, y + 1, '#b8b0a4', w - 1, 1); p.px(x + w, y + 2, '#857e78', 1, h - 1); p.px(x + 2, y + h, '#857e78', w - 1, 1);
    }
    p.speck(['#7a9a5a', '#6a8a4a'], 10); p.speck(['#5e5852'], 20);
  },
  planks(p) { p.fill('#8a5e36'); for (let i = 0; i < 4; i++) { const y = i * 8; p.px(0, y, '#a87444', 32, 1); p.px(0, y + 7, '#5a3a20', 32, 1); p.px(((p.R() * 24) | 0) + 4, y + 1, '#5a3a20', 1, 6); p.px(((p.R() * 28) | 0), y + 3, '#7a5030', 4, 1); } p.speck(['#9a6a3e', '#7e5430'], 60); },
  sand(p) { p.fill('#e0c890'); p.speck(['#ecd8a4', '#d4b880', '#c8aa70', '#f4e4bc'], 200); p.speck(['#b89a68'], 10, 2, 1); },
  cave(p) { p.fill('#6a5a4c'); p.speck(['#76665a', '#5e4e42', '#82705e', '#544438'], 220); p.speck(['#927e68'], 14, 2, 2); },
  moss(p) { DRAW.cave(p); p.speck(['#3e6a3a', '#4e8040', '#356030'], 120, 2, 1); p.speck(['#7ae0a0'], 6); },
  stone(p) { p.fill('#6a6478'); for (let r = 0; r < 2; r++) for (let k = 0; k < 2; k++) { const x = k * 16, y = r * 16; p.px(x + 1, y + 1, ['#7a7488', '#726c80', '#827c90'][(p.R() * 3) | 0], 14, 14); p.px(x + 1, y + 1, '#948ea2', 13, 1); p.px(x + 14, y + 1, '#5a5468', 1, 14); p.px(x + 1, y + 14, '#5a5468', 14, 1); } p.speck(['#5e586c', '#8a849a'], 60); },
  riverbed(p) { p.fill('#3a5a5a'); p.speck(['#4a6a66', '#2e4a4a', '#5a7a70'], 160, 2, 2); },
  cliff(p) {
    // wavy sediment strata with cracks and the odd tuft — reads as rock face, not masonry
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const band = Math.floor((y + Math.sin(x * 0.35 + y * 0.1) * 2.2 + Math.sin(x * 0.11) * 3) / 5);
      const c = ['#8e7a62', '#7e6c56', '#9a8670', '#86735c', '#a08b72'][(band % 5 + 5) % 5];
      p.px(x, y, c);
    }
    p.speck(['#6e5e4a', '#a6927a', '#74644e'], 140);
    for (let i = 0; i < 4; i++) { let x = (p.R() * 30) | 0, y = (p.R() * 14) | 0; for (let k = 0; k < 10 + p.R() * 8; k++) { p.px(x, y, '#4e4234'); p.px(x + 1, y, '#9a8670'); y++; if (p.R() < 0.3) x += p.R() < 0.5 ? -1 : 1; } }
    p.speck(['#6a8a4a', '#5a7a3e'], 10, 2, 1);
  },
  rocktop(p) { p.fill('#8a7c6a'); p.speck(['#9a8c78', '#7a6c5a', '#6a8a4a', '#5a7a3e'], 240, 2, 1); },
  cavewall(p) { p.fill('#54463c'); for (let i = 0; i < 26; i++) { const x = (p.R() * 28) | 0, y = (p.R() * 28) | 0, s = 2 + ((p.R() * 4) | 0); p.px(x, y, '#66564a', s, s); p.px(x, y, '#7a6856', s - 1, 1); p.px(x + s - 1, y, '#3a302a', 1, s); } p.speck(['#3a302a'], 40); },
  cavetop(p) { p.fill('#3a302a'); p.speck(['#463a32', '#2e2620', '#4e4238'], 200, 2, 2); p.speck(['#4a7a44', '#3a6a3a'], 40, 2, 1); },
  brick(p) { p.fill('#4e4a5a'); for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) { const x = k * 12 + (r % 2) * 6 - 6, y = r * 8; const b = ['#6a6476', '#625c6e', '#706a7e'][(p.R() * 3) | 0]; p.px(x + 1, y + 1, b, 10, 6); p.px(x + 1, y + 1, '#7e788c', 10, 1); p.px(x + 1, y + 6, '#545064', 10, 1); } },
  stonetop(p) { p.fill('#5a5468'); p.speck(['#625c70', '#524c60', '#6a6478'], 200, 2, 1); },
  dirtside(p) { p.fill('#7a5a3a'); for (let y = 2; y < TS; y += 5) p.px(0, y, '#6a4c30', 32, 1); p.speck(['#8a6a46', '#6a4a2e', '#9a7a52'], 150); p.px(0, 0, '#5f9a3c', 32, 3); for (let x = 0; x < 32; x += 2) p.px(x, 3, '#4a7e2e', 1, 1 + ((p.R() * 3) | 0)); },
  sandside(p) { p.fill('#c8aa74'); for (let y = 3; y < TS; y += 5) p.px(0, y, '#b0925e', 32, 1); p.speck(['#d8bc88', '#b89a68'], 120); },
  plaster(p) { p.fill('#e8dcc4'); p.speck(['#f0e6d0', '#ddd0b6', '#d4c6aa'], 140); p.px(0, 0, '#6a4428', 32, 3); p.px(0, 29, '#6a4428', 32, 3); p.px(0, 0, '#6a4428', 3, 32); p.px(15, 3, '#7a5030', 3, 26); p.px(3, 3, '#8a6038', 1, 26); },
  timber(p) { p.fill('#9a6a40'); for (let x = 0; x < TS; x += 6) { p.px(x, 0, '#7a5030', 1, 32); p.px(x + 1, 0, '#aa7a4c', 1, 32); } p.speck(['#8a5c36', '#a8784a'], 90, 1, 2); },
  housestone(p) { p.fill('#8a8478'); for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) { const x = k * 8 + (r % 2) * 4 - 4, y = r * 8; p.px(x + 1, y + 1, ['#a49c8e', '#9a9284', '#aea696'][(p.R() * 3) | 0], 7, 6); p.px(x + 1, y + 1, '#bcb4a4', 6, 1); } },
  roof(p) { p.fill('#8c8c8c'); for (let r = 0; r < 5; r++) { const y = r * 7; for (let k = 0; k < 5; k++) { const x = k * 7 + (r % 2) * 3 - 3; p.px(x, y, ['#b0b0b0', '#a4a4a4', '#bababa'][(p.R() * 3) | 0], 6, 6); p.px(x, y + 5, '#6a6a6a', 6, 1); p.px(x + 5, y, '#7a7a7a', 1, 6); } } },
  door(p) { p.fill('#5a3620'); for (let x = 2; x < 30; x += 5) p.px(x, 2, '#7a4c2c', 4, 30); p.px(0, 0, '#3a2414', 32, 2); p.px(0, 0, '#3a2414', 2, 32); p.px(30, 0, '#3a2414', 2, 32); p.px(23, 15, '#e8c050', 3, 3); p.px(4, 8, '#3a2414', 24, 1); p.px(4, 24, '#3a2414', 24, 1); },
  window(p) { p.fill('#4a2e1c'); p.px(3, 3, '#ffd890', 26, 26); p.px(3, 3, '#fff0c0', 12, 12); p.px(15, 3, '#4a2e1c', 2, 26); p.px(3, 15, '#4a2e1c', 26, 2); p.px(0, 29, '#7a5030', 32, 3); },
  bark(p) { p.fill('#6a4a30'); for (let x = 0; x < TS; x += 3) p.px(x + ((p.R() * 2) | 0), 0, '#5a3c26', 1, 32); p.speck(['#7a5a3a', '#4e3420'], 80, 1, 3); },
  leaves(p) { p.fill('#3e7a34'); for (let i = 0; i < 70; i++) { const x = (p.R() * 30) | 0, y = (p.R() * 30) | 0; p.px(x, y, ['#4e9440', '#3a7030', '#5aa44a', '#2e5e28'][(p.R() * 4) | 0], 3, 2); p.px(x, y, '#6cb456'); } },
  pine(p) { p.fill('#2e5a3a'); for (let i = 0; i < 80; i++) { const x = (p.R() * 30) | 0, y = (p.R() * 30) | 0; p.px(x, y, ['#386a44', '#244a30', '#40784c'][(p.R() * 3) | 0], 2, 3); } p.speck(['#5a9a6a'], 14); },
  wood(p) { p.fill('#9a6a3e'); for (let y = 0; y < TS; y += 8) { p.px(0, y, '#6a4426', 32, 1); p.px(0, y + 1, '#b0804e', 32, 1); } p.speck(['#8a5c34', '#a8784a'], 70, 2, 1); p.px(0, 0, '#5a3a20', 2, 32); p.px(30, 0, '#5a3a20', 2, 32); },
  iron(p) { p.fill('#3a3a44'); p.speck(['#44444e', '#30303a', '#50505c'], 160); p.px(0, 0, '#5a5a66', 32, 1); },
  crystal(p) { p.fill('#5ac8e0'); for (let i = 0; i < 8; i++) { const x = (p.R() * 28) | 0; p.px(x, 0, '#a0f0ff', 2, 32); p.px(x + 2, 0, '#3a98b8', 1, 32); } p.speck(['#ffffff'], 10); },
  thorn(p) { p.fill('#2a1a24'); for (let i = 0; i < 30; i++) { const x = (p.R() * 30) | 0, y = (p.R() * 30) | 0; p.px(x, y, '#3e2632', 3, 1); p.px(x + 1, y - 1, '#5a3a48', 1, 1); } p.speck(['#6a2a3a'], 20); },
  hay(p) { p.fill('#d8b050'); for (let i = 0; i < 60; i++) p.px((p.R() * 31) | 0, (p.R() * 30) | 0, ['#e8c868', '#b89038', '#f0d880'][(p.R() * 3) | 0], 1, 3); },
  awning(p) { for (let x = 0; x < TS; x += 8) { p.px(x, 0, '#e8e0d0', 4, 32); p.px(x + 4, 0, '#c84a3a', 4, 32); } p.px(0, 28, '#00000030', 32, 4); },
  signItems(p) { p.fill('#7a5030'); p.px(2, 2, '#e8d8b0', 28, 28); p.px(13, 8, '#c03a4a', 6, 4); p.px(11, 12, '#e04a5a', 10, 12); p.px(13, 14, '#ff8a9a', 3, 4); p.px(14, 5, '#8a5a3a', 4, 3); },
  signSmith(p) { p.fill('#7a5030'); p.px(2, 2, '#e8d8b0', 28, 28); p.px(7, 18, '#4a4a56', 18, 5); p.px(10, 14, '#4a4a56', 14, 4); p.px(12, 23, '#4a4a56', 8, 4); p.px(9, 6, '#c8d0dc', 2, 10); p.px(8, 15, '#e8b84a', 4, 1); },
  signInn(p) { p.fill('#7a5030'); p.px(2, 2, '#e8d8b0', 28, 28); p.px(6, 16, '#3a6aa8', 20, 8); p.px(6, 13, '#f0f0f0', 7, 4); p.px(22, 8, '#e8c040', 5, 5); p.px(24, 8, '#e8d8b0', 3, 3); },
  stairs(p) { p.fill('#6a6478'); for (let y = 0; y < TS; y += 8) { p.px(0, y, '#8a849a', 32, 2); p.px(0, y + 6, '#4a4458', 32, 2); } p.speck(['#5a5468'], 40); },
  roots(p) { p.fill('#4a3020'); for (let i = 0; i < 7; i++) { const x = (p.R() * 26) | 0; p.px(x, 0, '#6a4a2e', 4, 32); p.px(x + 3, 0, '#36221a', 1, 32); } p.speck(['#3e6a3a', '#4e8040'], 40, 2, 1); },
  stripes(p) { for (let y = 0; y < TS; y += 16) { p.px(0, y, '#f0ece4', 32, 8); p.px(0, y + 8, '#c83a3a', 32, 8); } p.speck(['#d8d4cc', '#a83030'], 40); },
  foundation(p) { DRAW.housestone(p); p.px(0, 30, '#5a564e', 32, 2); },
  chest(p) { p.fill('#8a5a30'); p.px(0, 0, '#e8b84a', 32, 3); p.px(0, 29, '#e8b84a', 32, 3); p.px(0, 0, '#e8b84a', 3, 32); p.px(29, 0, '#e8b84a', 3, 32); p.px(13, 10, '#e8b84a', 6, 8); p.px(15, 13, '#3a2414', 2, 3); for (let y = 6; y < 28; y += 6) p.px(3, y, '#6a4224', 26, 1); },
  cardGrass(p) { p.clear(); for (let i = 0; i < 9; i++) { const x = 4 + i * 3, h = 10 + ((p.R() * 14) | 0); for (let y = 0; y < h; y++) p.px(x + Math.round(Math.sin(y * 0.3 + i) * 1), 31 - y, y > h - 3 ? '#8ccc58' : ['#5a9a3c', '#4e8a34'][i % 2]); } },
  cardRed(p) { p.clear(); for (let i = 0; i < 4; i++) { const x = 4 + i * 7, h = 12 + ((p.R() * 10) | 0); p.px(x + 1, 31 - h, '#4e8a34', 1, h); p.px(x, 31 - h - 2, '#e8506a', 3, 3); p.px(x + 1, 31 - h - 1, '#ffd060'); p.px(x + 2, 31 - h / 2, '#5a9a3c', 2, 1); } },
  cardYellow(p) { p.clear(); for (let i = 0; i < 4; i++) { const x = 3 + i * 7, h = 10 + ((p.R() * 12) | 0); p.px(x + 1, 31 - h, '#4e8a34', 1, h); p.px(x, 31 - h - 2, '#f0d050', 3, 3); p.px(x + 1, 31 - h - 1, '#c87a20'); } },
  cardBlue(p) { p.clear(); for (let i = 0; i < 4; i++) { const x = 3 + i * 7, h = 9 + ((p.R() * 12) | 0); p.px(x + 1, 31 - h, '#4e8a34', 1, h); p.px(x, 31 - h - 2, i % 2 ? '#a0b8ff' : '#ffffff', 3, 3); p.px(x + 1, 31 - h - 1, '#ffe060'); } },
  cardReed(p) { p.clear(); for (let i = 0; i < 6; i++) { const x = 3 + i * 5, h = 18 + ((p.R() * 12) | 0); p.px(x, 31 - h, '#7a9a4a', 1, h); if (i % 2) p.px(x - 1, 31 - h, '#6a4a2a', 3, 5); } },
  cardMush(p) { p.clear(); for (let i = 0; i < 3; i++) { const x = 4 + i * 9, h = 6 + i * 3; p.px(x + 2, 31 - h, '#e8dcc0', 2, h); p.px(x, 31 - h - 3, '#5ae0c0', 6, 3); p.px(x + 1, 31 - h - 4, '#9affe0', 4, 1); } },
  fence(p) { p.clear(); for (const x of [2, 28]) p.px(x, 4, '#7a5030', 3, 28); p.px(0, 10, '#9a6a40', 32, 3); p.px(0, 20, '#9a6a40', 32, 3); p.px(0, 12, '#6a4426', 32, 1); p.px(0, 22, '#6a4426', 32, 1); },
  gold(p) { p.fill('#e8b84a'); p.speck(['#ffd870', '#c89838'], 80); },
  shells(p) { DRAW.sand(p); for (let i = 0; i < 6; i++) { const x = (p.R() * 28) | 0, y = (p.R() * 28) | 0; p.px(x, y, '#f0d0d8', 3, 2); p.px(x + 1, y + 2, '#d8a0b0'); } },
  statue(p) { p.fill('#9a96a6'); p.speck(['#a8a4b4', '#8a8696', '#b4b0c0'], 120); },
  grotto(p) { p.fill('#4a5462'); p.speck(['#56606e', '#3e4856', '#5e6a7a', '#4a5a5a'], 220, 2, 1); p.speck(['#7ad0e0'], 3); },
  void(p) { p.fill('#0a0a14'); },
  mossstone(p) { DRAW.stone(p); p.speck(['#4a7a44', '#3a6a3a'], 50, 2, 1); },
  thatch(p) { p.fill('#b08a40'); for (let i = 0; i < 70; i++) p.px((p.R() * 31) | 0, (p.R() * 28) | 0, ['#c89a48', '#9a7838', '#d8b058'][(p.R() * 3) | 0], 1, 4); },
  cloth(p) { p.fill('#e8e0d0'); p.speck(['#d8d0c0', '#f4ece0'], 100); },
  darkwood(p) { p.fill('#4a3020'); for (let y = 0; y < TS; y += 6) p.px(0, y, '#36221a', 32, 1); p.speck(['#5a3a26'], 60, 2, 1); },
  ember(p) { p.fill('#ff8a3a'); p.speck(['#ffd27a', '#ff5a2a', '#fff0b0'], 160); },
};

export function buildAtlas() {
  const cv = document.createElement('canvas'); cv.width = cv.height = AW; const ctx = cv.getContext('2d');
  const tmp = document.createElement('canvas'); tmp.width = tmp.height = TS; const tc = tmp.getContext('2d');
  NAMES.forEach((n, i) => {
    tc.clearRect(0, 0, TS, TS);
    DRAW[n](painter(tc, 1000 + i * 7919));
    const sx = (i % COLS) * SLOT + PAD, sy = Math.floor(i / COLS) * SLOT + PAD;
    // extrude edges into the padding (clamp) so mip levels sample the tile's own border
    ctx.drawImage(tmp, sx, sy);
    for (let k = 1; k <= PAD; k++) {
      ctx.drawImage(tmp, 0, 0, 1, TS, sx - k, sy, 1, TS); ctx.drawImage(tmp, TS - 1, 0, 1, TS, sx + TS - 1 + k, sy, 1, TS);
      ctx.drawImage(tmp, 0, 0, TS, 1, sx, sy - k, TS, 1); ctx.drawImage(tmp, 0, TS - 1, TS, 1, sx, sy + TS - 1 + k, TS, 1);
    }
    ctx.drawImage(tmp, 0, 0, 1, 1, sx - PAD, sy - PAD, PAD, PAD); ctx.drawImage(tmp, TS - 1, 0, 1, 1, sx + TS, sy - PAD, PAD, PAD);
    ctx.drawImage(tmp, 0, TS - 1, 1, 1, sx - PAD, sy + TS, PAD, PAD); ctx.drawImage(tmp, TS - 1, TS - 1, 1, 1, sx + TS, sy + TS, PAD, PAD);
  });
  return cv;
}
// UV rect of a tile's content (v flipped for three's texture convention)
export function uvOf(i) {
  const sx = (i % COLS) * SLOT + PAD, sy = Math.floor(i / COLS) * SLOT + PAD, e = 0.02;
  return [(sx + e) / AW, 1 - (sy + TS - e) / AW, (sx + TS - e) / AW, 1 - (sy + e) / AW];
}
