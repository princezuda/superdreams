// Gem Garden — small Web Audio synth for pitched, musical match feedback (cascades climb a pentatonic scale).
// Respects the kit's shared volume setting. FABLE: music bed + richer foley in the audio pass.
import { settings } from '/shared/sd-kit.js';
let ctx = null, master = null, comp = null, noise = null;
function ensure() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return false; }
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
    master = ctx.createGain(); master.connect(comp); comp.connect(ctx.destination);
    const b = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; noise = b;
  }
  if (ctx.state === 'suspended') ctx.resume();
  master.gain.value = settings.volume * 0.9;
  return settings.volume > 0;
}
addEventListener('pointerdown', ensure, { passive: true }); addEventListener('keydown', ensure);
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
function tone(f, { type = 'sine', dur = 0.2, vol = 0.2, at = 0, f1 = f, attack = 0.004, q = 0, filt = 0 } = {}) {
  const t = ctx.currentTime + at; const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f1 !== f) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let n = o; if (filt) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = filt; fl.Q.value = q; o.connect(fl); n = fl; }
  n.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function hiss({ dur = 0.2, vol = 0.1, f0 = 2000, f1 = 600, type = 'bandpass', q = 1.2, at = 0 } = {}) {
  const t = ctx.currentTime + at; const s = ctx.createBufferSource(); s.buffer = noise; const fl = ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + dur); const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
}
const note = (i, base = 523.25) => base * 2 ** (PENTA[Math.max(0, Math.min(PENTA.length - 1, i))] / 12);
let lastLand = 0;
export const audio = {
  pop(cascade = 1, k = 0) { if (!ensure()) return; const f = note(cascade - 1 + (k % 2)); tone(f, { type: 'triangle', dur: 0.16, vol: 0.16 }); tone(f * 2, { dur: 0.09, vol: 0.05 }); hiss({ dur: 0.07, vol: 0.05, f0: 5000, f1: 2000 }); },
  swap() { if (!ensure()) return; hiss({ dur: 0.12, vol: 0.06, f0: 900, f1: 2600 }); tone(330, { type: 'sine', dur: 0.08, vol: 0.06, f1: 440 }); },
  bad() { if (!ensure()) return; tone(220, { type: 'triangle', dur: 0.12, vol: 0.12, f1: 180 }); tone(208, { type: 'triangle', dur: 0.12, vol: 0.1, at: 0.09, f1: 160 }); },
  land() { if (!ensure()) return; const n = ctx.currentTime; if (n - lastLand < 0.045) return; lastLand = n; tone(180 + Math.random() * 40, { type: 'sine', dur: 0.05, vol: 0.05, f1: 120 }); },
  select() { if (!ensure()) return; tone(880, { type: 'sine', dur: 0.06, vol: 0.06 }); },
  line() { if (!ensure()) return; hiss({ dur: 0.35, vol: 0.14, f0: 400, f1: 6000, q: 2 }); tone(300, { type: 'sawtooth', dur: 0.3, vol: 0.05, f1: 1400, filt: 3000 }); },
  bomb() { if (!ensure()) return; tone(120, { type: 'sine', dur: 0.4, vol: 0.35, f1: 40 }); hiss({ dur: 0.35, vol: 0.2, f0: 1500, f1: 120, type: 'lowpass' }); },
  prism() { if (!ensure()) return; [0, 2, 4, 5, 7, 9].forEach((s, k) => tone(note(s, 660), { type: 'triangle', dur: 0.35, vol: 0.07, at: k * 0.04 })); hiss({ dur: 0.5, vol: 0.06, f0: 8000, f1: 3000 }); },
  nova() { if (!ensure()) return; tone(80, { type: 'sine', dur: 0.9, vol: 0.4, f1: 30 }); [0, 4, 7, 12, 16].forEach((s, k) => tone(note(s, 440), { type: 'triangle', dur: 0.6, vol: 0.08, at: 0.1 + k * 0.06 })); },
  make() { if (!ensure()) return; tone(note(7, 880), { type: 'sine', dur: 0.25, vol: 0.08 }); tone(note(9, 880), { type: 'sine', dur: 0.3, vol: 0.06, at: 0.06 }); },
  vine() { if (!ensure()) return; hiss({ dur: 0.18, vol: 0.09, f0: 3000, f1: 900, q: 0.8 }); },
  bramble() { if (!ensure()) return; hiss({ dur: 0.14, vol: 0.14, f0: 1800, f1: 300, q: 3 }); tone(160, { type: 'square', dur: 0.06, vol: 0.04, filt: 900 }); },
  seed() { if (!ensure()) return; [0, 4, 7, 12].forEach((s, k) => tone(note(s, 523), { type: 'sine', dur: 0.4, vol: 0.1, at: k * 0.07 })); },
  star(k) { if (!ensure()) return; tone(note(k * 2 + 4, 523), { type: 'triangle', dur: 0.5, vol: 0.14 }); tone(note(k * 2 + 6, 523), { type: 'sine', dur: 0.5, vol: 0.06, at: 0.05 }); },
  grow() { if (!ensure()) return; [0, 2, 4, 7, 9, 12, 14].forEach((s, k) => tone(note(s, 392), { type: 'sine', dur: 0.45, vol: 0.07, at: k * 0.08 })); hiss({ dur: 0.8, vol: 0.04, f0: 600, f1: 5000 }); },
  bonus(k) { if (!ensure()) return; tone(note(k % 12, 660), { type: 'triangle', dur: 0.2, vol: 0.09 }); },
};
