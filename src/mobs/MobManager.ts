import * as THREE from 'three'
import type { World } from '../engine/World'
import type { Mob } from './Mob'
import { BirdMob, BIRD_PALETTES } from './BirdMob'
import { config } from '../config'

export class MobManager {
  private readonly mobs: Mob[] = []
  private readonly playerPos = new THREE.Vector3()

  constructor(
    scene: THREE.Scene,
    material: THREE.MeshBasicMaterial,
    treeTops: [number, number, number][],
    rng: () => number,
  ) {
    this.spawnBirds(scene, material, treeTops, rng)
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

  update(dt: number, playerPosition: [number, number, number], world: World, dayTime: number): void {
    this.playerPos.set(playerPosition[0], playerPosition[1], playerPosition[2])
    for (const mob of this.mobs) mob.update(dt, this.playerPos, world, dayTime)
  }
}
