// Sample score for /shared/sd-music.js — copy and rewrite per game. Check levels with:
//   node tools/music-check.mjs http://127.0.0.1:8099 /games/<id>/music.js
export const score = {
  tracks: {
    // Calm menu bed: slow pad, harp arpeggio, bell answer phrase.
    menu: { bpm: 72, key: 'D', scale: 'dorian', chords: ['0:7', '3:7', '5:7', '4:sus'], barsPerChord: 2, delay: 0.25,
      layers: [
        { inst: 'pad', vol: 0.8 },
        { inst: 'harp', pat: '0 . 2 . 1 . 3 . | 2 . 4 . 3 . 1 .', div: 8, vol: 0.7 },
        { inst: 'bell', pat: 's4 _ _ . s6 _ s7 _ | _ _ . . . . . . | s9 _ _ . s7 _ s6 _ | s4 _ _ _ . . . .', div: 8, octave: 4, vol: 0.5 },
        { inst: 'sub', play: 'root', vol: 0.6 },
      ] },
    // Play loop: light groove; a lead and fuller drums join when intensity rises (close to the goal).
    play: { bpm: 104, key: 'D', scale: 'dorian', chords: [0, 3, 5, 4], swing: 0.12,
      layers: [
        { inst: 'pad', vol: 0.55 },
        { inst: 'bass', pat: '0 . . 0 . . 2 . | 0 . . 0 . 1 . .', vol: 0.9 },
        { inst: 'pluck', pat: '0 2 1 2 3 2 1 2', div: 8, vol: 0.6, pan: -0.3 },
        { inst: 'kick', pat: 'x-------x-----x-' }, { inst: 'hat', pat: '--x---x---x---xo', vol: 0.8 },
        { inst: 'snare', pat: '----x-------x---', at: 0.5 }, { inst: 'shaker', pat: 'x-xxx-xxx-xxx-xx', at: 0.6, vol: 0.7, pan: 0.4 },
        { inst: 'lead', pat: 's7 _ s6 s4 _ . s2 _ | s4 _ _ . . . s6 s7 | s9 _ s7 s6 _ . s4 _ | s2 _ _ _ . . . .', div: 8, at: 0.7, vol: 0.6 },
      ] },
  },
  stings: {
    collect: { inst: 'bell', pat: 's4 s7 s9', div: 16, bpm: 140, key: 'D', scale: 'dorian', octave: 5 },
    win: { bpm: 126, key: 'D', scale: 'major', chords: [0, 3, 4, 0], barsPerChord: 0.5, bars: 2,
      layers: [{ inst: 'brass', pat: '0 . 1 2 | 2 _ 1 2 | 3 _ _ _ | _ . . .', div: 8, octave: 4 }, { inst: 'strings', pat: 'c _ _ _ c _ _ _ c _ _ _ c _ _ _', div: 8 }, { inst: 'timpani', pat: 's0 . . . s4 . . . s0 _ _ _', div: 8 }, { inst: 'cymbal', pat: '--------x-------', div: 8 }] },
  },
};
