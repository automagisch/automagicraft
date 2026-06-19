import { createNoise2D } from 'simplex-noise'
import { Block } from './blocks'
import type { World } from './World'
import { mulberry32 } from './rng'
import { config } from '../config'

export interface TerrainConfig {
  seed: number
  sizeX: number
  sizeZ: number
  height: number
}


const BASE_LEVEL = 34 // average ground height
const HILL_AMPLITUDE = 18 // vertical spread of hills/valleys around the base
const SAND_LEVEL = 28 // at/below this the surface is sand (valley floor / shores)
const ROCK_LEVEL = 62 // at/above this the surface is bare stone (peaks)
const WATER_LEVEL = 27 // water fills columns with terrain height below this up to this y

export function generateTerrain(world: World, cfg: TerrainConfig): { treeTops: [number, number, number][]; godBlockPos: [number, number, number] } {
  const noise2D = createNoise2D(mulberry32(cfg.seed))
  const treeRng = mulberry32(cfg.seed ^ 0x9e3779b9)
  const godRng  = mulberry32(cfg.seed ^ 0xc0ffee42)

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

  const treeTops = scatterTrees(world, heights, cfg, treeRng)

  // Flood low-lying valleys with water up to WATER_LEVEL.
  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x < sizeX; x++) {
      const h = heights[hi(x, z)]
      if (h < WATER_LEVEL) {
        for (let y = h + 1; y <= WATER_LEVEL; y++) {
          if (world.getBlock(x, y, z) === Block.Air) {
            world.setBlock(x, y, z, Block.Water)
          }
        }
      }
    }
  }

  // Publish per-column bounds for the mesher: continuous ground height, and the topmost
  // non-air cell (trees/leaves included).
  const topY = new Int32Array(sizeX * sizeZ)
  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x < sizeX; x++) topY[hi(x, z)] = world.surfaceY(x, z)
  }
  world.terrainHeight = heights
  world.topY = topY

  // Place the one God Block on a grass surface visible from the mountain peak.
  // We use `heights[]` (the terrain heightmap) rather than surfaceY() so we check the
  // actual ground surface, not tree canopy tops. Then we verify gy+1 is clear air.
  const cx2 = sizeX * 0.5
  const cz2 = sizeZ * 0.5
  let godBlockPos: [number, number, number] | null = null

  const tryPlace = (gx: number, gz: number): boolean => {
    if (gx < 1 || gx >= sizeX - 1 || gz < 1 || gz >= sizeZ - 1) return false
    const gy = heights[gx + gz * sizeX]
    if (gy < 1 || gy + 1 >= height) return false
    if (world.getBlock(gx, gy, gz) !== Block.Grass) return false
    if (world.getBlock(gx, gy + 1, gz) !== Block.Air) return false
    world.setBlock(gx, gy + 1, gz, Block.God)
    topY[gx + gz * sizeX] = gy + 1
    godBlockPos = [gx, gy + 1, gz]
    return true
  }

  // Phase 1: prioritise the mountain foothills (30–80 blocks from center).
  // This guarantees it's visible from the spawn peak regardless of seed.
  for (let attempt = 0; attempt < 300 && !godBlockPos; attempt++) {
    const angle = godRng() * Math.PI * 2
    const dist  = 30 + godRng() * 50
    tryPlace(Math.round(cx2 + Math.cos(angle) * dist), Math.round(cz2 + Math.sin(angle) * dist))
  }

  // Phase 2: widen to the full inner area if foothills had no luck (e.g. very rocky seeds).
  const inner = Math.max(0, Math.min(0.49, config.godBlockMargin))
  for (let attempt = 0; attempt < 300 && !godBlockPos; attempt++) {
    tryPlace(
      Math.floor(inner * sizeX + godRng() * sizeX * (1 - inner * 2)),
      Math.floor(inner * sizeZ + godRng() * sizeZ * (1 - inner * 2)),
    )
  }

  // Phase 3: exhaustive scan (stride 5) — virtually guaranteed to find something.
  if (!godBlockPos) {
    outer: for (let z = Math.floor(sizeZ * 0.05); z < sizeZ * 0.95; z += 5) {
      for (let x = Math.floor(sizeX * 0.05); x < sizeX * 0.95; x += 5) {
        if (tryPlace(x, z)) break outer
      }
    }
  }

  // Phase 4: absolute last resort — float above whatever is at the world center.
  if (!godBlockPos) {
    const fx = Math.floor(sizeX / 2)
    const fz = Math.floor(sizeZ / 2)
    const fy = Math.max(0, heights[fx + fz * sizeX]) + 1
    world.setBlock(fx, fy, fz, Block.God)
    topY[fx + fz * sizeX] = fy
    godBlockPos = [fx, fy, fz]
  }

  return { treeTops, godBlockPos: godBlockPos! }
}

// Trees are placed on a coarse grid (one candidate per cell) so they stay naturally spaced.
// Returns the world-space [x, perchY, z] of each placed tree's trunk top (natural bird perch).
function scatterTrees(
  world: World,
  heights: Int32Array,
  cfg: TerrainConfig,
  rng: () => number,
): [number, number, number][] {
  const { sizeX, sizeZ, height } = cfg
  const CELL = 7
  const hi = (x: number, z: number) => x + z * sizeX
  const tops: [number, number, number][] = []

  for (let cz = 0; cz < sizeZ; cz += CELL) {
    for (let cx = 0; cx < sizeX; cx += CELL) {
      if (rng() > 0.45) continue // ~45% of cells get a tree

      const x = cx + 1 + Math.floor(rng() * (CELL - 2))
      const z = cz + 1 + Math.floor(rng() * (CELL - 2))
      if (x < 2 || x >= sizeX - 2 || z < 2 || z >= sizeZ - 2) continue

      const h = heights[hi(x, z)]
      if (world.getBlock(x, h, z) !== Block.Grass) continue // only grow on grass

      const perchY = placeTree(world, x, h + 1, z, height, rng)
      tops.push([x, perchY, z])
    }
  }

  return tops
}

// Returns the Y of the top log block (birds perch here, inside the canopy).
function placeTree(
  world: World,
  x: number,
  baseY: number,
  z: number,
  maxH: number,
  rng: () => number,
): number {
  // Trunk weighted toward 5 (3 visible stem blocks under canopy): 15% → 4, 70% → 5, 15% → 6
  const tr = rng()
  const trunk = tr < 0.15 ? 4 : tr < 0.85 ? 5 : 6
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

  return topY + 2 // cap leaf block — birds perch on top of this
}
