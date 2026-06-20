// World config — values are injected at build time from world.env via vite.config.ts.
// Import from here rather than using __WC_*__ directly.
declare const __WC_WORLD_SEED__: number
declare const __WC_DAY_LENGTH__: number
declare const __WC_BIRD_AMOUNT__: number
declare const __WC_DEER_AMOUNT__: number
declare const __WC_WALK_SPEED__: number
declare const __WC_FOG_DENSITY__: number
declare const __WC_GOD_BLOCK_MARGIN__: number
declare const __WC_WIND_THRESHOLD__: number
declare const __WC_WIND_MIX__: number

export const config = {
  worldSeed:      __WC_WORLD_SEED__,
  dayLength:      __WC_DAY_LENGTH__,
  birdAmount:     __WC_BIRD_AMOUNT__,
  deerAmount:     __WC_DEER_AMOUNT__,
  walkSpeed:      __WC_WALK_SPEED__,
  fogDensity:     __WC_FOG_DENSITY__,
  godBlockMargin: __WC_GOD_BLOCK_MARGIN__,
  windThreshold:  __WC_WIND_THRESHOLD__,
  windMix:        __WC_WIND_MIX__,
} as const
