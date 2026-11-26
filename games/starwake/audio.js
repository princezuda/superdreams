// Starwake — game-specific WebAudio: continuous engine bed + weapon/explosion/UI voices. Music is deferred (FABLE).
import { settings, sfx } from '/shared/sd-kit.js';
let ctx = null, out = null, eng = null, noiseB = null;
function ensure() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return false; }
  out = ctx.createGain(); out.gain.value = settings.volume * 0.8; out.connect(ctx.destination);
  noiseB = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseB.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // engine bed: detuned saws through a lowpass + rumble noise. Gains driven by throttle/boost each frame.
  const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(); o1.type = 'sawtooth'; o2.type = 'sawtooth'; o1.frequency.value = 46; o2.frequency.value = 46.7;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 2;
  const g = ctx.createGain(); g.gain.value = 0;
  const n = ctx.createBufferSource(); n.buffer = noiseB; n.loop = true; const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 400; nf.Q.value = 0.7; const ng = ctx.createGain(); ng.gain.value = 0;
  o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(out); n.connect(nf); nf.connect(ng); ng.connect(out);
  o1.start(); o2.start(); n.start();
  eng = { o1, o2, lp, g, nf, ng };
  return true;
}
addEventListener('pointerdown', ensure, { passive: true }); addEventListener('keydown', ensure);
addEventListener('sd-settings', () => { if (out) out.gain.value = settings.volume * 0.8; });
function v({ type = 'sine', f0 = 440, f1 = f0, dur = 0.15, vol = 0.2, noise = false, filter = null, attack = 0.004, pan = 0, delay = 0 }) {
  if (!ctx || settings.volume <= 0) return;
  const t = ctx.currentTime + delay, j = 1 + (Math.random() - 0.5) * 0.16;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let src;
  if (noise) { src = ctx.createBufferSource(); src.buffer = noiseB; src.playbackRate.value = j; }
  else { src = ctx.createOscillator(); src.type = type; src.frequency.setValueAtTime(f0 * j, t); src.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * j), t + dur); }
  let node = src;
  if (filter) { const f = ctx.createBiquadFilter(); f.type = filter.type || 'lowpass'; f.frequency.setValueAtTime(filter.f0, t); f.frequency.exponentialRampToValueAtTime(filter.f1 ?? filter.f0, t + dur); f.Q.value = filter.q ?? 1; node.connect(f); node = f; }
  if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); node.connect(p); node = p; }
  node.connect(g); g.connect(out); src.start(t); src.stop(t + dur + 0.05);
}
export const audio = {
  ensure,
  engine(throttle, boost, cruise, on = true) {
    if (!eng) return; const t = ctx.currentTime;
    const base = on ? 0.05 + throttle * 0.09 + (boost ? 0.07 : 0) : 0;
    eng.g.gain.setTargetAtTime(base, t, 0.08);
    eng.lp.frequency.setTargetAtTime(180 + throttle * 420 + (boost ? 700 : 0) + (cruise ? 900 : 0), t, 0.1);
    const f = 40 + throttle * 26 + (boost ? 18 : 0) + (cruise ? 30 : 0); eng.o1.frequency.setTargetAtTime(f, t, 0.12); eng.o2.frequency.setTargetAtTime(f * 1.013, t, 0.12);
    eng.ng.gain.setTargetAtTime(on ? (boost ? 0.12 : 0.02 + throttle * 0.03) + (cruise ? 0.08 : 0) : 0, t, 0.1); eng.nf.frequency.setTargetAtTime(300 + throttle * 600 + (boost ? 1400 : 0), t, 0.1);
  },
  laser(gun = 'pulse', pan = 0, vol = 1) {
    if (gun === 'driver') { v({ type: 'square', f0: 220, f1: 60, dur: 0.16, vol: 0.13 * vol, filter: { f0: 1800, f1: 200 }, pan }); v({ noise: true, dur: 0.09, vol: 0.12 * vol, filter: { f0: 900, f1: 200 }, pan }); }
    else if (gun === 'ion') v({ type: 'triangle', f0: 1900, f1: 900, dur: 0.07, vol: 0.09 * vol, pan });
    else v({ type: 'sawtooth', f0: 1500, f1: 260, dur: 0.12, vol: 0.075 * vol, filter: { f0: 4200, f1: 600 }, pan });
  },
  hitShield() { v({ type: 'sine', f0: 900, f1: 1400, dur: 0.12, vol: 0.1 }); v({ noise: true, dur: 0.1, vol: 0.08, filter: { type: 'highpass', f0: 3000 } }); },
  hitHull() { v({ type: 'square', f0: 140, f1: 70, dur: 0.18, vol: 0.14, filter: { f0: 900 } }); v({ noise: true, dur: 0.16, vol: 0.18, filter: { f0: 1400, f1: 300 } }); },
  hitConfirm() { v({ type: 'triangle', f0: 2200, f1: 2000, dur: 0.04, vol: 0.06 }); },
  boom(dist = 0, big = false) {
    const k = Math.max(0.12, 1 - dist / 4000) * (big ? 1.6 : 1);
    v({ noise: true, dur: big ? 2.2 : 1.1, vol: 0.32 * k, filter: { f0: big ? 1600 : 2400, f1: 60 }, attack: 0.01 });
    v({ type: 'sine', f0: big ? 90 : 120, f1: 30, dur: big ? 1.6 : 0.8, vol: 0.4 * k });
  },
  missile() { v({ noise: true, dur: 0.9, vol: 0.18, filter: { type: 'bandpass', f0: 600, f1: 2400, q: 1.2 }, attack: 0.05 }); v({ type: 'sawtooth', f0: 120, f1: 380, dur: 0.6, vol: 0.06, filter: { f0: 800 } }); },
  lockTone(locked) { v({ type: 'sine', f0: locked ? 1320 : 880, dur: locked ? 0.25 : 0.05, vol: 0.07 }); },
  warn() { v({ type: 'square', f0: 660, dur: 0.1, vol: 0.07, filter: { f0: 2000 } }); v({ type: 'square', f0: 660, dur: 0.1, vol: 0.07, filter: { f0: 2000 }, delay: 0.16 }); },
  comms() { v({ type: 'sine', f0: 1200, f1: 1600, dur: 0.05, vol: 0.06 }); v({ noise: true, dur: 0.15, vol: 0.04, filter: { type: 'bandpass', f0: 2500, q: 3 }, delay: 0.04 }); },
  scoop() { v({ type: 'sine', f0: 500, f1: 1200, dur: 0.18, vol: 0.12 }); },
  jump() { v({ type: 'sawtooth', f0: 60, f1: 900, dur: 2.2, vol: 0.12, filter: { f0: 300, f1: 6000 }, attack: 0.6 }); v({ noise: true, dur: 2.4, vol: 0.16, filter: { type: 'bandpass', f0: 200, f1: 5000, q: 1 }, attack: 0.8 }); },
  dock() { v({ type: 'sine', f0: 110, f1: 55, dur: 0.6, vol: 0.3 }); v({ noise: true, dur: 0.6, vol: 0.15, filter: { f0: 600, f1: 100 } }); },
  cash() { sfx.check(); v({ type: 'triangle', f0: 1568, dur: 0.15, vol: 0.06, delay: 0.1 }); },
  ui: () => sfx.click(),
};
