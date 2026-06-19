import * as THREE from 'three'
import { createRenderer } from './render/renderer'
import { DayNightCycle } from './render/sky'
import { World } from './engine/World'
import { generateTerrain } from './engine/terrain'
import { buildChunkGeometry, buildWaterGeometry } from './engine/mesher'
import { Player } from './player/Player'
import { Controls } from './player/controls'
import { updatePlayer, WALK_SPEED } from './player/physics'
import { Block } from './engine/blocks'
import { setLoading, setLocked, initMenu, setUnderwater } from './ui/hud'
import { MusicPlayer } from './audio/music'
import { SfxPlayer } from './audio/sfx'

const WORLD_X = 512
const WORLD_Y = 96
const WORLD_Z = 512
const CHUNK = 32
const SEED = 1337
const PHYSICS_STEP = 1 / 60

// Head-bob feel.
const BOB_STRIDE = 1.6
const BOB_VERTICAL = 0.06
const BOB_ROLL = 0.011
const STEP_SMOOTH_TAU = 0.08 // seconds for the camera to ease up after a step

const { renderer, scene, camera } = createRenderer()
document.body.appendChild(renderer.domElement)

const world = new World(WORLD_X, WORLD_Y, WORLD_Z)
const material = new THREE.MeshBasicMaterial({ vertexColors: true })
const waterMaterial = new THREE.MeshBasicMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.68,
  depthWrite: false,
})

// Background music and SFX start on the first click into the world (autoplay needs a user gesture).
const music = new MusicPlayer()
const sfx = new SfxPlayer()
renderer.domElement.addEventListener('click', () => { music.start(); sfx.start() })

let player: Player
let controls: Controls
let dayNight: DayNightCycle
const spawn: [number, number, number] = [0, 0, 0]

// Yield to the event loop via MessageChannel rather than setTimeout: background tabs clamp
// timers to ~1s, which would make first load take minutes; MessageChannel tasks are not
// throttled, so the world builds fast whether the tab is focused or not.
const yieldToLoop = (() => {
  const channel = new MessageChannel()
  let resume: (() => void) | null = null
  channel.port1.onmessage = () => {
    const r = resume
    resume = null
    r?.()
  }
  return () => new Promise<void>((resolve) => {
    resume = resolve
    channel.port2.postMessage(0)
  })
})()

setLoading('Shaping the land…', 'Carving hills, a valley and a mountain.')
window.setTimeout(start, 30)

async function start(): Promise<void> {
  await yieldToLoop()
  generateTerrain(world, { seed: SEED, sizeX: WORLD_X, sizeZ: WORLD_Z, height: WORLD_Y })

  // Build chunk meshes incrementally so the loading screen stays responsive and shows progress.
  const chunks: [number, number][] = []
  for (let cz = 0; cz < WORLD_Z; cz += CHUNK) {
    for (let cx = 0; cx < WORLD_X; cx += CHUNK) chunks.push([cx, cz])
  }
  let i = 0
  while (i < chunks.length) {
    const t0 = performance.now()
    while (i < chunks.length && performance.now() - t0 < 12) {
      const [cx, cz] = chunks[i++]
      const geo = buildChunkGeometry(world, cx, cz, CHUNK)
      if (geo) scene.add(new THREE.Mesh(geo, material))
      const waterGeo = buildWaterGeometry(world, cx, cz, CHUNK)
      if (waterGeo) scene.add(new THREE.Mesh(waterGeo, waterMaterial))
    }
    setLoading('Building the world…', `${Math.round((i / chunks.length) * 100)}%`)
    await yieldToLoop()
  }

  // Spawn on the mountain top (the highest column near the world center).
  const cx = Math.floor(WORLD_X / 2)
  const cz = Math.floor(WORLD_Z / 2)
  let peak = { x: cx, z: cz, y: world.surfaceY(cx, cz) }
  for (let z = cz - 8; z <= cz + 8; z++) {
    for (let x = cx - 8; x <= cx + 8; x++) {
      const s = world.surfaceY(x, z)
      if (s > peak.y) peak = { x, z, y: s }
    }
  }
  spawn[0] = peak.x + 0.5
  spawn[1] = peak.y + 1 + 0.9
  spawn[2] = peak.z + 0.5

  player = new Player(spawn[0], spawn[1], spawn[2])
  controls = new Controls(renderer.domElement, setLocked)
  dayNight = new DayNightCycle(scene, material, 0.3, waterMaterial)

  initMenu(music, sfx)
  setLocked(false)

  // Dev-only inspection hook (stripped from production builds).
  if (import.meta.env.DEV) {
    ;(window as unknown as { __voxel: unknown }).__voxel = {
      scene, camera, world, renderer, material, player, controls, updatePlayer, dayNight,
    }
  }

  loop()
}

