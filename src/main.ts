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
import { setLoading, setLocked, initMenu, setUnderwater, setGodLabel, setGodModeBadge, showBuildHint, setBuildControlsVisible } from './ui/hud'
import { MusicPlayer } from './audio/music'
import { SfxPlayer } from './audio/sfx'
import { MobManager } from './mobs/MobManager'
import { mulberry32 } from './engine/rng'
import { config } from './config'
import { raycastVoxel } from './engine/raycast'
import { GodBlock } from './god/GodBlock'
import { GodMode } from './god/GodMode'
import { InventoryUI } from './ui/inventory'
import { BlockBreakEffect } from './effects/blockBreak'
import { storage } from './storage'

const WORLD_X = 512
const WORLD_Y = 96
const WORLD_Z = 512
const CHUNK = 32
// Persisted seed overrides the compiled-in default; set by the World settings UI.
const SEED = storage.seed.get() ?? config.worldSeed
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
// Restore persisted volumes immediately so sliders initialise to the saved values.
const savedMusicVol = storage.musicVolume.get()
if (savedMusicVol !== null) music.setVolume(savedMusicVol)
const savedSfxVol = storage.sfxVolume.get()
if (savedSfxVol !== null) sfx.setVolume(savedSfxVol)
renderer.domElement.addEventListener('click', () => { music.start(); sfx.start() })

let player: Player
let controls: Controls
let dayNight: DayNightCycle
let mobs: MobManager
let godBlock: GodBlock
let godMode: GodMode
let inventoryUI: InventoryUI
let blockBreak: BlockBreakEffect
let godModeEverActivated = false
const spawn: [number, number, number] = [0, 0, 0]

// Chunk mesh registry for hot-rebuild when blocks change
const chunkMeshes = new Map<string, { solid: THREE.Mesh | null; water: THREE.Mesh | null }>()

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
  const { treeTops, godBlockPos } = generateTerrain(world, { seed: SEED, sizeX: WORLD_X, sizeZ: WORLD_Z, height: WORLD_Y })

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
      const solidMesh = geo ? new THREE.Mesh(geo, material) : null
      if (solidMesh) scene.add(solidMesh)
      const waterGeo = buildWaterGeometry(world, cx, cz, CHUNK)
      const waterMesh = waterGeo ? new THREE.Mesh(waterGeo, waterMaterial) : null
      if (waterMesh) scene.add(waterMesh)
      chunkMeshes.set(`${cx},${cz}`, { solid: solidMesh, water: waterMesh })
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
  mobs = new MobManager(scene, material, treeTops, world, mulberry32(SEED ^ 0xdeadbeef))
  godBlock = new GodBlock(scene, godBlockPos[0], godBlockPos[1], godBlockPos[2])
  godMode  = new GodMode(scene)
  inventoryUI = new InventoryUI()
  blockBreak = new BlockBreakEffect(scene)

  initMenu(music, sfx, SEED)
  setLocked(false)

  // Dev-only inspection hook (stripped from production builds).
  if (import.meta.env.DEV) {
    ;(window as unknown as { __voxel: unknown }).__voxel = {
      scene, camera, world, renderer, material, player, controls, updatePlayer, dayNight,
    }
  }

  loop()
}

// ── Chunk hot-rebuild ─────────────────────────────────────────────────────────

function rebuildChunk(cx: number, cz: number): void {
  const key = `${cx},${cz}`
  const existing = chunkMeshes.get(key)
  if (existing) {
    if (existing.solid) { scene.remove(existing.solid); existing.solid.geometry.dispose() }
    if (existing.water) { scene.remove(existing.water); existing.water.geometry.dispose() }
  }
  const geo      = buildChunkGeometry(world, cx, cz, CHUNK, true)
  const waterGeo = buildWaterGeometry(world, cx, cz, CHUNK)
  const solidMesh = geo      ? new THREE.Mesh(geo, material)            : null
  const waterMesh = waterGeo ? new THREE.Mesh(waterGeo, waterMaterial)  : null
  if (solidMesh) scene.add(solidMesh)
  if (waterMesh) scene.add(waterMesh)
  chunkMeshes.set(key, { solid: solidMesh, water: waterMesh })
}

