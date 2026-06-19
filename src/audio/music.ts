// Background-music playlist. The three tracks are royalty-free (see the Credits tab);
// they shuffle endlessly during gameplay and the next track is never the one just played.
// Browsers block autoplay, so playback must be kicked off from a user gesture via start().

export interface Track {
  file: string
  title: string
  artist: string
  license: string
  url: string
}

export const TRACKS: Track[] = [
  {
    file: 'kawaii-kitsune-kevin-macleod.mp3',
    title: 'Kawaii Kitsune',
    artist: 'Kevin MacLeod',
    license: 'RNJBVWPTSLUCOEYF',
    url: 'https://uppbeat.io/t/kevin-macleod/kawai-kitsune',
  },
  {
    file: 'telluride-92elm.mp3',
    title: 'Telluride',
    artist: '92elm',
    license: '592IT8V9ZCSU3C3V',
    url: 'https://uppbeat.io/t/92elm/telluride',
  },
  {
    file: 'willow-of-the-depths-all-ambient.mp3',
    title: 'Willow of the Depths',
    artist: 'All Ambient',
    license: 'OKA6MGNH5QQ81XGM',
    url: 'https://uppbeat.io/t/all-ambient/willow-of-the-depths',
  },
]

export class MusicPlayer {
  private readonly audio = new Audio()
  private index = -1
  private prevIndex = -1
  private started = false
  private _volume = 0.2
  // Fade scale: 1 = full volume, 0 = silent. Eased each tick toward _targetScale.
  private _scale = 1.0
  private _targetScale = 1.0
  private _userPaused = false

  constructor() {
    this.audio.volume = this._volume
    this.audio.preload = 'auto'
    this.audio.addEventListener('ended', () => this.advance())
  }

  start(): void {
    if (this.started) return
    this.started = true
    this.advance()
  }

  // Call every frame. `active` = pointer is locked (player is in-world).
  tick(dt: number, active: boolean): void {
    this._targetScale = active ? 1.0 : 0.0
    // Ease toward target: fast fade-out (~1.5s), slightly faster fade-in (~0.8s).
    const rate = this._scale > this._targetScale ? dt / 1.5 : dt / 0.8
    if (Math.abs(this._scale - this._targetScale) < rate) {
      this._scale = this._targetScale
    } else {
      this._scale += (this._targetScale - this._scale > 0 ? 1 : -1) * rate
    }
    this.audio.volume = this._volume * this._scale
  }

  next(): void {
    if (!this.started) return
    this.advance()
  }

  prev(): void {
    if (!this.started) return
    if (this.prevIndex === -1) return
    // Swap: current becomes "prev" so pressing prev again goes back the other way.
    const target = this.prevIndex
    this.prevIndex = this.index
    this.index = target
    this.audio.src = `${import.meta.env.BASE_URL}music/${TRACKS[this.index].file}`
    if (!this._userPaused) this.audio.play().catch(() => {})
  }

  togglePause(): void {
    if (!this.started) return
    if (this._userPaused) {
      this._userPaused = false
      this.audio.play().catch(() => {})
    } else {
      this._userPaused = true
      this.audio.pause()
    }
  }

  get isPaused(): boolean {
    return this._userPaused
  }

  get currentTrack(): Track | null {
    return this.index >= 0 ? TRACKS[this.index] : null
  }

  get volume(): number {
    return this._volume
  }

  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(1, v))
    this.audio.volume = this._volume * this._scale
  }

  private pickNext(): number {
    if (TRACKS.length <= 1) return 0
    let n = this.index
    while (n === this.index) n = Math.floor(Math.random() * TRACKS.length)
    return n
  }

  private advance(): void {
    this.prevIndex = this.index
    this.index = this.pickNext()
    this.audio.src = `${import.meta.env.BASE_URL}music/${TRACKS[this.index].file}`
    if (!this._userPaused) this.audio.play().catch(() => {})
  }
}
