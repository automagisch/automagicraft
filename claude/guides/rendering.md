# Rendering Guide

Covers the Three.js render setup, the shared chunk material, the day-night cycle, fog,
and the critical rules that keep the visual style consistent. Read this before adding any
new Three.js materials or scene objects.

---

## Core setup (`src/render/renderer.ts`)

- `WebGLRenderer` with `antialias: true`
- `THREE.ColorManagement.enabled = false` — set in `createRenderer()` in `renderer.ts`.
  Authored sRGB hex values render exactly as typed, with no gamma correction applied.
  **Do not re-enable this** without re-tuning the entire palette.
- Camera far plane (**380**) and `FogExp2` density (default **0.007**) are tuned together
  so the world edge is already fog-opaque before geometry is clipped. If world size changes,
  retune both. The far plane is set in `renderer.ts`; fog density is in `world.env`.

---

## The shared chunk material

All terrain chunks share **one** `MeshBasicMaterial({ vertexColors: true })` instance
(created in `main.ts`). The day-night cycle animates this material's `.color` property
each frame to darken/tint the whole world at once — no per-object lighting is needed.

```ts
const material = new THREE.MeshBasicMaterial({ vertexColors: true })
// passed to DayNightCycle so it can set material.color each frame
dayNight = new DayNightCycle(scene, material, 0.3, waterMaterial)
```

Water chunks use a **separate** `MeshBasicMaterial` (transparent, no depth write) that is
also passed to `DayNightCycle` and receives the same tint.

### Rule: new scene objects must receive the tint

Any mesh added to the scene that should look like part of the world (terrain, structures,
props) needs to receive the day-night tint. The two ways to do this:

1. **Use the shared `material`** — pass it directly if the object uses vertex colors.
2. **Use a separate material but copy the tint** — in `DayNightCycle.update` (or your own
   update), copy `material.color` to your material's `.color` each frame.

Objects that should **not** follow the tint (the God Block, glows, HUD) use their own
`MeshBasicMaterial` and are intentionally excluded.

---

## Day-night cycle (`src/render/sky.ts`)

`DayNightCycle` is updated every frame with `dayNight.update(dt, camera.position)`.

### Time

`dayNight.time` is a float in `[0, 1)`:
- `0.0` = midnight
- `0.25` = sunrise
- `0.5` = noon
- `0.75` = sunset

Duration is `config.dayLength` seconds (set via `world.env`).

### Sky color palette

All constants are RGB triples (`[r, g, b]` in 0–1 floats) at the top of `sky.ts`:

| Constant | Hex approx | Used for |
|---|---|---|
| `SKY_DAY` | `#9ad0ec` | Daytime sky and fog |
| `SKY_NIGHT` | deep navy | Night sky and fog |
| `SKY_DUSK` | warm orange | Horizon blend at sunrise/sunset |
| `TINT_DAY` | `[1,1,1]` | Full-bright world during day |
| `TINT_NIGHT` | cool dim blue | World tint at night |
| `TINT_DUSK` | warm gold | Golden hour tint |
| `SUN_HIGH` | warm white | Sun color at zenith |
| `SUN_LOW` | deep orange | Sun color at horizon |
| `MOON` | cool blue-white | Moon sprite color |

To adjust the visual feel of the cycle, edit these constants. The overall shape of the
transition (timing of day/dusk/night) is controlled by:

```ts
const dayAmt  = smoothstep(-0.12, 0.18, e)          // 0=night → 1=day
const duskAmt = Math.exp(-((e / 0.16) ** 2))         // peaks at horizon (e≈0)
```

where `e = sin(angle)` is the sun's elevation (-1 to +1).

### Celestial objects

- **Sun** — `THREE.Sprite` with additive blending, `AdditiveBlending`, follows `sunDir * SKY_RADIUS` from the camera. Hidden below elevation -0.12.
- **Moon** — opposite the sun, fades in as the moon rises above -0.12. Semi-transparent (no additive blend — it should occlude stars).
- **Stars** — 900 `THREE.Points` scattered over the upper hemisphere at `SKY_RADIUS * 0.98`. Opacity = `nightAmt²` so they only appear in full darkness.

All three are set to `fog: false` so they never dissolve into the world fog.

### Audio mirror

`SfxPlayer.update()` uses the same `dayAmt` curve to crossfade forest day/night sounds.
The formula is duplicated in `src/audio/sfx.ts` — if you change the curve in `sky.ts`,
update `sfx.ts` to match.

---

## Fog

`FogExp2` with density `config.fogDensity` (default 0.007). The fog color is updated every
frame to match the sky color so the world edge dissolves seamlessly.

Special cases in `main.ts`:
- **Underwater:** fog color → `0x1a5080`, density → 0.18 (murky blue)
- **Normal:** fog color follows the sky, density = `config.fogDensity`

---

## God Block rendering exception

The God Block mesh uses its own `MeshBasicMaterial({ vertexColors: true })` independent of
the chunk material. This is intentional: the God Block stays fully bright at night, reading
as magical and always findable. Do not pass the chunk material to it.

---

## Adding a new sky/scene object

1. Use `THREE.Sprite` with `fog: false` for 2D billboard elements (glows, icons).
2. Set `depthWrite: false` on sprites to avoid z-fighting with geometry.
3. For additive glow: `blending: THREE.AdditiveBlending, transparent: true`.
4. Position relative to `cameraPos` (not world origin) so it follows the player — the sky
   dome lives at `camera.position + direction * SKY_RADIUS`.
5. If the object should tint with the world, copy `material.color` to it in your update.
