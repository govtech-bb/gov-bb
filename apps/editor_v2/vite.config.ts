import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * ONE dev server, ONE origin, two route trees.
 *
 * IndexedDB is scoped per origin: an editor on :3001 and a site on :3000
 * cannot see each other's database. `/editor/*` mounts the editor and
 * everything else mounts `@govtech-bb/landing-v2`, both inside this app.
 */
export default defineConfig({
  // Pinned to this directory so the dev server serves index.html whatever
  // the cwd is (nx, pnpm --filter, or a bare `vite` from the repo root).
  root: import.meta.dirname,
  plugins: [react()],
  server: { port: 3010 },
  worker: { format: 'es' },
  optimizeDeps: {
    // PGlite ships WASM + a worker entry; pre-bundling breaks the worker's
    // relative asset resolution.
    exclude: ['@electric-sql/pglite'],
  },
})
