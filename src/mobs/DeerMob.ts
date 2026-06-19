import * as THREE from 'three'
import { Block } from '../engine/blocks'
import type { World } from '../engine/World'
import { Mob } from './Mob'

type RGB = [number, number, number]

const ALERT_DIST = 18
const FLEE_DIST  = 10
const CALM_DIST  = 30
const WALK_SPEED = 1.8
const FLEE_SPEED = 7.5
// Distance from block-top Y to deer body center.
// Feet at (leg pivot + leg mesh offset + half-leg-h) = 0.22 + 0.275 + 0.275 = 0.77
// Body center = 1.0 (block height) + 0.77 = 1.77
const FOOT_OFFSET = 1.77
const NIGHT_START = 0.77
const NIGHT_END   = 0.23

export const DEER_PALETTES: [RGB, RGB, RGB][] = [
  // [body, belly/antler highlight, legs/snout]
  [[0.60, 0.38, 0.18], [0.82, 0.66, 0.42], [0.44, 0.26, 0.12]],
  [[0.65, 0.44, 0.24], [0.84, 0.68, 0.46], [0.50, 0.32, 0.16]],
  [[0.58, 0.40, 0.22], [0.78, 0.62, 0.40], [0.44, 0.30, 0.16]],
]

function flatColor(geo: THREE.BoxGeometry, c: RGB): void {
  const n = geo.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c[0]; arr[i * 3 + 1] = c[1]; arr[i * 3 + 2] = c[2]
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
}

export class DeerMob extends Mob {
  private state: 'grazing' | 'alert' | 'fleeing' | 'sleeping' = 'grazing'
  private grazeTimer: number
  private alertTimer = 0
  private sleeping = false
  private prevNight = false

  private readonly walkTarget = new THREE.Vector3()
  private walkPhase = 0
  private headBobPhase = 0
  private targetY: number  // smoothly tracked ground Y

  private readonly frontLeft:  THREE.Object3D
  private readonly frontRight: THREE.Object3D
  private readonly backLeft:   THREE.Object3D
  private readonly backRight:  THREE.Object3D
  private readonly headPivot:  THREE.Object3D

