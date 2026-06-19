import * as THREE from 'three'
import { BLOCK_COLORS } from '../engine/blocks'

interface Fragment {
  mesh: THREE.Mesh
  vx: number; vy: number; vz: number
  life: number   // 0..1, counts down
}

const LIFETIME = 0.42   // seconds
const GRAVITY  = 18     // blocks/s²

export class BlockBreakEffect {
  private fragments: Fragment[] = []

  constructor(private readonly scene: THREE.Scene) {}

  spawn(x: number, y: number, z: number, blockId: number): void {
    const palette = BLOCK_COLORS[blockId]
    if (!palette) return

    // 6 small fragments scattered around the block centre
    for (let i = 0; i < 6; i++) {
      const geo = new THREE.BoxGeometry(0.18, 0.18, 0.18)

      // Tint each fragment from the block's top/side colour
      const [r, g, b] = i < 2 ? palette.top : palette.side
      const shade = 0.75 + Math.random() * 0.25
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(r * shade, g * shade, b * shade),
        transparent: true,
      })

      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(
        x + 0.5 + (Math.random() - 0.5) * 0.7,
        y + 0.5 + (Math.random() - 0.5) * 0.7,
        z + 0.5 + (Math.random() - 0.5) * 0.7,
      )

      const angle = Math.random() * Math.PI * 2
      const spd   = 1.8 + Math.random() * 2.2
      this.fragments.push({
        mesh,
        vx: Math.cos(angle) * spd * 0.5,
        vy: 2.5 + Math.random() * 3.0,
        vz: Math.sin(angle) * spd * 0.5,
        life: 1,
      })
      this.scene.add(mesh)
    }
  }

  update(dt: number): void {
    for (let i = this.fragments.length - 1; i >= 0; i--) {
      const f = this.fragments[i]
      f.life -= dt / LIFETIME
      f.vy   -= GRAVITY * dt

      f.mesh.position.x += f.vx * dt
      f.mesh.position.y += f.vy * dt
      f.mesh.position.z += f.vz * dt
      f.mesh.rotation.x += f.vx * dt * 3
      f.mesh.rotation.z += f.vz * dt * 3

      ;(f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, f.life)

      if (f.life <= 0) {
        this.scene.remove(f.mesh)
        f.mesh.geometry.dispose()
        ;(f.mesh.material as THREE.Material).dispose()
        this.fragments.splice(i, 1)
      }
    }
  }
}
