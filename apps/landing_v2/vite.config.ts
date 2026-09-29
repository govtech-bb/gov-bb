import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * The site is server-rendered; the editor is not.
 *
 * A citizen's page should arrive as finished HTML, and an authoring surface
 * with a rich text editor and local drafts gains nothing from being rendered
 * on a server — so the two are separate apps.
 */
export default defineConfig({
  root: import.meta.dirname,
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    nitro({
      // `node-server` for the e2e harness only (`nx run landing_v2:e2e`,
      // e2e/support.ts). The `aws_amplify` runtime always listens on :3000
      // and ignores PORT, and :3000 is the forms dev server; `node-server`
      // reads PORT. Set here rather than through NITRO_PRESET, because the
      // preset passed to `nitro()` beats the env var.
      preset: process.env.LANDING_V2_NITRO_PRESET ?? "aws_amplify",
      awsAmplify: {
        // @ts-expect-error - Lambda supports nodejs24.x; Nitro types lag.
        runtime: "nodejs24.x",
      },
      // Assumption (#2702): 8 and 9 — API_V2_URL and FORMS_URL are baked into
      // the server runtime config at build time, as apps/landing does. Neither
      // is `VITE_`-prefixed, so neither is ever inlined into a client chunk.
      //
      // On Amplify this app deploys as a Nitro `aws_amplify` SSR compute (a
      // Lambda). Amplify injects the Console's environment variables into the
      // BUILD container only, never the runtime, and Nitro doesn't read `.env`
      // in production, so a runtime `process.env` read is `undefined` in
      // production.
      //
      // runtimeConfig snapshots the build-time value into the server-only
      // `#nitro/virtual/runtime-config` module, read via `useRuntimeConfig()`
      // (src/server/config.ts). Unlike a Vite `define`, it can never leak into
      // a client chunk, because that virtual module is never part of the
      // client graph. In the built server a runtime `NITRO_API_V2_URL` /
      // `NITRO_FORMS_URL` still overrides it if ever set. Trade-off: changing
      // either needs a redeploy.
      runtimeConfig: {
        apiV2Url: process.env.API_V2_URL ?? "",
        formsUrl: process.env.FORMS_URL ?? "",
      },
    }),
    tanstackStart(),
    viteReact(),
  ],
  server: { port: 3030 },
});
