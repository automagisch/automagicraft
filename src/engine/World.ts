import { Block } from './blocks'

// Voxel store backed by a single flat Uint8Array.
// Index layout: x + sizeX * (z + sizeZ * y).
export class World {
  readonly sizeX: number
  readonly sizeY: number
  readonly sizeZ: number
  readonly data: Uint8Array

  // Per-column maps filled by terrain generation; used to bound the mesher so it never
  // iterates the buried interior. `terrainHeight` = top of the continuous solid ground;
  // `topY` = topmost non-air cell including trees/overhanging leaves.
  terrainHeight: Int32Array | null = null
  topY: Int32Array | null = null

  constructor(sizeX: number, sizeY: number, sizeZ: number) {
    this.sizeX = sizeX
    this.sizeY = sizeY
    this.sizeZ = sizeZ
    this.data = new Uint8Array(sizeX * sizeY * sizeZ)
  }

  private idx(x: number, y: number, z: number): number {
    return x + this.sizeX * (z + this.sizeZ * y)
  }

  inBounds(x: number, y: number, z: number): boolean {
    return (
      x >= 0 && x < this.sizeX &&
      y >= 0 && y < this.sizeY &&
      z >= 0 && z < this.sizeZ
    )
  }

  // Returns Air outside the world — used by the mesher so edge faces are emitted.
  getBlock(x: number, y: number, z: number): number {
    if (!this.inBounds(x, y, z)) return Block.Air
    return this.data[this.idx(x, y, z)]
  }

  setBlock(x: number, y: number, z: number, id: number): void {
    if (!this.inBounds(x, y, z)) return
    this.data[this.idx(x, y, z)] = id
  }

  // Topmost non-air block in a column, or -1 if the column is empty.
  surfaceY(x: number, z: number): number {
    for (let y = this.sizeY - 1; y >= 0; y--) {
      if (this.getBlock(x, y, z) !== Block.Air) return y
    }
    return -1
  }

  // Collision view of the world: world borders and everything below y=0 are solid
  // (invisible walls + bedrock) so the player stays contained. The open sky (y>=sizeY)
  // is not solid.
  isSolid(x: number, y: number, z: number): boolean {
    if (y < 0) return true
    if (y >= this.sizeY) return false
    if (x < 0 || x >= this.sizeX || z < 0 || z >= this.sizeZ) return true
    const b = this.data[this.idx(x, y, z)]
    return b !== Block.Air && b !== Block.Water && b !== Block.God
  }
}
