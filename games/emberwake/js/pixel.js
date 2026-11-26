// Emberwake — procedural pixel-art painter. Every character, monster and portrait is drawn here at runtime
// (no image assets): parts are painted with light from the upper-left (highlight / base / shade ramps),
// then a coloured outline pass runs over each frame. Sheets are consumed as NearestFilter textures.

export const FW = 32, FH = 40; // human frame size
const clamp = (v) => Math.max(0, Math.min(255, v | 0));
function hex2rgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function shade(h, k, hue = 0) { const [r, g, b] = hex2rgb(h); const s = k < 1 ? [r * k - hue * 6, g * k - hue * 2, b * k + hue * 10] : [r + (255 - r) * (k - 1), g + (255 - g) * (k - 1) + hue * 4, b + (255 - b) * (k - 1) - hue * 8]; return `rgb(${clamp(s[0])},${clamp(s[1])},${clamp(s[2])})`; }

class P {
  constructor(ctx, ox, oy, flip = false, w = FW) { this.c = ctx; this.ox = ox; this.oy = oy; this.flip = flip; this.w = w; }
  r(x, y, w, h, col) { if (w <= 0 || h <= 0) return; const c = this.c; c.fillStyle = col; const X = this.flip ? this.w - x - w : x; c.fillRect(this.ox + Math.round(X), this.oy + Math.round(y), Math.round(w), Math.round(h)); }
  p(x, y, col) { this.r(x, y, 1, 1, col); }
  // shaded rounded block: highlight top-left, shade right + bottom
  b(x, y, w, h, col, o = {}) {
    const rd = o.round ?? 1;
    for (let j = 0; j < h; j++) {
      let inset = 0; if (rd && (j < rd || j >= h - rd)) inset = rd - Math.min(j, h - 1 - j);
      this.r(x + inset, y + j, w - inset * 2, 1, col);
    }
    if (o.flat) return;
    const dk = shade(col, o.dark ?? 0.72, 1), lt = shade(col, 1.22);
    const sw = Math.max(1, Math.round(w * (o.sw ?? 0.3)));
    for (let j = rd; j < h - rd; j++) this.r(x + w - sw - (j >= h - 2 ? 1 : 0), y + j, sw, 1, dk);
    this.r(x + rd, y + h - 1, w - rd * 2, 1, dk);
    if (o.hl !== false) { this.r(x + rd, y, Math.max(1, Math.round(w * 0.45)), 1, lt); if (h > 3) this.r(x, y + rd, 1, Math.max(1, Math.round(h * 0.4)), lt); }
  }
  e(cx, cy, rx, ry, col, o = {}) { // shaded ellipse
    for (let j = -ry; j <= ry; j++) { const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (j / (ry + 0.5)) ** 2))); this.r(cx - half, cy + j, half * 2 + 1, 1, col); }
    if (o.flat) return;
    const dk = shade(col, o.dark ?? 0.7, 1), lt = shade(col, 1.25);
    for (let j = -ry; j <= ry; j++) { const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (j / (ry + 0.5)) ** 2))); const sw = Math.max(1, Math.round(half * 0.55)); if (j > -ry * 0.6) this.r(cx + half - sw + 1, cy + j, sw, 1, dk); }
    for (let j = -ry; j <= ry; j++) { const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (j / (ry + 0.5)) ** 2))); if (j >= ry - Math.max(1, ry * 0.25)) this.r(cx - half, cy + j, half * 2 + 1, 1, dk); }
    if (o.hl !== false) this.r(cx - Math.round(rx * 0.5), cy - Math.round(ry * 0.55), Math.max(1, Math.round(rx * 0.5)), Math.max(1, Math.round(ry * 0.3)), lt);
  }
}

// outline pass: transparent pixels touching opaque ones get a dark, hue-matched outline
export function outline(ctx, x0, y0, w, h, { col = [26, 16, 30], inner = true } = {}) {
  const img = ctx.getImageData(x0, y0, w, h), d = img.data, src = new Uint8ClampedArray(d);
  const A = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : src[(y * w + x) * 4 + 3]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (src[i + 3] > 0) continue;
    let n = null;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (A(x + dx, y + dy) > 0) { const j = ((y + dy) * w + x + dx) * 4; n = j; break; }
    if (n !== null) { d[i] = Math.min(col[0], src[n] * 0.25 + col[0] * 0.6); d[i + 1] = Math.min(col[1] + 10, src[n + 1] * 0.2 + col[1] * 0.6); d[i + 2] = Math.min(col[2] + 20, src[n + 2] * 0.25 + col[2] * 0.7); d[i + 3] = 255; }
  }
  if (inner) { // soften: darken opaque pixels on the bottom-right silhouette edge
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (!src[i + 3]) continue; if (!A(x + 1, y) || !A(x, y + 1)) { d[i] *= 0.82; d[i + 1] *= 0.8; d[i + 2] *= 0.86; } }
  }
  ctx.putImageData(img, x0, y0);
}

// ================================================================ humans
// poses (field): stand/walk(0..3) per dir (down, up, side). battle (side, facing left): idle0, idle1, ready, attack, cast, hurt, ko, guard, victory
export const HUMAN_FRAMES = { down: [0, 1, 2, 3], up: [4, 5, 6, 7], side: [8, 9, 10, 11], idle0: 12, idle1: 13, ready: 14, attack: 15, cast: 16, hurt: 17, ko: 18, guard: 19, victory: 20 };
export const HUMAN_COLS = 7, HUMAN_ROWS = 3;

