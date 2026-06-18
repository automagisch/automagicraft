import * as THREE from 'three'
import { Block, BLOCK_COLORS } from './blocks'
import type { World } from './World'

// Brightness per ambient-occlusion level (0 = most occluded corner, 3 = open).
const AO_BRIGHTNESS = [0.45, 0.62, 0.8, 1.0]

type Vec3 = [number, number, number]

interface FaceVert {
  pos: Vec3 // corner offset within the unit cube
  du: 0 | 1 // position along the face's u axis (for AO sampling)
  dv: 0 | 1 // position along the face's v axis
}

interface FaceDef {
  nb: Vec3 // neighbor offset = outward normal; face is hidden if this neighbor is solid
  u: Vec3 // in-plane axis 1
  v: Vec3 // in-plane axis 2
  shade: number // directional face shading (fakes a fixed sun)
  colorKey: 'top' | 'side' | 'bottom'
  verts: [FaceVert, FaceVert, FaceVert, FaceVert] // CCW from outside
}

// Vertices are ordered counter-clockwise viewed from outside so default front-face
// culling keeps the outward face.
const FACES: FaceDef[] = [
  {
    // +Y top
    nb: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1], shade: 1.0, colorKey: 'top',
    verts: [
      { pos: [0, 1, 0], du: 0, dv: 0 },
      { pos: [0, 1, 1], du: 0, dv: 1 },
      { pos: [1, 1, 1], du: 1, dv: 1 },
      { pos: [1, 1, 0], du: 1, dv: 0 },
    ],
  },
  {
    // -Y bottom
    nb: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], shade: 0.55, colorKey: 'bottom',
    verts: [
      { pos: [0, 0, 0], du: 0, dv: 0 },
      { pos: [1, 0, 0], du: 1, dv: 0 },
      { pos: [1, 0, 1], du: 1, dv: 1 },
      { pos: [0, 0, 1], du: 0, dv: 1 },
    ],
  },
  {
    // +X
    nb: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1], shade: 0.86, colorKey: 'side',
    verts: [
      { pos: [1, 0, 1], du: 0, dv: 1 },
      { pos: [1, 0, 0], du: 0, dv: 0 },
      { pos: [1, 1, 0], du: 1, dv: 0 },
      { pos: [1, 1, 1], du: 1, dv: 1 },
    ],
  },
  {
    // -X
    nb: [-1, 0, 0], u: [0, 1, 0], v: [0, 0, 1], shade: 0.74, colorKey: 'side',
    verts: [
      { pos: [0, 0, 0], du: 0, dv: 0 },
      { pos: [0, 0, 1], du: 0, dv: 1 },
      { pos: [0, 1, 1], du: 1, dv: 1 },
      { pos: [0, 1, 0], du: 1, dv: 0 },
    ],
  },
  {
    // +Z
    nb: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], shade: 0.8, colorKey: 'side',
    verts: [
      { pos: [0, 0, 1], du: 0, dv: 0 },
      { pos: [1, 0, 1], du: 1, dv: 0 },
      { pos: [1, 1, 1], du: 1, dv: 1 },
      { pos: [0, 1, 1], du: 0, dv: 1 },
    ],
  },
  {
    // -Z
    nb: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0], shade: 0.68, colorKey: 'side',
    verts: [
      { pos: [1, 0, 0], du: 1, dv: 0 },
      { pos: [0, 0, 0], du: 0, dv: 0 },
      { pos: [0, 1, 0], du: 0, dv: 1 },
      { pos: [1, 1, 0], du: 1, dv: 1 },
    ],
  },
]

function vertexAO(side1: boolean, side2: boolean, corner: boolean): number {
  if (side1 && side2) return 0
  return 3 - ((side1 ? 1 : 0) + (side2 ? 1 : 0) + (corner ? 1 : 0))
}

