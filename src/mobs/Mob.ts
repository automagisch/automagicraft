import * as THREE from 'three'
import type { World } from '../engine/World'

// Base class for all mobs. Subclasses define appearance and behavior.
export abstract class Mob {
  readonly mesh: THREE.Group
  readonly position: THREE.Vector3

  constructor(protected readonly scene: THREE.Scene) {
    this.mesh = new THREE.Group()
    this.position = new THREE.Vector3()
    scene.add(this.mesh)
  }

  abstract update(dt: number, playerPos: THREE.Vector3, world: World, dayTime: number): void

  dispose(): void {
    this.scene.remove(this.mesh)
  }
}
