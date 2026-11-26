---
name: amazing-game-development
description: Hub for AAA browser-game development (Three.js, Canvas 2D, WebGL, Tone.js) — the global render stack, game-feel rules, single-file delivery format, failure modes, and the audit checklist that apply to EVERY game, plus a routing map to focused sub-skills for each domain. Use this skill whenever building, polishing, upgrading, or reviewing ANY game, interactive scene, or game asset — especially when the user says "AAA", "professional", "polished", "juice", "game feel", "make it look amazing/better", "studio quality", mentions Superdreams, World Forge, or game generation loops, or asks what a game is missing. Even casual one-line requests like "make me a fun little game" should use this skill so the result clears a professional bar. Load this first; it points you to the sub-skill the specific task needs.
---

# Amazing Game Development

The professional quality bar for browser games, plus a map to the focused sub-skills that carry the implementation detail. This skill holds only what applies to **every** game; everything domain-specific lives in a sub-skill it points to (see the Skill Map at the bottom). Three jobs:

1. **Apply the quality bar** — the global stack and audit checklist below, by default, not on request.
2. **Speak the language** — full terminology in `glossary-for-triple-a-games` (read the section you need).
3. **Build it to run** — the single-file delivery format and failure modes below; subsystems in the sub-skills.

## The Proven Global AAA Stack (apply to every 3D/Three.js scene)

These seven upgrades were battle-tested in the World Forge engine and are worth roughly +30% perceived quality on ANY scene before touching a single asset. Apply all of them unless the user opts out:

1. **Real-time soft shadows** — `renderer.shadowMap.enabled = true`, `type = PCFSoftShadowMap`. One directional "sun" casts (`castShadow`, 1024 map, generous ortho frustum), ground receives. Skip sprites, transparent materials, and silhouette planes.
2. **ACES filmic tone mapping + sRGB** — `renderer.toneMapping = ACESFilmicToneMapping`, `toneMappingExposure ≈ 1.05`, `outputEncoding = sRGBEncoding`. Instantly cinematic color; crushed blacks and rolled highlights instead of flat linear output.
3. **Vignette + film grain** — CSS overlays, zero GPU cost. Radial-gradient darkening at edges (~38% at corners) plus an SVG `feTurbulence` noise tile at ~5% opacity with `mix-blend-mode: overlay`.
4. **Pointer parallax** — lerp the camera a small amount toward the cursor (±0.6 world units), plus a slow sine "camera breathing" drift. Stillness reads as dead; micro-motion reads as alive.
5. **Aerial-perspective haze** — two large translucent fog-colored planes at mid and far depth. Separates depth layers the way real atmosphere does. Pair with `FogExp2` matched to the sky palette.
6. **Ambient dust motes** — ~26 tiny slow-drifting white particles in every scene regardless of theme. Subliminal volume cue.
7. **Three-point light rig** — hemisphere (sky/ground colors) + directional key + dim opposed rim/fill + low ambient. Never a single light.

For 2D/Canvas/SVG games the equivalents are: layered parallax backgrounds, a vignette div, palette-locked gradients instead of flat fills, idle micro-animation on everything organic, drop shadows or contact darkening under characters, and particles on every player action.


## Game Feel Rules (every playable game, every genre)

Read `references/glossary.md` § Game Feel for the full list. Non-negotiables:

- **Respond in under 100ms** to every input with at least two channels (visual + audio).
- **Juice every state change**: particles, squash-and-stretch, screen shake (small!), hitstop on impacts, tweened UI — never instant teleports or hard cuts.
- **Forgive the player**: coyote time (~80–120ms), input buffering (~120ms), generous hitboxes for the player, stingy ones for hazards.
- **Frame-rate independence**: all movement scaled by delta time; clamp dt to avoid spiral-of-death.
- **Audio is half the feel**: Tone.js synth SFX for every action, a ducking music layer, pitch-randomize repeated sounds ±10%.
- **Accessibility is AAA**: difficulty options, colorblind-safe palettes, shake/flash toggles, remappable or simple inputs, scalable text. Cheap to add early, impossible to bolt on late.


