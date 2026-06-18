// Single source of truth for block types and their flat stylized colors.
// Colors are authored in sRGB hex and rendered as-is (ColorManagement is disabled),
// so what you type here is what you see.

export const Block = {
  Air: 0,
  Grass: 1,
  Stone: 2,
  Sand: 3,
  Log: 4,
  Leaves: 5,
} as const

export type BlockId = (typeof Block)[keyof typeof Block]

export type RGB = [number, number, number]

export interface BlockColors {
  top: RGB
  side: RGB
  bottom: RGB
}

const hex = (h: number): RGB => [
  ((h >> 16) & 255) / 255,
  ((h >> 8) & 255) / 255,
  (h & 255) / 255,
]

// Per-face base colors. The mesher additionally applies directional face shading and
// ambient occlusion on top of these.
//
// Design language: a soft PASTEL palette (light, gently desaturated) so the world reads
// as calm and stylized. Leaves are the deliberate exception — a deeper muted sage that
// gives trees contrast against the pale grass.
export const BLOCK_COLORS: Record<number, BlockColors> = {
  [Block.Grass]: { top: hex(0x90c873), side: hex(0x7bb05e), bottom: hex(0x9c8b66) },
  [Block.Stone]: { top: hex(0xc3c2cd), side: hex(0xb4b3c0), bottom: hex(0xa2a1af) },
  [Block.Sand]: { top: hex(0xecdfb2), side: hex(0xe0d29f), bottom: hex(0xd1c08c) },
  [Block.Log]: { top: hex(0xb89a72), side: hex(0x9c7b54), bottom: hex(0xb89a72) },
  [Block.Leaves]: { top: hex(0x4c763f), side: hex(0x436b39), bottom: hex(0x37592f) },
}
