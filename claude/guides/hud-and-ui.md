# HUD & UI Guide

Covers the overlay system, menu tabs, DOM element conventions, and how to add new panels,
overlays, or HUD elements. All UI is plain DOM — nothing is rendered in the Three.js scene.

---

## Architecture

`src/ui/hud.ts` is a thin wrapper over DOM elements defined in `index.html`. It exports
named functions that toggle classes or set text — no UI state lives in `hud.ts`. The
source of truth for what's visible is always the DOM class list.

`src/ui/inventory.ts` is a self-contained build-mode hotbar overlay, separate from the
main HUD.

---

## Overlay states

The `#overlay` element covers the screen and hosts the title, subtitle, and menu tabs.
It has two modes:

| Mode | When | What's shown |
|---|---|---|
| Loading | World is building | Title + progress text, no tabs |
| Play prompt | Pointer unlocked | Title + tabs (Explore / Settings / Credits) |

`setLoading(message, detail?)` — switches to loading mode.  
`setLocked(locked)` — called on every pointer-lock change. `true` → hides overlay + shows
crosshair. `false` → shows play prompt via `showPlayPrompt()`.

---

## Tabs and panels

Three tabs are registered in `PANELS`:

```ts
const PANELS = ['explore', 'settings', 'credits'] as const
```

Each tab has:
- A `<button data-tab="explore">` in `#tabs`
- A `<div id="panel-explore" class="panel hidden">` sibling

`selectTab(tab)` toggles the `hidden` class on panels and the `active` class on buttons.
Tab buttons wire up in `initMenu` by reading `btn.dataset.tab`.

### Adding a new tab

1. Add the tab name to `PANELS` in `hud.ts`.
2. Add a `<button data-tab="my-tab">My Tab</button>` inside `#tabs` in `index.html`.
3. Add a `<div id="panel-my-tab" class="panel hidden">…content…</div>` alongside the
   existing panels in `index.html`.
4. No other wiring needed — `selectTab` and the tab button loop handle it automatically.

---

## Exported HUD functions

| Function | Purpose |
|---|---|
| `setLoading(msg, detail?)` | Show loading overlay with message |
| `setLocked(locked)` | Sync overlay/crosshair to pointer-lock state |
| `setUnderwater(bool)` | Toggle blue water tint overlay (`#water-overlay`) |
| `setGodLabel(visible, html?)` | Show/hide the contextual God Block label |
| `setGodModeBadge(visible)` | Show/hide the "GOD MODE" badge |
| `setBuildControlsVisible(visible)` | Show/hide the build controls hint panel |
| `showBuildHint()` | Show the build hint overlay; auto-dismisses after 6 s |
| `initMenu(music, sfx, seed)` | Wire all menu controls (called once after world loads) |

### `byId()` throws on missing elements

All HUD functions use `byId(id)` internally, which **throws** if the element doesn't exist:
```ts
throw new Error(`Missing HUD element #${id}`)
```
This is a runtime error, not a compile-time one. If you add a new export that calls
`byId('my-new-id')` but forget to add the element to `index.html`, it will throw the first
time `initMenu` or your function is called — not at startup. Add the DOM element first.

### Adding a new in-world overlay

1. Add a `<div id="my-overlay" class="hidden">…</div>` to `index.html`.
2. Add a `setMyOverlay(visible: boolean)` export to `hud.ts`:
   ```ts
   export function setMyOverlay(visible: boolean): void {
     byId('my-overlay').classList.toggle('hidden', !visible)
   }
   ```
3. Call it from `main.ts` based on game state.

---

## DOM element IDs (index.html)

| ID | Element |
|---|---|
| `overlay` | Full-screen overlay container |
| `ov-title` | Large title text in overlay |
| `ov-text` | Subtitle / detail text in overlay |
| `tabs` | Tab button row |
| `panel-explore` | Explore tab content |
| `panel-settings` | Settings tab content |
| `panel-credits` | Credits tab content |
| `crosshair` | Crosshair SVG |
| `water-overlay` | Blue underwater tint |
| `god-label` | Contextual God Block action label |
| `god-mode-badge` | "GOD MODE" badge |
| `build-controls` | Build mode controls hint |
| `build-hint` | One-time build mode intro hint |
| `vol-slider` / `vol-value` | Music volume slider + readout |
| `sfx-slider` / `sfx-value` | SFX volume slider + readout |
| `btn-prev` / `btn-playpause` / `btn-next` | Music transport buttons |
| `music-track` | Now-playing track label |
| `seed-input` | World seed input |
| `btn-random-seed` | Randomise seed button |
| `btn-reseed` | Re-render world button |
| `credits-scroll-wrap` | Scrolling credits container |

---

## Credits panel

The credits panel (`#panel-credits`) contains a `.credits-track` div that is duplicated
at init for seamless looping scroll. Auto-scroll can be interrupted by the mouse wheel
(resumes after 2 s).

Credits are grouped by `.lead` headers and `.credit` entries. See the Audio guide for the
exact HTML structure to use when adding a new asset credit.

---

## Inventory (`src/ui/inventory.ts`)

The build-mode hotbar is managed by `InventoryUI`:

- `setVisible(bool)` — shows/hides the hotbar
- `refresh(slots, selectedSlot)` — re-renders all 10 slot cells from the current inventory

The hotbar is a separate DOM element, not part of the `#overlay` system. It is shown when
God Mode is active and hidden when it is exited.

---

## Style conventions

- All HUD elements use `display: none` toggled via the `hidden` CSS class (defined in
  `index.html`'s `<style>`).
- Never manipulate `element.style.display` directly — always use `.classList.toggle('hidden', …)`.
- HUD elements are defined in `index.html`. Do not create DOM elements dynamically in JS
  unless they are transient (e.g. the credits track duplication for looping).
