# Mob creation guide — automagicraft

A practical reference for adding a new mob to the world, based on the
patterns established by `BirdMob`. Read this before writing any code.

---

## Architecture overview

```
src/mobs/
  Mob.ts          Abstract base — mesh group, position, update signature
  BirdMob.ts      Reference implementation (flying, perching, night roosting)
  DeerMob.ts      Ground mob reference (grazing, alerting, fleeing)
  MobManager.ts   Spawns all mob types, drives their update loop
```

`MobManager` owns all mob instances and calls `mob.update()` every frame.
New mobs are registered here. Nothing outside `src/mobs/` touches mobs directly.

---

## Step-by-step checklist

### 1. Design the mob on paper first

Answer these before writing code:

- **Shape** — what simple boxes make a recognisable silhouette?
- **Palette** — 2-3 pastel RGB triples that fit the world's soft look.
  Pick from the same desaturated range as blocks (`engine/blocks.ts`).
- **States** — what are the named behavioral modes? (e.g. idle / walking / fleeing)
- **Triggers** — what causes a state transition? (timer, player distance, time of day)
- **Terrain relationship** — airborne, ground-bound, water, or mixed?
- **Night behavior** — does it sleep, hide, or stay active?
- **World.env handle** — what should the designer be able to tune? (count, radius, speed)

### 2. Extend `Mob`

```typescript
// src/mobs/YourMob.ts
import { Mob } from './Mob'

export class YourMob extends Mob {
  update(dt: number, playerPos: THREE.Vector3, world: World, dayTime: number): void {
    // ...
  }
}
```

`Mob` gives you:
- `this.mesh` — `THREE.Group`, already added to the scene
- `this.position` — `THREE.Vector3`, your source of truth for world position
- `this.scene` — for cleanup in `dispose()`

Keep `update()` cheap. It runs every frame for every instance.

### 3. Build the mesh with vertex colors

All world geometry uses `MeshBasicMaterial({ vertexColors: true })`.
The day-night cycle tints the **shared chunk material** (`material.color`),
which your mob must also use — otherwise it won't darken at night.

```typescript
// Receive the shared material in the constructor; do NOT create your own.
constructor(scene, material: THREE.MeshBasicMaterial, ...) {
  super(scene)
  const geo = new THREE.BoxGeometry(w, h, d)
  flatColor(geo, [r, g, b])           // bake color into vertex attributes
  this.mesh.add(new THREE.Mesh(geo, material))
}
```

`flatColor` pattern (copy from `BirdMob`):
```typescript
function flatColor(geo: THREE.BoxGeometry, c: [number, number, number]): void {
  const n = geo.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c[0]; arr[i * 3 + 1] = c[1]; arr[i * 3 + 2] = c[2]
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
}
```

No textures, no lights, no separate materials — keep it that way.

### 4. State machine pattern

Use a `private state: 'a' | 'b' | 'c'` field and a `tick*()` method per state.
`update()` dispatches to the right tick method, then syncs `this.mesh.position`.

```typescript
update(dt, playerPos, world, dayTime) {
  // global transitions (night/dawn, player proximity)
  if (...) this.state = 'fleeing'

  if (this.state === 'idle')    this.tickIdle(dt)
  else if (this.state === 'walking') this.tickWalking(dt, world)
  else if (this.state === 'fleeing') this.tickFleeing(dt, playerPos)

  this.mesh.position.copy(this.position)
}
```

Keep each tick method focused on one concern. Cross-state logic (night check,
player distance) goes at the top of `update()` before the dispatch.

### 5. Ground-following

For ground mobs, snap Y to terrain every frame:

```typescript
const gx = Math.floor(this.position.x)
const gz = Math.floor(this.position.z)
if (gx >= 1 && gx < world.sizeX - 1 && gz >= 1 && gz < world.sizeZ - 1) {
  const sy = world.surfaceY(gx, gz)
  if (sy >= 0) this.position.y = sy + FOOT_OFFSET
}
```

`FOOT_OFFSET` is half the mob's leg-to-back height (e.g. `0.55` for a deer).
This gives free terrain following at zero cost — no physics needed.

### 6. Day/night behavior

Receive `dayTime` in `update()`. Standard thresholds (from `BirdMob`):

```typescript
const isNight = dayTime > 0.77 || dayTime < 0.23
```

Track `prevNight` to detect the moment of transition:

```typescript
if (isNight && !this.prevNight)  this.onNightFall()
if (!isNight && this.prevNight)  this.onDawn()
this.prevNight = isNight
```

### 7. Register in MobManager

```typescript
// MobManager.ts — add a spawnDeer() call in the constructor
private spawnDeer(scene, material, rng) {
  for (let i = 0; i < config.deerAmount; i++) {
    // pick a random spawn position on the terrain
    this.mobs.push(new DeerMob(scene, material, spawnPos, palette, rng))
  }
}
```

Spawning happens once at startup (inside the constructor). `update()` loops
over `this.mobs` and calls each one — new mob types are included automatically.

### 8. Expose config handles in world.env

Add to `world.env`:
```
DEER_AMOUNT=25   # number of deer in the world
```

Add to `vite.config.ts` define block:
```typescript
__WC_DEER_AMOUNT__: num('DEER_AMOUNT', 25),
```

Add to `src/config.ts`:
```typescript
declare const __WC_DEER_AMOUNT__: number
export const config = { ..., deerAmount: __WC_DEER_AMOUNT__ }
```

---

## Dos and don'ts

| Do | Don't |
|----|-------|
| Re-use the shared `MeshBasicMaterial` | Create a per-mob material |
| Snap ground mobs to `world.surfaceY` | Apply gravity/physics for terrain follow |
| Use `Math.random()` for per-frame variation | Use seeded RNG for per-frame variation (RNG is for spawn determinism) |
| Expose count + key tunables in `world.env` | Hard-code counts in source |
| Keep `update()` under ~1ms per mob | Do expensive searches every frame |
| Design states before writing code | Code states as you go |

## Performance guidelines

- Cap expensive searches (tree/surface scans) to a fixed sample size.
- Cache `world` reference inside `update()` — don't store it across frames.
- For ground mobs with many instances, terrain snap (`surfaceY`) is O(1) — free.
- Don't allocate `new THREE.Vector3()` inside `update()` — keep them as class fields.
