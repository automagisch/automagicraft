import * as THREE from 'three'
import { Block } from '../engine/blocks'
import type { World } from '../engine/World'
import { Mob } from './Mob'

type RGB = [number, number, number]

const NOTICE_DIST = 10      // blocks — player within this radius is "noticed"
const SURFACE_CHANCE = 0.28 // probability a flight lands on ground/water instead of a tree
const TREE_SAMPLE = 150     // how many random trees to consider per flight decision
// time thresholds (DayNightCycle.time: 0=midnight, 0.25=sunrise, 0.5=noon, 0.75=sunset)
const NIGHT_START = 0.77
const NIGHT_END = 0.23

// Pastel bird palettes: [body, wing, head]. Fit the world's soft desaturated look.
export const BIRD_PALETTES: [RGB, RGB, RGB][] = [
  // Soft golden yellow
  [[0.91, 0.79, 0.42], [0.83, 0.71, 0.34], [0.95, 0.87, 0.54]],
  // Warm earthy brown
  [[0.77, 0.60, 0.44], [0.67, 0.50, 0.36], [0.83, 0.67, 0.50]],
  // Cool muted gray
  [[0.72, 0.74, 0.79], [0.64, 0.67, 0.72], [0.79, 0.81, 0.85]],
]

// Vertical offset from block surface to bird center (half body height + tiny gap).
const PERCH_OFFSET = 1.08

function flatColor(geo: THREE.BoxGeometry, c: RGB): void {
  const n = geo.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c[0]; arr[i * 3 + 1] = c[1]; arr[i * 3 + 2] = c[2]
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
}

export class BirdMob extends Mob {
  private state: 'perched' | 'flying' = 'perched'
  private perchTimer: number
  private sleeping = false
  private prevNight = false

  // Where the bird is currently perched (world-space center of the bird).
  private readonly perchPos = new THREE.Vector3()

  // Quadratic bezier flight: A (start) → C (control/arc peak) → B (end)
  private flightT = 0
  private flightDuration = 1
  private readonly flightA = new THREE.Vector3()
  private readonly flightB = new THREE.Vector3()
  private readonly flightC = new THREE.Vector3()

  // Wing pivots — rotated around Z for synchronized flap animation
  private readonly leftPivot: THREE.Object3D
  private readonly rightPivot: THREE.Object3D
  private wingPhase = 0

  // Cached world reference (set on first update, used for surface spot lookups)
  private world: World | null = null

  constructor(
    scene: THREE.Scene,
    material: THREE.MeshBasicMaterial,
    private readonly treeTops: [number, number, number][],
    startTree: number,
    palette: [RGB, RGB, RGB],
    rng: () => number,
  ) {
    super(scene)
    this.perchTimer = 2 + rng() * 6 // stagger initial departure times

    const [bodyColor, wingColor, headColor] = palette

    // Body
    const bodyGeo = new THREE.BoxGeometry(0.32, 0.16, 0.26)
    flatColor(bodyGeo, bodyColor)
    this.mesh.add(new THREE.Mesh(bodyGeo, material))

    // Head — front (+Z) and slightly up
    const headGeo = new THREE.BoxGeometry(0.18, 0.17, 0.17)
    flatColor(headGeo, headColor)
    const head = new THREE.Mesh(headGeo, material)
    head.position.set(0, 0.13, 0.12)
    this.mesh.add(head)

    // Wings — pivot at body edge, mesh extends outward; rotation around Z = flapping
    const makeWing = (sign: number): THREE.Object3D => {
      const pivot = new THREE.Object3D()
      pivot.position.set(sign * 0.13, 0, 0)
      const geo = new THREE.BoxGeometry(0.22, 0.04, 0.20)
      flatColor(geo, wingColor)
      const mesh = new THREE.Mesh(geo, material)
      mesh.position.set(sign * 0.11, 0, 0)
      pivot.add(mesh)
      this.mesh.add(pivot)
      return pivot
    }
    this.leftPivot = makeWing(-1)
    this.rightPivot = makeWing(1)

    // Start wings folded (drooped slightly below body)
    this.leftPivot.rotation.z = 0.45
    this.rightPivot.rotation.z = -0.45

    // Place at starting tree
    const [tx, ty, tz] = treeTops[startTree]
    this.perchPos.set(tx + 0.5, ty + PERCH_OFFSET, tz + 0.5)
    this.position.copy(this.perchPos)
    this.mesh.position.copy(this.position)
  }