function drawHuman(P_, L, dir, pose, f) {
  const sk = L.skin || '#f0c8a0', hair = L.hair || '#3a2a20', top = L.top || '#5a7aa0', top2 = L.top2 || shade(top, 0.7), bot = L.bottom || '#4a3a2a', boots = L.boots || '#3a2618';
  const broad = L.build === 'broad', slim = L.build === 'slim', robe = !!L.robe;
  const walk = pose === 'walk' ? f : 0;
  const bob = pose === 'walk' ? (walk % 2 ? -1 : 0) : pose === 'idle1' ? 1 : pose === 'hurt' ? 1 : 0;
  const lean = pose === 'attack' ? -3 : pose === 'hurt' ? 2 : pose === 'ready' ? -1 : 0; // side poses (towards -x = facing left)
  const y0 = bob;
  const tw = broad ? 14 : slim ? 10 : 12, tx = 16 - tw / 2; // torso
  const side = dir === 'side', back = dir === 'up';
  // ---- cape behind
  if (L.cape && !side) P_.b(tx - 1, 19 + y0, tw + 2, back ? 15 : 13, back ? L.cape : shade(L.cape, 0.75), { round: 1 });
  if (L.cape && side) P_.b(18 + lean / 2, 19 + y0, 5, 14, shade(L.cape, 0.8));
  // ---- legs + boots
  if (!robe) {
    if (!side) {
      const lift = (k) => (pose === 'walk' && walk === k ? -1 : 0);
      for (const [lx, k] of [[tx + 1, 1], [tx + tw - 5, 3]]) { P_.b(lx, 30 + y0 + lift(k), 4, 6, bot, { round: 0 }); P_.b(lx - (lx < 16 ? 0 : 0), 35 + lift(k), 4, 4, boots, { round: 0 }); }
    } else {
      const sw = pose === 'walk' ? [0, 2, 0, -2][walk] : pose === 'attack' ? 3 : 0;
      P_.b(14 - sw + lean, 30 + y0, 4, 6, shade(bot, 0.85), { round: 0 }); P_.b(13 - sw + lean, 35, 5, 4, shade(boots, 0.85), { round: 0 });
      P_.b(15 + sw + lean, 30 + y0, 4, 6, bot, { round: 0 }); P_.b(14 + sw + lean, 35, 5, 4, boots, { round: 0 });
    }
  } else {
    const hem = pose === 'walk' ? walk % 2 : 0;
    P_.b(tx - 1 + (side ? lean : 0), 28 + y0, tw + 2, 9 - hem, top2, { round: 0 });
    P_.r(tx + 1 + (side ? lean : 0), 37, 4, 2, boots); P_.r(tx + tw - 5 + (side ? lean : 0), 37, 4, 2, boots);
  }
  // ---- torso
  const lx = side ? lean : 0;
  P_.b(tx + lx, 19 + y0, tw, 12, top, { round: 1 });
  if (!back) { P_.r(tx + 1 + lx, 27 + y0, tw - 2, 1, shade(top2, 0.9)); P_.r(tx + lx, 28 + y0, tw, 2, top2); } // belt/hem
  if (L.apron && !back) P_.b(tx + 2 + lx, 22 + y0, tw - 4, 11, L.apron, { round: 0, dark: 0.85 });
  if (!side && !back) { P_.r(15, 20 + y0, 2, 6, shade(top, 0.8)); } // placket
  // ---- arms
  const armY = 20 + y0;
  if (!side) {
    const sw = pose === 'walk' ? (walk === 1 ? 1 : walk === 3 ? -1 : 0) : 0;
    P_.b(tx - 3, armY + sw, 3, 8, top, { round: 0 }); P_.b(tx + tw, armY - sw, 3, 8, top, { round: 0 });
    if (!back) { P_.r(tx - 3, armY + 8 + sw, 3, 2, sk); P_.r(tx + tw, armY + 8 - sw, 3, 2, sk); }
  }
  // ---- head
  const hy = 5 + y0, hx = 10 + lx;
  P_.b(hx, hy + 2, 12, 12, sk, { round: 2, sw: 0.25 });
  P_.r(15 + lx, 18 + y0, 3, 2, shade(sk, 0.75)); // neck
  if (!back) {
    if (!side) {
      const blink = pose === 'hurt' || pose === 'ko';
      for (const ex of [12, 18]) { if (blink) P_.r(ex, hy + 9, 2, 1, '#2a1a20'); else { P_.r(ex, hy + 8, 2, 3, '#24161e'); P_.p(ex, hy + 8, '#ffffff'); } }
      P_.r(11, hy + 11, 2, 1, shade(sk, 0.85, 0) === '' ? sk : '#f0a0a0'); P_.r(19, hy + 11, 2, 1, '#f0a0a0'); // blush
      P_.r(15, hy + 12, 2, 1, shade(sk, 0.6));
    } else {
      const blink = pose === 'hurt' || pose === 'ko';
      if (blink) P_.r(hx + 1, hy + 9, 2, 1, '#2a1a20'); else { P_.r(hx + 1, hy + 8, 2, 3, '#24161e'); P_.p(hx + 1, hy + 8, '#ffffff'); }
      P_.p(hx - 1, hy + 10, sk); P_.p(hx + 2, hy + 12, shade(sk, 0.6));
    }
  }
  // ---- hair / hats
  const st = L.style || 'short', hc = hair, hd = shade(hair, 0.7, 1), hl = shade(hair, 1.25);
  const H = (x, y, w, h, c = hc, sh = false) => (sh ? P_.b(x + lx, y + y0, w, h, c, { round: 1, sw: 0.35 }) : P_.r(x + lx, y + y0, w, h, c));
  if (st === 'hood') {
    const hood = L.top || '#5a5a6a';
    P_.b(hx - 1, hy, 14, 9, hood, { round: 3 }); H(9, 9, 2, 8, shade(hood, 0.8)); H(21, 9, 2, 8, shade(hood, 0.6));
    if (back) H(10, 5, 12, 14, hood, true); else if (!side) { H(11, 9, 10, 2, shade(hood, 0.55)); } else H(13, 6, 10, 12, hood);
  } else if (st !== 'bald') {
    H(10, 4, 12, 5, hc); H(9, 6, 2, side ? 4 : 6, hd); H(21, 6, 2, side ? 4 : 6, hd); H(12, 4, 5, 1, hl);
    if (back) { H(10, 5, 12, 10, hc, true); H(12, 7, 3, 1, hl); }
    if (side) H(14, 5, 9, 8, hc);
    if (st === 'spiky') { H(10, 2, 2, 3); H(13, 1, 2, 3); H(16, 2, 3, 3); H(19, 2, 2, 3); H(21, 4, 2, 2); if (!back && !side) { H(11, 8, 3, 2); H(17, 8, 2, 1); } }
    if (st === 'long' || st === 'braid') { if (!side) { H(9, 8, 2, 10, hd); H(21, 8, 2, 10, hd); } else H(19, 8, 4, 11, hd); if (back) { H(10, 5, 12, 15, hc, true); H(15, 8, 1, 10, hd); } }
    if (st === 'braid') { if (back || side) for (let i = 0; i < 4; i++) H(side ? 21 : 15, 17 + i * 3, 3, 2, i % 2 ? hd : hc); if (!back && !side) H(11, 8, 10, 1, hc); }
    if (st === 'bun') { H(12, 1, 8, 4, hc); H(13, 1, 4, 1, hl); }
    if (st === 'short' && !back && !side) H(11, 8, 10, 1, hc);
    if (st === 'cap') { H(9, 3, 14, 4, L.top2 || '#3a3a4a'); if (!back) H(side ? 6 : 10, 7, side ? 6 : 12, 1, shade(L.top2 || '#3a3a4a', 0.6)); }
    if (st === 'straw') { H(6, 6, 20, 2, '#e8c868'); H(10, 2, 12, 5, '#d8b050'); H(10, 5, 12, 1, '#a83a2a'); }
    if (st === 'bandana') { H(9, 4, 14, 3, '#c83a3a'); H(side ? 21 : 20, 6, 3, 4, '#a82a2a'); }
    if (st === 'captain') { H(8, 3, 16, 3, '#1a2238'); H(10, 1, 12, 3, '#1a2238'); H(14, 2, 4, 2, '#e8c040'); }
    if (st === 'miner') { H(9, 2, 14, 5, '#d8a030'); H(8, 6, 16, 1, '#a87820'); if (!back) { H(14, 3, 4, 3, '#fff6c0'); } }
  } else { H(11, 5, 10, 2, shade(sk, 1.1)); }
  if (L.beard && !back) { const bc = L.beard; if (!side) { P_.b(11, hy + 10, 10, 6, bc, { round: 2 }); P_.r(14, hy + 12, 4, 1, shade(sk, 0.6)); } else P_.b(hx - 1, hy + 10, 7, 6, bc, { round: 2 }); }
  if (L.scarf) { if (!side) P_.b(tx, 18 + y0, tw, 3, L.scarf, { round: 1 }); else P_.b(tx + 1 + lx, 18 + y0, tw - 2, 3, L.scarf); if (!back && L.scarf && !side) P_.r(tx + tw - 4, 21 + y0, 3, 4, shade(L.scarf, 0.8)); if (side) P_.r(21 + lx, 20 + y0, 3, 5, shade(L.scarf, 0.8)); }
  // ---- side arm + weapon (drawn last so it reads in front)
  const wpn = L.weapon;
  if (side) {
    let ax = 14 + lean, ay = armY, aw = 3, ah = 8;
    if (pose === 'attack') { ax = 6 + lean; ay = armY + 1; aw = 9; ah = 3; }
    else if (pose === 'ready' || pose === 'guard') { ax = 10 + lean; aw = 6; ah = 3; ay = armY + 4; }
    else if (pose === 'cast' || pose === 'victory') { ax = 13 + lean; ay = armY - 8; aw = 3; ah = 9; }
    else if (pose === 'walk') { ax += [0, -2, 0, 2][walk]; }
    P_.b(ax, ay, aw, ah, top, { round: 0 }); const hx2 = pose === 'attack' ? ax - 1 : pose === 'ready' || pose === 'guard' ? ax - 1 : ax; const hy2 = pose === 'cast' || pose === 'victory' ? ay - 1 : pose === 'attack' || pose === 'ready' || pose === 'guard' ? ay : ay + ah;
    P_.r(hx2, hy2, 3, 2, sk);
    drawWeapon(P_, wpn, hx2 + 1, hy2 + 1, pose, true);
    if (pose === 'cast') { P_.r(hx2 - 1, hy2 - 3, 5, 2, 'rgba(255,240,180,0.9)'); }
  } else if (!back) drawWeapon(P_, wpn, tx + tw + 1, armY + 9 - (pose === 'walk' && walk === 3 ? -1 : 0), 'field', false);
  else drawWeapon(P_, wpn, tx - 2, armY + 4, 'back', false);
}

