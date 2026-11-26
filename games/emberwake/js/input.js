// Emberwake — unified input: keyboard, gamepad (standard mapping) and touch (virtual stick + A/B/Menu buttons).
// Game code reads `I.move` (analog vector), `I.held(action)` and consumes edge presses with `I.take(action)`.
const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Enter: 'confirm', Space: 'confirm', KeyZ: 'confirm', KeyE: 'confirm', Escape: 'pause', KeyP: 'pause', KeyX: 'cancel', Backspace: 'cancel', KeyC: 'cancel',
  KeyQ: 'boostDown', PageDown: 'boostDown', KeyR: 'boostUp', PageUp: 'boostUp', ShiftLeft: 'run', ShiftRight: 'run', Tab: 'menu', KeyM: 'menu',
};
const PAD = { 0: 'confirm', 1: 'cancel', 2: 'menu', 3: 'menu', 9: 'pause', 8: 'menu', 4: 'boostDown', 5: 'boostUp', 12: 'up', 13: 'down', 14: 'left', 15: 'right', 7: 'run' };
export const I = {
  move: { x: 0, z: 0 }, down: new Set(), pressed: new Set(), lastDevice: 'kb', touch: false, padConnected: false, repeat: {},
  held(a) { return this.down.has(a); },
  take(a) { if (this.pressed.has(a)) { this.pressed.delete(a); return true; } return false; },
  clear() { this.pressed.clear(); },
  press(a) { this.pressed.add(a); this.onPress?.(a); },
};
addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
  const a = KEYMAP[e.code]; if (!a) return;
  if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace'].includes(e.code)) e.preventDefault();
  I.lastDevice = 'kb';
  if (!I.down.has(a) || ['up', 'down', 'left', 'right'].includes(a)) { if (!e.repeat || ['up', 'down', 'left', 'right'].includes(a)) I.press(a); }
  I.down.add(a);
});
addEventListener('keyup', (e) => { const a = KEYMAP[e.code]; if (a) I.down.delete(a); });
addEventListener('blur', () => I.down.clear());

// ---------------------------------------------------------------- gamepad (polled each frame)
const padPrev = {}; let axisPrev = { x: 0, y: 0 }, axisRep = 0;
export function pollPad(dt) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : []; const p = [...pads].find((x) => x && x.connected);
  I.padConnected = !!p; if (!p) return;
  p.buttons.forEach((b, i) => { const a = PAD[i]; if (!a) return; if (b.pressed && !padPrev[i]) { I.press(a); I.lastDevice = 'pad'; } if (b.pressed) I.down.add(a); else if (padPrev[i]) I.down.delete(a); padPrev[i] = b.pressed; });
  const ax = p.axes[0] || 0, ay = p.axes[1] || 0, dz = 0.25;
  I.padMove = Math.hypot(ax, ay) > dz ? { x: ax, z: ay } : null;
  // stick → menu navigation with auto-repeat
  const nx = Math.abs(ax) > 0.6 ? Math.sign(ax) : 0, ny = Math.abs(ay) > 0.6 ? Math.sign(ay) : 0;
  axisRep -= dt;
  if ((nx !== axisPrev.x || ny !== axisPrev.y) || ((nx || ny) && axisRep <= 0)) { if (ny < 0) I.press('up'); if (ny > 0) I.press('down'); if (nx < 0) I.press('left'); if (nx > 0) I.press('right'); axisRep = nx !== axisPrev.x || ny !== axisPrev.y ? 0.35 : 0.12; if (nx || ny) I.lastDevice = 'pad'; }
  axisPrev = { x: nx, y: ny };
}

// ---------------------------------------------------------------- touch controls (shown on first touch)
export function initTouch(root) {
  const el = document.createElement('div'); el.id = 'touch'; el.innerHTML = `<div class="stick"><div class="knob"></div></div><div class="tbtns"><button class="tb tbB" data-a="cancel" aria-label="Back">B</button><button class="tb tbA" data-a="confirm" aria-label="Act">A</button></div>`;
  root.appendChild(el);
  const stick = el.querySelector('.stick'), knob = el.querySelector('.knob');
  let sid = null, c = null;
  const show = () => { if (!I.touch) { I.touch = true; document.body.classList.add('touchmode'); } };
  addEventListener('touchstart', show, { passive: true });
  stick.addEventListener('pointerdown', (e) => { show(); sid = e.pointerId; const r = stick.getBoundingClientRect(); c = { x: r.left + r.width / 2, y: r.top + r.height / 2, R: r.width / 2 }; stick.setPointerCapture(sid); upd(e); e.preventDefault(); });
  const upd = (e) => { if (e.pointerId !== sid) return; let dx = e.clientX - c.x, dy = e.clientY - c.y; const l = Math.hypot(dx, dy); if (l > c.R) { dx *= c.R / l; dy *= c.R / l; } knob.style.transform = `translate(${dx}px,${dy}px)`; I.touchMove = l > 8 ? { x: dx / c.R, z: dy / c.R } : null; };
  stick.addEventListener('pointermove', upd);
  const end = (e) => { if (e.pointerId !== sid) return; sid = null; knob.style.transform = ''; I.touchMove = null; };
  stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
  el.querySelectorAll('.tb').forEach((b) => { b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); I.lastDevice = 'touch'; I.press(b.dataset.a); I.down.add(b.dataset.a); b.classList.add('on'); }); const up = () => { I.down.delete(b.dataset.a); b.classList.remove('on'); }; b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up); });
  return el;
}
export function moveVector() {
  let x = (I.down.has('right') ? 1 : 0) - (I.down.has('left') ? 1 : 0), z = (I.down.has('down') ? 1 : 0) - (I.down.has('up') ? 1 : 0);
  if (I.padMove) { x = I.padMove.x; z = I.padMove.z; }
  if (I.touchMove) { x = I.touchMove.x; z = I.touchMove.z; }
  const l = Math.hypot(x, z); if (l > 1) { x /= l; z /= l; }
  I.move.x = x; I.move.z = z; return I.move;
}
