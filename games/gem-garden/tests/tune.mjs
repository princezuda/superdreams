// Design-first tuning: each level has a designed move budget M. Score/collect targets are derived so the "mid" bot
// (60% goal-aware greedy, 40% biggest-match) reaches them at the zone's target rate; other goals report the win rate at M
// and the moves the bot needed, so content can be adjusted by hand. node games/gem-garden/tests/tune.mjs [seeds] [from] [to]
import * as L from '../logic.js';
import { LEVELS } from '../levels.js';
const N = +(process.argv[2] || 20), from = +(process.argv[3] || 1), to = +(process.argv[4] || 40);
const SCALE = { 5: 1.12, 12: 0.92, 15: 1.08, 17: 1.04, 26: 1.0, 29: 0.9, 35: 0.88 };
const rate = (k) => (k <= 3 ? 0.97 : k <= 10 ? 0.9 : k <= 20 ? 0.8 : k <= 30 ? 0.72 : k === 40 ? 0.58 : 0.64);
const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.max(0, Math.min(a.length - 1, Math.floor(p * a.length)))];
function play(lv, s, stopWhenWon) {
  const st = L.createState(lv, 7000 + s * 13); const r = L.makeRng(99 + s); let usedToWin = -1;
  while (st.moves > 0) { if (L.levelWon(st)) { if (usedToWin < 0) usedToWin = st.movesUsed; if (stopWhenWon) break; } const m = L.rnd(r) < 0.6 ? L.bestMove(st) : L.hintMove(st); if (!m) break; L.swap(st, ...m); }
  if (L.levelWon(st) && usedToWin < 0) usedToWin = st.movesUsed;
  return { st, usedToWin };
}
const out = {};
for (let k = from; k <= to; k++) {
  const lv = structuredClone(LEVELS[k - 1]); const M = lv.moves; const r100 = (v) => Math.round(v / 100) * 100;
  const g0 = lv.goals[0];
  if (lv.goals.every((g) => g.type === 'score' || g.type === 'collect') && !(k === 26)) {
    // run all M moves with no goal (open), measure score + collected
    const open = { ...lv, goals: [{ type: 'score', target: 1e12 }] };
    const runs = []; for (let s = 0; s < N; s++) runs.push(play(open, s, false).st);
    const q = 1 - rate(k);
    lv.goals = lv.goals.map((g) => g.type === 'score' ? { ...g, target: r100(pct(runs.map((st) => st.score), q) * 0.92 * (SCALE[k] || 1)) } : { ...g, n: Math.max(8, Math.round(pct(runs.map((st) => st.collected[g.c]), q) * 0.92 * (SCALE[k] || 1))) });
  }
  const res = []; for (let s = 0; s < N; s++) { const { st, usedToWin } = play(lv, s, true); const won = L.levelWon(st); if (won) L.bonusRound(st); res.push({ won, used: usedToWin, score: st.score }); }
  const wr = res.filter((r) => r.won).length / N, used = res.filter((r) => r.won).map((r) => r.used);
  const sc = res.filter((r) => r.won).map((r) => r.score); const s1 = lv.goals.find((g) => g.type === 'score')?.target || 0;
  const stars = [s1, r100(Math.max(s1 * 1.25, pct(sc, 0.3) || 0)), r100(Math.max(s1 * 1.6, pct(sc, 0.75) || 0))];
  out[k] = { moves: M, goals: lv.goals, stars };
  console.error(`L${k} M${M} win ${(wr * 100) | 0}% (want ${(rate(k) * 100) | 0}) used p50 ${pct(used, 0.5)} p90 ${pct(used, 0.9)} goals ${JSON.stringify(lv.goals)} stars ${stars.join('/')}`);
}
console.log(JSON.stringify(out));
