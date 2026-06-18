import { createNoise2D } from 'simplex-noise'
import { Block } from './blocks'
import type { World } from './World'

export interface TerrainConfig {
  seed: number
  sizeX: number
  sizeZ: number
  height: number
}

// Deterministic PRNG so a given seed always produces the same world.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const BASE_LEVEL = 34 // average ground height
const HILL_AMPLITUDE = 18 // vertical spread of hills/valleys around the base
const SAND_LEVEL = 28 // at/below this the surface is sand (valley floor / shores)
const ROCK_LEVEL = 62 // at/above this the surface is bare stone (peaks)

export function generateTerrain(world: World, cfg: TerrainConfig): void {
  const noise2D = createNoise2D(mulberry32(cfg.seed))
  const treeRng = mulberry32(cfg.seed ^ 0x9e3779b9)

  const { sizeX, sizeZ, height } = cfg
  const heights = new Int32Array(sizeX * sizeZ)
  const hi = (x: number, z: number) => x + z * sizeX

  // Fractal (multi-octave) noise in [-1, 1].
  const fbm = (x: number, z: number): number => {
    let amp = 1
    let freq = 0.012
    let sum = 0
    let norm = 0
    for (let o = 0; o < 4; o++) {
      sum += noise2D(x * freq, z * freq) * amp
      norm += amp
      amp *= 0.5
      freq *= 2
    }
    return sum / norm
  }

  // One mountain mass at the world center, so spawning on its peak gives a 360° horizon.
  const mx = sizeX * 0.5
  const mz = sizeZ * 0.5
  const mradius = Math.min(sizeX, sizeZ) * 0.2

  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x < sizeX; x++) {
      let h = BASE_LEVEL + fbm(x, z) * HILL_AMPLITUDE // rolling hills and valleys

      const dx = x - mx
      const dz = z - mz
      const d = Math.sqrt(dx * dx + dz * dz)
      if (d < mradius) {
        const t = 1 - d / mradius // 0 at the foot, 1 at the center
        const rugged = 0.72 + 0.28 * (fbm(x * 1.7, z * 1.7) * 0.5 + 0.5)
        h += Math.pow(t, 2.3) * 54 * rugged
      }

      heights[hi(x, z)] = Math.max(1, Math.min(height - 2, Math.round(h)))
    }
  }

  // Fill columns top-down.
  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x < sizeX; x++) {
      const h = heights[hi(x, z)]

      const hl = heights[hi(Math.max(0, x - 1), z)]
      const hr = heights[hi(Math.min(sizeX - 1, x + 1), z)]
      const hd = heights[hi(x, Math.max(0, z - 1))]
      const hu = heights[hi(x, Math.min(sizeZ - 1, z + 1))]
      const slope = Math.max(
        Math.abs(h - hl),
        Math.abs(h - hr),
        Math.abs(h - hd),
        Math.abs(h - hu),
      )

      let topBlock: number = Block.Grass
      if (h <= SAND_LEVEL) topBlock = Block.Sand
      else if (h >= ROCK_LEVEL || slope >= 3) topBlock = Block.Stone

      for (let y = 0; y <= h; y++) {
        let id: number
        if (y === h) id = topBlock
        else if (topBlock === Block.Sand && y >= h - 2) id = Block.Sand
        else id = Block.Stone
        world.setBlock(x, y, z, id)
      }
    }
  }

  scatterTrees(world, heights, cfg, treeRng)

  // Publish per-column bounds for the mesher: continuous ground height, and the topmost
  // non-air cell (trees/leaves included).
  const topY = new Int32Array(sizeX * sizeZ)
  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x < sizeX; x++) topY[hi(x, z)] = world.surfaceY(x, z)
  }
  world.terrainHeight = heights
  world.topY = topY
}

// Trees are placed on a coarse grid (one candidate per cell) so they stay naturally spaced.
function scatterTrees(
  world: World,
  heights: Int32Array,
  cfg: TerrainConfig,
  rng: () => number,
): void {
  const { sizeX, sizeZ, height } = cfg
  const CELL = 7
  const hi = (x: number, z: number) => x + z * sizeX

  for (let cz = 0; cz < sizeZ; cz += CELL) {
    for (let cx = 0; cx < sizeX; cx += CELL) {
      if (rng() > 0.45) continue // ~45% of cells get a tree

      const x = cx + 1 + Math.floor(rng() * (CELL - 2))
      const z = cz + 1 + Math.floor(rng() * (CELL - 2))
      if (x < 2 || x >= sizeX - 2 || z < 2 || z >= sizeZ - 2) continue

      const h = heights[hi(x, z)]
      if (world.getBlock(x, h, z) !== Block.Grass) continue // only grow on grass

      placeTree(world, x, h + 1, z, height, rng)
    }
  }
}

function placeTree(
  world: World,
  x: number,
  baseY: number,
  z: number,
  maxH: number,
  rng: () => number,
): void {
  const trunk = 4 + Math.floor(rng() * 3) // 4..6 logs
  const topY = baseY + trunk - 1

  for (let i = 0; i < trunk; i++) {
    if (baseY + i < maxH) world.setBlock(x, baseY + i, z, Block.Log)
  }

  const leaf = (lx: number, ly: number, lz: number) => {
    if (ly >= maxH) return
    if (world.getBlock(lx, ly, lz) === Block.Air) world.setBlock(lx, ly, lz, Block.Leaves)
  }

  // Wide lower canopy, narrow top, with softly rounded corners.
  for (let dy = -2; dy <= 1; dy++) {
    const ly = topY + dy
    const r = dy <= -1 ? 2 : 1
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (r === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2 && rng() < 0.6) continue
        leaf(x + dx, ly, z + dz)
      }
    }
  }
  leaf(x, topY + 2, z) // small cap
}