let last = performance.now()
let accumulator = 0
let bobPhase = 0
let bobAmount = 0
// Previous-frame state for one-shot SFX event detection.
let prevOnGround = false
let prevFeetInWater = false

function loop(): void {
  requestAnimationFrame(loop)

  const now = performance.now()
  let dt = (now - last) / 1000
  last = now
  if (dt > 0.1) dt = 0.1 // clamp after tab-switches / hitches

  const input = controls.update()

  // Dev-only: when frozen, skip simulation so the camera can be parked for inspection.
  const frozen = import.meta.env.DEV &&
    (window as unknown as { __voxel?: { frozen?: boolean } }).__voxel?.frozen
  if (frozen) {
    renderer.render(scene, camera)
    return
  }

  accumulator += dt
  while (accumulator >= PHYSICS_STEP) {
    updatePlayer(
      player,
      world,
      {
        // Movement only responds while the pointer is locked; gravity always applies.
        forward: controls.locked ? input.forward : 0,
        right: controls.locked ? input.right : 0,
        jump: controls.locked ? input.jump : false,
        yaw: input.yaw,
      },
      PHYSICS_STEP,
    )

    if (player.position[1] < -10) {
      player.position[0] = spawn[0]
      player.position[1] = spawn[1]
      player.position[2] = spawn[2]
      player.vx = player.vy = player.vz = 0
    }

    accumulator -= PHYSICS_STEP
  }

  // Head-bob: subtle vertical bounce + roll while walking on the ground.
  const speed = Math.hypot(player.vx, player.vz)
  const targetBob = player.onGround && speed > 0.4 ? Math.min(speed / WALK_SPEED, 1) : 0
  bobAmount += (targetBob - bobAmount) * Math.min(1, dt * 8)
  if (player.onGround) bobPhase += speed * dt * BOB_STRIDE
  const bobY = Math.sin(bobPhase * 2) * BOB_VERTICAL * bobAmount
  const roll = Math.sin(bobPhase) * BOB_ROLL * bobAmount

  // Ease the step-up camera offset back to zero.
  player.stepOffset *= Math.exp(-dt / STEP_SMOOTH_TAU)
  if (player.stepOffset < 1e-3) player.stepOffset = 0

  camera.position.set(
    player.position[0],
    player.eyeY - player.stepOffset + bobY,
    player.position[2],
  )
  camera.rotation.set(input.pitch, input.yaw, roll, 'YXZ')

  dayNight.update(dt, camera.position)
  music.tick(dt, controls.locked)

  const isWalking = player.onGround && Math.hypot(player.vx, player.vz) > 0.4

  // Jump: player left the ground with upward velocity this frame (not a step off a ledge).
  if (!player.onGround && prevOnGround && player.vy > 4) sfx.playJump()

  // Water splash: player entered a water block having been airborne (not grounded, not in water).
  // Using prevOnGround + prevFeetInWater guards against triggering while walking through water.
  const feetY = Math.floor(player.position[1] - player.hy + 0.1)
  const feetInWater = world.getBlock(Math.floor(player.position[0]), feetY, Math.floor(player.position[2])) === Block.Water
  const wasAirborne = !prevOnGround && !prevFeetInWater
  if (feetInWater && !prevFeetInWater && wasAirborne) sfx.playSplash()

  prevOnGround = player.onGround
  prevFeetInWater = feetInWater

  sfx.update(dayNight.time, isWalking)

  // When the camera eye is inside a water block, show the blue tint overlay and
  // thicken the fog so the world dissolves quickly into murky blue.
  const eyeInWater =
    world.getBlock(
      Math.floor(camera.position.x),
      Math.floor(camera.position.y),
      Math.floor(camera.position.z),
    ) === Block.Water
  setUnderwater(eyeInWater)
  if (eyeInWater) {
    scene.fog!.color.setHex(0x1a5080)
    ;(scene.fog as THREE.FogExp2).density = 0.18
  } else {
    ;(scene.fog as THREE.FogExp2).density = 0.007
  }

  renderer.render(scene, camera)
}
