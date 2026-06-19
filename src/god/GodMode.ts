import * as THREE from 'three'
import { Block, BLOCK_COLORS, type BlockId } from '../engine/blocks'
import type { World } from '../engine/World'
import type { RaycastHit } from '../engine/raycast'

// Blocks the player can pick up and place. God Block is intentionally excluded.
export const PLACEABLE: BlockId[] = [
  Block.Grass, Block.Stone, Block.Sand, Block.Log, Block.Leaves,
]

export interface InventorySlot {
  blockId: BlockId
  count: number
}

// Build a hand-preview cube geometry with baked per-face directional shading.
function makeBlockGeo(blockId: number): THREE.BufferGeometry {
  const palette = BLOCK_COLORS[blockId]
  const pos: number[] = []
  const col: number[] = []
  const idx: number[] = []
  let vc = 0

  // [colorKey, shade, quad verts CCW from outside]
  const faces: ['top' | 'side' | 'bottom', number, [number, number, number][]][] = [
    ['top',    1.00, [[0,1,0],[0,1,1],[1,1,1],[1,1,0]]],
    ['bottom', 0.55, [[0,0,0],[1,0,0],[1,0,1],[0,0,1]]],
    ['side',   0.86, [[1,0,1],[1,0,0],[1,1,0],[1,1,1]]],
    ['side',   0.74, [[0,0,0],[0,0,1],[0,1,1],[0,1,0]]],
    ['side',   0.80, [[0,0,1],[1,0,1],[1,1,1],[0,1,1]]],
    ['side',   0.68, [[1,0,0],[0,0,0],[0,1,0],[1,1,0]]],
  ]

  for (const [key, shade, verts] of faces) {
    const base = palette[key]
    for (const [x, y, z] of verts) {
      pos.push(x, y, z)
      col.push(base[0] * shade, base[1] * shade, base[2] * shade)
    }
    idx.push(vc, vc + 1, vc + 2, vc, vc + 2, vc + 3)
    vc += 4
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geo.setIndex(idx)
  return geo
}

export class GodMode {
  active = false
  selectedSlot = 0

  // 10 inventory slots; start empty — filled by collecting blocks in the world
  readonly slots: (InventorySlot | null)[] = Array.from({ length: 10 }, () => null)

  // Second scene for the first-person hand block, rendered on top of the world
  readonly handScene = new THREE.Scene()
  readonly handCamera: THREE.PerspectiveCamera
  private readonly handMat: THREE.MeshBasicMaterial
  private handMesh: THREE.Mesh | null = null

  // Wireframe target box added to the main scene externally (main.ts manages it)
  readonly targetBox: THREE.LineSegments

  constructor(mainScene: THREE.Scene) {
    this.handMat = new THREE.MeshBasicMaterial({ vertexColors: true })

    // Hand camera looks down -Z; hand block sits in the lower-right
    this.handCamera = new THREE.PerspectiveCamera(
      60, window.innerWidth / window.innerHeight, 0.01, 10,
    )
    window.addEventListener('resize', () => {
      this.handCamera.aspect = window.innerWidth / window.innerHeight
      this.handCamera.updateProjectionMatrix()
    })

    // Target box — white wireframe around the aimed block, added to main scene
    const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.005, 1.005, 1.005))
    this.targetBox = new THREE.LineSegments(
      edgeGeo,
      new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.55, transparent: true }),
    )
    this.targetBox.visible = false
    mainScene.add(this.targetBox)

    this.rebuildHand()
  }

  toggle(): void {
    this.active = !this.active
    if (!this.active) this.targetBox.visible = false
  }

  selectSlot(delta: number): void {
    this.selectedSlot = ((this.selectedSlot + delta) % 10 + 10) % 10
    this.rebuildHand()
  }

  addToInventory(blockId: BlockId): void {
    // Try to stack onto an existing slot with the same type
    for (const slot of this.slots) {
      if (slot && slot.blockId === blockId && slot.count < 64) {
        slot.count = Math.min(64, slot.count + 1)
        return
      }
    }
    // Fill first empty slot
    for (let i = 0; i < this.slots.length; i++) {
      if (!this.slots[i]) {
        this.slots[i] = { blockId, count: 1 }
        return
      }
    }
    // Inventory full — silently drop
  }

  currentBlock(): BlockId | null {
    return this.slots[this.selectedSlot]?.blockId ?? null
  }

  // Place selected block on the face of the hit block. Returns true if placed.
  placeBlock(
    hit: RaycastHit,
    world: World,
    setBlockAt: (x: number, y: number, z: number, id: number) => void,
  ): boolean {
    const slot = this.slots[this.selectedSlot]
    if (!slot || slot.count <= 0) return false

    const nx = hit.x + hit.face[0]
    const ny = hit.y + hit.face[1]
    const nz = hit.z + hit.face[2]

    if (!world.inBounds(nx, ny, nz)) return false
    const existing = world.getBlock(nx, ny, nz)
    if (existing !== Block.Air && existing !== Block.Water) return false

    setBlockAt(nx, ny, nz, slot.blockId)
    slot.count--
    if (slot.count <= 0) this.slots[this.selectedSlot] = null
    return true
  }

  // Collect the hit block into inventory. Returns true if collected.
  collectBlock(
    hit: RaycastHit,
    _world: World,
    setBlockAt: (x: number, y: number, z: number, id: number) => void,
  ): boolean {
    if (hit.blockId === Block.God) return false  // can't collect the God Block
    if (!PLACEABLE.includes(hit.blockId as BlockId)) return false

    setBlockAt(hit.x, hit.y, hit.z, Block.Air)
    this.addToInventory(hit.blockId as BlockId)
    return true
  }

  update(hit: RaycastHit | null): void {
    if (!this.active) {
      this.targetBox.visible = false
      return
    }

    if (hit) {
      this.targetBox.visible = true
      this.targetBox.position.set(hit.x + 0.5025, hit.y + 0.5025, hit.z + 0.5025)
    } else {
      this.targetBox.visible = false
    }
  }

  renderHand(renderer: THREE.WebGLRenderer): void {
    if (!this.active) return
    renderer.autoClear = false
    renderer.clearDepth()
    renderer.render(this.handScene, this.handCamera)
    renderer.autoClear = true
  }

  private rebuildHand(): void {
    if (this.handMesh) {
      this.handScene.remove(this.handMesh)
      this.handMesh.geometry.dispose()
      this.handMesh = null
    }

    const blockId = this.currentBlock()
    if (blockId === null) return

    const geo = makeBlockGeo(blockId)
    this.handMesh = new THREE.Mesh(geo, this.handMat)
    // Position in the lower-right of view — hand camera looks down -Z
    this.handMesh.position.set(0.72, -0.6, -1.1)
    this.handMesh.rotation.set(0.25, -0.5, 0.1)
    this.handMesh.scale.setScalar(0.48)
    this.handScene.add(this.handMesh)
  }
}
