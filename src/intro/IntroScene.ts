// Cinematic introduction sequence.
// Shutters cover the world from page load. User clicks/Enter to begin.
// Quotes render above the shutters, then the shutters open to reveal the blurred world.
// First visit: unskippable. Subsequent visits: E skips to shutter-open phase.

type IntroState =
  | 'idle'
  | 'q1_in' | 'q1_hold' | 'q1_out'
  | 'q2_in' | 'q2_hold' | 'q2_out'
  | 'black_pause'
  | 'shutter' | 'blur'
  | 'done'

// All durations in seconds — edit here to tune timing.
const QUOTE_FADE  = 1.2   // fade in / fade out per quote
const Q1_HOLD     = 5     // quote 1 hold after fade-in
const Q2_HOLD     = 3     // quote 2 hold after fade-in
const BLACK_PAUSE = 1     // pause after last quote fades out
const SHUTTER_DUR = 1.2   // shutter open animation (must match CSS transition)
const BLUR_DELAY  = 0.1   // seconds after shutter starts before blur begins fading
const BLUR_DUR    = 1.5   // blur fade duration (must match CSS transition)

const QUOTES = [
  {
    text: '"You only need 2 hands, 10 fingers and a big gray mass in your skull to shape the entire world around you…"',
    cite: '',
  },
  {
    text: '"Dream out loud and make some noise."',
    cite: '— Koen Houtman',
  },
]

function el(id: string): HTMLElement {
  const e = document.getElementById(id)
  if (!e) throw new Error(`Missing intro element #${id}`)
  return e
}

export class IntroScene {
  private state: IntroState = 'idle'
  private timer = 0
  private blurStarted = false
  private started = false
  private onDone: (() => void) | null = null
  private onStart: (() => void) | null = null

  readonly skipAllowed: boolean
  private readonly canvas: HTMLCanvasElement

  constructor(seenIntro: boolean, canvas: HTMLCanvasElement) {
    this.skipAllowed = seenIntro
    this.canvas = canvas
  }

  // Call immediately after world loads. Shows the start prompt and waits for user input.
  init(onStart: () => void, onDone: () => void): void {
    this.onStart = onStart
    this.onDone = onDone

    el('intro-start').classList.remove('hidden')
    if (this.skipAllowed) el('intro-skip-hint').classList.remove('hidden')

    el('intro-start').addEventListener('click', () => this.triggerStart(), { once: true })
    document.addEventListener('keydown', this.onKeydown)
  }

  update(dt: number): void {
    if (this.state === 'idle' || this.state === 'done') return
    this.timer += dt

    // Update progress bar during hold phases.
    if (this.state === 'q1_hold' || this.state === 'q2_hold') {
      const dur = this.state === 'q1_hold' ? Q1_HOLD : Q2_HOLD
      el('intro-progress').style.transform = `scaleX(${Math.min(this.timer / dur, 1)})`
    }

    // Blur starts BLUR_DELAY seconds after shutter begins opening.
    if (this.state === 'shutter' && !this.blurStarted && this.timer >= BLUR_DELAY) {
      this.blurStarted = true
      this.canvas.classList.remove('intro-blurred')
    }

    const dur = this.stateDuration()
    if (dur !== null && this.timer >= dur) {
      this.timer -= dur
      this.advance()
    }
  }

  skipToShutter(): void {
    if (this.state === 'shutter' || this.state === 'blur' || this.state === 'done') return

    el('intro-quote').classList.remove('visible')
    el('intro-progress').classList.add('hidden')
    el('intro-skip-hint').classList.add('hidden')

    this.timer = 0
    this.blurStarted = false
    this.setState('shutter')
  }

  dispose(): void {
    document.removeEventListener('keydown', this.onKeydown)
    for (const id of ['intro-start', 'intro-quote', 'intro-shutter-top', 'intro-shutter-bottom', 'intro-progress', 'intro-skip-hint']) {
      el(id).classList.add('hidden')
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private triggerStart(): void {
    if (this.started) return
    this.started = true
    el('intro-start').classList.add('hidden')
    this.onStart?.()
    el('intro-progress').classList.remove('hidden')
    this.setState('q1_in')
  }

  private setState(s: IntroState): void {
    this.state = s

    switch (s) {
      case 'q1_in':
        el('intro-progress').style.transform = 'scaleX(0)'
        this.showQuote(0)
        break
      case 'q1_out':
        this.hideQuote()
        break
      case 'q2_in':
        el('intro-progress').style.transform = 'scaleX(0)'
        this.showQuote(1)
        break
      case 'q2_out':
        this.hideQuote()
        break
      case 'black_pause':
        el('intro-progress').classList.add('hidden')
        break
      case 'shutter':
        el('intro-skip-hint').classList.add('hidden')
        this.openShutter()
        break
      case 'done':
        this.complete()
        break
    }
  }

  private advance(): void {
    const next: Record<IntroState, IntroState | null> = {
      idle:        null,
      q1_in:       'q1_hold',
      q1_hold:     'q1_out',
      q1_out:      'q2_in',
      q2_in:       'q2_hold',
      q2_hold:     'q2_out',
      q2_out:      'black_pause',
      black_pause: 'shutter',
      shutter:     'blur',
      blur:        'done',
      done:        null,
    }
    const n = next[this.state]
    if (n) this.setState(n)
  }

  private stateDuration(): number | null {
    switch (this.state) {
      case 'q1_in':       return QUOTE_FADE
      case 'q1_hold':     return Q1_HOLD
      case 'q1_out':      return QUOTE_FADE
      case 'q2_in':       return QUOTE_FADE
      case 'q2_hold':     return Q2_HOLD
      case 'q2_out':      return QUOTE_FADE
      case 'black_pause': return BLACK_PAUSE
      case 'shutter':     return SHUTTER_DUR
      case 'blur':        return BLUR_DUR
      default:            return null
    }
  }

  private showQuote(i: number): void {
    const q = QUOTES[i]
    el('intro-quote-text').textContent = q.text
    const cite = el('intro-quote-cite')
    cite.textContent = q.cite
    cite.classList.toggle('hidden', q.cite === '')
    el('intro-quote').classList.add('visible')
  }

  private hideQuote(): void {
    el('intro-quote').classList.remove('visible')
  }

  private openShutter(): void {
    el('intro-shutter-top').classList.add('open')
    el('intro-shutter-bottom').classList.add('open')
  }

  private complete(): void {
    this.onDone?.()
  }

  private onKeydown = (e: KeyboardEvent): void => {
    if (this.state === 'idle' && (e.code === 'Enter' || e.code === 'NumpadEnter')) {
      this.triggerStart()
      return
    }
    if (this.skipAllowed && e.code === 'KeyE') {
      this.skipToShutter()
    }
  }
}
