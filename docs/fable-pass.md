# Fable pass — animation & music backlog

One batched pass over all launch games. Each list comes from the game's `meta.json` `fablePass`; code locations are the `// FABLE:` markers (`grep -rn "FABLE:" games/<id>`).

## Checkers: Event Horizon (`games/checkers`) — 7 markers
- Music: no score yet — needs a calm parlour/ambient bed per theme plus tension layers when a hazard is telegraphed (FABLE: music).
- Black hole opening: gravitational-wave ripple across the board + sub-bass hit (main.js holeOpenAnim).
- Spaghettification: true vertex-level tidal stretch along the infall spiral instead of an affine stretch (main.js suckAnim).
- Capture: rigid-body tumble of the taken piece onto the side stack with a proper clack (main.js capture).
- Coronation: light shaft, choir sting and slow-mo crown spin when a man is crowned (main.js promoteAnim).
- Graves: a spectral ghost (cloth/face) curling out of a crumbling tombstone instead of particle wisps (fx.js GravesFX.fade).
- Victory: bespoke celebration — pieces leap and spin, fireworks, music sting (main.js celebrate).

## Chess: Worlds (`games/chess`) — 6 markers
- Capture choreography per world: the capturing piece strikes (knight rears, dragon breathes, ship fires), hit-stop and a camera punch-in before each capture effect
- Promotion transformation: the pawn ascends in a column of light and the new piece materialises with a world-specific flourish
- Checkmate / victory sequence: the mated king topples in slow motion with a cinematic orbit, then a fanfare
- Idle life for pieces: breathing glows, hovering ships bob, dragons blink, crystals rotate, flames flicker on Fantasy torches
- Music: one ambient bed per world (study fireplace & piano, space drone, galactic choir pad, synthwave grid, medieval lute & wind, arcane chimes) ducked under SFX
- Check alert: a sting plus a world-specific pulse across the board, not just the king glow
- Menu attract mode: a short scripted famous game (e.g. the Opera Game) played in the background world

## Neon Drift (`games/drift-snake`) — 2 markers
- Music: driving synthwave bed with tempo tied to length
- Head: animated comet flare + light-wake ripples on the grid
- Finale: three charged planets orbiting in a camera flyby
- Crash: slow-motion shatter of the trail into sparks

## Gem Garden (`games/gem-garden`) — 4 markers
- Music: gentle garden bed per zone (meadow, orchard, pond, moon), ducked under cascades
- Plant growth: replace the scale-pop grow-in with staged sprout→bud→bloom animation
- Gem idle: occasional glint sweep across random gems; special-gem creation flourish
- Finale: choreographed Moon Gate opening and firefly swarm
- Map: butterflies and bees following the path; character mascot walking to the next node

## The Hollow Crown (`games/hollowcrown`) — 1 markers
- Hand-keyed character animation: walk/run cycles, talk gestures, reach/pick-up, idle fidgets (actors.js procedural rig is the placeholder)
- Lip-sync / mouth shapes for NPCs and Grumbleroot's bark face
- Cape and banner cloth simulation
- Music: a theme per chapter, leitmotifs for Corvin and the Crown's song, coronation finale
- Ambient soundscapes per scene (river, sea, birds, tavern choir) and voiced narrator
- Cutscene choreography: Corvin swooping to the mirror, the lighthouse beam reveal, the epilogue coronation

## Prism Breaker (`games/prism-breaker`) — 2 markers
- Music: synthwave bed per world, boss theme with intensity layers tied to core HP
- Boss: animated core phases (shield unfolding, charge-up tell before orb volleys)
- Paddle: squash/stretch + thruster flare when moving fast
- Finale: the three cores reassemble into a rotating prism; camera pull-back
- Gravity Well: lensing distortion of the starfield around the horizon

## Skyharbor (`games/skyharbor`) — 6 markers
- Music: ambient bed per planet type, wonder-completion fanfare, festival theme
- Wonder completion cinematic: choreographed camera + scaffold collapse
- Visitor ship landing/take-off animation (gear, thrusters, dust) and crowd walk cycles
- Construction cranes and scaffold animation for buildings and wonders
- Per-landmark ambient sound (Helix hum, falls, lantern crackle)
- Galaxy-to-planet descent transition (atmosphere entry)

## Skystack (`games/skystack`) — 1 markers
- Music: airy ambient bed that thins with altitude (wind → choir pad → space hum)
- Slab land: squash-and-settle animation and dust puff on cuts
- Sky: birds near the Treetops, aircraft contrails in the Stratosphere, satellite at Orbit
- Game over: tower-top camera fly-down with the run's highlights

## Solitaire Suite (`games/solitaire`) — 1 markers
- Music: soft lounge loop
- Card pickup tilt + physically lit 3D flip
- Win cascade: optional confetti + table glow
- Court cards: illustrated portraits replacing the geometric busts

## Starwake (`games/starwake`) — 6 markers
- Music: ambient space score per faction space, combat stingers, docking/hangar theme, finale track
- Animation: pilot hands on stick/throttle in cockpit, hangar crane + crew, docking clamps, capital-ship turret slew and breakup sequence
- Voice-style comms barks with radio filter
- Richer explosion flipbooks and capital-ship debris chunks

## Strikepoint (`games/strikepoint`) — 2 markers
- Authored character animation: walk/run/crouch-walk cycles, cover peeks, reloads, grenade throws, hit reactions and ragdoll-style deaths (actors.js FABLE markers)
- First-person animation polish: hand-keyed reloads per weapon, inspect, sprint-in/out, melee swing (weapons.js)
- Music: menu theme, mission-start stingers, combat intensity layers, Overseer boss theme, holdout wave stinger, Dropzone storm-phase cues
- Overseer gunship rotor/armour-plate animation and crash sequence (boss.js)
- Voice-acted squad barks and radio chatter to replace text callouts
