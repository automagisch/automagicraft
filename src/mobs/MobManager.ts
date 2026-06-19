import * as THREE from 'three'
import { Block } from '../engine/blocks'
import type { World } from '../engine/World'
import type { Mob } from './Mob'
import { BirdMob, BIRD_PALETTES } from './BirdMob'
import { DeerMob, DEER_PALETTES } from './DeerMob'
import { config } from '../config'

export class MobManager {
  private readonly mobs: Mob[] = []
  private readonly playerPos = new THREE.Vector3()

  constructor(
    scene: THREE.Scene,
    material: THREE.MeshBasicMaterial,
    treeTops: [number, number, number][],
    world: World,
    rng: () => number,
  ) {
    this.spawnBirds(scene, material, treeTops, rng)
    this.spawnDeer(scene, material, world, rng)
  }

  private spawnBirds(
    scene: THREE.Scene,
    material: THREE.MeshBasicMaterial,
    treeTops: [number, number, number][],
    rng: () => number,
  ): void {
    if (treeTops.length === 0) return
    for (let b = 0; b < config.birdAmount; b++) {
      const treeIdx = Math.floor(rng() * treeTops.length)
      const palette = BIRD_PALETTES[Math.floor(rng() * BIRD_PALETTES.length)]
      this.mobs.push(new BirdMob(scene, material, treeTops, treeIdx, palette, rng))
    }
  }

  private spawnDeer(
    scene: THREE.Scene,
    material: THREE.MeshBasicMaterial,
    world: World,
    rng: () => number,
  ): void {
    let spawned = 0
    let attempts = 0
    const maxAttempts = config.deerAmount * 30

    while (spawned < config.deerAmount && attempts < maxAttempts) {
      attempts++
      const x = Math.floor(rng() * (world.sizeX - 4)) + 2
      const z = Math.floor(rng() * (world.sizeZ - 4)) + 2
      const sy = world.surfaceY(x, z)
      if (sy < 0) continue
      const block = world.getBlock(x, sy, z)
      // Deer graze on land only — skip water, trees
      if (block !== Block.Grass && block !== Block.Stone && block !== Block.Sand) continue

      const palette = DEER_PALETTES[Math.floor(rng() * DEER_PALETTES.length)]
      this.mobs.push(new DeerMob(scene, material, x + 0.5, sy, z + 0.5, palette, rng))
      spawned++
    }
  }

  update(dt: number, playerPosition: [number, number, number], world: World, dayTime: number): void {
    this.playerPos.set(playerPosition[0], playerPosition[1], playerPosition[2])
    for (const mob of this.mobs) mob.update(dt, this.playerPos, world, dayTime)
  }
}
