# Intro Scene Guide

Covers the cinematic intro sequence: the start screen, quote state machine, shutter
animation, blur reveal, and the controls lock pattern. Read this before touching
`src/intro/IntroScene.ts` or the startup flow in `main.ts`.

---

## Architecture overview

The intro is a self-contained state machine in `src/intro/IntroScene.ts`. It owns
all DOM manipulation for the intro elements. `main.ts` wires it in after world load
and provides two callbacks; the game loop calls `intro.update(dt)` every frame.

```
World loads
  → intro.init(onStart, onDone)   ← shutters visible, start prompt shown
  → user clicks / presses Enter
  → onStart()                     ← sfx.start(), canvas pre-blurred
  → quotes play above shutters
  → shutters open, blur fades
  → onDone()                      ← controls.allowLock = true, music.start(), setLocked(false)
```

---

## State machine

States advance in order; all visual transitions are CSS-driven (JS only flips classes):

```
idle → q1_in → q1_hold → q1_out → q2_in → q2_hold → q2_out → black_pause → shutter → blur → done
```

Timing constants (seconds, all at the top of `IntroScene.ts`):

| Constant | Default | Meaning |
|---|---|---|
| `QUOTE_FADE` | 1.2 | Fade in / fade out per quote |
| `Q1_HOLD` | 5 | Quote 1 hold time |
| `Q2_HOLD` | 3 | Quote 2 hold time |
| `BLACK_PAUSE` | 1 | White silence after last quote fades out |
| `SHUTTER_DUR` | 1.2 | Shutter open animation (must match CSS `transition`) |
| `BLUR_DELAY` | 0.1 | Delay after shutter starts before canvas blur begins fading |
| `BLUR_DUR` | 1.5 | Blur fade duration (must match CSS `transition`) |

---

## DOM structure and z-index hierarchy

All intro elements live inside `#hud` (z-index 10). Within that stacking context:

| Element | z-index | Purpose |
|---|---|---|
| `#intro-shutter-top/bottom` | 7 | White panels covering the world from page load |
| `#intro-quote` | 8 | Quote text — above shutters during quote phase |
| `#intro-start` | 9 | Start prompt — shown before intro begins |
| `#intro-progress` | 9 | Thin 200px progress bar, fills during hold phases |
| `#intro-skip-hint` | 9 | "E skip" — returning visitors only |

`#hud` has `pointer-events: none`; children inherit this. `#intro-start` overrides
with `pointer-events: auto` so it catches clicks. The canvas is below `#hud` and
receives no pointer events during the intro.

### Shutter lifecycle

Shutters start **visible** (no `hidden` class) at page load, covering the world
completely. They open when `openShutter()` is called (adds `.open` class → CSS
`translateY(-100%/100%)` transition). They're hidden in `dispose()` after the intro
completes.

There is no "close then re-open" sequence — shutters go directly from closed → open.

### Canvas blur

Pre-blur (`canvas.classList.add('intro-blurred')`) is applied in `onStart` (before
quotes begin) so the canvas is already blurred behind the shutters. Unblur
(`canvas.classList.remove('intro-blurred')`) fires `BLUR_DELAY` seconds into the
`shutter` state, letting the CSS `filter` transition do the 4-second fade.

```css
canvas { transition: filter 4s ease; }
canvas.intro-blurred { filter: blur(18px); }
```

---

## Public API

```ts
export class IntroScene {
  constructor(seenIntro: boolean, canvas: HTMLCanvasElement)

  // Call immediately after world loads. Shows the start prompt.
  init(onStart: () => void, onDone: () => void): void

  // Call every frame from the game loop.
  update(dt: number): void

  // Jumps to shutter-open phase. Called by E key for returning visitors.
  skipToShutter(): void

  // Hides all intro DOM elements after onDone fires.
  dispose(): void
}
```

---

## `controls.allowLock` — the pointer-lock gate

`Controls` has an `allowLock = false` property. The canvas click listener only calls
`requestPointerLock()` when `allowLock` is true:

```ts
dom.addEventListener('click', () => {
  if (!this.locked && this.allowLock) dom.requestPointerLock()
})
```

This prevents the player accidentally locking the pointer during the intro. The gate
is opened in the `onDone` callback, immediately before `setLocked(false)`:

```ts
intro.init(
  () => { sfx.start(); renderer.domElement.classList.add('intro-blurred') },
  () => {
    storage.seenIntro.set(true)
    intro.dispose()
    controls.allowLock = true   // ← gate opens here
    music.start()
    setLocked(false)            // shows play prompt
  },
)
```

If you add any other pre-gameplay gate (cutscene, tutorial, loading), apply the same
pattern: keep `allowLock = false` until the player is ready to play, then flip it once
before `setLocked(false)`.

---

## Skip behaviour

`seenIntro` is persisted to localStorage (via `storage.seenIntro`). On first visit it
is `false` — the intro is unskippable. On subsequent visits it is `true`:
- `E` key during the quote phase jumps directly to `shutter` state
- The "E skip" hint is shown in the bottom-right corner

`seenIntro` is written to storage in the `onDone` callback (after the full intro
plays, not just after Start is pressed).

---

## Progress bar

During `q1_hold` and `q2_hold`, `update()` drives the progress bar via a JS-set
`transform: scaleX(n)` on `#intro-progress`. No CSS transition — the frame-by-frame
update is inherently smooth:

```ts
el('intro-progress').style.transform = `scaleX(${Math.min(this.timer / dur, 1)})`
```

The bar is hidden outside hold phases (hidden during fade-in/out and black pause).

---

## Initial camera tilt

On first load the camera pitch is set to a slight downward angle so the terrain fills
the view when the shutters open (set in `main.ts` after `Controls` is constructed):

```ts
controls.state.pitch = -0.22  // ~12° down; negative = looking down in YXZ order
```

Do not reset this in `Controls` — it's an intentional starting pose for the intro reveal.
