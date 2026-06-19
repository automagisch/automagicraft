import { Block } from './blocks'
import type { World } from './World'

export interface RaycastHit {
  x: number
  y: number
  z: number
  blockId: number
  face: [number, number, number] // outward normal of the struck face
  dist: number
}

// DDA (grid-traversal) voxel ray march. Steps through the voxel grid along (dx,dy,dz)
// from origin (ox,oy,oz) and returns the first solid non-water block hit, or null.
// `face` is the inward normal flipped to point back toward the ray — use it to find
// the adjacent air block when placing.
export function raycastVoxel(
  world: World,
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  maxDist: number,
): RaycastHit | null {
  // Integer cell the ray starts in
  let bx = Math.floor(ox)
  let by = Math.floor(oy)
  let bz = Math.floor(oz)

  // Per-axis step direction
  const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0
  const sy = dy > 0 ? 1 : dy < 0 ? -1 : 0
  const sz = dz > 0 ? 1 : dz < 0 ? -1 : 0

  // t-distance between successive voxel crossings on each axis
  const dtx = sx !== 0 ? Math.abs(1 / dx) : Infinity
  const dty = sy !== 0 ? Math.abs(1 / dy) : Infinity
  const dtz = sz !== 0 ? Math.abs(1 / dz) : Infinity

  // t-distance to the first crossing on each axis
  let tmx = sx > 0 ? (bx + 1 - ox) / dx : sx < 0 ? (ox - bx) / -dx : Infinity
  let tmy = sy > 0 ? (by + 1 - oy) / dy : sy < 0 ? (oy - by) / -dy : Infinity
  let tmz = sz > 0 ? (bz + 1 - oz) / dz : sz < 0 ? (oz - bz) / -dz : Infinity

  let face: [number, number, number] = [0, 0, 0]
  let dist = 0

  while (dist < maxDist) {
    // Check current voxel (skip the starting block so we don't self-hit)
    if (dist > 0) {
      const id = world.getBlock(bx, by, bz)
      if (id !== Block.Air && id !== Block.Water) {
        return { x: bx, y: by, z: bz, blockId: id, face, dist }
      }
    }

    // Advance to next voxel crossing — pick the nearest axis
    if (tmx < tmy && tmx < tmz) {
      dist = tmx; tmx += dtx; bx += sx; face = [-sx, 0, 0]
    } else if (tmy < tmz) {
      dist = tmy; tmy += dty; by += sy; face = [0, -sy, 0]
    } else {
      dist = tmz; tmz += dtz; bz += sz; face = [0, 0, -sz]
    }
  }

  return null
}
