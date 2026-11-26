// Canvas-painted item icons, smart-cursor glyphs and the painted world map.
const TAU = Math.PI * 2;
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function shade(g, x, y, r, c1, c2) { const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r); gr.addColorStop(0, c1); gr.addColorStop(1, c2); return gr; }
function outline(g, w = 3) { g.lineWidth = w; g.strokeStyle = '#2a1a0e'; g.lineJoin = 'round'; g.lineCap = 'round'; }
function gem(g, x, y, r, c1, c2, glow) {
  if (glow) { g.save(); g.shadowColor = glow; g.shadowBlur = 18; }
  g.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU - Math.PI / 2; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.95); } g.closePath();
  g.fillStyle = shade(g, x, y, r, c1, c2); g.fill(); if (glow) g.restore(); outline(g, 2.5); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.ellipse(x - r * 0.3, y - r * 0.35, r * 0.25, r * 0.14, -0.6, 0, TAU); g.fill();
}
const DRAW = {
  wrench(g) { g.save(); g.translate(56, 56); g.rotate(-0.7); g.fillStyle = shade(g, 0, -10, 40, '#e6eaee', '#7a8490'); g.beginPath(); g.roundRect(-8, -34, 16, 62, 6); g.fill(); outline(g); g.stroke(); g.beginPath(); g.arc(0, -36, 18, 0.9, TAU - 0.9 + Math.PI * 0.0); g.lineTo(0, -36); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#2a1a0e'; g.beginPath(); g.roundRect(-6, -58, 12, 22, 3); g.fill(); g.fillStyle = '#8a5030'; g.beginPath(); g.roundRect(-10, 6, 20, 26, 6); g.fill(); g.stroke(); g.restore(); },
  crown(g, s) {
    g.fillStyle = shade(g, 56, 50, 50, '#fff1b0', '#b8862a'); g.beginPath(); g.moveTo(16, 82); g.lineTo(12, 36); g.lineTo(34, 58); g.lineTo(56, 24); g.lineTo(78, 58); g.lineTo(100, 36); g.lineTo(96, 82); g.closePath(); g.fill(); outline(g); g.stroke();
    g.fillStyle = '#c8962e'; g.fillRect(16, 74, 80, 10); g.strokeRect(16, 74, 80, 10);
    const sockets = [[34, 66, 'emberSet', '#ff8a6a', '#a8201a', '#ff4020'], [56, 62, 'bloomSet', '#b8ff9a', '#2a8a2a', '#60ff60'], [78, 66, 'tideSet', '#a8e8ff', '#1a5aa8', '#40b0ff']];
    for (const [x, y, k, a, b, gl] of sockets) { if (s && s.f[k]) gem(g, x, y, 8, a, b, gl); else { g.fillStyle = '#3a2a1a'; g.beginPath(); g.arc(x, y, 6, 0, TAU); g.fill(); } }
  },
  feather(g) { g.save(); g.translate(56, 58); g.rotate(-0.8); const gr = g.createLinearGradient(-40, 0, 40, 0); gr.addColorStop(0, '#f4f4f0'); gr.addColorStop(0.45, '#f4f4f0'); gr.addColorStop(0.5, '#1a1c2e'); gr.addColorStop(0.8, '#2a4a7a'); gr.addColorStop(1, '#2a8a7a'); g.fillStyle = gr; g.beginPath(); g.moveTo(-44, 0); g.quadraticCurveTo(0, -22, 44, -2); g.quadraticCurveTo(0, 20, -44, 0); g.fill(); outline(g, 2.5); g.stroke(); g.strokeStyle = '#d8d8d0'; g.lineWidth = 2; g.beginPath(); g.moveTo(-50, 1); g.lineTo(40, -1); g.stroke(); g.restore(); },
  tongs(g) { g.save(); g.translate(56, 56); for (const s of [-1, 1]) { g.save(); g.rotate(s * 0.12 - 0.6); g.fillStyle = shade(g, 0, 0, 40, '#a8a8b0', '#3a3a44'); g.beginPath(); g.roundRect(-4, -44, 8, 88, 4); g.fill(); outline(g, 2.5); g.stroke(); g.restore(); } g.beginPath(); g.arc(-16, -30, 7, 0, TAU); g.fillStyle = '#5a5a64'; g.fill(); g.stroke(); g.restore(); },
  water(g) { g.fillStyle = shade(g, 56, 60, 44, '#d8a868', '#7a4a22'); g.beginPath(); g.moveTo(24, 36); g.lineTo(88, 36); g.lineTo(80, 96); g.lineTo(32, 96); g.closePath(); g.fill(); outline(g); g.stroke(); g.strokeStyle = '#4a4440'; g.lineWidth = 4; for (const y of [52, 82]) { g.beginPath(); g.moveTo(26 + (y - 36) * 0.12, y); g.lineTo(86 - (y - 36) * 0.12, y); g.stroke(); } g.fillStyle = shade(g, 56, 34, 34, '#bfe8ff', '#2a6aa0'); g.beginPath(); g.ellipse(56, 37, 31, 8, 0, 0, TAU); g.fill(); outline(g, 2); g.stroke(); g.strokeStyle = '#3a2a1a'; g.lineWidth = 3; g.beginPath(); g.arc(56, 36, 34, Math.PI, TAU); g.stroke(); },
  ember(g) { DRAW.tongs(g); gem(g, 72, 34, 16, '#ffd08a', '#c0201a', '#ff6030'); },
  bread(g, s) { const half = s && s.f.fennickFed; g.fillStyle = shade(g, 56, 52, 46, '#f8d08a', '#a86a2a'); g.beginPath(); g.ellipse(56, 60, half ? 28 : 42, 26, 0, Math.PI * 1.02, Math.PI * 1.98 + (half ? 0.4 : 0)); g.lineTo(half ? 84 : 98, 74); g.lineTo(half ? 28 : 14, 74); g.closePath(); g.fill(); outline(g); g.stroke(); g.strokeStyle = '#7a4a1a'; g.lineWidth = 3; for (let i = 0; i < (half ? 2 : 4); i++) { g.beginPath(); g.moveTo(32 + i * 16, 48); g.lineTo(40 + i * 16, 60); g.stroke(); } if (half) { g.fillStyle = '#fbe8c0'; g.beginPath(); g.ellipse(84, 62, 6, 12, 0, 0, TAU); g.fill(); } },
  musicbox(g, s) { g.fillStyle = shade(g, 50, 50, 50, '#f4f6fa', '#8a94a8'); g.beginPath(); g.roundRect(18, 44, 76, 48, 6); g.fill(); outline(g); g.stroke(); g.fillStyle = shade(g, 50, 36, 40, '#ffffff', '#a8b0c0'); g.beginPath(); g.roundRect(14, 30, 84, 18, 5); g.fill(); g.stroke(); g.fillStyle = '#6a8ac8'; g.beginPath(); g.ellipse(56, 68, 12, 8, 0, 0, TAU); g.fill(); g.fillStyle = '#d8a040'; g.beginPath(); g.moveTo(66, 66); g.lineTo(74, 63); g.lineTo(66, 70); g.fill(); if (s && s.f.boxFixed) { g.fillStyle = '#d8a83a'; g.beginPath(); g.roundRect(94, 62, 14, 6, 2); g.fill(); g.stroke(); g.beginPath(); g.arc(106, 65, 7, 0, TAU); g.stroke(); g.fillStyle = '#2a1a0e'; g.font = 'bold 22px serif'; g.fillText('♪', 80, 26); } },
  key(g) { g.save(); g.translate(56, 56); g.rotate(-0.6); g.fillStyle = shade(g, 0, 0, 40, '#ffe8a0', '#a8741a'); g.beginPath(); g.arc(-24, 0, 16, 0, TAU); g.fill(); outline(g); g.stroke(); g.fillStyle = '#5a3a12'; g.beginPath(); g.arc(-24, 0, 6, 0, TAU); g.fill(); g.fillStyle = shade(g, 0, 0, 40, '#ffe8a0', '#a8741a'); g.beginPath(); g.roundRect(-8, -5, 50, 10, 3); g.fill(); g.stroke(); g.beginPath(); g.rect(30, 4, 6, 12); g.rect(20, 4, 6, 9); g.fill(); g.stroke(); g.restore(); },
  rope(g) { g.lineCap = 'round'; for (let i = 0; i < 4; i++) { g.strokeStyle = '#2a1a0e'; g.lineWidth = 13; g.beginPath(); g.ellipse(56, 58 + i * 2 - 3, 36 - i * 7, 22 - i * 4, 0, 0, TAU); g.stroke(); g.strokeStyle = i % 2 ? '#c8a060' : '#dab878'; g.lineWidth = 8; g.stroke(); } g.strokeStyle = '#c8a060'; g.lineWidth = 8; g.beginPath(); g.moveTo(84, 70); g.quadraticCurveTo(100, 86, 92, 100); g.stroke(); },
  pass(g) { g.fillStyle = shade(g, 56, 50, 50, '#fffaf0', '#d8c098'); g.beginPath(); g.roundRect(22, 20, 68, 76, 4); g.fill(); outline(g); g.stroke(); g.strokeStyle = '#7a5a3a'; g.lineWidth = 2; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(32, 36 + i * 9); g.lineTo(80 - (i % 2) * 12, 36 + i * 9); g.stroke(); } g.fillStyle = shade(g, 70, 82, 14, '#ff8a7a', '#8a1a1a'); g.beginPath(); g.arc(70, 82, 12, 0, TAU); g.fill(); outline(g, 2); g.stroke(); },
  lavender(g) { g.strokeStyle = '#4a7a3a'; g.lineWidth = 4; for (const a of [-0.25, 0, 0.25]) { g.beginPath(); g.moveTo(56, 100); g.quadraticCurveTo(56 + a * 40, 60, 56 + a * 80, 18); g.stroke(); for (let i = 0; i < 6; i++) { const t = 0.35 + i * 0.11, x = 56 + a * 80 * t * t, y = 100 - t * 82; g.fillStyle = i % 2 ? '#9a6ad8' : '#b88af0'; g.beginPath(); g.ellipse(x, y, 6, 8, a, 0, TAU); g.fill(); } } },
  mirror(g) { g.fillStyle = shade(g, 56, 70, 30, '#ffe8a0', '#a8741a'); g.beginPath(); g.roundRect(50, 70, 12, 34, 4); g.fill(); outline(g); g.stroke(); g.fillStyle = shade(g, 56, 44, 34, '#ffe8a0', '#a8741a'); g.beginPath(); g.ellipse(56, 44, 30, 34, 0, 0, TAU); g.fill(); g.stroke(); const gr = g.createLinearGradient(30, 20, 80, 70); gr.addColorStop(0, '#e8f6ff'); gr.addColorStop(0.5, '#8ab4d8'); gr.addColorStop(1, '#d8eef8'); g.fillStyle = gr; g.beginPath(); g.ellipse(56, 44, 22, 26, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.ellipse(48, 34, 5, 11, 0.5, 0, TAU); g.fill(); },
  glowcap(g) { g.save(); g.shadowColor = '#9affd8'; g.shadowBlur = 20; g.fillStyle = shade(g, 56, 40, 40, '#e8fff0', '#3ac8a0'); g.beginPath(); g.ellipse(56, 50, 36, 26, 0, Math.PI, TAU); g.closePath(); g.fill(); g.restore(); outline(g); g.stroke(); g.fillStyle = '#f4ecd8'; g.beginPath(); g.roundRect(46, 50, 20, 42, 8); g.fill(); g.stroke(); g.fillStyle = '#fff'; for (const [x, y] of [[40, 40], [60, 32], [72, 44]]) { g.beginPath(); g.arc(x, y, 4, 0, TAU); g.fill(); } },
  toffee(g, s) { const warm = s && s.f.toffeeWarm; g.fillStyle = 'rgba(220,240,255,.45)'; g.beginPath(); g.roundRect(26, 30, 60, 66, 10); g.fill(); outline(g); g.stroke(); g.fillStyle = warm ? shade(g, 56, 60, 30, '#ffd070', '#b8641a') : shade(g, 56, 64, 30, '#d89a4a', '#6a3a12'); g.beginPath(); g.roundRect(30, warm ? 50 : 54, 52, warm ? 42 : 38, 8); g.fill(); if (warm) { g.beginPath(); g.moveTo(40, 50); g.quadraticCurveTo(44, 30, 50, 50); g.fill(); } g.fillStyle = '#c8b090'; g.beginPath(); g.roundRect(22, 22, 68, 12, 4); g.fill(); g.stroke(); g.fillStyle = '#c8302e'; g.fillRect(40, 22, 32, 12); },
  bloom(g) { gem(g, 56, 56, 30, '#d0ffb0', '#1a7a2a', '#60ff80'); },
  tide(g) { gem(g, 56, 56, 30, '#c8f4ff', '#1a4aa8', '#40b8ff'); },
  thimble(g) { g.fillStyle = shade(g, 56, 50, 40, '#ffffff', '#8a94a8'); g.beginPath(); g.moveTo(30, 92); g.lineTo(36, 40); g.quadraticCurveTo(56, 14, 76, 40); g.lineTo(82, 92); g.closePath(); g.fill(); outline(g); g.stroke(); g.fillStyle = '#6a7488'; for (let y = 44; y < 86; y += 9) for (let x = 40 + (y % 2) * 4; x < 74; x += 9) { g.beginPath(); g.arc(x, y, 1.8, 0, TAU); g.fill(); } },
  bell(g) { g.fillStyle = shade(g, 56, 50, 44, '#ffe8a0', '#a8741a'); g.beginPath(); g.moveTo(22, 82); g.quadraticCurveTo(34, 76, 36, 50); g.quadraticCurveTo(38, 22, 56, 22); g.quadraticCurveTo(74, 22, 76, 50); g.quadraticCurveTo(78, 76, 90, 82); g.closePath(); g.fill(); outline(g); g.stroke(); g.beginPath(); g.arc(56, 88, 8, 0, TAU); g.fill(); g.stroke(); g.beginPath(); g.arc(56, 18, 6, 0, TAU); g.stroke(); },
  watch(g, s) { g.fillStyle = shade(g, 56, 60, 40, '#ffffff', '#8a94a8'); g.beginPath(); g.arc(56, 62, 34, 0, TAU); g.fill(); outline(g); g.stroke(); g.fillStyle = '#fffaf0'; g.beginPath(); g.arc(56, 62, 26, 0, TAU); g.fill(); g.stroke(); g.beginPath(); g.arc(56, 22, 7, 0, TAU); g.stroke(); g.strokeStyle = '#2a1a0e'; g.lineWidth = 3; const a = s && s.f.watchFixed ? (Date.now() / 1000) % 60 / 60 * TAU : 0.35; g.beginPath(); g.moveTo(56, 62); g.lineTo(56 + Math.sin(a) * 18, 62 - Math.cos(a) * 18); g.moveTo(56, 62); g.lineTo(56 + 12, 62); g.stroke(); },
  hairpin(g) { g.strokeStyle = '#c8a050'; g.lineWidth = 5; g.beginPath(); g.moveTo(24, 92); g.lineTo(80, 36); g.stroke(); for (const [x, y, r] of [[82, 32, 12], [66, 30, 7], [86, 48, 7]]) { g.fillStyle = shade(g, x, y, r, '#ffffff', '#c8bcd8'); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); outline(g, 2); g.stroke(); } },
};
export function itemIcon(id, s) {
  const c = cv(112, 112), g = c.getContext('2d');
  g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowOffsetY = 3; g.shadowBlur = 4;
  (DRAW[id] || ((gg) => { gg.fillStyle = '#c8a060'; gg.beginPath(); gg.arc(56, 56, 30, 0, TAU); gg.fill(); }))(g, s);
  g.restore();
  return c;
}