  // startBlockY is the surface block Y index (not world-space Y)
  constructor(
    scene: THREE.Scene,
    material: THREE.MeshBasicMaterial,
    startX: number,
    startBlockY: number,
    startZ: number,
    palette: [RGB, RGB, RGB],
    rng: () => number,
  ) {
    super(scene)
    this.grazeTimer = 2 + rng() * 8
    this.targetY = startBlockY + FOOT_OFFSET
    this.position.set(startX, this.targetY, startZ)

    const [bodyColor, highlightColor, legColor] = palette

    // Body — narrow (X) and long (Z) like a real deer
    const bodyGeo = new THREE.BoxGeometry(0.38, 0.44, 0.88)
    flatColor(bodyGeo, bodyColor)
    this.mesh.add(new THREE.Mesh(bodyGeo, material))

    // Belly highlight strip
    const bellyGeo = new THREE.BoxGeometry(0.26, 0.02, 0.66)
    flatColor(bellyGeo, highlightColor)
    const belly = new THREE.Mesh(bellyGeo, material)
    belly.position.set(0, -0.21, 0)
    this.mesh.add(belly)

    // Legs — pivot at body bottom, mesh hangs downward
    const makeLeg = (sx: number, sz: number): THREE.Object3D => {
      const pivot = new THREE.Object3D()
      pivot.position.set(sx * 0.13, -0.22, sz * 0.30)
      const geo = new THREE.BoxGeometry(0.11, 0.55, 0.11)
      flatColor(geo, legColor)
      const mesh = new THREE.Mesh(geo, material)
      mesh.position.set(0, -0.275, 0)
      pivot.add(mesh)
      this.mesh.add(pivot)
      return pivot
    }
    this.frontLeft  = makeLeg(-1,  1)
    this.frontRight = makeLeg( 1,  1)
    this.backLeft   = makeLeg(-1, -1)
    this.backRight  = makeLeg( 1, -1)

    // Neck
    const neckGeo = new THREE.BoxGeometry(0.18, 0.38, 0.18)
    flatColor(neckGeo, bodyColor)
    const neck = new THREE.Mesh(neckGeo, material)
    neck.position.set(0, 0.30, 0.22)
    neck.rotation.x = -0.30
    this.mesh.add(neck)

    // Head pivot
    this.headPivot = new THREE.Object3D()
    this.headPivot.position.set(0, 0.54, 0.40)

    const headGeo = new THREE.BoxGeometry(0.24, 0.22, 0.32)
    flatColor(headGeo, bodyColor)
    this.headPivot.add(new THREE.Mesh(headGeo, material))

    // Snout
    const snoutGeo = new THREE.BoxGeometry(0.14, 0.12, 0.14)
    flatColor(snoutGeo, legColor)
    const snout = new THREE.Mesh(snoutGeo, material)
    snout.position.set(0, -0.04, 0.22)
    this.headPivot.add(snout)

    // Antlers — lighter than body, small upward spikes with a short branch
    const antlerPositions: [number, number, number][] = [[-0.10, 0.14, -0.06], [0.10, 0.14, -0.06]]
    for (const [ax, ay, az] of antlerPositions) {
      const sign = ax < 0 ? -1 : 1
      // Main spike
      const spikeGeo = new THREE.BoxGeometry(0.04, 0.16, 0.04)
      flatColor(spikeGeo, highlightColor)
      const spike = new THREE.Mesh(spikeGeo, material)
      spike.position.set(ax, ay, az)
      this.headPivot.add(spike)
      // Short outward branch near the top
      const branchGeo = new THREE.BoxGeometry(0.10, 0.03, 0.03)
      flatColor(branchGeo, highlightColor)
      const branch = new THREE.Mesh(branchGeo, material)
      branch.position.set(ax + sign * 0.04, ay + 0.06, az)
      this.headPivot.add(branch)
    }

    this.mesh.add(this.headPivot)
    this.walkTarget.copy(this.position)
    this.mesh.position.copy(this.position)
  }

  update(dt: number, playerPos: THREE.Vector3, world: World, dayTime: number): void {
    const isNight = dayTime > NIGHT_START || dayTime < NIGHT_END
    const distToPlayer = this.position.distanceTo(playerPos)

    if (isNight && !this.prevNight && !this.sleeping) {
      this.sleeping = true
      this.state = 'sleeping'
    }
    if (!isNight && this.prevNight && this.sleeping) {
      this.sleeping = false
      this.grazeTimer = 1 + Math.random() * 3
      this.state = 'grazing'
    }
    this.prevNight = isNight

    if (!this.sleeping) {
      if (distToPlayer < FLEE_DIST && this.state !== 'fleeing') {
        this.state = 'fleeing'
      } else if (distToPlayer < ALERT_DIST && this.state === 'grazing') {
        this.state = 'alert'
        this.alertTimer = 4 + Math.random() * 3
      }
    }

    if      (this.state === 'grazing')  this.tickGrazing(dt, world)
    else if (this.state === 'alert')    this.tickAlert(dt, playerPos, world)
    else if (this.state === 'fleeing')  this.tickFleeing(dt, playerPos, world)
    else if (this.state === 'sleeping') this.tickSleeping()

    this.lerpToGround(world, dt)
    this.mesh.position.copy(this.position)
  }

  private tickGrazing(dt: number, world: World): void {
    this.grazeTimer -= dt
    const dx = this.walkTarget.x - this.position.x
    const dz = this.walkTarget.z - this.position.z
    const dist = Math.hypot(dx, dz)
    const moving = dist > 0.3

    if (moving) {
      const speed = WALK_SPEED * dt
      this.position.x += (dx / dist) * speed
      this.position.z += (dz / dist) * speed
      this.mesh.rotation.y = Math.atan2(dx, dz)
      this.walkPhase += dt * 4.5
      this.animateLegs(Math.sin(this.walkPhase) * 0.42)
    } else {
      this.animateLegs(0)
    }

    this.headBobPhase += dt * (moving ? 2.5 : 1.0)
    this.headPivot.rotation.x = Math.sin(this.headBobPhase) * (moving ? 0.07 : 0.20)

    if (this.grazeTimer <= 0) this.pickNewTarget(world)
  }

