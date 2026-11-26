// Solitaire Suite — card foley synthesised with Web Audio (place, flip, slide, foundation chime climbing with rank).
// FABLE: soft lounge music bed.
import { settings } from '/shared/sd-kit.js';
let ctx = null, master = null, noise = null;
function ensure() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return false; } master = ctx.createGain(); master.connect(ctx.destination);
    const b = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length); noise = b; }
  if (ctx.state === 'suspended') ctx.resume(); master.gain.value = settings.volume; return settings.volume > 0;
}
addEventListener('pointerdown', ensure, { passive: true }); addEventListener('keydown', ensure);
function hiss(dur, vol, f0, f1, type = 'bandpass', at = 0) { const t = ctx.currentTime + at, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noise; f.type = type; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05); }
function tone(f, dur, vol, type = 'sine', at = 0) { const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05); }
export const audio = {
  place() { if (!ensure()) return; hiss(0.07, 0.25, 1800, 400, 'lowpass'); tone(140, 0.05, 0.05); },
  flip() { if (!ensure()) return; hiss(0.05, 0.12, 4000, 2000); },
  slide() { if (!ensure()) return; hiss(0.12, 0.08, 900, 3000); },
  found(r = 1) { if (!ensure()) return; const f = 523 * 2 ** ([0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21][r - 1] / 12); tone(f, 0.35, 0.09, 'triangle'); tone(f * 2, 0.2, 0.03); hiss(0.05, 0.12, 1800, 500, 'lowpass'); },
  shuffle() { if (!ensure()) return; for (let k = 0; k < 14; k++) hiss(0.03, 0.08, 3000, 1500, 'bandpass', k * 0.035); },
  bad() { if (!ensure()) return; tone(180, 0.12, 0.08, 'triangle'); tone(150, 0.14, 0.06, 'triangle', 0.08); },
  run() { if (!ensure()) return; [0, 4, 7, 12].forEach((s, k) => tone(523 * 2 ** (s / 12), 0.4, 0.08, 'triangle', k * 0.06)); },
  bounce() { if (!ensure()) return; hiss(0.04, 0.06, 2500, 900, 'lowpass'); },
};
