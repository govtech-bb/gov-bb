import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { markdown } from './vite-plugin-markdown'

// Deliberately NOT the app vite.config.ts: booting nitro (an SSR server)
// and devtools for unit tests leaks hundreds of file handles, so vitest
// can't exit ("something prevents Vite server from exiting"). Only the
// plugins the suites actually exercise are loaded — markdown (registry's
// import.meta.glob of *.md), Start (server-fn transform), react (JSX).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [markdown(), tanstackStart(), viteReact()],
})
