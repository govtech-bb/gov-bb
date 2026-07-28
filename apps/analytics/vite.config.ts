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
        // The analytics page reads Umami directly, server-side (see
        // src/lib/report.ts → umami-server.ts). On Amplify this deploys as a
        // Nitro SSR compute (a Lambda) that never sees Console env vars at
        // runtime, and Nitro doesn't read `.env` in production — so a runtime
        // `process.env` read is `undefined` in prod. runtimeConfig snapshots the
        // build-time values into the server-only runtime config, read via
        // `useRuntimeConfig()`; these are NEVER exposed to the client (they are
        // deliberately not `VITE_`-prefixed, which would inline them into the
        // browser bundle). The Umami API key stays here on the server only.
        // Trade-off: rotating a value needs a redeploy.
        runtimeConfig: {
          // Prod: only the secret's ARN is baked (non-sensitive); the SSR Lambda
          // fetches the key from Secrets Manager at runtime (see lib/report.ts).
          // Sandbox/dev still bake the raw key via their pipeline/`.env`.
          analyticsUmamiSecretArn: process.env.ANALYTICS_UMAMI_SECRET_ARN ?? '',
          umamiApiKey: process.env.UMAMI_API_KEY ?? '',
          umamiLandingWebsiteId: process.env.UMAMI_LANDING_WEBSITE_ID ?? '',
          umamiFormsWebsiteId: process.env.UMAMI_FORMS_WEBSITE_ID ?? '',
          // Public URL (not a secret) — used to list published forms.
          formsApiUrl: process.env.VITE_FORMS_API_URL ?? '',
        },
      },
    }),
    tanstackStart(),
    viteReact({ include: /\.(js|jsx|ts|tsx)$/ }),
  ],
})