// ------------------------------------------------------------------ smart-cursor glyphs (72px, drawn once)
export function cursorIcon(kind, dir) {
  const c = cv(72, 72), g = c.getContext('2d'); g.translate(36, 36);
  const ring = (col) => { g.fillStyle = 'rgba(30,18,10,.55)'; g.beginPath(); g.arc(0, 0, 30, 0, TAU); g.fill(); g.strokeStyle = col; g.lineWidth = 3; g.stroke(); };
  g.lineJoin = g.lineCap = 'round';
  if (kind === 'walk') { g.fillStyle = '#fff6e0'; g.strokeStyle = '#2a1a0e'; g.lineWidth = 3; g.beginPath(); g.moveTo(-14, -22); g.lineTo(16, 6); g.lineTo(2, 7); g.lineTo(10, 22); g.lineTo(4, 25); g.lineTo(-4, 10); g.lineTo(-14, 18); g.closePath(); g.fill(); g.stroke(); }
  else if (kind === 'look') { ring('#9fd0ff'); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-20, 0); g.quadraticCurveTo(0, -18, 20, 0); g.quadraticCurveTo(0, 18, -20, 0); g.fill(); g.fillStyle = '#3a6aa8'; g.beginPath(); g.arc(0, 0, 8, 0, TAU); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(0, 0, 4, 0, TAU); g.fill(); }
  else if (kind === 'use') { ring('#ffd27a'); g.fillStyle = '#f6d0b0'; g.strokeStyle = '#2a1a0e'; g.lineWidth = 2.5; g.beginPath(); g.roundRect(-12, -4, 24, 22, 6); g.fill(); g.stroke(); for (let i = 0; i < 4; i++) { g.beginPath(); g.roundRect(-12 + i * 6, -20 + (i === 1 ? -4 : 0), 6, 20, 3); g.fill(); g.stroke(); } g.beginPath(); g.roundRect(-20, -2, 10, 8, 4); g.fill(); g.stroke(); }
  else if (kind === 'talk') { ring('#f6b8d8'); g.fillStyle = '#fff6e8'; g.strokeStyle = '#2a1a0e'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(0, -3, 19, 14, 0, 0, TAU); g.fill(); g.stroke(); g.beginPath(); g.moveTo(-6, 9); g.lineTo(-12, 20); g.lineTo(2, 10); g.fill(); g.fillStyle = '#2a1a0e'; for (const x of [-8, 0, 8]) { g.beginPath(); g.arc(x, -3, 2.5, 0, TAU); g.fill(); } }
  else if (kind === 'exit') { ring('#b5e08a'); g.rotate({ left: Math.PI, right: 0, up: -Math.PI / 2, down: Math.PI / 2 }[dir] ?? 0); g.fillStyle = '#e8ffd0'; g.strokeStyle = '#2a1a0e'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-16, -7); g.lineTo(2, -7); g.lineTo(2, -16); g.lineTo(20, 0); g.lineTo(2, 16); g.lineTo(2, 7); g.lineTo(-16, 7); g.closePath(); g.fill(); g.stroke(); }
  else if (kind === 'wait') { ring('#c9b0ff'); g.fillStyle = '#f6ecd6'; g.beginPath(); g.moveTo(-10, -16); g.lineTo(10, -16); g.lineTo(0, 0); g.lineTo(10, 16); g.lineTo(-10, 16); g.lineTo(0, 0); g.closePath(); g.fill(); }
  return c;
}

