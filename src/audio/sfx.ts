// SFX layer: ambient forest sounds (day/night crossfade), footsteps, jump, and water splash.
// Forest tracks run as always-on loops whose volumes cross-fade with the day-night cycle.
// Footsteps loop while the player is walking and pause the moment they stop, so playback
// resumes mid-clip rather than restarting (giving a random-feeling step cadence).
// Jump and splash are one-shot sounds fired by caller-detected events.

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function makeLoop(src: string): HTMLAudioElement {
  const a = new Audio(src)
  a.loop = true
  a.preload = 'auto'
  a.volume = 0
  return a
}

function makeOneShot(src: string): HTMLAudioElement {
  const a = new Audio(src)
  a.preload = 'auto'
  return a
}

export class SfxPlayer {
  private readonly forestDay: HTMLAudioElement
  private readonly forestNight: HTMLAudioElement
  private readonly footsteps: HTMLAudioElement
  private readonly jump: HTMLAudioElement
  private readonly splash: HTMLAudioElement
  private _volume = 0.6
  private started = false

  constructor() {
    const base = import.meta.env.BASE_URL
    this.forestDay = makeLoop(`${base}sfx/forest_day.wav`)
    this.forestNight = makeLoop(`${base}sfx/forest_night.wav`)
    this.footsteps = makeLoop(`${base}sfx/footsteps_default.wav`)
    this.jump = makeOneShot(`${base}sfx/jump_c04.wav`)
    this.splash = makeOneShot(`${base}sfx/agua-jump1.wav`)
  }

  // Must be called from a user gesture (same constraint as MusicPlayer.start).
  start(): void {
    if (this.started) return
    this.started = true
    this.forestDay.play().catch(() => {})
    this.forestNight.play().catch(() => {})
  }

  // dayTime: DayNightCycle.time (0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset).
  // isWalking: player is on the ground and has meaningful horizontal speed.
  update(dayTime: number, isWalking: boolean): void {
    if (!this.started) return

    // Mirror the dayAmt curve from sky.ts so the crossfade tracks the sun exactly.
    const angle = (dayTime - 0.25) * Math.PI * 2
    const e = Math.sin(angle)
    const dayAmt = smoothstep(-0.12, 0.18, e)

    this.forestDay.volume = dayAmt * this._volume
    this.forestNight.volume = (1 - dayAmt) * this._volume

    if (isWalking) {
      this.footsteps.volume = this._volume * 0.55
      if (this.footsteps.paused) this.footsteps.play().catch(() => {})
    } else {
      if (!this.footsteps.paused) this.footsteps.pause()
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
