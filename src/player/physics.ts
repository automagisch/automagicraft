import { Block } from '../engine/blocks'
import type { World } from '../engine/World'
import type { Player } from './Player'

export const WALK_SPEED = 4.6 // blocks / second (top horizontal speed)
export const GROUND_ACCEL = 55 // how fast we reach target speed on the ground
export const GROUND_FRICTION = 48 // how fast we stop when no input on the ground
export const AIR_ACCEL = 16 // gentle steering while airborne (momentum is otherwise kept)
export const GRAVITY = 28 // blocks / second^2
export const JUMP_SPEED = 8.2 // ~1.2 blocks of clearance
export const STEP_HEIGHT = 1.05 // auto step-up height (clears a 1-block ledge)

// Water movement tunables.
const WATER_WALK_SPEED = WALK_SPEED * 0.38  // ~1.75 — wading is slow
const WATER_ACCEL = 18                       // sluggish acceleration
const WATER_DRAG = 10                        // drag when no input (replaces ground friction)
const WATER_GRAVITY = GRAVITY * 0.18         // ~5 — nearly weightless
const WATER_BUOYANCY = GRAVITY * 0.14        // ~3.9 — net force: slow downward drift
const WATER_SWIM_SPEED = 3.8                 // upward speed when pressing space

const MAX_FALL = 42
const MAX_SUBSTEP = 0.2 // cap per-axis move so at most one block boundary is crossed
const EPS = 1e-3

export interface MoveInput {
  forward: number
  right: number
  jump: boolean
  yaw: number
}

function approach(value: number, target: number, maxDelta: number): number {
  if (value < target) return Math.min(value + maxDelta, target)
  return Math.max(value - maxDelta, target)
}

// True when any part of the player's body (feet or center) is submerged in water.
function isPlayerInWater(player: Player, world: World): boolean {
  const px = Math.floor(player.position[0])
  const pz = Math.floor(player.position[2])
  const feetY = Math.floor(player.position[1] - player.hy + 0.1)
  const midY = Math.floor(player.position[1])
  return (
    world.getBlock(px, feetY, pz) === Block.Water ||
    world.getBlock(px, midY, pz) === Block.Water
  )
}

// Advances the player one fixed timestep: integrates velocity (with momentum), applies
// gravity/jump, then resolves collisions axis by axis with auto step-up over 1-block ledges.
export function updatePlayer(player: Player, world: World, input: MoveInput, dt: number): void {
  const inWater = isPlayerInWater(player, world)

  // Desired horizontal direction relative to the camera's yaw.
  const sin = Math.sin(input.yaw)
  const cos = Math.cos(input.yaw)
  let dirX = -sin * input.forward + cos * input.right
  let dirZ = -cos * input.forward - sin * input.right
  const dirLen = Math.hypot(dirX, dirZ)
  const hasInput = dirLen > 1e-5
  if (hasInput) {
    dirX /= dirLen
    dirZ /= dirLen
  }

  if (inWater) {
    // Sluggish water movement — accelerate slowly, drag to a stop with no input.
    if (hasInput) {
      player.vx = approach(player.vx, dirX * WATER_WALK_SPEED, WATER_ACCEL * dt)
      player.vz = approach(player.vz, dirZ * WATER_WALK_SPEED, WATER_ACCEL * dt)
    } else {
      player.vx = approach(player.vx, 0, WATER_DRAG * dt)
      player.vz = approach(player.vz, 0, WATER_DRAG * dt)
    }

    // Buoyancy: near-weightless, space swims upward.
    player.vy -= WATER_GRAVITY * dt
    player.vy += WATER_BUOYANCY * dt
    if (player.vy < -MAX_FALL * 0.25) player.vy = -MAX_FALL * 0.25
    if (input.jump) player.vy = WATER_SWIM_SPEED
  } else {
    if (player.onGround) {
      // Responsive ground control: accelerate toward target, brake to a stop with no input.
      if (hasInput) {
        player.vx = approach(player.vx, dirX * WALK_SPEED, GROUND_ACCEL * dt)
        player.vz = approach(player.vz, dirZ * WALK_SPEED, GROUND_ACCEL * dt)
      } else {
        player.vx = approach(player.vx, 0, GROUND_FRICTION * dt)
        player.vz = approach(player.vz, 0, GROUND_FRICTION * dt)
      }
    } else if (hasInput) {
      // Airborne: keep momentum, allow only a light nudge, never exceeding walk speed.
      player.vx += dirX * AIR_ACCEL * dt
      player.vz += dirZ * AIR_ACCEL * dt
      const sp = Math.hypot(player.vx, player.vz)
      if (sp > WALK_SPEED) {
        player.vx *= WALK_SPEED / sp
        player.vz *= WALK_SPEED / sp
      }
    }
    // Airborne with no input: velocity is left untouched, so a running jump keeps flying.

    // Gravity + jump.
    player.vy -= GRAVITY * dt
    if (player.vy < -MAX_FALL) player.vy = -MAX_FALL
    if (input.jump && player.onGround) {
      player.vy = JUMP_SPEED
      player.onGround = false
    }
  }

  // Vertical first, so groundedness is known before the horizontal step.
  player.onGround = false
  if (moveAxis(player, world, 1, player.vy * dt)) {
    if (player.vy < 0) player.onGround = true
    player.vy = 0
  }

  // Horizontal with step-assist (skip in water — no stepping over blocks while swimming).
  if (inWater) {
    moveAxis(player, world, 0, player.vx * dt)
    moveAxis(player, world, 2, player.vz * dt)
  } else {
    moveHorizontal(player, world, player.vx * dt, player.vz * dt)
  }
}

