import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * The two server-only variables. Neither is `VITE_`-prefixed, so neither is
 * ever inlined into a client chunk.
 */
const SERVER_ONLY_VARS = ["API_V2_URL", "FORMS_URL"] as const;

/**
 * The site is server-rendered; the editor is not.
 *
 * A citizen's page should arrive as finished HTML, and an authoring surface
 * with a rich text editor and local drafts gains nothing from being rendered
 * on a server — so the two are separate apps.
 */
export default defineConfig(({ command }) => {
  // Assumption (#2702): 8 and 9 — a production build without either base URL
  // fails here, rather than shipping a server that quietly calls localhost.
  // `vite dev` falls back to the local ports instead (src/server/config.ts).
  if (command === "build") {
    const missing = SERVER_ONLY_VARS.filter((name) => !process.env[name]);
    if (missing.length > 0) {
      throw new Error(
        `landing_v2: ${missing.join(" and ")} must be set for a production ` +
          "build, which bakes the value into the server; see " +
          "apps/landing_v2/.env.example.",
      );
    }
  }

  return {
    root: import.meta.dirname,
    resolve: { tsconfigPaths: true },
    plugins: [
      tailwindcss(),
      nitro({
        preset: "aws_amplify",
        awsAmplify: {
          // @ts-expect-error - Lambda supports nodejs24.x; Nitro types lag.
          runtime: "nodejs24.x",
        },
        // Assumption (#2702): 8 and 9 — baked into the server runtime config
        // at build time, as apps/landing does.
        //
        // On Amplify this app deploys as a Nitro `aws_amplify` SSR compute (a
        // Lambda). Amplify injects the Console's environment variables into
        // the BUILD container only, never the runtime, and Nitro doesn't read
        // `.env` in production, so a runtime `process.env` read is
        // `undefined` in production.
        //
        // runtimeConfig snapshots the build-time value into the server-only
        // `#nitro/virtual/runtime-config` module, read via
        // `useRuntimeConfig()`. Unlike a Vite `define`, it can never leak into
        // a client chunk, because that virtual module is never part of the
        // client graph. A runtime `NITRO_API_V2_URL` / `NITRO_FORMS_URL`
        // still overrides it if ever set. Trade-off: changing either needs a
        // redeploy.
        runtimeConfig: {
          apiV2Url: process.env.API_V2_URL ?? "",
          formsUrl: process.env.FORMS_URL ?? "",
        },
      }),
      tanstackStart(),
      viteReact(),
    ],
    server: { port: 3030 },
  };
});
