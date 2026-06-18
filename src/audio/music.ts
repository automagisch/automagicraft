// Background-music playlist. The three tracks are royalty-free (see claude/resources/music.md
// and the Credits tab); they shuffle endlessly during gameplay, and the next track is never
// the one that just played. Browsers block autoplay, so playback must be kicked off from a
// user gesture (the first click into the world) via start().

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
  private index = -1 // none played yet
  private started = false
  private _volume = 0.5

  constructor() {
    this.audio.volume = this._volume
    this.audio.preload = 'auto'
    // Advance to a different track when one finishes — endless shuffled playlist.
    this.audio.addEventListener('ended', () => this.advance())
  }

  // Begin playback from a user gesture. Safe to call repeatedly; only the first call starts.
  start(): void {
    if (this.started) return
    this.started = true
    this.advance()
  }

  // Pick a random track index that differs from the one currently playing.
  private pickNext(): number {
    if (TRACKS.length <= 1) return 0
    let n = this.index
    while (n === this.index) n = Math.floor(Math.random() * TRACKS.length)
    return n
  }

  private advance(): void {
    this.index = this.pickNext()
    this.audio.src = `${import.meta.env.BASE_URL}music/${TRACKS[this.index].file}`
    this.audio.play().catch(() => {}) // ignore autoplay rejections before the first gesture
  }

  get volume(): number {
    return this._volume
  }

  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(1, v))
    this.audio.volume = this._volume
  }
}
