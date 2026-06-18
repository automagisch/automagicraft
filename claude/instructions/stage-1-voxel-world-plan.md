# Stage 1 — Traversable Voxel World (Foundation)

**Status:** Built — awaiting design review. The world, rendering, controls, and physics
are implemented and verified (build passes; gravity/walk/wall-collision/step-assist/jump
all confirmed via simulation; terrain composition checked visually).
**Goal of this stage:** Stand up our own voxel world that a player can walk and jump
through, in first person. No resume content yet — this is purely the world + movement
foundation that everything later builds on.

> Later stages (NOT in scope now): block placing/breaking, resume content & points of
> interest, signs/portals, audio, third-person/avatar, day-night cycle, save/load.

---

## 1. Vision for this stage

- A **medium, finite, hand-seeded voxel world** the visitor drops into.
- **First-person** exploration (camera at the eyes, no visible avatar — chosen).
- **Flat stylized block colors** — each block is a solid color with subtle per-face
  shading + baked ambient occlusion, so it reads as *ours*, not a Minecraft clone (chosen).
- Terrain has real character: **rolling hills, at least one prominent mountain, and a
  valley/lowland**.
- Movement feels good: **walk (WASD), look (mouse), jump (Space)**, with gravity and
  solid collision so you can climb hills, stand on trees, and never fall through the floor.
- Ships as a **static site** that can be deployed anywhere.

### Definition of done (acceptance criteria)
1. `npm run dev` opens a browser scene showing a medium voxel world with **grass, stone,
   sand, and trees**, featuring hills, a mountain, and a valley.
2. Click-to-play locks the pointer; **mouse looks**, **WASD walks** relative to view,
   **Space jumps**.
3. **Gravity + collision** work: the player walks on the surface, climbs slopes, lands
   after jumping, and cannot pass through solid blocks or fall out of the world.
4. The world is **deterministic** (fixed seed) so the layout is identical on every load
   — important because later stages will place resume content at fixed coordinates.
5. Runs at a **smooth framerate** (target ~60 fps on a typical laptop) and **`npm run
   build` produces a deployable static `dist/`**.

---

## 2. Tech stack

| Concern        | Choice                          | Why |
|----------------|---------------------------------|-----|
| Language       | **TypeScript**                  | Type safety across engine/physics math. |
| Build/dev      | **Vite**                        | Instant dev server + HMR, trivial static build. |
| 3D rendering   | **Three.js** (WebGL)            | Mature, well-documented, no engine lock-in. |
| Terrain noise  | **`simplex-noise`** (tiny dep)  | Fast, seedable fractal terrain. |
| Package mgr    | **pnpm** (npm fallback)         | Already installed; fast installs. |

No game engine (Babylon/PlayCanvas) — a thin Three.js layer keeps us in full control of
the voxel meshing and physics, and keeps the door open for embedding this into the eventual
resume site however we like.

**Dependencies:** `three`, `simplex-noise` · **Dev:** `typescript`, `vite`, `@types/three`

---

## 3. How the world is built (rendering approach)

A naive "one mesh cube per block" approach dies fast. Instead:

- **Chunked voxel storage.** The world is a grid of **chunks** (16×16 in X/Z, full world
  height in Y). Each chunk stores its blocks in a flat `Uint8Array` (block id per cell).
- **Face-culling mesher.** For each chunk we build **one** `BufferGeometry`, emitting only
  the faces that touch air (a block buried between solid neighbors contributes nothing).
  This is the single biggest performance win and is plenty for a medium world.
- **Flat stylized look via vertex colors.** Each emitted face gets a color from the block
  registry, with a slightly brighter top / darker sides, plus **baked ambient occlusion**
  (darken vertices tucked into corners). One `MeshLambertMaterial({ vertexColors: true })`
  per chunk — no textures, no atlas, no external image assets.
- **Greedy meshing** (merging coplanar faces into larger quads) is noted as a *future*
  optimization, not needed for stage 1.

### Block registry (stage 1)
The brief lists Grass, Stone, Sand, and trees. Trees require two more colors, so the
starting palette is:

| Block   | Role                          | Look (flat color) |
|---------|-------------------------------|-------------------|
| Grass   | Surface in normal elevations  | Green top, earthy-tinted sides |
| Stone   | Subsurface + exposed peaks/cliffs | Mid grey |
| Sand    | Low areas / valley floor / beaches | Pale warm tan |
| Log     | Tree trunk                    | Brown |
| Leaves  | Tree canopy                   | Deeper muted green |
| *(Dirt)*| *Optional thin subsurface layer* | *Brown — flagged optional* |

---

## 4. Terrain generation

Deterministic, driven by a fixed seed.

1. **Heightmap:** fractal (multi-octave) simplex noise over X/Z gives a surface height per
   column. Layering a few octaves yields broad landmasses + finer hills.
2. **Mountain:** a low-frequency noise band (or a placed radial bump) pushes one region up
   to near max height to guarantee a clear mountain, rather than hoping noise produces one.
3. **Valley/lowland:** the same field produces dips; columns below a "low" threshold form
   the valley.
4. **Block assignment per column (top-down):**
   - Top block = **grass**, *unless*:
     - height ≤ sand level (valley floor / shoreline) → **sand**, or
     - height ≥ rock level OR slope is steep → exposed **stone**.
   - Below the surface → **stone** (optionally a thin **dirt** band first).
5. **Trees:** seeded scatter on grass tops with a minimum spacing; each tree = a 4–6 block
   **log** trunk + a **leaf** canopy blob. Skipped on sand/stone and near steep edges.

**Suggested dimensions (open to tuning):** 8×8 chunks = **128×128** footprint, world height
**64**. Sea/base level ≈ 20, sand level ≈ 24, rock level ≈ 48.

---

