# Audio Guide

Covers the two audio systems: `MusicPlayer` (background music playlist) and `SfxPlayer`
(ambient loops + one-shot effects). Both live in `src/audio/`.

---

## Architecture overview

| Class | File | Responsibility |
|---|---|---|
| `MusicPlayer` | `src/audio/music.ts` | Shuffling music playlist, fade in/out on pointer lock, prev/next/pause controls |
| `SfxPlayer` | `src/audio/sfx.ts` | Ambient loops (forest day/night, wind), footsteps, one-shot jump/splash |

Both are instantiated in `main.ts`, started on the first user click (autoplay constraint),
and wired to the volume sliders in `initMenu` (`src/ui/hud.ts`).

---

## MusicPlayer

### Adding a track

1. Drop the `.mp3` into `public/music/`.
2. Add an entry to the `TRACKS` array in `src/audio/music.ts`:

```ts
{
  file: 'my-track.mp3',
  title: 'Track Title',
  artist: 'Artist Name',
  license: 'LICENSE_CODE',
  url: 'https://source-url',
}
```

3. Add a credit entry to the **Background music** section in `index.html` (see Credits below).

Tracks shuffle automatically; the same track never plays back-to-back.

### Volume & fading

`MusicPlayer.tick(dt, active)` is called every frame. When `active` is false (pointer
unlocked / menu open) the music fades out over ~1.5 s and fades back in over ~0.8 s.
The master volume is controlled by the music slider and persisted to localStorage via
`storage.musicVolume`.

---

## SfxPlayer

### Loop tracks (`LoopTrack`)

Ambient sounds are created with `makeLoop(src, options?)` which returns a `LoopTrack`:

```ts
interface LoopTrack {
  el: HTMLAudioElement   // the underlying audio element
  gain: number           // volume multiplier offset (see Gain below)
}
```

All loops start at `volume = 0` and are played immediately on `start()`. Their volumes
are set every frame inside `update()` via `setVol(track, computedVolume)`.

### Gain

`gain` is an additive offset on the multiplier applied to a track's computed volume:

- `gain: 0` (default) — no change, full computed volume
- `gain: -0.3` — max 70% of computed volume (quieter)
- `gain: +0.2` — max 120% of computed volume (clamped to 1 by the browser)

Formula: `el.volume = clamp(computedVolume * max(0, 1 + gain), 0, 1)`

Pass `gain` when calling `makeLoop` — it is a property of the clip, not a runtime control:

```ts
this.wind = makeLoop(`${base}sfx/wind.wav`, { gain: -0.8 })
```

### Existing loops and their mixing logic

| Track | Mixing rule |
|---|---|
| `forest_day` | `dayAmt × forestAmt × masterVolume` |
| `forest_night` | `(1 − dayAmt) × forestAmt × masterVolume` |
| `wind` | `windAmt × masterVolume` (with `gain: -0.8`) |
| `footsteps` | `masterVolume × 0.55` while walking; paused when still |

`dayAmt` mirrors the sun curve from `sky.ts` (smoothstep over `sin` of the day angle).

`forestAmt = 1 − windAmt`. `windAmt` is a smoothstep from `config.windThreshold` to
`config.windThreshold + config.windMix` over the player's Y position.

### Wind threshold config

Two values in `world.env` control the height-based wind blend:

| Key | Default | Meaning |
|---|---|---|
| `WIND_THRESHOLD` | `45` | Y level where wind starts to fade in |
| `WIND_MIX` | `20` | Blocks over which the full crossfade occurs |

These flow through `vite.config.ts` → `src/config.ts` as `config.windThreshold` / `config.windMix`.

### Adding a new ambient loop

1. Drop the `.wav` into `public/sfx/`.
2. Add a `LoopTrack` field to `SfxPlayer` and create it in the constructor:

```ts
private readonly mySound: LoopTrack

this.mySound = makeLoop(`${base}sfx/my-sound.wav`, { gain: 0 })
```

3. Start it in `start()`:

```ts
this.mySound.el.play().catch(() => {})
```

4. Set its volume each frame in `update()`:

```ts
setVol(this.mySound, someAmount * this._volume)
```

5. Add a credit entry to the **Sound effects** section in `index.html`.

### Adding a one-shot effect

1. Drop the `.wav` into `public/sfx/`.
2. Add an `HTMLAudioElement` field, created with `makeOneShot(src)`.
3. Add a `playX()` method that rewinds and plays:

```ts
playX(): void {
  if (!this.started) return
  this.x.volume = this._volume * 0.7
  this.x.currentTime = 0
  this.x.play().catch(() => {})
}
```

4. Call `sfx.playX()` from `main.ts` when the triggering condition is detected.
5. Add a credit entry to `index.html`.

---

## Credits

Every audio asset needs a credit in the **Credits** tab (`index.html`, `#panel-credits`).

### Sound effects block

```html
<div class="credit">
  <div class="t">Track Title</div>
  <div class="by">Artist Name</div>
  <div class="lic">License Name ·
    <a href="https://source-url" target="_blank" rel="noopener">source</a>
  </div>
</div>
```

Omit the `<a>` tag if there is no source URL (e.g. Attribution-only entries without a link).

### Music block

Same structure; use the license code and uppbeat.io URL:

```html
<div class="credit">
  <div class="t">Track Title</div>
  <div class="by">Artist Name</div>
  <div class="lic">License LICENSECODE ·
    <a href="https://uppbeat.io/t/..." target="_blank" rel="noopener">uppbeat.io</a>
  </div>
</div>
```

---

## Volume persistence

Both master volumes are stored in localStorage via `src/storage.ts` and restored in
`main.ts` before the menu is initialised. Sliders in the Settings panel call
`music.setVolume()` / `sfx.setVolume()` and write back to storage on `input`.

Do not read or write localStorage for audio anywhere else.

---

## Autoplay constraint

Browsers block audio until a user gesture. Both `music.start()` and `sfx.start()` are
called from the renderer's `click` event listener in `main.ts`. Neither method does
anything if called before that — guard with the internal `started` flag, not external
checks.
