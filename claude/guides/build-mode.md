# Build Mode Guide

Covers GodBlock (the in-world object), GodMode (inventory and block interactions), and
the raycast system that connects them. Read this before modifying anything in `src/god/`.

---

## Overview

Build mode is a two-part system:

- **`GodBlock`** (`src/god/GodBlock.ts`) — the golden floating block placed in the world.
  Purely visual + proximity detection. Has no gameplay logic of its own.
- **`GodMode`** (`src/god/GodMode.ts`) — activated by interacting with the God Block.
  Manages the inventory, block placing/collecting, hand preview, and target wireframe.

Both are instantiated in `main.ts` after world generation. `main.ts` owns the interaction
loop: it polls `GodBlock.aimed` + `GodBlock.inRange2`, listens for the `E` key, and routes
left/right clicks to `GodMode.placeBlock` / `GodMode.collectBlock`.

---

## GodBlock

### Visual components

The God Block is rendered by its own `MeshBasicMaterial` (not the shared chunk material),
so it stays **fully bright regardless of day-night tint** — intentional, it reads as magical
and is always findable.

Three scene objects:
| Object | Purpose |
|---|---|
| `mesh` | Vertex-colored block, bobs and spins |
| `glow` | Inner golden sprite (visible within 20 blocks) |
| `halo` | Outer beacon sprite (visible up to 80 blocks), always on |

### Proximity flags

| Flag | True when | Read by |
|---|---|---|
| `inRange10` | Player within 10 blocks | Internal only (halo visibility) |
| `inRange2` | Player within 2.5 blocks (interaction range) | `main.ts` |
| `aimed` | Raycast hit lands on a `Block.God` | `main.ts` |

`inRange10` is **not** read by `main.ts` — it is only used internally to gate the glow
sprite. Do not rely on it for external game logic.

### Animation

Updated every frame in `GodBlock.update(dt, playerPos, hit)`:
- Gentle sine bob (0.9 Hz, ±0.12 blocks vertical)
- Lazy wobble tilt (independent X and Z sine, ~0.4 and 0.5 Hz)
- Slow continuous spin (0.4 rad/s)
- Halo pulse (1.8 Hz) with sqrt distance falloff

### Respawn

When the player exits God Mode, `GodBlock.respawn(world, setBlockAt)` is called:
1. Clears the old position (sets to Air), fires a gold dissolve particle burst.
2. Tries up to 80 random positions 6–16 blocks away on Grass/Stone with clear air above.
3. Falls back to the old position if no valid spot is found.

The dissolve burst (`spawnDissolve`) emits 28 gold particles that drift upward and fade
over 1.4 seconds.

---

## GodMode

### Inventory

10 slots, each `InventorySlot | null`. Slots stack up to 64 of the same block type.
`selectedSlot` (0–9) is the active slot; **ArrowLeft / ArrowRight** cycle it via
`controls.consumeSlotDelta()` → `selectSlot(delta)`. There is no scroll wheel binding.

```ts
interface InventorySlot {
  blockId: BlockId
  count: number
}
```

Blocks start empty — the player must **collect** blocks from the world to fill inventory.

### Placeable blocks

Only blocks in `PLACEABLE` can be placed or collected:

```ts
export const PLACEABLE: BlockId[] = [
  Block.Grass, Block.Stone, Block.Sand, Block.Log, Block.Leaves,
]
```

Water and God Block are intentionally excluded. To add a new placeable block type, append
its id here (and add the block type first — see the Blocks guide).

### Placing blocks (`placeBlock`)

Places the selected slot's block on the face adjacent to the raycast hit:
- Target cell = `hit.xyz + hit.face` (one step in the hit normal direction)
- Fails if out of bounds, or the target is not Air/Water
- Decrements slot count; clears slot if count reaches 0

### Collecting blocks (`collectBlock`)

Removes the hit block from the world and adds it to inventory:
- Fails if the hit block is `Block.God` (can't collect the God Block)
- Fails if the block is not in `PLACEABLE`
- Calls `setBlockAt` (which also handles chunk rebuild and `topY` update)
- Triggers a `BlockBreakEffect` particle burst (managed in `main.ts`)

### Hand preview

GodMode maintains a **second scene** (`handScene`) rendered on top of the main world via
`renderHand(renderer)`. The hand block sits in the lower-right of the screen using its own
`PerspectiveCamera` (`handCamera`).

`rebuildHand()` is called whenever the selected slot changes — it disposes the old mesh and
builds a fresh vertex-colored block geometry via `makeBlockGeo(blockId)`.

`renderHand` is called at the end of every frame in `main.ts`:
```ts
// Render order matters: world first, hand on top with cleared depth
renderer.autoClear = false
renderer.clearDepth()
renderer.render(this.handScene, this.handCamera)
renderer.autoClear = true
```

Do not add objects to `handScene` that need the day-night tint — the hand camera uses its
own projection and ignores `material.color`.

### Target wireframe

A white `LineSegments` box (1.005³, semi-transparent) added to the **main scene** and
repositioned to `hit.xyz + 0.5025` each frame when in build mode. Only visible when aimed
at a block.

---

## Raycast (`src/engine/raycast.ts`)

`raycastVoxel(world, ox, oy, oz, dx, dy, dz, maxDist)` — DDA voxel traversal, returns a
`RaycastHit` or `null`.

```ts
interface RaycastHit {
  x: number; y: number; z: number   // hit block coords
  blockId: number
  face: [number, number, number]     // normal of the hit face (+1 or -1 on one axis)
}
```

The ray is cast from `camera.position` along the look direction in `main.ts`. Max range is
6 blocks. The hit is reused for both GodBlock aim detection and build-mode interactions.

---

## Extending build mode

**New interaction key:** Add to `controls.ts` and expose a `consumeX()` method (same
pattern as `consumeLeftClick`). Wire it in the build-mode block in `main.ts`.

**New block effect on collect/place:** Add to `src/effects/` and call it from `main.ts`
after a successful `collectBlock` or `placeBlock`.

**Persistent inventory:** Serialize `godMode.slots` to localStorage using the pattern in
`src/storage.ts`. The seed and volumes are good examples to follow.