## Single-File Delivery (self-contained HTML)

The whole experience can ship as one `.html` file — no build step, no server, no npm. Open it, it runs. Three blocks do everything:

- **`<style>`** — all CSS: layout, HUD, chat/inventory panels, vignette and overlays, every animation.
- **`<script type="importmap">`** — maps `three` and `three/addons/` to CDN URLs so ES-module imports resolve with no bundler.
- **`<script type="module">`** — all logic: scene, procedural world, systems, controls, UI.

What the format costs, and how it stays compatible with the rules above:

- **Nothing loaded from disk.** Geometry for *form* (boxes, cylinders, spheres, cones, tori); canvas-painted textures as alpha-tested cutouts for *silhouette detail* (fronds, fur, foliage edges), exactly as in **Asset Quality Rules**. The constraint is "no files," not "no textures" — cones-and-spheres alone still look wrong, so the canvas-cutout escape hatch is mandatory, not optional.
- **All audio synthesized at runtime** (Web Audio API, no audio files). Ambient beds are cheap: layered sine oscillators through a low-pass for drones, looped white noise through a band-pass for wind. Tone.js is still the better tool for *gameplay* SFX per **Game Feel Rules**; raw Web Audio is the zero-dependency fallback for the ambient layer. For outdoor/natural scenes, add **ecological audio**: schedule cricket chirps and owl calls on randomized intervals with `setInterval` + `Math.random() < probability` guards — see **Ecological Audio** below.
- **No external calls** — no AI APIs, no database, no networking. Keyword-matched NPC dialogue is not model inference; present it as what it is rather than implying real AI. No persistence unless you add `localStorage`; single-player only.
- **No physics engine** — collision is manual (see **Interaction & Game Systems**); particle drift is the only "gravity."

**Budget:** a full experience — first-person world, several NPCs, a quest chain, inventory, 150+ instanced trees, shader sky and water, hundreds of particles — lands around **28–32 KB** of code and holds 60 fps on mid-range hardware. Far over that with less on screen means you're duplicating geometry where you should be instancing.


## Known Failure Modes

The bugs that recur in single-file browser games — mostly pointer-lock and input plumbing, the rest render-loop robustness. Verify each before shipping. (The custom-shader render loop has its own robustness note under **Custom-Shader Surfaces**.)

| Symptom | Cause | Fix |
|---|---|---|
| Start button does nothing | `requestPointerLock()` throws when called from a non-canvas click handler | Separate start logic from the lock request; register the handler both inline (`onclick`) and via `addEventListener` |
| Movement dead after start | Movement gated behind pointer-lock state | Decouple WASD from lock state — process movement whenever the game is running |
| WASD leaks while typing in chat | No `stopPropagation` on the chat input | `e.stopPropagation()` on chat-input keydown |
| Pointer lock gets stuck | Lock not released/reclaimed around modal UI | Track `isChatOpen` / `isInvOpen`; release on open, re-request on close, check state before requesting |
| Black screen | Shader compile error or unset uniform | Keep GLSL simple, avoid dynamic branching on complex conditions, verify every uniform is set |
| Frame rate tanks | Too many draw calls / high poly / uncapped DPR | Instance repeated geometry, `Points` for particles, cap `devicePixelRatio` at 2, limit shadow-map size and geometry segments |


## Live Parameter Panels

For showcases and tooling, couple ONE input to ALL downstream systems. A "Time of Day" slider should drive sun elevation → sky uniforms → light color → fog → exposure → bloom simultaneously, through a single `updateSceneFromSliders()` called on every `input` event and once on init. Set uniforms piecemeal across scattered handlers and the scene drifts out of sync at some settings. Frosted-glass panel, sliders labeled with the computed value ("Golden Hour", "5 m/s") rather than the raw number.