  update(dt: number, playerPos: THREE.Vector3, world: World, dayTime: number): void {
    this.world = world
    const isNight = dayTime > NIGHT_START || dayTime < NIGHT_END

    // Night falls while perched → seek shelter
    if (isNight && !this.prevNight && this.state === 'perched' && !this.sleeping) {
      this.goSleep()
    }
    // Dawn breaks while sleeping at a roost → wake up
    if (!isNight && this.prevNight && this.sleeping && this.state === 'perched') {
      this.wakeUp()
    }
    this.prevNight = isNight

    if (this.sleeping && this.state === 'perched') {
      // Fold wings, face a fixed direction, do nothing
      this.leftPivot.rotation.z = 0.45
      this.rightPivot.rotation.z = -0.45
    } else if (this.state === 'perched') {
      const nearPlayer = this.position.distanceTo(playerPos) < NOTICE_DIST
      this.tickPerched(dt, nearPlayer, playerPos)
    } else {
      this.tickFlying(dt)
    }

    this.mesh.position.copy(this.position)
  }

  private tickPerched(dt: number, nearPlayer: boolean, playerPos: THREE.Vector3): void {
    this.leftPivot.rotation.z = 0.45
    this.rightPivot.rotation.z = -0.45

    // Face toward the player when they're close
    if (nearPlayer) {
      const dx = playerPos.x - this.position.x
      const dz = playerPos.z - this.position.z
      this.mesh.rotation.y = Math.atan2(dx, dz)
    }

    // Linger longer when the player is nearby — the bird notices them
    this.perchTimer -= dt * (nearPlayer ? 0.35 : 1.0)
    if (this.perchTimer <= 0) this.startFlight()
  }

  private tickFlying(dt: number): void {
    // Flap wings in sync
    this.wingPhase += dt * 7
    const flap = Math.sin(this.wingPhase) * 1.1
    // Negative left / positive right → both tips go up when flap > 0
    this.leftPivot.rotation.z = -flap
    this.rightPivot.rotation.z = flap

    this.flightT = Math.min(1, this.flightT + dt / this.flightDuration)
    const t = this.flightT
    const mt = 1 - t

    // Quadratic bezier: A → C → B
    this.position.set(
      mt * mt * this.flightA.x + 2 * mt * t * this.flightC.x + t * t * this.flightB.x,
      mt * mt * this.flightA.y + 2 * mt * t * this.flightC.y + t * t * this.flightB.y,
      mt * mt * this.flightA.z + 2 * mt * t * this.flightC.z + t * t * this.flightB.z,
    )

    // Point mesh nose toward the next position along the curve
    if (t < 0.97) {
      const lt = Math.min(1, t + 0.08)
      const lmt = 1 - lt
      const fx = lmt * lmt * this.flightA.x + 2 * lmt * lt * this.flightC.x + lt * lt * this.flightB.x
      const fz = lmt * lmt * this.flightA.z + 2 * lmt * lt * this.flightC.z + lt * lt * this.flightB.z
      const dx = fx - this.position.x
      const dz = fz - this.position.z
      if (Math.abs(dx) + Math.abs(dz) > 0.001) {
        this.mesh.rotation.y = Math.atan2(dx, dz)
      }
    }

    if (this.flightT >= 1) {
      this.state = 'perched'
      this.perchPos.copy(this.position)
      if (!this.sleeping) this.perchTimer = 3 + Math.random() * 6
      this.leftPivot.rotation.z = 0.45
      this.rightPivot.rotation.z = -0.45
    }
  }

  private goSleep(): void {
    this.sleeping = true
    const roost = this.findRoostTarget()
    if (!roost) return // no shelter nearby — sleep in place
    this.flightA.copy(this.perchPos)
    this.flightB.copy(roost)
    const dist = Math.hypot(roost.x - this.perchPos.x, roost.z - this.perchPos.z)
    const arcH = Math.max(2, dist * 0.3)
    this.flightC.set(
      (this.flightA.x + this.flightB.x) / 2,
      Math.max(this.flightA.y, this.flightB.y) + arcH,
      (this.flightA.z + this.flightB.z) / 2,
    )
    const speed = 3 + Math.random() * 2
    this.flightDuration = Math.max(0.5, dist / speed)
    this.flightT = 0
    this.state = 'flying'
  }

  private wakeUp(): void {
    this.sleeping = false
    this.perchTimer = 1 + Math.random() * 3
  }

