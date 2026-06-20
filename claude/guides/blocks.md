# Blocks Guide

Single source of truth for the block type system. Everything block-related starts in
`src/engine/blocks.ts` — nothing else hardcodes colors or ids.

---

## Block id enum

```ts
export const Block = {
  Air:    0,
  Grass:  1,
  Stone:  2,
  Sand:   3,
  Log:    4,
  Leaves: 5,
  Water:  6,
  God:    7,   // unique — spawned once, unlocks build mode
} as const
```

`BlockId` is the union of these values (`0 | 1 | 2 | … | 7`). Use `Block.X` constants
everywhere; never use raw integers.

---

## Color system

Each block has three face colors — top, side, bottom — expressed as `RGB` triples (0–1
floats, sRGB). They are authored in the `BLOCK_COLORS` map via the `hex()` helper:

```ts
[Block.Grass]: { top: hex(0x90c873), side: hex(0x7bb05e), bottom: hex(0x9c8b66) },
```

**`THREE.ColorManagement.enabled = false`** — authored hex values render exactly as typed.
Do not adjust colors to compensate for gamma.

The mesher then applies additional per-face directional shading (multiplier constants baked
into the face quads) and ambient occlusion on top of these base colors. The result is
written into `BufferGeometry` vertex colors and drawn with
`MeshBasicMaterial({ vertexColors: true })`. There are no textures, no lights.

### Directional shade multipliers (same in mesher and GodMode hand preview)

| Face | Multiplier |
|---|---|
| top | 1.00 |
| side +X | 0.86 |
| side −X | 0.74 |
| side +Z | 0.80 |
| side −Z | 0.68 |
| bottom | 0.55 |

---

## Design language (locked)

- **Pastel palette:** soft, light, gently desaturated. Think chalk, not crayon.
- **Leaves are the deliberate exception:** a deeper muted sage (`#4c763f`) so trees read
  as contrast against the pale grass.
- **Water** is a slightly deeper pastel blue (`#7dc8e8`) — richer than the sky so it reads
  as water without clashing.
- **God Block** is warm gold (`#f5d060`) — magical, always-visible, intentionally pops.

New blocks must fit this palette. If in doubt, desaturate and lighten.

---

## Adding a new block type

1. **Add the id** to the `Block` enum in `src/engine/blocks.ts`. Choose the next integer.

2. **Add the colors** to `BLOCK_COLORS` in the same file:

```ts
[Block.MyBlock]: { top: hex(0xaabbcc), side: hex(0x99aabb), bottom: hex(0x889900) },
```

3. **Decide collision behavior.** By default new blocks are solid (collision, opaque).
   If the block should be non-solid (like Water or God), add it to the `isSolid` exclusion
   in `World.ts`:

```ts
return b !== Block.Air && b !== Block.Water && b !== Block.God && b !== Block.MyBlock
```

4. **Make it placeable in build mode** (optional). Add it to `PLACEABLE` in
   `src/god/GodMode.ts`:

```ts
export const PLACEABLE: BlockId[] = [
  Block.Grass, Block.Stone, Block.Sand, Block.Log, Block.Leaves, Block.MyBlock,
]
```

5. **Add terrain placement** (optional). See the World & Terrain guide for how terrain
   assigns blocks per column.

6. **Update the credits** if the block is tied to a licensed asset.

---

## `isSolid` vs `getBlock`

| Method | Out-of-bounds | Use for |
|---|---|---|
| `getBlock(x,y,z)` | Returns `Air` | Rendering, block queries |
| `isSolid(x,y,z)` | `y<0` → true (bedrock); lateral → true (invisible walls) | Collision only |

Never use `getBlock` for collision — it won't enforce world boundaries. Never use `isSolid`
to identify a block type — Water and God both return false despite being present.
