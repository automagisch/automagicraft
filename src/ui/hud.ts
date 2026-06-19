// Thin wrapper over the HUD DOM defined in index.html.
import type { MusicPlayer } from '../audio/music'
import type { SfxPlayer } from '../audio/sfx'

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

function initMusicControls(music: MusicPlayer): void {
  const btnPrev = byId('btn-prev')
  const btnPlay = byId('btn-playpause')
  const btnNext = byId('btn-next')
  const trackLabel = byId('music-track')

  const syncPlayBtn = (): void => {
    const paused = music.isPaused
    btnPlay.innerHTML = paused ? '&#9654;' : '&#9646;&#9646;'
    btnPlay.classList.toggle('active', paused)
  }

  btnPrev.addEventListener('click', () => { music.prev(); syncPlayBtn() })
  btnNext.addEventListener('click', () => { music.next(); syncPlayBtn() })
  btnPlay.addEventListener('click', () => { music.togglePause(); syncPlayBtn() })

  // Keep the track label in sync by polling — simpler than exposing events from MusicPlayer.
  const updateLabel = (): void => {
    const track = music.currentTrack
    trackLabel.textContent = track ? `${track.title} — ${track.artist}` : ''
  }
  setInterval(updateLabel, 500)
  updateLabel()
}

function initCreditsScroll(): void {
  const wrap = byId('credits-scroll-wrap')
  const track = wrap.querySelector<HTMLElement>('.credits-track')
  if (!track) return

  // Duplicate the track content so the scroll can loop seamlessly: when we reach the
  // halfway point (end of the first copy) we jump back to 0 with no visible seam.
  track.innerHTML += track.innerHTML

  const SPEED = 22 // px per second
  let halfHeight = 0
  let userScrolling = false
  let resumeTimer: ReturnType<typeof setTimeout> | null = null
  let lastTime = 0

  wrap.addEventListener('wheel', (e) => {
    e.preventDefault()
    wrap.scrollTop += e.deltaY
    userScrolling = true
    if (resumeTimer !== null) clearTimeout(resumeTimer)
    resumeTimer = setTimeout(() => { userScrolling = false }, 2000)
  }, { passive: false })

  function tick(now: number): void {
    // Measure lazily: the panel is display:none at init so scrollHeight is 0 until first open.
    if (halfHeight === 0) halfHeight = track!.scrollHeight / 2

    const dt = lastTime ? (now - lastTime) / 1000 : 0
    lastTime = now

    if (!userScrolling && halfHeight > 0) {
      wrap.scrollTop += SPEED * dt
      if (wrap.scrollTop >= halfHeight) wrap.scrollTop -= halfHeight
    }

    requestAnimationFrame(tick)
  }

  requestAnimationFrame(tick)
}

// Wires the menu tabs, music-volume slider, and SFX-volume slider. Call once after the player exists.
export function initMenu(music: MusicPlayer, sfx: SfxPlayer): void {
  for (const btn of byId('tabs').querySelectorAll<HTMLButtonElement>('button')) {
    btn.addEventListener('click', () => selectTab(btn.dataset.tab ?? 'explore'))
  }

  initCreditsScroll()
  initMusicControls(music)

  const slider = byId('vol-slider') as HTMLInputElement
  const value = byId('vol-value')
  slider.value = String(Math.round(music.volume * 100))
  value.textContent = `${slider.value}%`
  slider.addEventListener('input', () => {
    music.setVolume(Number(slider.value) / 100)
    value.textContent = `${slider.value}%`
  })

  const sfxSlider = byId('sfx-slider') as HTMLInputElement
  const sfxValue = byId('sfx-value')
  sfxSlider.value = String(Math.round(sfx.volume * 100))
  sfxValue.textContent = `${sfxSlider.value}%`
  sfxSlider.addEventListener('input', () => {
    sfx.setVolume(Number(sfxSlider.value) / 100)
    sfxValue.textContent = `${sfxSlider.value}%`
  })
}