function drawWeapon(P_, w, x, y, pose, side) {
  if (!w) return;
  const steel = '#dfe6f0', steelD = '#8a96a8', wood = '#7a4a28', gold = '#e8b84a';
  const attack = pose === 'attack', up = pose === 'cast' || pose === 'victory', ready = pose === 'ready' || pose === 'guard';
  if (w === 'sword') {
    if (side && attack) { P_.r(x - 14, y - 1, 13, 2, steel); P_.r(x - 14, y, 13, 1, steelD); P_.r(x - 2, y - 3, 2, 6, gold); P_.r(x - 1, y - 1, 3, 2, '#ffd27a'); return; }
    if (side && (up)) { P_.r(x, y - 14, 2, 13, steel); P_.r(x + 1, y - 14, 1, 13, steelD); P_.r(x - 2, y - 1, 6, 2, gold); return; }
    if (side && ready) { P_.r(x - 10, y - 6, 2, 2, steel); P_.r(x - 8, y - 4, 2, 2, steel); P_.r(x - 6, y - 2, 2, 2, steel); P_.r(x - 4, y, 3, 2, steelD); P_.r(x - 2, y - 1, 2, 4, gold); return; }
    P_.r(x, y - 12, 2, 11, steel); P_.r(x + 1, y - 12, 1, 11, steelD); P_.r(x - 1, y - 1, 4, 2, gold); P_.r(x, y + 1, 2, 3, wood); P_.r(x, y - 3, 2, 2, '#ffd27a');
  } else if (w === 'hammer') {
    const head = '#7e8896', headD = '#5a6270';
    if (side && attack) { P_.r(x - 12, y - 1, 12, 2, wood); P_.b(x - 17, y - 5, 6, 9, head, { round: 0 }); P_.r(x - 16, y - 4, 1, 7, '#c8e0ff'); return; }
    if (side && (up || ready)) { P_.r(x, y - 12, 2, 12, wood); P_.b(x - 3, y - 17, 9, 6, head, { round: 0 }); return; }
    P_.r(x, y - 10, 2, 12, wood); P_.b(x - 3, y - 15, 9, 6, head, { round: 0 }); P_.r(x - 3, y - 13, 9, 1, headD);
  } else if (w === 'harpoon') {
    const sh = '#b89a6a', tip = '#8ff0ff';
    if (side && attack) { P_.r(x - 20, y, 24, 1, sh); P_.r(x - 24, y - 1, 4, 3, tip); P_.p(x - 25, y, '#e0ffff'); return; }
    if (side && ready) { P_.r(x - 14, y, 20, 1, sh); P_.r(x - 18, y - 1, 4, 3, tip); return; }
    P_.r(x, y - 22, 1, 30, sh); P_.r(x - 1, y - 26, 3, 4, tip); P_.p(x, y - 27, '#e0ffff'); P_.r(x - 1, y - 18, 3, 1, '#e86a5a');
  } else if (w === 'cane' || w === 'staff') {
    const c = w === 'staff' ? '#8a6a3a' : '#5a3a24';
    P_.r(x, y - (w === 'staff' ? 14 : 2), 1, w === 'staff' ? 24 : 12, c); if (w === 'staff') P_.r(x - 1, y - 16, 3, 3, '#a8e0ff'); else P_.r(x - 2, y - 3, 3, 2, c);
  }
}

