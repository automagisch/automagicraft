// The player is a center-based axis-aligned bounding box.
// `position` is the CENTER of the box; the feet are at position.y - hy.
export class Player {
  position: [number, number, number]
  // Horizontal velocity persists between ticks so movement carries momentum (esp. in air).
  vx = 0
  vz = 0
  vy = 0
  onGround = false

  // Visual-only: when auto step-up snaps the body up a ledge, the camera lags behind by
  // this much and eases back to 0, turning the hop into a smooth glide.
  stepOffset = 0

  // Half-extents: 0.6 x 1.8 x 0.6 box.
  readonly hx = 0.3
  readonly hy = 0.9
  readonly hz = 0.3

  // Eye height is 1.62 above the feet => 0.72 above the center.
  readonly eyeOffset = 0.72

  constructor(x: number, y: number, z: number) {
    this.position = [x, y, z]
  }

  get eyeY(): number {
    return this.position[1] + this.eyeOffset
  }
}