  // Find a surface spot to sleep on that has overhead cover (a non-Air block somewhere
  // above the column — e.g. the base of a tree trunk tucked under the canopy).
  private findRoostTarget(): THREE.Vector3 | null {
    const world = this.world
    if (!world) return null

    for (let attempt = 0; attempt < 30; attempt++) {
      const angle = Math.random() * Math.PI * 2
      const dist = 3 + Math.random() * 22
      const tx = Math.round(this.perchPos.x + Math.cos(angle) * dist)
      const tz = Math.round(this.perchPos.z + Math.sin(angle) * dist)
      if (tx < 1 || tx >= world.sizeX - 1 || tz < 1 || tz >= world.sizeZ - 1) continue

      const surfTop = world.surfaceY(tx, tz)
      if (surfTop < 0) continue

      // Only sleep on walkable ground (not leaves/logs/water)
      const top = world.getBlock(tx, surfTop, tz)
      if (top !== Block.Grass && top !== Block.Sand && top !== Block.Stone) continue

      // Require at least one non-Air block overhead — tree canopy, trunk, or overhang
      let hasCover = false
      for (let y = surfTop + 2; y <= Math.min(surfTop + 14, world.sizeY - 1); y++) {
        if (world.getBlock(tx, y, tz) !== Block.Air) { hasCover = true; break }
      }
      if (!hasCover) continue

      return new THREE.Vector3(tx + 0.5, surfTop + PERCH_OFFSET, tz + 0.5)
    }
    return null
  }

  private startFlight(): void {
    const goToSurface = Math.random() < SURFACE_CHANCE

    let targetPos: THREE.Vector3 | null = null

    if (goToSurface) {
      targetPos = this.findSurfaceTarget()
    }
    // Fall back to tree if surface search failed (e.g. no suitable spot found)
    if (!targetPos) {
      targetPos = this.findTreeTarget()
    }

    if (!targetPos) {
      // Truly no target — sit a bit longer
      this.perchTimer = 2 + Math.random() * 3
      return
    }

    this.flightA.copy(this.perchPos)
    this.flightB.copy(targetPos)

    const dist = Math.hypot(
      this.flightB.x - this.flightA.x,
      this.flightB.z - this.flightA.z,
    )
    const arcH = Math.max(4, dist * 0.4)
    this.flightC.set(
      (this.flightA.x + this.flightB.x) / 2,
      Math.max(this.flightA.y, this.flightB.y) + arcH,
      (this.flightA.z + this.flightB.z) / 2,
    )

    const speed = 4.5 + Math.random() * 2.5
    this.flightDuration = Math.max(0.5, dist / speed)
    this.flightT = 0
    this.state = 'flying'
  }

  // Pick a random tree within a variable radius. Samples a subset for performance.
  private findTreeTarget(): THREE.Vector3 | null {
    const px = this.perchPos.x
    const pz = this.perchPos.z
    const maxDist = 18 + Math.random() * 65

    const candidates: number[] = []
    const n = this.treeTops.length
    const sample = Math.min(n, TREE_SAMPLE)

    for (let s = 0; s < sample; s++) {
      const i = Math.floor(Math.random() * n)
      const [tx, , tz] = this.treeTops[i]
      const d = Math.hypot(tx - px, tz - pz)
      if (d >= 5 && d <= maxDist) candidates.push(i)
    }

    if (candidates.length === 0) return null
    const [tx, ty, tz] = this.treeTops[candidates[Math.floor(Math.random() * candidates.length)]]
    return new THREE.Vector3(tx + 0.5, ty + PERCH_OFFSET, tz + 0.5)
  }

  // Pick a nearby surface spot (ground or water) by checking what block is at the top
  // of random nearby columns. Skips leaves/logs so birds don't "land" on hidden tree tops.
  private findSurfaceTarget(): THREE.Vector3 | null {
    const world = this.world
    if (!world) return null

    for (let attempt = 0; attempt < 18; attempt++) {
      const angle = Math.random() * Math.PI * 2
      const dist = 6 + Math.random() * 32
      const tx = Math.round(this.perchPos.x + Math.cos(angle) * dist)
      const tz = Math.round(this.perchPos.z + Math.sin(angle) * dist)
      if (tx < 1 || tx >= world.sizeX - 1 || tz < 1 || tz >= world.sizeZ - 1) continue

      const ty = world.surfaceY(tx, tz)
      if (ty < 0) continue

      const top = world.getBlock(tx, ty, tz)
      // Only land on natural open surfaces — skip tree canopy (leaves/logs)
      if (top !== Block.Grass && top !== Block.Sand && top !== Block.Stone && top !== Block.Water) continue

      return new THREE.Vector3(tx + 0.5, ty + PERCH_OFFSET, tz + 0.5)
    }
    return null
  }
}
