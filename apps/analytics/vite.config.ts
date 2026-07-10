import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
  },
  plugins: [
    tailwindcss(),
    nitro({
      config: {
        preset: 'aws_amplify',
        awsAmplify: { runtime: 'nodejs24.x' },
        // The analytics page fetches the API's cached report server-side (see
        // src/lib/report.ts). On Amplify this deploys as a Nitro SSR compute
        // (a Lambda) that never sees Console env vars at runtime, and Nitro
        // doesn't read `.env` in production — so a runtime `process.env` read is
        // `undefined` in prod. runtimeConfig snapshots the build-time value into
        // the server-only runtime config, read via `useRuntimeConfig()`. It can
        // never leak into a client chunk. A runtime `NITRO_API_URL` env var
        // still overrides it if ever set. Trade-off: changing it needs a
        // redeploy. VITE_API_URL is the API base only (a public URL, not a
        // secret) — the Umami API key lives in the API, never here.
        runtimeConfig: {
          apiUrl: process.env.VITE_API_URL ?? '',
        },
      },
    }),
    tanstackStart(),
    viteReact({ include: /\.(js|jsx|ts|tsx)$/ }),
  ],
})
