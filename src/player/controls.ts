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

  private keys = new Set<string>()

  constructor(
    dom: HTMLElement,
    private readonly onLockChange?: (locked: boolean) => void,
  ) {
    dom.addEventListener('click', () => {
      if (!this.locked) dom.requestPointerLock()
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

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code)
      if (e.code === 'Space') e.preventDefault() // stop page scroll
    })
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code)
    })
  }

  // Refresh the movement intent from currently-held keys.
  update(): ControlState {
    const k = this.keys
    this.state.forward = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0)
    this.state.right = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0)
    this.state.jump = k.has('Space')
    return this.state
  }
}
