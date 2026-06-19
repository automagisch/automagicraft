import * as THREE from 'three'
import type { RaycastHit } from '../engine/raycast'
import type { World } from '../engine/World'
import { Block, BLOCK_COLORS } from '../engine/blocks'

function discTexture(): THREE.CanvasTexture {
  const size = 128
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.5)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.NoColorSpace
  return tex
}

// Build a vertex-colored box geometry using God Block's face palette.
function makeGodGeo(): THREE.BufferGeometry {
  const pal = BLOCK_COLORS[Block.God]
  const faces: ['top' | 'side' | 'bottom', number, number[][]][] = [
    ['top',    1.00, [[0,1,0],[0,1,1],[1,1,1],[1,1,0]]],
    ['bottom', 0.55, [[0,0,0],[1,0,0],[1,0,1],[0,0,1]]],
    ['side',   0.86, [[1,0,1],[1,0,0],[1,1,0],[1,1,1]]],
    ['side',   0.74, [[0,0,0],[0,0,1],[0,1,1],[0,1,0]]],
    ['side',   0.80, [[0,0,1],[1,0,1],[1,1,1],[0,1,1]]],
    ['side',   0.68, [[1,0,0],[0,0,0],[0,1,0],[1,1,0]]],
  ]
  const pos: number[] = []
  const col: number[] = []
  const idx: number[] = []
  let vc = 0
  for (const [key, shade, verts] of faces) {
    const base = pal[key]
    for (const [x, y, z] of verts) {
      pos.push(x - 0.5, y - 0.5, z - 0.5)  // centred at origin
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

interface DissolveBurst {
  points: THREE.Points
  velY: Float32Array   // per-particle upward drift speed
  velX: Float32Array
  velZ: Float32Array
  age: number
}

export class GodBlock {
  pos: [number, number, number]

  // Proximity / aim flags read by main.ts each frame
  inRange10 = false
  inRange2  = false
  aimed     = false

  private readonly scene: THREE.Scene
  private readonly glow: THREE.Sprite
  private readonly halo: THREE.Sprite
  private readonly mesh: THREE.Mesh
  private readonly meshMat: THREE.MeshBasicMaterial
  private phase = 0
  private bobTime = 0

  private dissolves: DissolveBurst[] = []

  constructor(scene: THREE.Scene, x: number, y: number, z: number) {
    this.scene = scene
    this.pos = [x, y, z]

    // ── Standalone animated block mesh (not rendered by the chunk mesher) ────
    // Uses its own material so it stays fully bright regardless of day-night tint —
    // intentional: the God Block reads as magical / always-visible.
    this.meshMat = new THREE.MeshBasicMaterial({ vertexColors: true })
    this.mesh = new THREE.Mesh(makeGodGeo(), this.meshMat)
    this.mesh.position.set(x + 0.5, y + 0.5, z + 0.5)
    scene.add(this.mesh)

    // ── Glow sprites ─────────────────────────────────────────────────────────
    const disc = discTexture()
    const gold = new THREE.Color(0xffe066)
    const makeMat = (opacity: number) =>
      new THREE.SpriteMaterial({
        map: disc, color: gold, fog: false,
        depthWrite: false, depthTest: false,
        transparent: true, blending: THREE.AdditiveBlending, opacity,
      })

    this.glow = new THREE.Sprite(makeMat(0.9))
    this.glow.scale.setScalar(2.4)
    this.glow.visible = false

    this.halo = new THREE.Sprite(makeMat(0.35))
    this.halo.scale.setScalar(5.5)
    this.halo.visible = false

    scene.add(this.halo)
    scene.add(this.glow)
    this.moveTo(x, y, z)
  }

  // ── Internal helper — update all floating object positions ─────────────────
  private moveTo(x: number, y: number, z: number): void {
    this.mesh.position.set(x + 0.5, y + 0.5, z + 0.5)
    // glow/halo follow the mesh, slightly above centre
    this.glow.position.set(x + 0.5, y + 0.8, z + 0.5)
    this.halo.position.set(x + 0.5, y + 0.8, z + 0.5)
  }

  update(dt: number, playerPos: THREE.Vector3, hit: RaycastHit | null): void {
    const [px, py, pz] = this.pos
    const dx = px + 0.5 - playerPos.x
    const dy = py + 0.5 - playerPos.y
    const dz = pz + 0.5 - playerPos.z
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

    this.inRange10 = dist < 10
    this.inRange2  = dist < 2.5
    this.aimed = hit !== null && hit.blockId === Block.God

    // ── Levitating animation ──────────────────────────────────────────────────
    this.bobTime += dt
    const bob = Math.sin(this.bobTime * 0.9) * 0.12           // gentle up/down
    const tiltX = Math.sin(this.bobTime * 0.37) * 0.05        // lazy wobble
    const tiltZ = Math.sin(this.bobTime * 0.51 + 1.2) * 0.05
    const spin  = this.bobTime * 0.4                           // slow spin

    this.mesh.position.y = py + 0.5 + bob
    this.mesh.rotation.set(tiltX, spin, tiltZ)
    this.glow.position.y = py + 0.8 + bob
    this.halo.position.y = py + 0.8 + bob

    // ── Glow pulse ───────────────────────────────────────────────────────────
    this.glow.visible = this.inRange10
    this.halo.visible = this.inRange10
    if (this.inRange10) {
      this.phase += dt * 1.8
      const pulse = Math.sin(this.phase) * 0.18 + 0.82
      const fast  = Math.sin(this.phase * 1.3 + 1) * 0.08 + 0.92
      ;(this.glow.material as THREE.SpriteMaterial).opacity = pulse * 0.9
      this.glow.scale.setScalar(2.4 * fast)
      ;(this.halo.material as THREE.SpriteMaterial).opacity = pulse * 0.35
      this.halo.scale.setScalar(5.5 * (0.9 + Math.sin(this.phase * 0.7) * 0.1))
    }

    // ── Dissolve particle update ──────────────────────────────────────────────
    for (let i = this.dissolves.length - 1; i >= 0; i--) {
      const b = this.dissolves[i]
      b.age += dt
      const t = b.age / 1.4
      const mat = b.points.material as THREE.PointsMaterial
      mat.opacity = Math.max(0, 1 - t)
      mat.size    = 0.22 * (1 - t * 0.6)

      const attr = b.points.geometry.attributes.position as THREE.BufferAttribute
      const arr  = attr.array as Float32Array
      for (let j = 0; j < b.velY.length; j++) {
        arr[j * 3]     += b.velX[j] * dt
        arr[j * 3 + 1] += b.velY[j] * dt
        arr[j * 3 + 2] += b.velZ[j] * dt
      }
      attr.needsUpdate = true

      if (t >= 1) {
        this.scene.remove(b.points)
        b.points.geometry.dispose()
        ;(b.points.material as THREE.Material).dispose()
        this.dissolves.splice(i, 1)
      }
    }
  }

  // Spawn a gold dissolve burst at the given world position.
  private spawnDissolve(x: number, y: number, z: number): void {
    const N = 28
    const pos   = new Float32Array(N * 3)
    const velX  = new Float32Array(N)
    const velY  = new Float32Array(N)
    const velZ  = new Float32Array(N)

    for (let i = 0; i < N; i++) {
      pos[i * 3]     = x + 0.5 + (Math.random() - 0.5) * 0.9
      pos[i * 3 + 1] = y + 0.5 + (Math.random() - 0.5) * 0.9
      pos[i * 3 + 2] = z + 0.5 + (Math.random() - 0.5) * 0.9
      const angle = Math.random() * Math.PI * 2
      const spd   = 0.3 + Math.random() * 0.5
      velX[i] = Math.cos(angle) * spd * 0.4
      velY[i] = 0.6 + Math.random() * 1.0   // mostly upward drift
      velZ[i] = Math.sin(angle) * spd * 0.4
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    const mat = new THREE.PointsMaterial({
      color: 0xffe066, size: 0.22, sizeAttenuation: true,
      transparent: true, opacity: 1, depthWrite: false,
    })
    const points = new THREE.Points(geo, mat)
    this.scene.add(points)
    this.dissolves.push({ points, velX, velY, velZ, age: 0 })
  }

  // Clear old position, spawn dissolve, teleport to a valid spot 6–16 blocks away.
  respawn(
    world: World,
    setBlockAt: (x: number, y: number, z: number, id: number) => void,
  ): void {
    const [ox, oy, oz] = this.pos
    setBlockAt(ox, oy, oz, Block.Air)
    this.spawnDissolve(ox, oy, oz)

    for (let attempt = 0; attempt < 80; attempt++) {
      const angle = Math.random() * Math.PI * 2
      const dist  = 6 + Math.random() * 10
      const nx    = Math.round(ox + Math.cos(angle) * dist)
      const nz    = Math.round(oz + Math.sin(angle) * dist)
      if (!world.inBounds(nx, 0, nz)) continue
      const ny = world.surfaceY(nx, nz)
      if (ny < 0 || ny + 1 >= world.sizeY) continue
      const top = world.getBlock(nx, ny, nz)
      if (top !== Block.Grass && top !== Block.Stone) continue
      if (world.getBlock(nx, ny + 1, nz) !== Block.Air) continue

      setBlockAt(nx, ny + 1, nz, Block.God)
      this.pos[0] = nx
      this.pos[1] = ny + 1
      this.pos[2] = nz
      this.moveTo(nx, ny + 1, nz)
      this.bobTime = 0
      return
    }
    // Fallback: restore at current position
    setBlockAt(ox, oy, oz, Block.God)
  }

  dispose(): void {
    this.scene.remove(this.mesh, this.glow, this.halo)
    this.mesh.geometry.dispose()
    this.meshMat.dispose()
    for (const b of this.dissolves) {
      this.scene.remove(b.points)
      b.points.geometry.dispose()
      ;(b.points.material as THREE.Material).dispose()
    }
  }
}
