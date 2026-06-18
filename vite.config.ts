import { defineConfig } from 'vite'

export default defineConfig({
  // relative base so the static build works under any host subpath (e.g. GitHub Pages)
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
})
