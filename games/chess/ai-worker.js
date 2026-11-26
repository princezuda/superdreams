// Chess: Worlds — AI Web Worker (module worker). The page never blocks: all search runs here.
// in:  { id, startFen, moves:[uci...], level }      out: { id, uci, san, score, depth, nodes, ms, pv, eval }
import { position, think, formatScore, evaluate } from './search.js';

self.onmessage = (e) => {
  const { id, startFen, moves, level } = e.data || {};
  try {
    const c = position(startFen, moves || []);
    const r = think(c, level || 'medium');
    if (!r) { self.postMessage({ id, uci: null }); return; }
    self.postMessage({ id, uci: c.uci(r.move), san: c.san(r.move), score: r.score, scoreText: formatScore(r.score, c.turn), depth: r.depth, nodes: r.nodes, ms: r.ms, pv: r.pv, eval: evaluate(c) });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
