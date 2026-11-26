// Skystack — Web Audio feedback: perfect drops climb a major-pentatonic ladder with the streak; cuts thunk; respects kit volume.
// FABLE: airy ambient music bed that thins out with altitude (wind → choir pad → space hum).
import { settings } from '/shared/sd-kit.js';
let ctx = null, master = null, noise = null;
function ensure() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return false; } const comp = ctx.createDynamicsCompressor(); master = ctx.createGain(); master.connect(comp); comp.connect(ctx.destination);
    const b = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; noise = b; }
  if (ctx.state === 'suspended') ctx.resume(); master.gain.value = settings.volume; return settings.volume > 0;
}
addEventListener('pointerdown', ensure, { passive: true }); addEventListener('keydown', ensure);
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];
function tone(f, { type = 'sine', dur = 0.3, vol = 0.15, at = 0, f1 = f, attack = 0.005 } = {}) { const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f1 !== f) o.frequency.exponentialRampToValueAtTime(f1, t + dur); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05); }
function hiss({ dur = 0.2, vol = 0.1, f0 = 2000, f1 = 500, q = 1, at = 0 } = {}) { const t = ctx.currentTime + at, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noise; fl.type = 'bandpass'; fl.Q.value = q; fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + dur); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(fl); fl.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05); }
export const audio = {
  perfect(streak = 1) { if (!ensure()) return; const i = Math.min(PENTA.length - 1, streak - 1), f = 440 * 2 ** (PENTA[i] / 12); tone(f, { type: 'triangle', dur: 0.45, vol: 0.16 }); tone(f * 2, { dur: 0.3, vol: 0.05 }); tone(f * 1.5, { dur: 0.5, vol: 0.04, at: 0.04 }); },
  cut(frac = 0.3) { if (!ensure()) return; tone(170 - frac * 60, { type: 'sine', dur: 0.18, vol: 0.28, f1: 80 }); hiss({ dur: 0.12, vol: 0.12, f0: 1800, f1: 400 }); },
  fall() { if (!ensure()) return; tone(260, { type: 'triangle', dur: 0.9, vol: 0.14, f1: 70 }); hiss({ dur: 0.8, vol: 0.08, f0: 1200, f1: 150 }); },
  milestone() { if (!ensure()) return; [0, 4, 7, 12, 16].forEach((s, k) => tone(523 * 2 ** (s / 12), { type: 'triangle', dur: 0.6, vol: 0.1, at: k * 0.09 })); },
  pop() { if (!ensure()) return; tone(900 + Math.random() * 600, { type: 'sine', dur: 0.25, vol: 0.06, f1: 300 }); hiss({ dur: 0.3, vol: 0.06, f0: 6000, f1: 1500 }); },
};
