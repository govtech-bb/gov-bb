import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import tailwindcss from '@tailwindcss/vite'
import { markdown } from './vite-plugin-markdown'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    devtools(),
    markdown(),
    nitro({
      config: {
        preset: 'aws_amplify',
        awsAmplify: { runtime: 'nodejs24.x' },
        // Bake PREVIEW_SECRET and DRAFT_SECRET into the server runtime config
        // at build time.
        //
        // The preview gate reads this secret per-request in a `createServerFn`
        // handler (src/lib/preview.ts). On Amplify this app deploys as a Nitro
        // `aws_amplify` SSR compute (a Lambda): Amplify injects the Console env
        // vars into the BUILD container only, never the runtime, and Nitro
        // doesn't read `.env` in production. So a runtime `process.env` read is
        // `undefined` in prod and every unlock silently fails — the gate works
        // locally only because Nitro's dev server loads `.env`.
        //
        // runtimeConfig snapshots the build-time value into the server-only
        // `#nitro/virtual/runtime-config` module, read via `useRuntimeConfig()`.
        // Unlike a Vite `define`, this can never leak into a client chunk — the
        // virtual module is never part of the client graph. A runtime
        // `NITRO_PREVIEW_SECRET` env var still overrides it if ever set.
        // Trade-off: rotating a secret needs a redeploy. `draftSecret` is the
        // higher-privilege grant (`?draft=`) and must be a different value than
        // `previewSecret`, or a preview reviewer could reach draft content.
        runtimeConfig: {
          previewSecret: process.env.PREVIEW_SECRET ?? '',
          draftSecret: process.env.DRAFT_SECRET ?? '',
        },
      },
    }),
    tanstackStart(),
    viteReact(),
  ],
})
