# Player & Physics Guide

Covers the player AABB, movement tunables, the fixed-timestep loop, water physics,
step-assist, and head-bob. Read this before changing movement feel or adding new
player states.

---

## Player state (`src/player/Player.ts`)

```ts
class Player {
  position: [number, number, number]  // centre of the AABB
  vx: number; vy: number; vz: number  // velocity (blocks/s)
  onGround: boolean
  stepOffset: number                   // camera ease-up after a step (see Head-bob)

  // AABB half-extents
  readonly hx = 0.3   // ±0.3 on X (total width 0.6)
  readonly hy = 0.9   // ±0.9 on Y (total height 1.8) — position is at centre
  readonly hz = 0.3   // ±0.3 on Z

  get eyeY(): number  // position.y + 0.72 (eye at 1.62 above feet)
}
```

---

## Fixed timestep

Physics runs at a fixed **1/60 s** step via an accumulator in `main.ts`. The render loop
advances the accumulator and drains it:

```ts
const PHYSICS_STEP = 1 / 60
accumulator += dt
while (accumulator >= PHYSICS_STEP) {
  updatePlayer(player, world, input, PHYSICS_STEP)
  accumulator -= PHYSICS_STEP
}
```

**Keep gameplay logic in the step; keep view-only effects in the render frame.** Head-bob,
`stepOffset` easing, and camera positioning happen outside the accumulator loop.

---

## Movement tunables (`src/player/physics.ts`)

| Constant | Value | Meaning |
|---|---|---|
| `WALK_SPEED` | `config.walkSpeed` (4.6) | Top horizontal speed on ground (blocks/s) |
| `GROUND_ACCEL` | 55 | Acceleration rate on the ground (blocks/s²) |
| `GROUND_FRICTION` | 48 | Deceleration rate when no input on ground |
| `AIR_ACCEL` | 16 | Light steering while airborne |
| `GRAVITY` | 28 | Downward acceleration (blocks/s²) |
| `JUMP_SPEED` | 8.2 | Initial upward velocity on jump (~1.2 blocks clearance) |
| `STEP_HEIGHT` | 1.05 | Max height of automatic step-up |
| `MAX_FALL` | 42 | Terminal velocity (blocks/s downward) |
| `MAX_SUBSTEP` | 0.2 | Max single-axis move per substep (prevents tunnelling) |

`WALK_SPEED` is the only value exposed via `world.env` / `config`. All others are
hardcoded — adjust them directly in `physics.ts` if feel needs tuning.

### Water movement tunables

| Constant | Value | Meaning |
|---|---|---|
| `WATER_WALK_SPEED` | `WALK_SPEED * 0.38` | ~1.75 blocks/s wading speed |
| `WATER_ACCEL` | 18 | Sluggish acceleration in water |
| `WATER_DRAG` | 10 | Deceleration with no input |
| `WATER_GRAVITY` | `GRAVITY * 0.18` | Near-weightless downward pull |
| `WATER_BUOYANCY` | `GRAVITY * 0.14` | Upward counterforce (net: slow drift down) |
| `WATER_SWIM_SPEED` | 3.8 | Upward speed when pressing Space |

---

## Movement model

### Ground

Input is converted to a unit direction vector relative to the camera yaw. The player
velocity is driven toward `direction * WALK_SPEED` at `GROUND_ACCEL` rate, and braked to
zero at `GROUND_FRICTION` rate when there's no input. Velocity is not zeroed instantly —
there's a brief slide.

### Airborne

Horizontal velocity is preserved from the last grounded frame. Only a light `AIR_ACCEL`
nudge is available, capped at `WALK_SPEED`. A running jump therefore maintains speed.

### Gravity and jump

`vy -= GRAVITY * dt` every step. Jump sets `vy = JUMP_SPEED` when `onGround` is true and
resets `onGround = false`. Falling is capped at `MAX_FALL`.

---

## AABB collision

Collision is resolved **per axis in order: Y first, then X, then Z**. Y is done first so
`onGround` is known before horizontal movement.

Each axis move is split into substeps of at most `MAX_SUBSTEP = 0.2` blocks (preventing
tunnelling at high speed). On collision, the player is pushed back to the face and the
velocity on that axis is zeroed.

Uses `World.isSolid()` — Water and God Block are passable.

---

## Step-assist

When the player collides horizontally while grounded, `moveHorizontal` tries to step up:

1. Lifts the player `STEP_HEIGHT` (1.05 blocks) vertically.
2. Re-attempts the horizontal move.
3. Settles back down.

If the stepped result moved further than the non-stepped result, the step is accepted.
Otherwise the normal (blocked) result is used.

On a successful step, the camera does **not** snap up — instead `player.stepOffset` is
incremented by the rise amount and eased back to zero over `STEP_SMOOTH_TAU = 0.08 s`
(see Head-bob below). This makes steps feel smooth rather than jarring.

---

## Head-bob and camera

Head-bob and camera positioning happen in the **render frame** (not the physics step):

```ts
const speed = Math.hypot(player.vx, player.vz)
const targetBob = player.onGround && speed > 0.4 ? Math.min(speed / WALK_SPEED, 1) : 0
bobAmount += (targetBob - bobAmount) * Math.min(1, dt * 8)   // smooth envelope
if (player.onGround) bobPhase += speed * dt * BOB_STRIDE
const bobY  = Math.sin(bobPhase * 2) * BOB_VERTICAL * bobAmount
const roll  = Math.sin(bobPhase)     * BOB_ROLL     * bobAmount
```

| Constant | Value | Effect |
|---|---|---|
| `BOB_STRIDE` | 1.6 | Bob cycle frequency relative to speed |
| `BOB_VERTICAL` | 0.06 | Vertical amplitude (blocks) |
| `BOB_ROLL` | 0.011 | Camera roll amplitude (radians) |
| `STEP_SMOOTH_TAU` | 0.08 s | Time constant for step-up camera ease |

`player.stepOffset` decays exponentially each render frame:
```ts
player.stepOffset *= Math.exp(-dt / STEP_SMOOTH_TAU)
if (player.stepOffset < 1e-3) player.stepOffset = 0
```

Final camera position:
```ts
camera.position.set(player.position[0], player.eyeY - player.stepOffset + bobY, player.position[2])
camera.rotation.set(input.pitch, input.yaw, roll, 'YXZ')
```

---

## Fall-out-of-world respawn

If the player falls below Y = -10, `main.ts` teleports them back to `spawn`:

```ts
if (player.position[1] < -10) {
  player.position = [...spawn]
  player.vx = player.vy = player.vz = 0
}
```

`spawn` is set to the mountain peak after world generation and never changes.

---

## Mouse sensitivity

`LOOK_SENSITIVITY = 0.0022` is defined at the top of `src/player/controls.ts`. It scales
`mousemove` delta directly to yaw/pitch change in radians. Adjust it there if feel needs
tuning — it is not currently exposed via `world.env`.

---

## Adding new player states

Follow the pattern:
- **New velocity modifier** (e.g. sprint): add a constant and modify the `GROUND_ACCEL`
  / target speed branch inside `updatePlayer`. Keep it in the physics step.
- **New detection** (e.g. crouching): add a flag to `Player.ts`, set it from `controls.ts`
  input, read it in `physics.ts`.
- **New visual effect** (e.g. camera tilt): add it in the render frame in `main.ts`,
  not inside `updatePlayer`.