export function paintHumanSheet(look) {
  const W = FW * HUMAN_COLS, Hh = FH * HUMAN_ROWS;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh; const ctx = cv.getContext('2d', { willReadFrequently: true });
  const at = (i) => [(i % HUMAN_COLS) * FW, Math.floor(i / HUMAN_COLS) * FH];
  const draw = (i, dir, pose, f, flip = false) => { const [x, y] = at(i); drawHuman(new P(ctx, x, y, flip), look, dir, pose, f); };
  for (let k = 0; k < 4; k++) { draw(HUMAN_FRAMES.down[k], 'down', 'walk', k); draw(HUMAN_FRAMES.up[k], 'up', 'walk', k); draw(HUMAN_FRAMES.side[k], 'side', 'walk', k); }
  for (const p of ['idle0', 'idle1', 'ready', 'attack', 'cast', 'hurt', 'guard', 'victory']) draw(HUMAN_FRAMES[p], 'side', p, 0);
  // KO: the hurt pose, laid down
  { const tmp = document.createElement('canvas'); tmp.width = FW; tmp.height = FH; drawHuman(new P(tmp.getContext('2d'), 0, 0), look, 'side', 'ko', 0); const [x, y] = at(HUMAN_FRAMES.ko); ctx.save(); ctx.imageSmoothingEnabled = false; ctx.translate(x + FW / 2, y + FH - 13); ctx.rotate(Math.PI / 2); ctx.drawImage(tmp, -13, -16, 26, 32); ctx.restore(); }
  for (let i = 0; i < HUMAN_COLS * HUMAN_ROWS; i++) { const [x, y] = at(i); outline(ctx, x, y, FW, FH); }
  return cv;
}

