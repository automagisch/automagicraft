// Thin wrapper over the HUD DOM defined in index.html.
import type { MusicPlayer } from '../audio/music'

const byId = (id: string): HTMLElement => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Missing HUD element #${id}`)
  return el
}

const PANELS = ['explore', 'settings', 'credits'] as const

function setMenuVisible(visible: boolean): void {
  byId('tabs').classList.toggle('hidden', !visible)
  for (const p of PANELS) byId(`panel-${p}`).classList.toggle('hidden', !visible)
}

export function setLoading(message: string, detail?: string): void {
  byId('overlay').classList.remove('hidden')
  byId('ov-title').textContent = message
  const text = byId('ov-text')
  text.classList.remove('hidden')
  if (detail !== undefined) text.textContent = detail
  setMenuVisible(false) // no tabs/panels while the world is still building
  byId('crosshair').classList.add('hidden')
}

function showPlayPrompt(): void {
  byId('overlay').classList.remove('hidden')
  byId('ov-title').textContent = 'automagicraft'
  byId('ov-text').textContent = 'A first-person voxel world to wander.'
  setMenuVisible(true)
  selectTab('explore')
}

// Reflects pointer-lock state: hide the overlay + show the crosshair while playing.
export function setLocked(locked: boolean): void {
  if (locked) {
    byId('overlay').classList.add('hidden')
    byId('crosshair').classList.remove('hidden')
  } else {
    byId('crosshair').classList.add('hidden')
    showPlayPrompt()
  }
}

function selectTab(tab: string): void {
  for (const p of PANELS) byId(`panel-${p}`).classList.toggle('hidden', p !== tab)
  for (const btn of byId('tabs').querySelectorAll<HTMLButtonElement>('button')) {
    btn.classList.toggle('active', btn.dataset.tab === tab)
  }
}

export function setUnderwater(underwater: boolean): void {
  byId('water-overlay').classList.toggle('hidden', !underwater)
}

// Wires the menu tabs and the music-volume slider. Call once after the player exists.
export function initMenu(music: MusicPlayer): void {
  for (const btn of byId('tabs').querySelectorAll<HTMLButtonElement>('button')) {
    btn.addEventListener('click', () => selectTab(btn.dataset.tab ?? 'explore'))
  }

  const slider = byId('vol-slider') as HTMLInputElement
  const value = byId('vol-value')
  slider.value = String(Math.round(music.volume * 100))
  value.textContent = `${slider.value}%`
  slider.addEventListener('input', () => {
    music.setVolume(Number(slider.value) / 100)
    value.textContent = `${slider.value}%`
  })
}