function moveHorizontal(player: Player, world: World, dx: number, dz: number): void {
  if (dx === 0 && dz === 0) return

  const startX = player.position[0]
  const startY = player.position[1]
  const startZ = player.position[2]
  const wasGround = player.onGround

  const hitX = moveAxis(player, world, 0, dx)
  const hitZ = moveAxis(player, world, 2, dz)

  if (!(hitX || hitZ) || !wasGround) {
    if (hitX) player.vx = 0
    if (hitZ) player.vz = 0
    return
  }

  // We bumped a wall while on the ground — try to step up over it.
  const normalX = player.position[0]
  const normalZ = player.position[2]
  const normalDist = (normalX - startX) ** 2 + (normalZ - startZ) ** 2

  player.position[0] = startX
  player.position[1] = startY
  player.position[2] = startZ

  moveAxis(player, world, 1, STEP_HEIGHT) // lift (stops early on a ceiling)
  moveAxis(player, world, 0, dx)
  moveAxis(player, world, 2, dz)
  const steppedDist =
    (player.position[0] - startX) ** 2 + (player.position[2] - startZ) ** 2
  moveAxis(player, world, 1, -STEP_HEIGHT) // settle back down onto the step

  if (steppedDist <= normalDist + 1e-4) {
    // Stepping didn't help — keep the plain (non-stepped) result and kill blocked velocity.
    player.position[0] = normalX
    player.position[1] = startY
    player.position[2] = normalZ
    if (hitX) player.vx = 0
    if (hitZ) player.vz = 0
  } else {
    // Stepped up: let the camera ease up to the new height instead of snapping.
    const rise = player.position[1] - startY
    if (rise > 0) player.stepOffset = Math.min(player.stepOffset + rise, 1.3)
    player.onGround = true
  }
}

// Moves the player along one axis and resolves penetration. Returns whether it collided.
function moveAxis(player: Player, world: World, axis: number, amount: number): boolean {
  if (amount === 0) return false
  const steps = Math.ceil(Math.abs(amount) / MAX_SUBSTEP)
  const step = amount / steps
  for (let s = 0; s < steps; s++) {
    if (moveAxisStep(player, world, axis, step)) return true
  }
  return false
}

function moveAxisStep(player: Player, world: World, axis: number, amount: number): boolean {
  const p = player.position
  p[axis] += amount

  const half = [player.hx, player.hy, player.hz]
  const min = [p[0] - player.hx, p[1] - player.hy, p[2] - player.hz]
  const max = [p[0] + player.hx, p[1] + player.hy, p[2] + player.hz]

  const ix0 = Math.floor(min[0] + EPS)
  const ix1 = Math.floor(max[0] - EPS)
  const iy0 = Math.floor(min[1] + EPS)
  const iy1 = Math.floor(max[1] - EPS)
  const iz0 = Math.floor(min[2] + EPS)
  const iz1 = Math.floor(max[2] - EPS)

  let hit = false
  for (let y = iy0; y <= iy1 && !hit; y++) {
    for (let z = iz0; z <= iz1 && !hit; z++) {
      for (let x = ix0; x <= ix1 && !hit; x++) {
        if (world.isSolid(x, y, z)) hit = true
      }
    }
  }
  if (!hit) return false

  if (amount > 0) {
    p[axis] = Math.floor(max[axis]) - half[axis] - EPS
  } else {
    p[axis] = Math.floor(min[axis]) + 1 + half[axis] + EPS
  }
  return true
}