// ================================================================ small critters (cat, gull) share the human sheet layout
function drawCritter(P_, L, dir, pose, f) {
  const walk = pose === 'walk' ? f : 0, bob = walk % 2 ? -1 : 0;
  if (L.kind === 'cat') {
    const c = L.fur || '#e8904a', d = shade(c, 0.7, 1);
    if (dir === 'side') { P_.e(16, 32 + bob, 6, 3, c); P_.e(10, 28 + bob, 4, 4, c); P_.r(7, 23 + bob, 2, 3, c); P_.r(11, 23 + bob, 2, 3, c); P_.r(21, 26 + bob, 2, 6, d); P_.p(9, 28 + bob, '#202020'); for (const lx of [12, 15, 18, 20]) P_.r(lx + (walk % 2 ? 1 : 0), 35, 1, 3, d); }
    else { P_.e(16, 32 + bob, 5, 4, c); P_.e(16, 26 + bob, 5, 4, c); P_.r(11, 21 + bob, 2, 3, c); P_.r(19, 21 + bob, 2, 3, c); if (dir === 'down') { P_.p(14, 26 + bob, '#202020'); P_.p(18, 26 + bob, '#202020'); P_.p(16, 28 + bob, '#f08080'); } P_.r(13, 36, 2, 2, d); P_.r(17, 36, 2, 2, d); }
    for (let i = 0; i < 3; i++) P_.r(14 + i * 2, 30 + bob, 1, 3, d);
  } else {
    const c = '#f4f4f0';
    P_.e(16, 30 + bob, 6, 4, c); P_.e(dir === 'side' ? 11 : 16, 25 + bob, 3, 3, c); P_.r(dir === 'side' ? 6 : 15, 25 + bob, 3, 1, '#e8b030');
    P_.r(14, 29 + bob, 8, 2, '#9aa4b0'); P_.r(14, 35, 1, 3, '#e8a040'); P_.r(18, 35, 1, 3, '#e8a040'); if (dir !== 'up') P_.p(dir === 'side' ? 10 : 15, 24 + bob, '#202020');
  }
}
export function paintCritterSheet(look) {
  const W = FW * HUMAN_COLS, Hh = FH * HUMAN_ROWS;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh; const ctx = cv.getContext('2d');
  const at = (i) => [(i % HUMAN_COLS) * FW, Math.floor(i / HUMAN_COLS) * FH];
  for (let k = 0; k < 4; k++) for (const [dir, arr] of [['down', HUMAN_FRAMES.down], ['up', HUMAN_FRAMES.up], ['side', HUMAN_FRAMES.side]]) { const [x, y] = at(arr[k]); drawCritter(new P(ctx, x, y), look, dir, 'walk', k); }
  for (let i = 0; i < HUMAN_COLS * HUMAN_ROWS; i++) { const [x, y] = at(i); outline(ctx, x, y, FW, FH); }
  return cv;
}

