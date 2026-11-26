// Scripted walkthrough runner — shared by the in-browser __cam.game.solveAll() and the node logic tests.
import { SCENES } from './story.js';

export async function runOps(E, ops, host, log = () => {}) {
  const problems = [];
  for (const op of ops) {
    const [kind, a, b] = op;
    const sc = SCENES[E.s.scene];
    const choices = op.slice(kind === 'item' || kind === 'combine' ? 3 : 2);
    host.queue = choices.slice();
    const need = (cond, msg) => { if (!cond) problems.push(`[${E.s.scene}] ${JSON.stringify(op)}: ${msg}`); return cond; };
    if (kind === 'go') { await E.run(() => E.enter(a, 'map')); }
    else if (kind === 'exit') { if (need(sc.exits[a], 'no such exit')) await E.interact(a, 'walk'); }
    else if (kind === 'item') { if (need(E.s.inv.includes(a), 'item not held') && need(sc.hot[b], 'no such hotspot')) await E.interact(b, 'use', a); }
    else if (kind === 'combine') { if (need(E.s.inv.includes(a) && E.s.inv.includes(b), 'combine items not held')) await E.combine(a, b); }
    else { if (need(sc.hot[a], 'no such hotspot') && need(E.hotVisible(E.s.scene, a), 'hotspot hidden')) await E.interact(a, kind); }
    host.queue = [];
    log(op, E.s);
  }
  return problems;
}
