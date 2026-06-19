import { defineConfig } from 'vite'
import { readFileSync } from 'fs'

// Minimal key=value parser for world.env (handles # comments and blank lines).
function parseEnvFile(path: string): Record<string, string> {
  let raw = ''
  try { raw = readFileSync(path, 'utf-8') } catch { return {} }
  const out: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 0) continue
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
  }
  return out
}

const wc = parseEnvFile('./world.env')
const num = (key: string, fallback: number) => (key in wc ? Number(wc[key]) : fallback)

export default defineConfig({
  // relative base so the static build works under any host subpath (e.g. GitHub Pages)
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
  define: {
    // World config constants — consumed by src/config.ts
    __WC_WORLD_SEED__:  num('WORLD_SEED',  1337),
    __WC_DAY_LENGTH__:  num('DAY_LENGTH',   150),
    __WC_BIRD_AMOUNT__: num('BIRD_AMOUNT',   80),
    __WC_DEER_AMOUNT__: num('DEER_AMOUNT',   25),
    __WC_WALK_SPEED__:       num('WALK_SPEED',         4.6),
    __WC_FOG_DENSITY__:      num('FOG_DENSITY',       0.007),
    __WC_GOD_BLOCK_MARGIN__: num('GOD_BLOCK_MARGIN',   0.3),
  },
})
