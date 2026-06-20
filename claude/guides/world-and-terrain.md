# World & Terrain Guide

Covers the voxel store (`World`), terrain generation constants, the config pipeline, and
the God Block placement strategy. Read this before touching world generation, block mutation,
or adding world config values.

---

## World store (`src/engine/World.ts`)

The world is a flat `Uint8Array` with index layout:

```
index = x + sizeX * (z + sizeZ * y)
```

Current dimensions: **512 × 96 × 512** (X × Y × Z). Y is up.

### Key methods

| Method | Behaviour |
|---|---|
| `getBlock(x,y,z)` | Returns `Block.Air` out of bounds |
| `setBlock(x,y,z,id)` | No-op out of bounds |
| `isSolid(x,y,z)` | `y<0` → true; lateral OOB → true; Water + God → false |
| `inBounds(x,y,z)` | Simple range check |
| `surfaceY(x,z)` | Scans top-down, returns topmost non-air Y, or -1 |

### Column height maps

Two `Int32Array` fields are populated by terrain generation and used by the mesher to skip
the buried interior — without them the mesher would iterate every Y level:

| Field | Meaning |
|---|---|
| `terrainHeight` | Top of the continuous solid ground per column (no trees) |
| `topY` | Topmost non-air block including trees and overhanging leaves |

**If you mutate blocks after generation** (e.g. build mode) you must keep `topY` in sync.
`main.ts::setBlockAt()` handles this for build-mode changes — follow the same pattern for
any other runtime mutation.

---

## Terrain generation (`src/engine/terrain.ts`)

Called once at startup: `generateTerrain(world, cfg)`. Returns `{ treeTops, godBlockPos }`.

### Heightmap constants

| Constant | Value | Meaning |
|---|---|---|
| `BASE_LEVEL` | 34 | Average ground height |
| `HILL_AMPLITUDE` | 18 | Vertical spread of hills/valleys around base |
| `SAND_LEVEL` | 28 | Surface ≤ this → sand |
| `ROCK_LEVEL` | 62 | Surface ≥ this, or slope ≥ 3 → bare stone |
| `WATER_LEVEL` | 27 | Columns with terrain below this are flooded to this Y |

### Heightmap pipeline

1. **fBm noise** (4 octaves, base freq 0.012) generates rolling hills in [-1, 1].
2. **Mountain** — a radial bump centred at (sizeX/2, sizeZ/2) with radius 20% of world
   width. The bump uses `pow(t, 2.3) * 54 * rugged` where `rugged` is a second noise
   sample for natural edges. This guarantees a central peak regardless of seed.
3. **Block assignment per column**: top block = Grass, unless height ≤ SAND_LEVEL → Sand,
   or height ≥ ROCK_LEVEL or slope ≥ 3 → Stone. Subsurface is Stone (or Sand for the top
   2 blocks under a Sand surface).
4. **Trees** — scattered on a 7×7 cell grid (~45% fill), only on Grass, only away from
   world edges. See tree details below.
5. **Water flood** — columns with terrain below WATER_LEVEL are filled from terrain+1 up
   to WATER_LEVEL with Water blocks.
6. **`topY` / `terrainHeight`** maps are computed and stored on the World instance.
7. **God Block** placement (see below).

### Trees

Each tree: Log trunk (4–6 blocks, weighted toward 5), rounded leaf canopy (radius 2 at
base, 1 near top, randomised corners, single cap leaf). Trees only grow on Grass and never
at world edges. `treeTops` returns `[x, perchY, z]` per tree (top of the trunk + 2 for the
cap leaf) — this is where birds perch.

---

## Config pipeline

World config values flow through three files:

```
world.env  →  vite.config.ts  →  src/config.ts  →  runtime code
```

### Adding a new config value

1. **`world.env`** — add a documented line:
   ```
   MY_VALUE=42
   ```

2. **`vite.config.ts`** — register the define constant:
   ```ts
   __WC_MY_VALUE__: num('MY_VALUE', 42),   // 42 is the fallback default
   ```

3. **`src/config.ts`** — declare and export:
   ```ts
   declare const __WC_MY_VALUE__: number
   export const config = {
     ...
     myValue: __WC_MY_VALUE__,
   } as const
   ```

4. Use `config.myValue` in source code.

### Current config values

| world.env key | config field | Default | Purpose |
|---|---|---|---|
| `WORLD_SEED` | `worldSeed` | 1337 | Terrain RNG seed |
| `DAY_LENGTH` | `dayLength` | 150 | Seconds per full day cycle |
| `BIRD_AMOUNT` | `birdAmount` | 80 | Number of birds |
| `DEER_AMOUNT` | `deerAmount` | 25 | Number of deer |
| `WALK_SPEED` | `walkSpeed` | 4.6 | Top walk speed (blocks/s) |
| `FOG_DENSITY` | `fogDensity` | 0.007 | FogExp2 density |
| `GOD_BLOCK_MARGIN` | `godBlockMargin` | 0.3 | God Block inner-area fraction |
| `WIND_THRESHOLD` | `windThreshold` | 45 | Y level where wind starts |
| `WIND_MIX` | `windMix` | 20 | Blocks over which wind crossfade completes |

All values are numeric. String config is not currently supported by the pipeline.

---

## God Block placement

`generateTerrain` places exactly one God Block per world, using four fallback phases to
guarantee placement regardless of seed:

1. **Phase 1 (preferred):** 300 random attempts in the mountain foothills, 30–80 blocks
   from the world centre. This keeps it visible from the spawn peak.
2. **Phase 2:** 300 random attempts across the inner area (controlled by `godBlockMargin`).
3. **Phase 3:** Exhaustive stride-5 scan over 5–95% of the world.
4. **Phase 4 (last resort):** Float above whatever is at the world centre.

Placement requirements: must be on Grass, the block above must be Air, and the column
must not be at the world edge. On successful placement, `topY` for that column is updated.

When the player interacts with the God Block, it **respawns** 6–16 blocks away
(see `GodBlock.respawn()` in the Build Mode guide).

---

## Determinism

Terrain is fully deterministic: same `WORLD_SEED` always produces the same world. The
`mulberry32` seeded RNG is used throughout — one instance for the heightmap noise seed, one
for trees (`seed ^ 0x9e3779b9`), one for God Block placement (`seed ^ 0xc0ffee42`).

**Do not introduce `Math.random()` into terrain generation** — it breaks determinism and
will cause resume-layer content placed at fixed coordinates to appear in the wrong locations.