// ------------------------------------------------------------------ the painted world map
export const MAP_SPOTS = {
  throne: [196, 250, 'The Castle'], courtyard: [270, 318, 'Courtyard'], square: [300, 430, 'Wrenfold Square'], mill: [176, 520, "Hobb's Mill"],
  woods: [560, 430, 'The Crossroads'], glade: [520, 250, "Thistle's Hollow"], oak: [700, 470, 'The Old Oak'],
  cliffs: [900, 360, 'Lighthouse Point'], cove: [930, 560, "Smuggler's Cove"], isle: [1100, 300, 'Magpie Isle'],
};
export function paintMap(cnv, s, current, seasonKey = 'spring') {
  const g = cnv.getContext('2d'), W = cnv.width, H = cnv.height;
  let seed = 11; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // parchment
  const pg = g.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, W * 0.7); pg.addColorStop(0, '#f6ead0'); pg.addColorStop(1, '#c8a878');
  g.fillStyle = pg; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '120,80,40' : '255,250,230'},${r() * 0.06})`; g.beginPath(); g.ellipse(r() * W, r() * H, 4 + r() * 30, 2 + r() * 10, r() * 3, 0, TAU); g.fill(); }
  // sea (east)
  g.save(); g.beginPath(); g.moveTo(W, 0); g.lineTo(840, 0);
  for (let y = 0; y <= H; y += 40) g.lineTo(840 + Math.sin(y * 0.02) * 40 + (y > 420 ? 40 : 0) + r() * 14, y);
  g.lineTo(W, H); g.closePath();
  const sg = g.createLinearGradient(820, 0, W, 0); sg.addColorStop(0, '#9ac4c8'); sg.addColorStop(1, '#5a94b0'); g.fillStyle = sg; g.fill();
  g.strokeStyle = 'rgba(40,70,90,.6)'; g.lineWidth = 3; g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; for (let i = 0; i < 40; i++) { const x = 900 + r() * 290, y = r() * H; g.beginPath(); g.arc(x, y, 8, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
  g.restore();
  // river
  g.strokeStyle = '#7ab0c0'; g.lineWidth = 10; g.lineCap = 'round'; g.beginPath(); g.moveTo(60, 380); g.bezierCurveTo(140, 470, 120, 560, 230, 600); g.bezierCurveTo(320, 640, 360, 760, 420, 800); g.stroke();
  // forest masses
  const leaf = { spring: ['#6a9a4a', '#4a7a3a', '#8aba5a'], autumn: ['#d08a3a', '#b8582a', '#e8b44a'], winter: ['#a8bcc8', '#7a98a8', '#dde8ee'] }[seasonKey] || ['#6a9a4a', '#4a7a3a'];
  for (let i = 0; i < 420; i++) { const x = 400 + r() * 430, y = 140 + r() * 560; if (Math.hypot(x - 560, y - 430) < 50 || Math.hypot(x - 520, y - 250) < 46 || Math.hypot(x - 700, y - 470) < 44) continue; g.fillStyle = leaf[i % leaf.length]; g.beginPath(); g.arc(x, y, 9 + r() * 7, 0, TAU); g.fill(); g.strokeStyle = 'rgba(40,30,20,.35)'; g.lineWidth = 1.5; g.stroke(); }
  // roads (dotted)
  const road = (pts) => { g.setLineDash([10, 9]); g.strokeStyle = '#8a5a2a'; g.lineWidth = 4; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.setLineDash([]); };
  road([[196, 250], [270, 318], [300, 430], [176, 520]]); road([[300, 430], [430, 440], [560, 430]]); road([[560, 430], [520, 250]]); road([[560, 430], [700, 470], [900, 360]]); road([[900, 360], [930, 560]]);
  g.setLineDash([4, 10]); g.strokeStyle = '#2a5a7a'; g.lineWidth = 3; g.beginPath(); g.moveTo(930, 560); g.quadraticCurveTo(1060, 480, 1100, 300); g.stroke(); g.setLineDash([]);
  // spots
  const spots = [];
  for (const [id, [x, y, label]] of Object.entries(MAP_SPOTS)) {
    const known = !!s.visited[id];
    g.globalAlpha = known ? 1 : 0.45;
    drawLandmark(g, id, x, y);
    g.font = 'italic 700 22px Palatino, Georgia, serif'; g.textAlign = 'center';
    g.lineWidth = 5; g.strokeStyle = 'rgba(250,240,218,.9)'; const lab = known ? label : '?';
    g.strokeText(lab, x, y + 52); g.fillStyle = '#3a2210'; g.fillText(lab, x, y + 52);
    if (id === current) { g.strokeStyle = '#c8302e'; g.lineWidth = 4; g.beginPath(); g.arc(x, y, 40, 0, TAU); g.stroke(); }
    g.globalAlpha = 1;
    spots.push({ id, x, y, known });
  }
  // title cartouche + compass
  g.font = 'italic 700 46px Palatino, Georgia, serif'; g.textAlign = 'left'; g.fillStyle = '#5a2e10'; g.fillText('The Kingdom of Wrenfold', 40, 70);
  g.save(); g.translate(1110, 720); g.fillStyle = '#5a2e10'; for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(0, -46); g.lineTo(9, 0); g.lineTo(-9, 0); g.fill(); } g.font = 'bold 20px serif'; g.textAlign = 'center'; g.fillText('N', 0, -52); g.restore();
  return spots;
}
function drawLandmark(g, id, x, y) {
  g.save(); g.translate(x, y); g.lineWidth = 2.5; g.strokeStyle = '#2a1a0e';
  const roof = (c) => { g.fillStyle = c; };
  if (id === 'throne' || id === 'courtyard') {
    g.fillStyle = '#e8dcc4'; g.fillRect(-26, -20, 52, 34); g.strokeRect(-26, -20, 52, 34);
    for (const sx of [-30, 22]) { g.fillStyle = '#e8dcc4'; g.fillRect(sx, -34, 10, 48); g.strokeRect(sx, -34, 10, 48); roof(); g.fillStyle = '#5a6aa8'; g.beginPath(); g.moveTo(sx - 3, -34); g.lineTo(sx + 5, -50); g.lineTo(sx + 13, -34); g.fill(); g.stroke(); }
    if (id === 'courtyard') { g.fillStyle = '#7a4a2a'; g.fillRect(-7, 0, 14, 14); }
  } else if (id === 'square') { for (const [dx, c] of [[-22, '#a8553a'], [0, '#b8865a'], [22, '#8c4a34']]) { g.fillStyle = '#f0e2c4'; g.fillRect(dx - 9, -8, 18, 18); g.strokeRect(dx - 9, -8, 18, 18); g.fillStyle = c; g.beginPath(); g.moveTo(dx - 12, -8); g.lineTo(dx, -22); g.lineTo(dx + 12, -8); g.fill(); g.stroke(); } }
  else if (id === 'mill') { g.fillStyle = '#e8d8b8'; g.fillRect(-14, -14, 28, 26); g.strokeRect(-14, -14, 28, 26); g.beginPath(); g.arc(-18, 4, 13, 0, TAU); g.stroke(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.beginPath(); g.moveTo(-18, 4); g.lineTo(-18 + Math.cos(a) * 13, 4 + Math.sin(a) * 13); g.stroke(); } }
  else if (id === 'woods') { g.strokeStyle = '#5a3a1a'; g.beginPath(); g.moveTo(0, 18); g.lineTo(0, -20); g.stroke(); g.fillStyle = '#c8a06a'; g.fillRect(-2, -18, 24, 8); g.fillRect(-22, -6, 22, 8); }
  else if (id === 'glade') { g.fillStyle = '#e8d8b8'; g.beginPath(); g.moveTo(-14, 14); g.lineTo(-12, -6); g.lineTo(12, -8); g.lineTo(14, 14); g.fill(); g.stroke(); g.fillStyle = '#6a4a6a'; g.beginPath(); g.moveTo(-18, -4); g.lineTo(2, -26); g.lineTo(18, -6); g.fill(); g.stroke(); g.fillStyle = '#3a3a3a'; g.beginPath(); g.arc(22, 10, 7, 0, Math.PI); g.fill(); }
  else if (id === 'oak') { g.fillStyle = '#6a4a2a'; g.fillRect(-6, -4, 12, 22); g.fillStyle = '#4a7a3a'; g.beginPath(); g.arc(0, -14, 22, 0, TAU); g.fill(); g.stroke(); g.fillStyle = '#7aff7a'; g.beginPath(); g.arc(0, -8, 4, 0, TAU); g.fill(); }
  else if (id === 'cliffs') { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-7, 18); g.lineTo(-4, -22); g.lineTo(4, -22); g.lineTo(7, 18); g.fill(); g.stroke(); g.fillStyle = '#c8302e'; g.fillRect(-6, -6, 12, 6); g.fillStyle = '#ffd060'; g.fillRect(-4, -28, 8, 6); }
  else if (id === 'cove') { g.fillStyle = '#e8d098'; g.beginPath(); g.ellipse(0, 6, 26, 10, 0, 0, TAU); g.fill(); g.stroke(); g.fillStyle = '#8a5a3a'; g.beginPath(); g.moveTo(-12, 2); g.lineTo(12, 2); g.lineTo(8, 9); g.lineTo(-8, 9); g.fill(); g.stroke(); }
  else if (id === 'isle') { g.fillStyle = '#9a8a78'; g.beginPath(); g.ellipse(0, 10, 26, 10, 0, 0, TAU); g.fill(); g.stroke(); g.fillStyle = '#b8b0a0'; g.fillRect(-6, -24, 12, 32); g.strokeRect(-6, -24, 12, 32); g.fillStyle = '#5a3a1a'; g.beginPath(); g.ellipse(0, -26, 14, 6, 0, 0, TAU); g.fill(); }
  g.restore();
}