## 5. Player, controls & physics

- **Camera:** first-person, eye height ≈ 1.7 blocks. Pointer-lock mouse look (yaw on the
  body, pitch on the camera, pitch clamped to avoid flipping).
- **Input → movement:** WASD moves relative to the camera's yaw; Space jumps. **Walk and
  jump only** this stage — no sprint, crouch, or fly in the final build (a debug fly/noclip
  toggle may exist during development only).
- **Physics (fixed timestep, ~1/60s accumulator for stability):**
  - Player is an **AABB** (≈ 0.6 × 1.8 × 0.6).
  - Gravity accelerates downward each tick; jump sets an upward velocity only when grounded.
  - **Collision** resolves **per axis** against the voxel grid (move X, resolve; move Y,
    resolve; move Z, resolve) — prevents passing through or sticking to blocks.
  - **Grounded** check enables jumping and stops downward velocity on landing.
  - *Nice-to-have:* single-block **step-assist** so walking into a 1-high ledge steps up
    smoothly (very Minecraft-y). Flagged optional.
- **Spawn:** placed on a known grass surface (e.g. near world center) computed from the
  heightmap so the player always starts standing on solid ground.

**Suggested tuning:** walk ≈ 4.3 blocks/s, gravity ≈ −28 blocks/s², jump tuned to clear
~1.25 blocks. (Numbers are starting points; we'll feel-test them.)

---

## 6. Scene & presentation

- Sky-colored clear background + **subtle distance fog** matched to the sky for depth.
- One **directional light** (sun) + soft **ambient/hemisphere** light for fill.
- HUD overlay (plain DOM, not in 3D): **crosshair**, a small **controls hint**
  (Click to play · WASD move · Space jump · Esc release), and a **loading screen** shown
  while the world generates.

---

## 7. Proposed file structure

```
voxel-world-website/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── public/                  # favicon, static assets
└── src/
    ├── main.ts              # bootstrap: renderer + scene + game loop
    ├── engine/
    │   ├── blocks.ts        # block id registry + per-face colors
    │   ├── World.ts         # owns chunks, world-space block lookups
    │   ├── Chunk.ts         # voxel storage + mesh rebuild
    │   ├── mesher.ts        # face-culling + ambient-occlusion mesh builder
    │   └── terrain.ts       # seeded noise heightmap, block assignment, trees
    ├── player/
    │   ├── Player.ts        # player state + AABB
    │   ├── controls.ts      # pointer lock + keyboard input
    │   └── physics.ts       # gravity + per-axis AABB collision
    ├── render/
    │   ├── renderer.ts      # WebGLRenderer, camera, lights, sky, fog
    │   └── materials.ts     # shared chunk material(s)
    └── ui/
        └── hud.ts           # crosshair, controls hint, loading overlay
```

---

## 8. Build order (incremental, each step verifiable)

1. **Scaffold** — Vite + TS + Three.js; render a single test cube; dev server runs. ✅ visible cube.
2. **Block + single chunk** — block registry + a flat grass platform via the face-culling
   mesher. ✅ correct colors, only outer faces drawn.
3. **World + terrain** — multiple chunks + noise terrain with hills/mountain/valley and
   grass/sand/stone placement, toured with a temporary free-fly camera. ✅ terrain reads well.
4. **Trees** — seeded scatter of log+leaf trees on grass. ✅ trees populate sensibly.
5. **First-person controls** — pointer lock, mouse look, WASD (no gravity yet). ✅ look + move.
6. **Physics** — gravity, per-axis AABB collision, grounded check, jump; remove free-fly.
   ✅ walk on terrain, climb hills, jump, no tunneling/falling through.
7. **Polish** — sky, fog, lights, baked AO shading, HUD crosshair + controls hint, loading
   screen, proper spawn. ✅ looks and feels good.
8. **Build & deploy config** — `npm run build`/`preview`, confirm static `dist/`. ✅ prod build runs.

We pause for your eyes at least after **3** (terrain) and **6** (movement) — the two points
where the feel of the world is easiest to course-correct.

---

## 9. Deployment

`vite build` emits a fully static `dist/` (HTML + JS + assets) — no server needed. It can go
to **Vercel, Netlify, Cloudflare Pages, or GitHub Pages** with zero/near-zero config.
**Recommendation:** Vercel or Netlify for the simplest "connect repo → auto-deploy" flow.
Final host can be decided when the resume layer lands; nothing here locks us in.

---

## 10. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Performance from too many faces | Chunked storage + face culling (built in from step 2); greedy meshing kept in reserve. |
| Collision tunneling at speed | Fixed timestep + per-axis resolution + sane walk speed. |
| Long synchronous world-gen freezing the page | Loading overlay; move generation to a Web Worker later if needed. |
| Pointer-lock browser quirks | Explicit click-to-play overlay; Esc to release. |

---

## 11. Decisions (resolved at build time)

1. **World size** — 128×128 footprint × 64 tall. (Tunable in `main.ts`.)
2. **Subsurface dirt** — not included; strictly grass-over-stone per the "basics only" brief.
3. **Step-assist** — included (`STEP_HEIGHT` in `physics.ts`); essential for the hilly terrain.
4. **Repo/deploy** — kept local for now; build config is ready, no `git init`/deploy yet.

Camera = first-person; block style = flat stylized colors (vertex color + face shade + AO).

### Tuning values that landed (in `engine/terrain.ts`)
- `BASE_LEVEL = 30`, `HILL_AMPLITUDE = 16`, `SAND_LEVEL = 24`, `ROCK_LEVEL = 45`.
- Mountain: deterministic radial bump centered at ~(41, 82), peak ≈ 53.
- Result (seed 1337): ~75% grass surface, sand confined to valley lows, bare rock on the
  peak, ~125 trees.
