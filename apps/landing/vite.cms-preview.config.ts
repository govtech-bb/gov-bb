import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// A public, read-only browser entry built by landing. The CMS loads the entry;
// neither app imports the other's source or needs a shared workspace package.
export default defineConfig(({ mode }) => ({
  base: './',
  publicDir: false,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    // A library build is always production code, so `requireEnv` would throw
    // for unset URLs even under `pnpm dev`. Keep its dev defaults in dev mode.
    'import.meta.env.DEV': JSON.stringify(mode !== 'production'),
  },
  plugins: [react(), tailwindcss()],
  // Source, as tsconfig's `paths` maps it for the app build, so this entry
  // needs no prior block-kit build either.
  resolve: {
    alias: {
      '@govtech-bb/block-kit/contact': fileURLToPath(
        new URL('../../packages/block-kit/src/contact.ts', import.meta.url),
      ),
    },
  },
  build: {
    outDir: 'public/cms-preview',
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(
        new URL('./src/preview/cms-preview.tsx', import.meta.url),
      ),
      formats: ['es'],
      fileName: 'renderer',
      cssFileName: 'styles',
    },
  },
}))