## AAA Audit Checklist

Before calling any game or scene done, verify and report the universal rows; pull the domain row from the relevant sub-skill.

```
RENDER   shadows · ACES tone mapping · vignette/grain · pointer parallax · depth haze · 3-point rig
MOTION   ambient animation everywhere · eased tweens (never linear) · idle states · delta time · day/night palette lerp
FEEL     <100ms two-channel feedback · juice every state change · forgiveness (coyote/buffer) ·
         no dead input · quest payoff = multi-system scene change
ART      silhouette readability · palette discipline (≤5 hues + accents) · cluster variance ·
         focal hierarchy · canvas-painted procedural detail textures (not flat fills)
AUDIO    SFX per verb · ambient bed · ecological layer · pitch variance
UX       onboarding inside play · readable HUD · fail states that teach ·
         accessibility (difficulty/colorblind/shake toggles) · save where session > 3 min
PERF     60fps / 16.6ms budget · pooled particles · batched draws · DPR capped at 2 ·
         dispose geometries/materials on scene swap · synchronous first frame + rAF→timer watchdog
SHIP     seeded determinism for shareable variations · share/export ·
         resetGame() clears all arrays + Object.assign(state, defaults)
```

Domain-specific audit rows live with their skills: custom shaders / raw WebGL / Preetham sky → `webgl2-pipeline`; water + raymarched scenes → `amazing-game-development-ocean`; controls/loop/state/mobile → `first-person-controls`; shooter combat + HUD → `fps-combat-systems`; procedural terrain/props/particles → `procedural-3d-world`; top-down 2D → `canvas-2d-game-engine`; retro → `pixel-art-games`.

If asked "how much did it improve," estimate per-area percentage deltas honestly and label them as your assessment, not a benchmark.

## How to Use the Glossary

`references/glossary.md` is organized by domain with a TOC: **Rendering & Graphics · Lighting · Animation · Game Feel & Juice · Game Design · Systems & Architecture · Audio · Art Direction · UI/UX · Performance (Web) · Production & Live Ops · Web-Stack Specifics · Custom-Shader & WebGL Surfaces**. Each term gets a one-line definition plus, where it matters, the browser-stack implementation note. Read only the sections relevant to the task; cite terms by name in code comments and explanations so users absorb the vocabulary.

When writing prompts for an AI generation loop (Superdreams-style multi-pass refinement), pull the relevant glossary section INTO the prompt — a model told to "add PCF soft shadows, ACES tone mapping, aerial-perspective haze, and coyote time" produces dramatically better output than one told to "make it look nice and feel good."

## Skill Map — load what the task needs

These skills cross-reference each other. Load the one matching the task and follow its "Related skills" pointers. It's one body of knowledge, split so each piece loads fast and stays under size limits.

| Building / need | Load |
|---|---|
| The global render stack (this page) on any 3D scene | (here) |
| Minimal/quick AAA, no full library | `minimal-aaa-game-dev` |
| First-person/3D base: controller, loop, state, save, navigation, mobile touch | `first-person-controls` |
| Shooter combat: enemies, weapons, waves, combat HUD | `fps-combat-systems` |
| Collision without a physics engine | `game-collision` |
| NPCs, dialogue, quests, inventory | `npc-and-quests` |
| Procedural terrain, props, particles, sky, day/night | `procedural-3d-world` |
| Runtime audio: ambience + SFX | `game-audio` |
| Top-down 2D game (smooth) | `canvas-2d-game-engine` |
| Retro pixel-art game | `pixel-art-games` |
| Raw WebGL 2 / custom shaders / Preetham sky | `webgl2-pipeline` |
| Water, ocean, waves, raymarched scenes | `amazing-game-development-ocean` |
| Space, moon, sci-fi hard-surface | `amazing-game-development-space` |
| Full glossary / terminology | `glossary-for-triple-a-games` |
