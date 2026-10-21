import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// A public, read-only browser entry built by landing. The CMS loads the entry;
// neither app imports the other's source or needs a shared workspace package.
export default defineConfig({
  base: './',
  publicDir: false,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [react(), tailwindcss()],
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
})