// Builds one BufferGeometry for the chunk region [cx0, cx0+csize) x [cz0, cz0+csize).
// Only faces adjacent to air are emitted, and each column is meshed only from its lowest
// exposed level up to its top — buried interior cells are skipped entirely.
// Returns null for an empty chunk.
export function buildChunkGeometry(
  world: World,
  cx0: number,
  cz0: number,
  csize: number,
): THREE.BufferGeometry | null {
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  let vcount = 0

  const data = world.data
  const SX = world.sizeX
  const SY = world.sizeY
  const SZ = world.sizeZ
  const SXZ = SX * SZ
  const topMap = world.topY!
  const terrMap = world.terrainHeight!

  // Fast solid test: the world floor (y<0) is solid (cull bottom faces); sky and the
  // horizontal borders read as air.
  const solid = (x: number, y: number, z: number): boolean => {
    if (y < 0) return true
    if (x < 0 || x >= SX || y >= SY || z < 0 || z >= SZ) return false
    return data[x + SX * z + SXZ * y] !== 0
  }

  const x1 = Math.min(cx0 + csize, SX)
  const z1 = Math.min(cz0 + csize, SZ)

  for (let z = cz0; z < z1; z++) {
    for (let x = cx0; x < x1; x++) {
      const top = topMap[x + z * SX]
      if (top < 0) continue

      // Lowest level that can be exposed: just above the shortest solid neighbor column.
      // Out-of-world neighbors (-1) make the world-edge column mesh to the ground.
      const tl = x > 0 ? terrMap[x - 1 + z * SX] : -1
      const tr = x < SX - 1 ? terrMap[x + 1 + z * SX] : -1
      const td = z > 0 ? terrMap[x + (z - 1) * SX] : -1
      const tu = z < SZ - 1 ? terrMap[x + (z + 1) * SX] : -1
      const low = Math.min(tl, tr, td, tu)
      const startY = low < 0 ? 0 : low

      for (let y = startY; y <= top; y++) {
        const id = data[x + SX * z + SXZ * y]
        if (id === Block.Air) continue

        const palette = BLOCK_COLORS[id]
        for (const f of FACES) {
          const nx = x + f.nb[0]
          const ny = y + f.nb[1]
          const nz = z + f.nb[2]
          if (solid(nx, ny, nz)) continue // hidden face

          const base = palette[f.colorKey]
          const ao0 = aoAt(solid, nx, ny, nz, f, 0)
          const ao1 = aoAt(solid, nx, ny, nz, f, 1)
          const ao2 = aoAt(solid, nx, ny, nz, f, 2)
          const ao3 = aoAt(solid, nx, ny, nz, f, 3)
          const ao = [ao0, ao1, ao2, ao3]

          for (let i = 0; i < 4; i++) {
            const vert = f.verts[i]
            positions.push(x + vert.pos[0], y + vert.pos[1], z + vert.pos[2])
            const bright = AO_BRIGHTNESS[ao[i]] * f.shade
            colors.push(base[0] * bright, base[1] * bright, base[2] * bright)
          }

          // Flip the quad's diagonal when AO is asymmetric to avoid shading artifacts.
          if (ao0 + ao2 > ao1 + ao3) {
            indices.push(vcount, vcount + 1, vcount + 2, vcount, vcount + 2, vcount + 3)
          } else {
            indices.push(vcount + 1, vcount + 2, vcount + 3, vcount + 1, vcount + 3, vcount)
          }
          vcount += 4
        }
      }
    }
  }

  if (vcount === 0) return null

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.setIndex(indices)
  geo.computeBoundingSphere() // needed for correct frustum culling
  return geo
}

function aoAt(
  solid: (x: number, y: number, z: number) => boolean,
  nx: number,
  ny: number,
  nz: number,
  f: FaceDef,
  vertIndex: number,
): number {
  const vert = f.verts[vertIndex]
  const ux = vert.du ? f.u[0] : -f.u[0]
  const uy = vert.du ? f.u[1] : -f.u[1]
  const uz = vert.du ? f.u[2] : -f.u[2]
  const vx = vert.dv ? f.v[0] : -f.v[0]
  const vy = vert.dv ? f.v[1] : -f.v[1]
  const vz = vert.dv ? f.v[2] : -f.v[2]
  const side1 = solid(nx + ux, ny + uy, nz + uz)
  const side2 = solid(nx + vx, ny + vy, nz + vz)
  const corner = solid(nx + ux + vx, ny + uy + vy, nz + uz + vz)
  return vertexAO(side1, side2, corner)
}
