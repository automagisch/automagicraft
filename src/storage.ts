const K = {
  musicVolume: 'amcraft_music_vol',
  sfxVolume:   'amcraft_sfx_vol',
  seed:        'amcraft_seed',
  seenIntro:   'amcraft_seen_intro',
} as const

function getNum(key: string): number | null {
  const v = localStorage.getItem(key)
  if (v === null) return null
  const n = Number(v)
  return isFinite(n) ? n : null
}

export const storage = {
  musicVolume: {
    get: (): number | null => getNum(K.musicVolume),
    set: (v: number): void => { localStorage.setItem(K.musicVolume, String(v)) },
  },
  sfxVolume: {
    get: (): number | null => getNum(K.sfxVolume),
    set: (v: number): void => { localStorage.setItem(K.sfxVolume, String(v)) },
  },
  seed: {
    get: (): number | null => getNum(K.seed),
    set: (v: number): void => { localStorage.setItem(K.seed, String(v)) },
    clear: (): void => { localStorage.removeItem(K.seed) },
  },
  seenIntro: {
    get: (): boolean => localStorage.getItem(K.seenIntro) === 'true',
    set: (v: boolean): void => { localStorage.setItem(K.seenIntro, String(v)) },
  },
}
