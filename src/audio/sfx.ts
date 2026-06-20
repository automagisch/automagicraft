// SFX layer: ambient forest sounds (day/night crossfade), wind (height-based), footsteps, jump, and water splash.
// Forest tracks run as always-on loops whose volumes cross-fade with the day-night cycle.
// Wind mixes in above WIND_THRESHOLD and fully replaces forest at WIND_THRESHOLD + WIND_MIX.
// Footsteps loop while the player is walking and pause the moment they stop, so playback
// resumes mid-clip rather than restarting (giving a random-feeling step cadence).
// Jump and splash are one-shot sounds fired by caller-detected events.

import { config } from '../config'

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

interface LoopOptions {
  // Additive offset applied as a multiplier on the track's computed volume each frame.
  // 0.0 (default) = no change; -0.3 = max 70% of computed volume; +0.2 = max 120% (clamped to 1).
  gain?: number
}

interface LoopTrack {
  el: HTMLAudioElement
  gain: number
}

function makeLoop(src: string, options: LoopOptions = {}): LoopTrack {
  const el = new Audio(src)
  el.loop = true
  el.preload = 'auto'
  el.volume = 0
  return { el, gain: options.gain ?? 0 }
}

function makeOneShot(src: string): HTMLAudioElement {
  const a = new Audio(src)
  a.preload = 'auto'
  return a
}

// Apply a computed volume to a track, factoring in its gain offset.
function setVol(track: LoopTrack, v: number): void {
  track.el.volume = Math.max(0, Math.min(1, v * Math.max(0, 1 + track.gain)))
}

export class SfxPlayer {
  private readonly forestDay: LoopTrack
  private readonly forestNight: LoopTrack
  private readonly wind: LoopTrack
  private readonly footsteps: LoopTrack
  private readonly jump: HTMLAudioElement
  private readonly splash: HTMLAudioElement
  private _volume = 0.6
  private started = false

  constructor() {
    const base = import.meta.env.BASE_URL
    this.forestDay   = makeLoop(`${base}sfx/forest_day.wav`)
    this.forestNight = makeLoop(`${base}sfx/forest_night.wav`)
    this.wind        = makeLoop(`${base}sfx/wind.wav`, { gain: -0.8 })
    this.footsteps   = makeLoop(`${base}sfx/footsteps_default.wav`)
    this.jump   = makeOneShot(`${base}sfx/jump_c04.wav`)
    this.splash = makeOneShot(`${base}sfx/agua-jump1.wav`)
  }

  // Must be called from a user gesture (same constraint as MusicPlayer.start).
  start(): void {
    if (this.started) return
    this.started = true
    this.forestDay.el.play().catch(() => {})
    this.forestNight.el.play().catch(() => {})
    this.wind.el.play().catch(() => {})
  }

  // dayTime: DayNightCycle.time (0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset).
  // isWalking: player is on the ground and has meaningful horizontal speed.
  // playerY: player Y position used to blend wind vs forest based on altitude.
  update(dayTime: number, isWalking: boolean, playerY: number): void {
    if (!this.started) return

    // Mirror the dayAmt curve from sky.ts so the crossfade tracks the sun exactly.
    const angle = (dayTime - 0.25) * Math.PI * 2
    const e = Math.sin(angle)
    const dayAmt = smoothstep(-0.12, 0.18, e)

    // Wind mix: 0 at or below WIND_THRESHOLD, 1 at WIND_THRESHOLD + WIND_MIX.
    const windAmt = smoothstep(config.windThreshold, config.windThreshold + config.windMix, playerY)
    const forestAmt = 1 - windAmt

    setVol(this.forestDay,   dayAmt * forestAmt * this._volume)
    setVol(this.forestNight, (1 - dayAmt) * forestAmt * this._volume)
    setVol(this.wind,        windAmt * this._volume)

    if (isWalking) {
      setVol(this.footsteps, this._volume * 0.55)
      if (this.footsteps.el.paused) this.footsteps.el.play().catch(() => {})
    } else {
      if (!this.footsteps.el.paused) this.footsteps.el.pause()
    }
  }

  // Fire-and-forget: rewind then play so rapid re-triggers work correctly.
  playJump(): void {
    if (!this.started) return
    this.jump.volume = this._volume * 0.7
    this.jump.currentTime = 0
    this.jump.play().catch(() => {})
  }

  playSplash(): void {
    if (!this.started) return
    this.splash.volume = this._volume * 0.85
    this.splash.currentTime = 0
    this.splash.play().catch(() => {})
  }

  get volume(): number {
    return this._volume
  }

  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(1, v))
  }
}