// Mutate a block and rebuild the affected chunk(s). Also keeps world.topY in sync.
function setBlockAt(x: number, y: number, z: number, id: number): void {
  world.setBlock(x, y, z, id)
  const colIdx = x + z * WORLD_X
  if (id !== 0 /* Air */) {
    if ((world.topY![colIdx] ?? -1) < y) world.topY![colIdx] = y
  } else if (world.topY![colIdx] === y) {
    let newTop = -1
    for (let yy = y - 1; yy >= 0; yy--) {
      if (world.getBlock(x, yy, z) !== 0) { newTop = yy; break }
    }
    world.topY![colIdx] = newTop
  }
  const cx = Math.floor(x / CHUNK) * CHUNK
  const cz = Math.floor(z / CHUNK) * CHUNK
  rebuildChunk(cx, cz)
  // Rebuild neighbours if on a chunk edge (AO and face-culling are cross-chunk)
  if ((x - cx) === 0            && cx - CHUNK >= 0)         rebuildChunk(cx - CHUNK, cz)
  if ((x - cx) === CHUNK - 1   && cx + CHUNK < WORLD_X)    rebuildChunk(cx + CHUNK, cz)
  if ((z - cz) === 0            && cz - CHUNK >= 0)         rebuildChunk(cx, cz - CHUNK)
  if ((z - cz) === CHUNK - 1   && cz + CHUNK < WORLD_Z)    rebuildChunk(cx, cz + CHUNK)
}

// ─────────────────────────────────────────────────────────────────────────────

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
  mobs.update(dt, player.position, world, dayNight.time)
  blockBreak.update(dt)

  // ── God Block / build mode ──────────────────────────────────────────────
  // Compute look direction from current yaw+pitch (same transform as the camera)
  const lookDx = -Math.sin(input.yaw) * Math.cos(input.pitch)
  const lookDy =  Math.sin(input.pitch)
  const lookDz = -Math.cos(input.yaw) * Math.cos(input.pitch)
  const hit = controls.locked
    ? raycastVoxel(world, camera.position.x, camera.position.y, camera.position.z, lookDx, lookDy, lookDz, 6)
    : null

  godBlock.update(dt, camera.position, hit)
  godMode.update(hit)

  // Toggle god mode with E when close enough and aimed at the block
  if (controls.locked && controls.consumeInteract() && godBlock.inRange2 && godBlock.aimed) {
    godMode.toggle()
    setGodModeBadge(godMode.active)
    inventoryUI.setVisible(godMode.active)
    godBlock.respawn(world, setBlockAt)
    if (!godModeEverActivated) {
      godModeEverActivated = true
      setBuildControlsVisible(true)
      showBuildHint()
    }
  }

  // Block interactions (only in god mode, only when pointer is locked)
  if (controls.locked && godMode.active && hit) {
    const slotDelta = controls.consumeSlotDelta()
    if (slotDelta !== 0) {
      godMode.selectSlot(slotDelta)
      inventoryUI.refresh(godMode.slots, godMode.selectedSlot)
    }

    if (controls.consumeLeftClick()) {
      if (godMode.placeBlock(hit, world, setBlockAt))
        inventoryUI.refresh(godMode.slots, godMode.selectedSlot)
    }
    if (controls.consumeRightClick()) {
      if (godMode.collectBlock(hit, world, setBlockAt)) {
        blockBreak.spawn(hit.x, hit.y, hit.z, hit.blockId)
        inventoryUI.refresh(godMode.slots, godMode.selectedSlot)
      }
    }
  } else {
    // Consume to avoid ghost clicks when exiting god mode
    controls.consumeLeftClick()
    controls.consumeRightClick()
    controls.consumeSlotDelta()
  }

  if (controls.locked && godBlock.aimed && godBlock.inRange2) {
    const label = godMode.active
      ? '<kbd>E</kbd> Exit God Mode'
      : '<kbd>E</kbd> Enter God Mode'
    setGodLabel(true, label)
  } else {
    setGodLabel(false)
  }
  // ───────────────────────────────────────────────────────────────────────

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
    ;(scene.fog as THREE.FogExp2).density = config.fogDensity
  }

  renderer.render(scene, camera)
  godMode.renderHand(renderer)
}
