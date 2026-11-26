# Fable pass — common brief (animation + music)

You are doing the animation and music pass for ONE Super Dreams game. The game is already complete and
tested; your job is to make it move and sound like a finished AA/AAA title without breaking anything.

## Read first
- `docs/fable-pass.md` — your game's backlog; `grep -rn "FABLE:" games/<id>` — the code spots.
- `shared/sd-music.js` (header comment = full score format) and `games/_template/music.js` (sample score).
- `shared/sd-anim.js` (springs, keyframes, squash/hop, `cine` camera, `ik2`/`gait`, `rope`/`cloth`) and the kit's
  `tween` (promise with `.cancel()`), `wait`, `hitstop(ms)`, `slowmo(scale, sec)`, more `ease` curves, `audio()`.
- `skills/amazing-game-development/SKILL.md` for the r187 rules. Game rules/tests stay untouched.

## Music — compose it, don't fill it in
- Put the score in `games/<id>/music.js` (`export const score`). One `createMusic(score)` per game.
- A track per context (menu, each world/biome/chapter, tension/combat, boss, shop/safe, finale). Give the game ONE
  memorable motif and bring it back transformed (menu statement, play variation, victory fanfare).
- Every track needs the four roles: bass, harmony, melody/hook, rhythm (rhythm may be very light for calm games).
  Real progressions (4–8 chords, use sevenths/sus), a mode chosen for mood, 8–16 bar forms: use `bars` masks so
  melodies rest and answer rather than loop every bar. Different key/tempo/instrumentation per context.
- Tie `music.intensity()` to game state (danger, combo, low health, final lap, boss HP) and use `at`/`upTo` layers.
  `music.tempo()` where speed is the game. Stings for payoffs (capture, win, lose, level up, discovery), short.
- It must never fatigue: sparse, mid-volume, space between phrases. Calm games stay calm.
- Ambience (`createAmbience`) for places; blip voices (`speak`) for characters/radio where the game has dialogue.
- If the game opened its own AudioContext, move it onto the kit's `audio()` graph if that is low-risk.
- Check: `node tools/music-check.mjs http://127.0.0.1:<port> /games/<id>/music.js` — no SILENT/HOT flags, track rms
  about 0.08–0.16, 0 errors. Music must start only after a user gesture (the kit handles this) and follow the
  Music slider (`settings.music`, automatic).

## Animation — author it
- Every verb gets anticipation → action → follow-through/settle; arcs not straight lines; overlap between parts;
  squash & stretch on impacts; timing varied by weight. Idle life everywhere (breathing, blinking, sway, flicker).
- Payoff moments (win, boss kill, discovery, promotion, level clear) get a short choreographed sequence:
  `hitstop`/`slowmo`, a `cine` camera move (skippable, letterboxed), particles, a sting. 1–4 seconds, never longer
  unless it is a story cutscene.
- Characters: replace placeholder bobbing with real cycles (use `gait` + `ik2`, or keyframes via `keys`), secondary
  motion with `rope`/`cloth`/springs.
- Never delay input: gameplay animation must not block the next input for more than ~150 ms. Honour
  `settings.reducedMotion` (cut camera moves, shorten flourishes) and the shake/flash toggles.
- No per-frame allocations in new code; keep the draw-call budget.

## Verify (non-negotiable)
- Existing node tests still pass; the automated play-through still ends with 0 page errors.
- Add test hooks to freeze or step an animation (e.g. `__cam.game.pose(name, k)`), screenshot key frames mid-motion
  with `?webgl`, and look at each twice: is the pose readable, does anything clip, float or pop?
- `tools/start-shot.mjs` clicks start and screenshots. CPU rendering is slow (1–5 s/frame): drive with hooks.

## Rules
- Touch ONLY `games/<id>/`. Do NOT commit. Scratch files only in your own scratchpad sub-folder.
- When done: remove or rewrite the `// FABLE:` markers you resolved, and in `meta.json` replace `fablePass` with
  what is still open (if anything) and add `"audio": { "music": true }`.
- Report in ≤ 300 words: what you composed (tracks, motif), what you animated, what you verified and how,
  what is still weak, kit changes you want.
