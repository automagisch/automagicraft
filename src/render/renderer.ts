import * as THREE from 'three'

export interface RenderContext {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
}

const SKY = 0x9ad0ec

export function createRenderer(): RenderContext {
  // Render authored colors as-is (we bake shading + AO into vertex colors ourselves).
  THREE.ColorManagement.enabled = false

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setClearColor(SKY)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(SKY)
  // Exponential "infinity fog": terrain dissolves smoothly into the horizon so the world's
  // hard edge is never a visible cut. The day-night cycle recolors this every frame.
  scene.fog = new THREE.FogExp2(SKY, 0.007)

  // Far plane sits where the fog is already ~opaque, so distant chunks are clipped (cheaper)
  // without any visible seam.
  const camera = new THREE.PerspectiveCamera(
    72,
    window.innerWidth / window.innerHeight,
    0.1,
    380,
  )

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  return { renderer, scene, camera }
}