  private tickAlert(dt: number, playerPos: THREE.Vector3, world: World): void {
    this.animateLegs(0)
    this.headPivot.rotation.x = -0.28

    const dx = playerPos.x - this.position.x
    const dz = playerPos.z - this.position.z
    this.mesh.rotation.y = Math.atan2(dx, dz)

    this.alertTimer -= dt
    if (this.alertTimer <= 0) {
      this.state = 'grazing'
      this.grazeTimer = 4 + Math.random() * 6
      this.pickNewTarget(world)
    }
  }

  private tickFleeing(dt: number, playerPos: THREE.Vector3, world: World): void {
    const dx = this.position.x - playerPos.x
    const dz = this.position.z - playerPos.z
    const dist = Math.hypot(dx, dz)

    if (dist > CALM_DIST) {
      this.state = 'grazing'
      this.grazeTimer = 5 + Math.random() * 8
      this.pickNewTarget(world)
      return
    }

    const speed = FLEE_SPEED * dt
    this.position.x = Math.max(2, Math.min(world.sizeX - 2, this.position.x + (dx / dist) * speed))
    this.position.z = Math.max(2, Math.min(world.sizeZ - 2, this.position.z + (dz / dist) * speed))
    this.mesh.rotation.y = Math.atan2(dx, dz)

    this.walkPhase += dt * 9
    this.animateLegs(Math.sin(this.walkPhase) * 0.72)
    this.headPivot.rotation.x = 0.12
  }

  private tickSleeping(): void {
    this.animateLegs(0)
    this.headPivot.rotation.x = 0.38
  }

  private animateLegs(swing: number): void {
    this.frontLeft.rotation.x  =  swing
    this.backRight.rotation.x  =  swing
    this.frontRight.rotation.x = -swing
    this.backLeft.rotation.x   = -swing
  }

  // Scan downward for the highest solid walkable block (skips leaves, logs, water).
  // Lerp position.y smoothly toward the result so step-ups feel gradual.
  private lerpToGround(world: World, dt: number): void {
    const gx = Math.floor(this.position.x)
    const gz = Math.floor(this.position.z)
    if (gx < 1 || gx >= world.sizeX - 1 || gz < 1 || gz >= world.sizeZ - 1) return

    for (let y = world.sizeY - 1; y >= 0; y--) {
      const b = world.getBlock(gx, y, gz)
      if (b === Block.Air || b === Block.Leaves || b === Block.Log || b === Block.Water) continue
      this.targetY = y + FOOT_OFFSET
      break
    }
    this.position.y += (this.targetY - this.position.y) * Math.min(1, dt * 12)
  }

  private pickNewTarget(world: World): void {
    for (let attempt = 0; attempt < 14; attempt++) {
      const angle = Math.random() * Math.PI * 2
      const d = 5 + Math.random() * 14
      const tx = this.position.x + Math.cos(angle) * d
      const tz = this.position.z + Math.sin(angle) * d
      const gx = Math.floor(tx)
      const gz = Math.floor(tz)
      if (gx < 2 || gx >= world.sizeX - 2 || gz < 2 || gz >= world.sizeZ - 2) continue
      // Find walkable surface — same skip logic as lerpToGround
      let sy = -1
      for (let y = world.sizeY - 1; y >= 0; y--) {
        const b = world.getBlock(gx, y, gz)
        if (b === Block.Air || b === Block.Leaves || b === Block.Log || b === Block.Water) continue
        sy = y; break
      }
      if (sy < 0) continue
      this.walkTarget.set(tx, sy + FOOT_OFFSET, tz)
      this.grazeTimer = 6 + Math.random() * 12
      return
    }
    this.grazeTimer = 3 + Math.random() * 4
  }
}
