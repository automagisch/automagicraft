import * as THREE from 'three'

type RGB = [number, number, number]

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}
const mix = (a: RGB, b: RGB, t: number): RGB => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
]

// Palette of the cycle (all soft / pastel to match the world).
const SKY_DAY: RGB = [0.604, 0.816, 0.925] // #9ad0ec
const SKY_NIGHT: RGB = [0.047, 0.063, 0.137] // deep navy
const SKY_DUSK: RGB = [0.95, 0.62, 0.46] // warm horizon glow

const TINT_DAY: RGB = [1.0, 1.0, 1.0]
const TINT_NIGHT: RGB = [0.34, 0.4, 0.58] // cool + dim, world still readable
const TINT_DUSK: RGB = [1.05, 0.86, 0.72] // golden hour

const SUN_HIGH: RGB = [1.0, 0.97, 0.85]
const SUN_LOW: RGB = [1.0, 0.58, 0.32]
const MOON: RGB = [0.82, 0.88, 1.0]

const SKY_RADIUS = 320 // distance the sun/moon/stars sit from the camera
const DAY_LENGTH = 150 // seconds for a full dawn→day→dusk→night cycle

function discTexture(): THREE.CanvasTexture {
  const size = 128
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.95)')
  g.addColorStop(0.7, 'rgba(255,255,255,0.35)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.NoColorSpace
  return tex
}

export class DayNightCycle {
  // 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset.
  time: number

  private readonly scene: THREE.Scene
  private readonly material: THREE.MeshBasicMaterial
  private readonly sun: THREE.Sprite
  private readonly moon: THREE.Sprite
  private readonly stars: THREE.Points
  private readonly bgColor = new THREE.Color()

  constructor(
    scene: THREE.Scene,
    chunkMaterial: THREE.MeshBasicMaterial,
    startTime = 0.3,
  ) {
    this.scene = scene
    this.material = chunkMaterial
    this.time = startTime

    const disc = discTexture()

    const sunMat = new THREE.SpriteMaterial({
      map: disc,
      color: 0xffffff,
      fog: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.AdditiveBlending,
    })
    this.sun = new THREE.Sprite(sunMat)
    this.sun.scale.setScalar(46)
    scene.add(this.sun)

    const moonMat = new THREE.SpriteMaterial({
      map: disc,
      color: new THREE.Color(...MOON),
      fog: false,
      depthWrite: false,
      transparent: true,
    })
    this.moon = new THREE.Sprite(moonMat)
    this.moon.scale.setScalar(30)
    scene.add(this.moon)

    this.stars = this.makeStars()
    scene.add(this.stars)
  }

  private makeStars(): THREE.Points {
    const COUNT = 900
    const pos = new Float32Array(COUNT * 3)
    for (let i = 0; i < COUNT; i++) {
      // points scattered over the upper hemisphere of the sky dome
      const theta = Math.random() * Math.PI * 2
      const y = Math.random() * 0.85 + 0.05
      const r = Math.sqrt(1 - y * y)
      pos[i * 3] = Math.cos(theta) * r * SKY_RADIUS * 0.98
      pos[i * 3 + 1] = y * SKY_RADIUS * 0.98
      pos[i * 3 + 2] = Math.sin(theta) * r * SKY_RADIUS * 0.98
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.5,
      sizeAttenuation: false,
      fog: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
    const points = new THREE.Points(geo, mat)
    points.frustumCulled = false
    return points
  }

  // Advances time and applies sky color, fog color, world tint, and sun/moon/star positions.
  update(dt: number, cameraPos: THREE.Vector3): void {
    this.time = (this.time + dt / DAY_LENGTH) % 1

    const angle = (this.time - 0.25) * Math.PI * 2
    const ca = Math.cos(angle)
    const sa = Math.sin(angle) // sun elevation: -1 (midnight) .. +1 (noon)
    // Slightly tilted east→west orbit (sun travels through the sky, not straight overhead).
    const sunDir = new THREE.Vector3(ca, sa, ca * 0.25).normalize()
    const e = sunDir.y

    const dayAmt = smoothstep(-0.12, 0.18, e) // 0 night → 1 day
    const duskAmt = Math.exp(-((e / 0.16) ** 2)) // peaks when the sun is on the horizon
    const nightAmt = 1 - dayAmt

    // Sky + fog color.
    let sky = mix(SKY_NIGHT, SKY_DAY, dayAmt)
    sky = mix(sky, SKY_DUSK, duskAmt * 0.7)
    this.bgColor.setRGB(sky[0], sky[1], sky[2])
    ;(this.scene.background as THREE.Color).copy(this.bgColor)
    this.scene.fog!.color.copy(this.bgColor)

    // World brightness/tint (multiplies the baked vertex colors).
    let tint = mix(TINT_NIGHT, TINT_DAY, dayAmt)
    tint = mix(tint, TINT_DUSK, duskAmt * 0.5)
    this.material.color.setRGB(tint[0], tint[1], tint[2])

    // Sun.
    const sunVisible = e > -0.12
    this.sun.visible = sunVisible
    if (sunVisible) {
      this.sun.position.copy(cameraPos).addScaledVector(sunDir, SKY_RADIUS)
      const sc = mix(SUN_LOW, SUN_HIGH, smoothstep(0, 0.35, e))
      ;(this.sun.material as THREE.SpriteMaterial).color.setRGB(sc[0], sc[1], sc[2])
    }

    // Moon (opposite the sun, visible after dark).
    const moonDir = sunDir.clone().multiplyScalar(-1)
    const moonVisible = moonDir.y > -0.12
    this.moon.visible = moonVisible
    if (moonVisible) {
      this.moon.position.copy(cameraPos).addScaledVector(moonDir, SKY_RADIUS)
      ;(this.moon.material as THREE.SpriteMaterial).opacity = smoothstep(-0.12, 0.15, moonDir.y)
    }

    // Stars fade in at night.
    this.stars.position.copy(cameraPos)
    ;(this.stars.material as THREE.PointsMaterial).opacity = nightAmt * nightAmt
  }
}