// ================================================================ monsters: 4 frames [idle0, idle1, attack, hurt] facing RIGHT
export const MONSTER_SIZE = { gloomcap: 48, thornbat: 48, boar: 64, rootling: 56, rootmother: 128, crab: 64, eel: 64, shade: 56, moth: 56, brinewarden: 144, sentinel: 72, hound: 64, lamp: 56, morrow: 80, morrow2: 112 };
const MON = {
  gloomcap(P_, s, f) {
    const sq = f === 1 ? 1 : 0, at = f === 2 ? 3 : 0;
    P_.b(17 + at, 28 + sq, 14, 14 - sq, '#e8dcc0', { round: 3 }); // stem
    P_.e(24 + at, 22 + sq, 15, 9 - sq, '#5a3a8a'); // cap
    for (const [x, y] of [[16, 18], [27, 16], [31, 22], [20, 24]]) P_.e(x + at, y + sq, 2, 1, '#c8a8f0', { flat: true });
    P_.r(20 + at, 32, 2, 3, '#1a1020'); P_.r(26 + at, 32, 2, 3, '#1a1020'); P_.p(20 + at, 32, '#ffe060'); P_.p(26 + at, 32, '#ffe060');
    P_.r(22 + at, 37, 4, 1, '#6a4a3a');
    if (f === 3) P_.r(19, 32, 9, 1, '#1a1020');
  },
  thornbat(P_, s, f) {
    const fl = f === 1 ? -4 : 0, at = f === 2 ? 4 : 0;
    P_.e(24 + at, 26, 6, 6, '#3a5a3a');
    for (const sx of [-1, 1]) { for (let i = 0; i < 4; i++) P_.r(24 + at + sx * (6 + i * 3) - (sx < 0 ? 3 : 0), 20 + fl + i * 2 + (f === 1 ? i : 0), 4, 6 - i, '#5a3a5a'); }
    P_.r(26 + at, 24, 2, 2, '#ff4040'); P_.r(21 + at, 24, 2, 2, '#ff4040');
    for (let i = 0; i < 4; i++) P_.p(20 + at + i * 3, 32, '#c8e0a0');
    P_.r(23 + at, 19, 2, 3, '#8a6a3a');
  },
  boar(P_, s, f) {
    const at = f === 2 ? 5 : 0, b = f === 1 ? 1 : 0;
    P_.e(28, 38 + b, 18, 13, '#7a4a32'); // body
    for (let i = 0; i < 7; i++) P_.r(14 + i * 4, 24 + b - (i % 2), 3, 5, '#3a2418'); // bristles
    P_.e(46 + at, 40 + b, 10, 9, '#8a5a3a'); P_.e(54 + at, 44 + b, 5, 4, '#c88a6a');
    P_.r(52 + at, 46 + b, 2, 1, '#3a2418'); P_.r(56 + at, 46 + b, 2, 1, '#3a2418');
    P_.r(53 + at, 49 + b, 6, 2, '#f0f0e0'); P_.r(58 + at, 47 + b, 2, 3, '#f0f0e0'); // tusk
    P_.r(46 + at, 36 + b, 3, 2, '#ff6040'); P_.r(42 + at, 31 + b, 4, 5, '#5a3424');
    for (const x of [16, 24, 34, 42]) P_.b(x, 48, 5, 9, '#5a3424', { round: 0 }); for (const x of [16, 24, 34, 42]) P_.r(x, 56, 5, 2, '#2a1a14');
  },
  rootling(P_, s, f) {
    const at = f === 2 ? 4 : 0, b = f === 1 ? 1 : 0;
    P_.b(20 + at, 18 + b, 16, 26, '#6a4a2a', { round: 3 }); for (let i = 0; i < 4; i++) P_.r(21 + at + i * 4, 18 + b, 1, 24, '#4a301c');
    P_.e(28 + at, 16 + b, 11, 6, '#4a8a3a'); P_.e(22 + at, 13 + b, 5, 4, '#5aa04a'); P_.e(33 + at, 12 + b, 5, 4, '#3a7a2a');
    P_.r(24 + at, 26 + b, 3, 3, '#ffb040'); P_.r(31 + at, 26 + b, 3, 3, '#ffb040');
    for (const x of [16, 22, 30, 36]) P_.r(x + at / 2, 43, 3, 9, '#5a3a20');
    P_.r(10 + at * 2, 28 + b, 12, 3, '#6a4a2a'); P_.r(8 + at * 2, 26 + b, 4, 3, '#4a8a3a');
  },
  rootmother(P_, s, f) {
    const b = f === 1 ? 2 : 0, at = f === 2 ? 6 : 0;
    for (let i = 0; i < 9; i++) P_.b(10 + i * 12, 96 + (i % 2) * 4, 10, 30 - (i % 2) * 4, i % 2 ? '#4a301c' : '#5a3a22', { round: 2 });
    P_.e(64, 70 + b, 44, 34, '#5a3a22'); P_.e(60, 62 + b, 36, 26, '#6a4a2a');
    for (let i = 0; i < 8; i++) P_.r(30 + i * 9, 48 + b + (i % 3) * 4, 3, 40, '#3a2414');
    P_.e(64, 36 + b, 46, 20, '#3a6a2a'); P_.e(42, 28 + b, 18, 12, '#4a8a3a'); P_.e(86, 26 + b, 18, 12, '#2f5a22'); P_.e(64, 20 + b, 22, 12, '#5aa04a');
    for (const [x, y] of [[30, 30], [52, 22], [76, 18], [96, 34], [64, 40]]) { P_.r(x, y + b, 3, 6, '#e8dcc0'); P_.e(x + 1, y - 2 + b, 4, 2, '#c84a6a'); }
    P_.e(52 + at, 66 + b, 5, 4, '#ffb040'); P_.e(76 + at, 66 + b, 5, 4, '#ffb040'); P_.r(51 + at, 65 + b, 2, 2, '#fff0a0'); P_.r(75 + at, 65 + b, 2, 2, '#fff0a0');
    P_.r(54 + at, 80 + b, 22, 4, '#1a0e08'); for (let i = 0; i < 5; i++) P_.r(56 + at + i * 4, 80 + b, 2, 2, '#e8dcc0');
    P_.e(64, 92 + b, 6, 5, '#ff9a3a'); P_.e(64, 92 + b, 3, 3, '#fff0b0', { flat: true }); // the shard, caught in her roots
    if (f === 2) for (let i = 0; i < 3; i++) P_.r(100 + i * 6, 70 + i * 8, 22, 4, '#5a3a22');
  },
  crab(P_, s, f) {
    const at = f === 2 ? 6 : 0, b = f === 1 ? 1 : 0, c = '#c8503a';
    for (let i = 0; i < 3; i++) { P_.r(14 + i * 6, 44, 3, 10, '#8a3020'); P_.r(38 + i * 6, 44, 3, 10, '#8a3020'); }
    P_.e(32, 38 + b, 20, 11, c); P_.e(30, 34 + b, 14, 6, '#e87a5a', { flat: true });
    for (let i = 0; i < 6; i++) P_.p(20 + i * 4, 30 + b + (i % 2), '#ffe0c0');
    P_.b(46 + at, 26 + b, 12, 10, c, { round: 2 }); P_.r(55 + at, 28 + b, 5, 3, '#f0a080'); P_.b(4, 28 + b, 10, 9, shade(c, 0.85), { round: 2 });
    P_.r(28, 22 + b, 2, 6, '#8a3020'); P_.r(35, 22 + b, 2, 6, '#8a3020'); P_.r(27, 20 + b, 4, 3, '#101010'); P_.r(34, 20 + b, 4, 3, '#101010'); P_.p(28, 20 + b, '#fff'); P_.p(35, 20 + b, '#fff');
    for (let i = 0; i < 3; i++) P_.e(22 + i * 10, 36 + b, 2, 1, '#9ff0ff', { flat: true });
  },
  eel(P_, s, f) {
    const w = f === 1 ? 2 : 0, at = f === 2 ? 6 : 0;
    for (let i = 0; i < 10; i++) P_.e(10 + i * 4 + (i > 6 ? at : 0), 44 - Math.sin(i * 0.7 + w) * 8 - i * 2, 5, 5, i % 2 ? '#2a4a6a' : '#325a7a', { hl: false });
    P_.e(52 + at, 18, 8, 6, '#3a6a8a'); P_.r(56 + at, 20, 6, 2, '#101820'); P_.r(54 + at, 15, 2, 2, '#ffe060');
    P_.r(48 + at, 6, 1, 8, '#6a8a9a'); P_.e(46 + at, 5, 3, 3, '#ffffa0', { flat: true }); P_.e(46 + at, 5, 1, 1, '#ffffff', { flat: true });
    for (let i = 0; i < 4; i++) P_.p(20 + i * 8, 40 - i * 6, '#8ff0ff');
  },
  shade(P_, s, f) {
    const b = f === 1 ? -2 : 0, at = f === 2 ? 5 : 0;
    for (let j = 0; j < 30; j++) { const w = 10 + Math.sin(j * 0.3) * 3 + j * 0.3; P_.r(28 - w / 2 + at * (j / 30) + Math.sin(j * 0.6 + f) * 2, 14 + j + b, w, 1, j % 3 ? '#4a5a7a' : '#3a4a6a'); }
    P_.e(28 + at, 16 + b, 9, 8, '#5a6a8a'); P_.r(23 + at, 15 + b, 3, 3, '#c8f0ff'); P_.r(31 + at, 15 + b, 3, 3, '#c8f0ff'); P_.r(26 + at, 21 + b, 5, 2, '#1a2030');
    for (let i = 0; i < 3; i++) P_.r(16 + i * 2 + at, 26 + i * 3 + b, 6, 2, '#4a5a7a');
  },
  moth(P_, s, f) {
    const fl = f === 1 ? 3 : 0, at = f === 2 ? 4 : 0;
    for (const sx of [-1, 1]) { P_.e(28 + sx * 12 + at, 20 - fl / 2, 10, 12 - fl, sx < 0 ? '#9cc8f0' : '#b0e0ff'); P_.e(28 + sx * 10 + at, 34, 7, 7 - fl / 2, '#c8b0ff'); P_.e(28 + sx * 14 + at, 18, 3, 3, '#ffffff', { flat: true }); }
    P_.b(25 + at, 14, 6, 26, '#3a3a5a', { round: 2 }); P_.r(25 + at, 12, 2, 2, '#e0f0ff'); P_.r(30 + at, 12, 2, 2, '#e0f0ff');
    P_.r(24 + at, 6, 1, 6, '#3a3a5a'); P_.r(32 + at, 6, 1, 6, '#3a3a5a');
  },
  brinewarden(P_, s, f) {
    const b = f === 1 ? 2 : 0, at = f === 2 ? 10 : 0, c = '#a8443a';
    for (let i = 0; i < 4; i++) { P_.b(20 + i * 14, 100, 6, 30, '#6a2a20', { round: 0 }); P_.b(84 + i * 12, 100, 6, 30, '#6a2a20', { round: 0 }); }
    P_.e(72, 86 + b, 58, 30, c); P_.e(70, 76 + b, 46, 18, '#c8604a');
    for (let i = 0; i < 9; i++) P_.e(30 + i * 10, 64 + b + (i % 3) * 3, 4, 7, i % 2 ? '#8ff0ff' : '#c8a0ff');
    for (let i = 0; i < 5; i++) P_.e(40 + i * 16, 96 + b, 5, 3, '#e8dcc0');
    P_.b(108 + at, 50 + b, 28, 24, c, { round: 4 }); P_.b(120 + at, 42 + b, 20, 12, '#c8604a', { round: 3 }); P_.b(118 + at, 70 + b, 20, 10, shade(c, 0.85), { round: 3 });
    P_.b(2, 54 + b, 22, 20, shade(c, 0.8), { round: 4 });
    for (const x of [56, 76]) { P_.r(x, 34 + b, 4, 20, '#6a2a20'); P_.e(x + 2, 32 + b, 6, 6, '#e8e0ff'); P_.e(x + 2, 32 + b, 3, 3, '#7a8aa0', { flat: true }); }
    P_.e(66, 12 + b, 6, 6, '#fff0a0', { flat: true }); P_.r(65, 18 + b, 2, 16, '#8a6a3a'); // dead lighthouse lantern on its back
  },
  sentinel(P_, s, f) {
    const b = f === 1 ? 1 : 0, at = f === 2 ? 6 : 0, m = '#4a5068';
    P_.b(24, 52, 9, 16, '#2e3244', { round: 0 }); P_.b(38, 52, 9, 16, '#2e3244', { round: 0 });
    P_.b(20, 26 + b, 32, 28, m, { round: 3 }); P_.r(24, 34 + b, 24, 3, '#a88a4a'); P_.r(34, 28 + b, 4, 24, '#383c50');
    P_.b(26, 8 + b, 20, 20, '#5a6078', { round: 4 }); P_.r(28, 16 + b, 16, 3, '#101018'); P_.r(31, 16 + b, 3, 2, '#a0c0ff'); P_.r(38, 16 + b, 3, 2, '#a0c0ff');
    P_.r(32, 2 + b, 8, 7, '#6a3a8a');
    P_.r(54 + at, 2, 3, 66, '#5a4a3a'); P_.b(50 + at, 0, 12, 12, '#c0c8d8', { round: 1 }); P_.b(48 + at, 30 + b, 8, 8, m, { round: 1 });
    P_.b(10, 30 + b, 12, 18, '#3a3e52', { round: 2 });
  },
  hound(P_, s, f) {
    const at = f === 2 ? 6 : 0, b = f === 1 ? 1 : 0, c = '#2a2240';
    P_.e(28, 36 + b, 18, 10, c); for (let i = 0; i < 6; i++) P_.r(14 + i * 5, 25 + b - (i % 2) * 2, 3, 5, '#4a3a7a');
    P_.e(48 + at, 30 + b, 10, 8, c); P_.r(52 + at, 34 + b, 10, 4, '#1a1428'); for (let i = 0; i < 3; i++) P_.p(54 + at + i * 3, 37 + b, '#e8e8ff');
    P_.r(51 + at, 27 + b, 3, 2, '#c060ff'); P_.r(44 + at, 20 + b, 3, 6, c); P_.r(48 + at, 19 + b, 3, 6, c);
    for (const x of [14, 22, 34, 42]) P_.b(x, 42, 4, 12, '#1e1830', { round: 0 });
    P_.r(4, 28 + b, 12, 3, '#4a3a7a'); P_.r(2, 26 + b, 4, 3, '#6a5aa0');
  },
  lamp(P_, s, f) {
    const b = f === 1 ? -2 : 0, at = f === 2 ? 4 : 0;
    P_.r(27 + at, 4 + b, 2, 6, '#3a3a44'); P_.b(18 + at, 8 + b, 20, 6, '#4a4a56', { round: 2 });
    P_.b(19 + at, 14 + b, 18, 24, '#2a2a34', { round: 1 }); P_.b(22 + at, 17 + b, 12, 18, '#3a4a7a', { round: 1 });
    P_.e(28 + at, 26 + b, 4, 6, '#9a7aff'); P_.e(28 + at, 26 + b, 2, 3, '#e0d0ff', { flat: true });
    P_.b(17 + at, 38 + b, 22, 5, '#4a4a56', { round: 1 }); P_.r(24 + at, 22 + b, 2, 2, '#ffffff'); P_.r(31 + at, 22 + b, 2, 2, '#ffffff');
    for (let i = 0; i < 4; i++) P_.r(20 + i * 5 + at, 44 + b + (i % 2) * 2, 2, 4, '#3a3a44');
  },
  morrow(P_, s, f) {
    const b = f === 1 ? 1 : 0, at = f === 2 ? 6 : 0;
    for (let j = 0; j < 46; j++) { const w = 16 + j * 0.45; P_.r(40 - w / 2 + (j > 30 ? Math.sin(j + f) : 0), 26 + j + b, w, 1, j % 4 ? '#5c5c6e' : '#4c4c5e'); }
    P_.b(28, 10 + b, 24, 20, '#5c5c6e', { round: 6 }); P_.e(40, 22 + b, 7, 6, '#1a1a24', { flat: true }); P_.r(36, 21 + b, 2, 1, '#e0e0ff'); P_.r(42, 21 + b, 2, 1, '#e0e0ff');
    P_.r(56 + at, 18, 2, 56, '#3a2a22'); P_.e(57 + at, 16, 6, 4, '#2a2230'); P_.r(55 + at, 30 + b, 6, 4, '#dcc0a8');
    for (let i = 0; i < 5; i++) P_.e(14 + i * 4, 40 + i * 6 + b, 2, 2, '#2a2a3a', { flat: true });
  },
  morrow2(P_, s, f) {
    const b = f === 1 ? 2 : 0, at = f === 2 ? 10 : 0;
    for (let i = 0; i < 7; i++) { const a = -0.4 + i * 0.13; for (let j = 0; j < 30; j++) P_.r(56 + Math.cos(Math.PI + a * 3) * j * 1.6 - 8, 40 - j * 0.9 + i * 6 + Math.sin(j * 0.4 + f) * 2, 3, 3, i % 2 ? '#2a2040' : '#1a1430'); }
    for (let j = 0; j < 60; j++) { const w = 20 + j * 0.6; P_.r(56 - w / 2, 36 + j + b, w, 1, j % 5 ? '#24203a' : '#342a50'); }
    P_.b(42, 14 + b, 28, 24, '#3a3050', { round: 7 }); P_.e(56, 28 + b, 8, 7, '#08060e', { flat: true }); P_.r(51, 26 + b, 3, 2, '#ff6060'); P_.r(59, 26 + b, 3, 2, '#ff6060');
    for (let i = 0; i < 9; i++) P_.p(30 + i * 7, 50 + (i * 13) % 40 + b, '#e8e0ff');
    P_.r(84 + at, 20, 3, 74, '#2a1a22'); P_.e(85 + at, 18, 8, 5, '#6a3a8a'); P_.e(85 + at, 18, 3, 2, '#ff9aff', { flat: true });
  },
};
export function paintMonsterSheet(id) {
  const S = MONSTER_SIZE[id] || 64, cv = document.createElement('canvas'); cv.width = S * 4; cv.height = S; const ctx = cv.getContext('2d');
  const fn = MON[id] || MON.gloomcap;
  for (let f = 0; f < 4; f++) {
    const p = new P(ctx, f * S, 0, false, S);
    // monsters are authored on a 64-ish canvas; bosses on their own size. Scale small authoring into bigger frames.
    fn(p, S, f);
    outline(ctx, f * S, 0, S, S);
  }
  return cv;
}

// ================================================================ portraits (head + shoulders, cropped from the front idle)
export function paintPortrait(look) {
  const tmp = document.createElement('canvas'); tmp.width = FW; tmp.height = FH; const t = tmp.getContext('2d');
  if (look.kind) drawCritter(new P(t, 0, 0), look, 'down', 'walk', 0); else drawHuman(new P(t, 0, 0), look, 'down', 'stand', 0);
  outline(t, 0, 0, FW, FH);
  const cv = document.createElement('canvas'); cv.width = 24; cv.height = 24; const c = cv.getContext('2d');
  c.drawImage(tmp, 4, look.kind ? 16 : 0, 24, 24, 0, 0, 24, 24);
  return cv;
}
