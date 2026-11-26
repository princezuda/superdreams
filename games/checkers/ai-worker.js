// Module Web Worker: runs the alpha-beta search off the main thread so the UI never freezes.
// Message in:  { id, state (serialized), level }   Message out: { id, move, score, depth, nodes, ms }
import { deserialize } from './rules.js';
import { createSearch } from './ai.js';

const search = createSearch();
self.onmessage = (e) => {
  const { id, state, level } = e.data;
  try {
    const r = search.think(deserialize(state), level);
    self.postMessage({ id, move: r.move, score: r.score, depth: r.depth, nodes: r.nodes, ms: r.ms });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.stack || err) });
  }
};
