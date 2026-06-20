# automagicraft — Project Guide

A first-person, explorable voxel world built with our own block set and style. The
long-term goal is an **interactive resume**: visitors wander a fantasy voxel landscape and
discover information about the owner along the way. We are building it in deliberate stages.

**Working model:** Claude does most of the implementation; the owner (interaqt@gmail.com)
provides design direction and reviews at gates. Propose, build incrementally, verify, and
pause for review at the points called out in the active plan.

---

## Current stage

**Stage 1 — complete. Stage 2 (resume layer) — not yet started.**

The world is fully traversable and polished. Everything below is shipped and working:

- **Terrain** — 512×512×96 world, seeded fBm heightmap, centered mountain, rolling hills,
  valley. Blocks: grass, stone, sand, log, leaves, water. Trees scattered on grass.
- **Player** — first-person, WASD/mouse-look/Space jump, gravity, AABB collision,
  1-block step-assist, head-bob. Spawns on the mountain peak.
- **Rendering** — pastel vertex-color style, per-face shading, baked AO, infinity fog
  (`FogExp2`). No scene lights, no textures.
- **Day-night cycle** — orbiting sun/moon, stars, sky/fog recolor, world-tint darkening.
  Length configurable via `world.env`.
- **Water** — water blocks in the terrain, semi-transparent water mesh, underwater fog
  tint + blue overlay, splash SFX on entry.
- **Mobs** — birds (flock between treetops, day/night aware) and deer (wander, graze,
  flee). Seeded spawn, day/night population scaling.
- **Audio** — shuffling background music playlist; ambient forest loops (day/night
  crossfade); height-based wind crossfade; footsteps; jump and splash one-shots.
- **Build mode (God Block)** — a golden block spawns in the world; interacting with it
  unlocks a god-mode inventory for placing and collecting blocks with particle effects.
- **Persistence** — music/SFX volumes and world seed saved to localStorage.
- **HUD/menu** — Explore / Settings / Credits tabs, music + SFX volume sliders, seed
  regeneration UI, scrolling credits panel.

The authoritative stage 1 plan lives in
[`claude/instructions/stage-1-voxel-world-plan.md`](claude/instructions/stage-1-voxel-world-plan.md).

---

## Commands

```bash
pnpm install        # or npm install
pnpm dev            # vite dev server at http://localhost:5173
pnpm build          # tsc --noEmit (typecheck) + vite build  → static dist/
pnpm preview        # serve the production build
```

Always run `pnpm build` (or `npx tsc --noEmit`) before declaring work done — the build
gate is the typecheck.

---

## Git workflow (GitHub flow)

`main` is always deployable. **Every piece of work gets its own branch** — never commit
features directly to `main`. The cycle:

1. **Branch** off the latest `main`: `git switch -c <type>/<short-name>`
   (e.g. `feat/water-blocks`, `fix/step-assist`, `chore/deps`).
