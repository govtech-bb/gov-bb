import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Built from landing's components, shipped as the editor's own static assets.
export default defineConfig({
  base: './',
  publicDir: false,
  envDir: false,
  resolve: { tsconfigPaths: true },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'import.meta.env.DEV': 'false',
    // Preview intercepts navigation; no deployment-specific destinations are needed.
    'import.meta.env.VITE_CHAT_URL': JSON.stringify('#'),
    'import.meta.env.VITE_FORMS_URL': JSON.stringify('#'),
    'import.meta.env.VITE_TRACKER_URL': JSON.stringify('#'),
  },
  plugins: [react(), tailwindcss()],
  build: {
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
