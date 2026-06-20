// Pointer-lock mouse look + keyboard movement intent.
// Produces a plain state object each frame; physics consumes it.
export interface ControlState {
  forward: number // -1..1 (W/S)
  right: number // -1..1 (D/A)
  jump: boolean
  yaw: number // radians, rotation about Y
  pitch: number // radians, clamped to avoid flipping
}

const LOOK_SENSITIVITY = 0.0022
const PITCH_LIMIT = Math.PI / 2 - 0.02

export class Controls {
  readonly state: ControlState = { forward: 0, right: 0, jump: false, yaw: 0, pitch: 0 }
  locked = false
  allowLock = false  // must be set true before pointer lock is permitted (prevents locking during intro)

  private keys = new Set<string>()

  // One-shot interaction flags — consumed by the game loop each frame
  private _leftClick  = false
  private _rightClick = false
  private _interact   = false // E key
  private _slotDelta  = 0     // accumulated arrow-key slot changes

  constructor(
    dom: HTMLElement,
    private readonly onLockChange?: (locked: boolean) => void,
  ) {
    dom.addEventListener('click', () => {
      if (!this.locked && this.allowLock) dom.requestPointerLock()
    })

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom
      if (!this.locked) this.keys.clear()
      this.onLockChange?.(this.locked)
    })

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return
      this.state.yaw -= e.movementX * LOOK_SENSITIVITY
      this.state.pitch -= e.movementY * LOOK_SENSITIVITY
      this.state.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.state.pitch))
    })

    dom.addEventListener('mousedown', (e) => {
      if (!this.locked) return
      if (e.button === 0) this._leftClick  = true
      if (e.button === 2) this._rightClick = true
    })

    // Prevent the browser context menu while in pointer-lock
    dom.addEventListener('contextmenu', (e) => { if (this.locked) e.preventDefault() })

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code)
      if (e.code === 'Space') e.preventDefault()
      if (e.code === 'KeyE') { this._interact = true; e.preventDefault() }
      if (e.code === 'ArrowLeft')  { this._slotDelta -= 1; e.preventDefault() }
      if (e.code === 'ArrowRight') { this._slotDelta += 1; e.preventDefault() }
    })
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code)
    })
  }

  // Consume one-shot flags (each returns true at most once per press)
  consumeLeftClick():  boolean { const v = this._leftClick;  this._leftClick  = false; return v }
  consumeRightClick(): boolean { const v = this._rightClick; this._rightClick = false; return v }
  consumeInteract():   boolean { const v = this._interact;   this._interact   = false; return v }
  consumeSlotDelta():  number  { const v = this._slotDelta;  this._slotDelta  = 0;     return v }

  // Refresh the movement intent from currently-held keys.
  update(): ControlState {
    const k = this.keys
    this.state.forward = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0)
    this.state.right = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0)
    this.state.jump = k.has('Space')
    return this.state
  }
}
