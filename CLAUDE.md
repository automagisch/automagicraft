# automagicraft — Project Guide

A first-person, explorable voxel world built with our own block set and style. The
long-term goal is an **interactive resume**: visitors wander a fantasy voxel landscape and
discover information about the owner along the way. We are building it in deliberate stages.

**Working model:** Claude does most of the implementation; the owner (interaqt@gmail.com)
provides design direction and reviews at gates. Propose, build incrementally, verify, and
pause for review at the points called out in the active plan.

---

## Current stage

**Stage 1 — Traversable voxel world (foundation).** No resume content yet.
The authoritative plan lives in [`claude/instructions/stage-1-voxel-world-plan.md`](claude/instructions/stage-1-voxel-world-plan.md).
Read it before changing engine behavior.

Stage 1 scope: finite world (**512×512×96**), terrain (rolling hills / valley / one
centered mountain), blocks (grass, stone, sand) + trees (log, leaves), first-person
controls (mouse look, WASD walk, Space jump) with gravity, AABB collision, and 1-block
step-assist. The player **spawns on the mountain peak** for a 360° horizon view.

Shaped in iteration: a soft **pastel** art direction (leaves are a deeper sage for
contrast), **infinity fog** so the world edge dissolves into the horizon, **natural
movement** (ground accel/friction + air momentum + head-bob), smoothed step-up, and a
**day-night cycle** (orbiting sun/moon, stars, sky/fog recolor, world-tint darkening).

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

## Architecture

Thin layer over **Three.js** (no game engine). TypeScript + Vite. Static output.

```
src/
  main.ts              Bootstrap: incremental world build, game loop, spawn, head-bob, camera
  engine/
    blocks.ts          Block id enum + per-face pastel colors (single source of truth)
    World.ts           Flat Uint8Array voxel store; getBlock/setBlock + isSolid; height maps
    terrain.ts         Seeded fBm heightmap + centered mountain + block assignment + trees
    mesher.ts          Face-culling + AO → one BufferGeometry per chunk (skips buried cells)
  player/
    Player.ts          Center-based AABB state (position, vx/vy/vz, onGround, stepOffset)
    physics.ts         Velocity movement (ground/air), gravity, AABB collision, jump, step-up
    controls.ts        Pointer lock, mouse look (yaw/pitch), WASD/Space input
  render/
    renderer.ts        WebGLRenderer, scene, camera, FogExp2 (infinity fog)
    sky.ts             DayNightCycle: sun/moon/stars, sky+fog color, world-tint over time
  ui/
    hud.ts             Crosshair, click-to-play overlay, loading progress (DOM, not 3D)
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
- **Day length** and palette of the cycle are constants at the top of `render/sky.ts`.
- A dev-only `window.__voxel` hook (and `__voxel.frozen` to park the camera) exists in DEV
  builds for inspection; it's stripped from production.

---

## Working agreement (how to make changes here)
1. Keep the **stages separated** — do not pull resume content into the engine before the
   world stage is signed off.
2. **Match the surrounding code** — small modules, explicit types, no clever indirection.
3. **Verify before claiming done:** run the build, and when behavior changes, run the dev
   server and screenshot it (Playwright MCP) to confirm it actually renders/moves.
4. **Pause at the plan's review gates** (after terrain, after movement) rather than racing
   to the end.
5. When something non-obvious is decided (tuning values, design calls), record it here or
   in the stage plan so it isn't lost.

## Roadmap (later stages — NOT in scope until stage 1 is signed off)
- Block interaction (place/break), richer biomes/water, day-night, audio.
- **Resume layer:** points of interest, signs/portals, structures that reveal info about
  the owner; navigation/minimap; mobile/touch controls.
