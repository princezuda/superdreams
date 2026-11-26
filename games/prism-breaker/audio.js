// Prism Breaker — glassy Web Audio synth: brick "tinks" climb a scale with the combo; respects kit volume.
// FABLE: synthwave music bed per world + boss theme.
import { settings } from '/shared/sd-kit.js';
let ctx = null, master = null, noise = null, verb = null;
function ensure() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return false; }
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 5;
    master = ctx.createGain(); master.connect(comp); comp.connect(ctx.destination);
    const b = ctx.createBuffer(1, ctx.sampleRate * 0.8, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; noise = b;
    // tiny feedback-delay "glass hall"
    verb = ctx.createDelay(0.5); verb.delayTime.value = 0.11; const fb = ctx.createGain(); fb.gain.value = 0.32; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    verb.connect(lp); lp.connect(fb); fb.connect(verb); const wet = ctx.createGain(); wet.gain.value = 0.35; lp.connect(wet); wet.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume();
  master.gain.value = settings.volume * 0.9; return settings.volume > 0;
}
addEventListener('pointerdown', ensure, { passive: true }); addEventListener('keydown', ensure);
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];
const nf = (i, base) => base * 2 ** (SCALE[Math.max(0, Math.min(SCALE.length - 1, i))] / 12);
function tone(f, { type = 'sine', dur = 0.2, vol = 0.2, at = 0, f1 = f, attack = 0.003, wet = true } = {}) {
  const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f1 !== f) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); if (wet) g.connect(verb); o.start(t); o.stop(t + dur + 0.05);
}
function hiss({ dur = 0.2, vol = 0.1, f0 = 3000, f1 = 800, type = 'bandpass', q = 1.5, at = 0 } = {}) {
  const t = ctx.currentTime + at, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noise; fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
}
let lastWall = 0, lastBreak = 0;
export const audio = {
  break(combo = 1, type = 'g') { if (!ensure()) return; const n = ctx.currentTime; if (n - lastBreak < 0.025) return; lastBreak = n; const f = nf(combo - 1, type === 's' ? 392 : 784); tone(f, { type: 'triangle', dur: 0.28, vol: 0.13 }); tone(f * 2.01, { dur: 0.18, vol: 0.05 }); tone(f * 3.97, { dur: 0.09, vol: 0.03 }); hiss({ dur: 0.16, vol: 0.09, f0: 7000, f1: 2500, q: 0.8 }); },
  crack() { if (!ensure()) return; tone(1400, { type: 'square', dur: 0.05, vol: 0.04, f1: 900, wet: false }); hiss({ dur: 0.07, vol: 0.06, f0: 5000, f1: 3000, q: 3 }); },
  clank() { if (!ensure()) return; tone(620, { type: 'square', dur: 0.12, vol: 0.05, f1: 600 }); tone(1650, { type: 'sine', dur: 0.2, vol: 0.04 }); },
  paddle(off = 0) { if (!ensure()) return; tone(260 + off * 40, { type: 'sine', dur: 0.12, vol: 0.2, f1: 180 }); tone(520 + off * 80, { type: 'triangle', dur: 0.06, vol: 0.06 }); },
  wall() { if (!ensure()) return; const n = ctx.currentTime; if (n - lastWall < 0.05) return; lastWall = n; tone(880, { type: 'sine', dur: 0.05, vol: 0.04, wet: false }); },
  explode() { if (!ensure()) return; tone(110, { type: 'sine', dur: 0.5, vol: 0.35, f1: 35 }); hiss({ dur: 0.45, vol: 0.22, f0: 2200, f1: 90, type: 'lowpass', q: 0.7 }); },
  power(kind) { if (!ensure()) return; const base = { multi: 523, laser: 659, wide: 440, slow: 392, life: 587 }[kind] || 523; [0, 4, 7, 12].forEach((s, k) => tone(base * 2 ** (s / 12), { type: 'triangle', dur: 0.3, vol: 0.09, at: k * 0.05 })); },
  laser() { if (!ensure()) return; tone(1800, { type: 'sawtooth', dur: 0.08, vol: 0.025, f1: 600, wet: false }); },
  lost() { if (!ensure()) return; tone(300, { type: 'sawtooth', dur: 0.6, vol: 0.08, f1: 60 }); hiss({ dur: 0.5, vol: 0.08, f0: 1200, f1: 100 }); },
  launch() { if (!ensure()) return; tone(330, { type: 'sine', dur: 0.18, vol: 0.12, f1: 660 }); },
  boss() { if (!ensure()) return; tone(90, { type: 'sawtooth', dur: 0.25, vol: 0.08, f1: 70 }); tone(180, { type: 'square', dur: 0.12, vol: 0.04 }); },
  bossDown() { if (!ensure()) return; tone(60, { type: 'sine', dur: 1.6, vol: 0.45, f1: 25 }); hiss({ dur: 1.4, vol: 0.25, f0: 4000, f1: 60, type: 'lowpass' }); [0, 4, 7, 11, 14, 19].forEach((s, k) => tone(nf(k, 523), { type: 'triangle', dur: 0.8, vol: 0.07, at: 0.3 + k * 0.09 })); },
  orb() { if (!ensure()) return; tone(220, { type: 'sine', dur: 0.3, vol: 0.06, f1: 440 }); },
  zap() { if (!ensure()) return; tone(160, { type: 'square', dur: 0.25, vol: 0.07, f1: 80 }); },
  sling() { if (!ensure()) return; tone(80, { type: 'sine', dur: 0.6, vol: 0.2, f1: 900 }); hiss({ dur: 0.5, vol: 0.1, f0: 200, f1: 6000 }); },
  clear() { if (!ensure()) return; [0, 4, 7, 12, 16, 19, 24].forEach((s, k) => tone(523 * 2 ** (s / 12), { type: 'triangle', dur: 0.5, vol: 0.09, at: k * 0.07 })); },
  star(k) { if (!ensure()) return; tone(nf(k * 2 + 4, 523), { type: 'triangle', dur: 0.5, vol: 0.12 }); },
};