2. **Commit** small, focused changes on that branch. Run the build gate before committing.
3. **Push** the branch and open a PR: `git push -u origin <branch>` → `gh pr create`.
4. **Review** at the PR (the owner reviews at the plan's gates), then **merge** into `main`.
5. **Delete** the merged branch and pull `main` before starting the next piece.

Keep one branch per logical part so each is reviewable on its own. Only commit/push/branch
when asked (per the harness rules); don't merge your own PRs without a review.

---

## Architecture

Thin layer over **Three.js** (no game engine). TypeScript + Vite. Static output.

```
src/
  main.ts              Bootstrap: world build, game loop, spawn, head-bob, camera, block interaction
  config.ts            World config constants injected at build time from world.env
  storage.ts           localStorage persistence (music/SFX volumes, world seed)
  audio/
    music.ts           MusicPlayer: shuffling playlist, fade in/out on pointer lock
    sfx.ts             SfxPlayer: ambient loops (forest day/night, wind), footsteps, one-shots
  effects/
    blockBreak.ts      Particle burst spawned when a block is collected in build mode
  engine/
    blocks.ts          Block id enum + per-face pastel colors (single source of truth)
    World.ts           Flat Uint8Array voxel store; getBlock/setBlock + isSolid; height maps
    terrain.ts         Seeded fBm heightmap + centered mountain + block assignment + trees
    mesher.ts          Face-culling + AO → one BufferGeometry per chunk (skips buried cells)
    raycast.ts         DDA voxel raycast for build-mode block targeting
    rng.ts             Seeded RNG (mulberry32) used by terrain and mob placement
  god/
    GodBlock.ts        The golden block in the world that unlocks build mode
    GodMode.ts         Build mode: place/collect blocks, inventory slot management
  mobs/
    Mob.ts             Base animated mob (body + limb rig, movement helpers)
    BirdMob.ts         Bird: flaps between treetops, circles overhead
    DeerMob.ts         Deer: wanders terrain, grazes, flees from player
    MobManager.ts      Spawns, updates, and culls all mob instances
  player/
    Player.ts          Center-based AABB state (position, vx/vy/vz, onGround, stepOffset)
    physics.ts         Velocity movement (ground/air), gravity, AABB collision, jump, step-up
    controls.ts        Pointer lock, mouse look (yaw/pitch), WASD/Space + interact input
  render/
    renderer.ts        WebGLRenderer, scene, camera, FogExp2 (infinity fog)
    sky.ts             DayNightCycle: sun/moon/stars, sky+fog color, world-tint over time
  ui/
    hud.ts             Overlay, tabs (Explore/Settings/Credits), sliders, seed UI, god labels
    inventory.ts       Build mode hotbar overlay
```

### Conventions & invariants
- **Units are blocks.** 1 world unit = 1 block. Y is up.
- **Coordinates are integers for voxels**, floats for the player. Floor before voxel lookups.
- **Block ids** live in `engine/blocks.ts` (`Block.Air=0`, Grass, Stone, Sand, Log, Leaves).
  Add new block types there with their face colors; nothing else hardcodes colors.
- **Pastel design language (locked):** soft, light, gently desaturated colors; leaves are
  the one deeper tone, for contrast. New blocks should fit this palette.
- **Flat stylized look:** color + per-face shade + baked ambient occlusion are written
  into vertex colors and drawn with `MeshBasicMaterial({ vertexColors: true })`. There are
  **no scene lights and no textures** — keep it that way unless the design direction changes.
- **Lighting = the day-night cycle.** `render/sky.ts` animates the *shared chunk material's*
  `.color` to darken/tint the whole world, and recolors `scene.background` + the fog. Don't
  add per-object materials that won't pick up this tint.
- **`THREE.ColorManagement.enabled = false`** so authored hex colors render as-is. Do not
  re-enable it without re-tuning the whole palette.
- **`World.getBlock`** returns `Air` out of bounds. **`World.isSolid`** treats world borders
  + `y<0` as solid (invisible walls + bedrock); use it for collision, not `getBlock`.
- **`World.terrainHeight` / `World.topY`** are per-column maps filled by terrain generation;
  the mesher relies on them to bound each column. Regenerate them if you mutate the world.
- **Determinism:** terrain is seeded (`SEED` in `main.ts`). Same seed ⇒ identical world.
  Later stages place content at fixed coordinates, so do not make generation nondeterministic.

### Performance rules
- **One mesh per chunk** (32×32 footprint), built with face culling. Never a mesh per block.
- **The mesher skips buried cells** — it meshes each column only from its lowest exposed
  neighbor up to its top. This is what makes the 512² world build in ~1s; preserve it.
- **Meshing is incremental** at load (time-budgeted batches) with a progress %, and yields
  via **MessageChannel, not setTimeout** (background tabs throttle timers to ~1s).
- If perf becomes an issue later: greedy meshing and/or a Web Worker for generation — in
  that order. Don't reach for them prematurely.

### Gotchas
- **Pointer lock** needs a user gesture (click). After Esc, the browser blocks immediate
  re-lock for ~1s — expected.
- **Infinity fog** (`FogExp2` density in `renderer.ts`) is tuned with the camera far plane
  so the world edge dissolves into the horizon. Retune both together if world size changes.
- **Physics uses a fixed timestep** (1/60) with an accumulator. Keep movement in the step;
  keep view-only effects (head-bob, `stepOffset` ease-out) in the render frame.
- **Movement carries momentum** (`vx`/`vz` persist): ground has accel/friction, air keeps
  velocity with only light steering. Tunables live at the top of `physics.ts`.
- **Day length** is set via `DAY_LENGTH` in `world.env` (flows through `config.ts`). The sky
  color palette is defined inside `render/sky.ts`.
- A dev-only `window.__voxel` hook (and `__voxel.frozen` to park the camera) exists in DEV
  builds for inspection; it's stripped from production.

---

## Guides

`claude/guides/` contains implementation guides for specific subsystems. **Read the relevant
guide before touching that subsystem, and update it when patterns or APIs change.** Guides
are the single source of truth for how to extend each area — they exist so features are
implemented consistently and without re-deriving decisions already made.

Current guides:
- [`claude/guides/blocks.md`](claude/guides/blocks.md) — block registry, adding block types, colors, isSolid rules
- [`claude/guides/world-and-terrain.md`](claude/guides/world-and-terrain.md) — World store, terrain constants, config pipeline, God Block placement
- [`claude/guides/rendering.md`](claude/guides/rendering.md) — shared chunk material tint, day-night cycle, fog, sky palette
- [`claude/guides/build-mode.md`](claude/guides/build-mode.md) — GodBlock visuals, GodMode inventory/place/collect, hand rendering
- [`claude/guides/player-and-physics.md`](claude/guides/player-and-physics.md) — AABB, movement tunables, step-assist, head-bob
- [`claude/guides/hud-and-ui.md`](claude/guides/hud-and-ui.md) — overlay, tabs/panels, DOM IDs, adding new UI elements
- [`claude/guides/audio.md`](claude/guides/audio.md) — MusicPlayer, SfxPlayer, LoopTrack/gain, adding sounds, credits
- [`claude/guides/mob-creation.md`](claude/guides/mob-creation.md) — adding new mob types
- [`claude/guides/intro.md`](claude/guides/intro.md) — intro state machine, shutter/blur lifecycle, controls.allowLock gate, progress bar

## Resources

`claude/resources/` is an inbox for files the owner drops in for processing (audio samples,
reference docs, images, etc.). **After the resource has been integrated, delete it from this
directory.** The folder should always be empty between tasks — a file here means it hasn't
been processed yet.

---

## Working agreement (how to make changes here)
1. Keep the **stages separated** — do not pull resume content into the engine before the
   world stage is signed off.
2. **Match the surrounding code** — small modules, explicit types, no clever indirection.
3. **Verify before claiming done:** run the build, and when behavior changes, run the dev
   server and screenshot it (Playwright MCP) to confirm it actually renders/moves.
4. **Pause at the plan's review gates** rather than racing to the end.
5. When something non-obvious is decided (tuning values, design calls), record it in the
   relevant guide so it isn't lost.
6. **After a feature ships:** delete its instruction file from `claude/features/` and make
   sure a `claude/guides/` entry covers the subsystem instead. Instruction files are
   one-shot briefs; guides are the living reference. Don't keep both.

## Roadmap (next stages)

**Stage 2 — Resume layer** (not yet started):
- Points of interest, signs/portals, structures that surface information about the owner.
- Navigation aid / minimap.
- Mobile/touch controls.
