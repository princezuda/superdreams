// Input: keyboard + gamepad (standard mapping) + touch (floating virtual stick, Jump/Action buttons, drag-to-look).
// Everything funnels into one state: stick (sx, sy), camera (cx, cy), jump held/pressed, action pressed. Edges are latched
// until the fixed-step simulation consumes them, so a tap is never lost between frames.
export function createInput() {
  const keys = new Set();
  const I = { sx: 0, sy: 0, cx: 0, cy: 0, jumpHeld: false, jumpEdge: false, actionEdge: false, pauseEdge: false, recenterEdge: false, mode: 'keys', touch: false, scripted: null, dragX: 0, dragY: 0 };
  const isText = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA');
  addEventListener('keydown', (e) => {
    if (isText(e)) return; if (e.repeat) { if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); return; }
    keys.add(e.code); I.mode = 'keys';
    if (['Space', 'KeyK', 'KeyJ'].includes(e.code)) { I.jumpEdge = true; e.preventDefault(); }
    if (['ShiftLeft', 'ShiftRight', 'KeyL', 'KeyX', 'KeyC', 'ControlLeft'].includes(e.code)) I.actionEdge = true;
    if (['Escape', 'KeyP'].includes(e.code)) I.pauseEdge = true;
    if (e.code === 'KeyR') I.recenterEdge = true;
    if (e.code.startsWith('Arrow')) e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  // mouse drag orbits the camera (no pointer lock: never fights the UI)
  let drag = null;
  addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse' || e.button !== 0) return; if (e.target.closest?.('button, .sd-panel, #menu, .sd-corner, .card, #touch')) return; drag = { x: e.clientX, y: e.clientY }; });
  addEventListener('pointermove', (e) => { if (!drag || e.pointerType !== 'mouse') return; I.dragX += (e.clientX - drag.x); I.dragY += (e.clientY - drag.y); drag.x = e.clientX; drag.y = e.clientY; });
  addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') drag = null; });

  // ---- touch
  const T = document.getElementById('touch'); const stickEl = document.getElementById('stick'), knob = document.getElementById('knob');
  const touches = new Map(); const R = 56;
  function showTouch() { if (!I.touch) { I.touch = true; document.body.classList.add('touch'); } I.mode = 'touch'; }
  if (matchMedia('(pointer: coarse)').matches) showTouch();
  const btn = (id, on, off) => { const b = document.getElementById(id); if (!b) return; b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); b.setPointerCapture?.(e.pointerId); b.classList.add('down'); on(); }); const up = (e) => { e.preventDefault(); b.classList.remove('down'); off?.(); }; b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); };
  btn('tJump', () => { I.jumpEdge = true; I.tJump = true; }, () => { I.tJump = false; });
  btn('tAct', () => { I.actionEdge = true; });
  if (T) {
    T.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return; showTouch(); e.preventDefault();
      const left = e.clientX < innerWidth * 0.5;
      touches.set(e.pointerId, { kind: left ? 'stick' : 'look', x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY });
      if (left) { stickEl.style.left = e.clientX + 'px'; stickEl.style.top = e.clientY + 'px'; stickEl.classList.add('on'); }
    }, { passive: false });
    T.addEventListener('pointermove', (e) => {
      const t = touches.get(e.pointerId); if (!t) return; e.preventDefault();
      if (t.kind === 'look') { I.dragX += (e.clientX - t.x) * 1.3; I.dragY += (e.clientY - t.y) * 1.3; }
      t.x = e.clientX; t.y = e.clientY;
    }, { passive: false });
    const end = (e) => { const t = touches.get(e.pointerId); if (!t) return; touches.delete(e.pointerId); if (t.kind === 'stick') { stickEl.classList.remove('on'); knob.style.transform = ''; } };
    T.addEventListener('pointerup', end); T.addEventListener('pointercancel', end);
  }

  // ---- gamepad
  let gpPrev = [];
  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : []; let pad = null; for (const p of pads) if (p && p.connected) { pad = p; break; }
    if (!pad) return null;
    const b = pad.buttons.map((x) => x.pressed), dz = (v) => Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82;
    const edge = (i) => b[i] && !gpPrev[i];
    const lx = dz(pad.axes[0] || 0), ly = dz(pad.axes[1] || 0), rx = dz(pad.axes[2] || 0), ry = dz(pad.axes[3] || 0);
    if (b.some(Boolean) || Math.abs(lx) + Math.abs(ly) > 0) I.mode = 'pad';
    if (edge(0)) I.jumpEdge = true; if (edge(2) || edge(1) || edge(6) || edge(7)) I.actionEdge = true; if (edge(9)) I.pauseEdge = true; if (edge(10) || edge(11) || edge(3)) I.recenterEdge = true;
    gpPrev = b;
    return { lx: lx + (b[15] ? 1 : 0) - (b[14] ? 1 : 0), ly: ly + (b[13] ? 1 : 0) - (b[12] ? 1 : 0), rx: rx + (b[5] ? 0.8 : 0) - (b[4] ? 0.8 : 0), ry, jump: b[0] };
  }

  /** Called once per rendered frame. */
  I.poll = function () {
    const pad = pollPad();
    let sx = 0, sy = 0, cx = 0, cy = 0, jh = false;
    sx += (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    sy += (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    cx += (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0);
    jh = keys.has('Space') || keys.has('KeyK') || keys.has('KeyJ');
    if (pad) { sx += pad.lx; sy -= pad.ly; cx += pad.rx; cy += pad.ry; jh = jh || pad.jump; }
    for (const t of touches.values()) if (t.kind === 'stick') {
      let dx = t.x - t.x0, dy = t.y - t.y0; const d = Math.hypot(dx, dy); if (d > R) { t.x0 += dx * (1 - R / d); t.y0 += dy * (1 - R / d); dx = t.x - t.x0; dy = t.y - t.y0; stickEl.style.left = t.x0 + 'px'; stickEl.style.top = t.y0 + 'px'; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`; const m = Math.min(1, d / R); const dd = Math.max(d, 1e-6); sx += dx / dd * m; sy -= dy / dd * m;
    }
    if (I.tJump) jh = true;
    if (I.scripted) { const s = I.scripted; sx = s.sx ?? 0; sy = s.sy ?? 0; jh = !!s.jump; }
    const m = Math.hypot(sx, sy); if (m > 1) { sx /= m; sy /= m; }
    I.sx = sx; I.sy = sy; I.cx = cx; I.cy = cy; I.jumpHeld = jh;
  };
  I.consume = function () { const r = { jump: I.jumpEdge, action: I.actionEdge }; I.jumpEdge = false; I.actionEdge = false; return r; };
  I.keys = keys;
  return I;
}
