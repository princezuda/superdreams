// Mate-in-2 puzzles. Every position was verified exhaustively with engine.js (see perft.mjs / report):
// no mate-in-1 exists, and the listed key is the ONLY first move that forces mate against every defence.
export const PUZZLES = [
  { name: "Philidor's Legacy", fen: '5r1k/6pp/7N/8/2Q5/8/5PPP/6K1 w - - 0 1', key: 'Qg8+', hint: 'The queen is a decoy. The knight does the rest.' },
  { name: "Morphy's Opera Game", fen: '4kb1r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 1 16', key: 'Qb8+', hint: 'Paris, 1858. Deflect the knight that guards d8.' },
  { name: "Légal's Mate", fen: 'r2qkbnr/ppp2ppp/2np4/4N3/2B1P1b1/2N5/PPPP1PPP/R1BbK2R w KQkq - 0 6', key: 'Bxf7+', hint: 'Your queen is gone. Who needs her?' },
  { name: "Boden's Mate", fen: '2kr4/pp1n1ppp/2n5/8/5B2/5Q2/PPP2PPP/5BK1 w - - 0 1', key: 'Qxc6+', hint: 'Two bishops on crossing diagonals.' },
  { name: "Anastasia's Mate", fen: '5r1k/pp2N1pp/8/7Q/8/3R4/5PPP/6K1 w - - 0 1', key: 'Qxh7+', hint: 'Open the h-file at any price.' },
  { name: "Greco's Mate", fen: 'rq3r1k/ppp3pp/8/5P1Q/2B5/3R4/PPP3PP/6K1 w - - 0 1', key: 'Qxh7+', hint: 'The bishop already guards g8.' },
  { name: 'The Royal Hunt', fen: 'r5k1/pp3p2/6pQ/6N1/8/8/PP3PPP/6K1 w - - 0 1', key: 'Qh7+', hint: 'Drive the king toward the knight.' },
];
