import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

const preset = process.env.NITRO_PRESET || "aws_amplify";

// Amplify Hosting Compute doesn't pass branch env vars to the SSR Lambda
// at runtime, so we bake non-sensitive values into the bundle at build time
// via Vite's `define`. The runtime code that reads these MUST use the
// literal form `process.env.X` (not `process.env` as a whole object) for the
// substitution to apply — see app/server/env.ts for the corresponding shape.
//
// Sensitive values (ADMIN_API_TOKEN, SESSION_SECRET, GITHUB_OAUTH_CLIENT_ID,
// GITHUB_OAUTH_CLIENT_SECRET) are intentionally NOT baked (alpha-infra#202/#203).
// Only their Secrets Manager ARNs are baked; the Nitro server plugin in
// server/plugins/secrets-hydrate.ts fetches the actual values at SSR boot
// and populates process.env at runtime.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const pick = (key: string, fallback = ""): string =>
    env[key] || process.env[key] || fallback;

  return {
    define: {
      // SM-backed secret ARNs (non-sensitive identifiers). The Nitro plugin
      // reads these at boot and hydrates ADMIN_API_TOKEN, SESSION_SECRET,
      // GITHUB_OAUTH_CLIENT_ID, and GITHUB_OAUTH_CLIENT_SECRET into process.env.
      "process.env.FORM_BUILDER_TOKENS_SECRET_ARN": JSON.stringify(
        pick("FORM_BUILDER_TOKENS_SECRET_ARN"),
      ),
      "process.env.FORM_BUILDER_GITHUB_OAUTH_SECRET_ARN": JSON.stringify(
        pick("FORM_BUILDER_GITHUB_OAUTH_SECRET_ARN"),
      ),
      // API target (not a secret)
      "process.env.BUILDER_API_URL": JSON.stringify(pick("BUILDER_API_URL")),
      // OAuth callback base (not a secret)
      "process.env.OAUTH_REDIRECT_BASE": JSON.stringify(
        pick("OAUTH_REDIRECT_BASE"),
      ),
      // GitHub org — team-membership login check + PR-publish repo owner.
      "process.env.GITHUB_ORG": JSON.stringify(pick("GITHUB_ORG")),
      // GitHub team slug whose members may sign in to the builder.
      "process.env.GITHUB_TEAM_SLUG": JSON.stringify(pick("GITHUB_TEAM_SLUG")),
      // Build-time FALLBACK for the Deploy PR's base branch, used only where the
      // platform can't expose env vars to the SSR runtime (Amplify Compute). The
      // LIVE `process.env.PUBLISH_BASE_BRANCH` still wins at runtime wherever it's
      // available — see resolveBaseBranch() in app/server/publish.ts, which reads
      // it via bracket access so this `define` doesn't statically replace it.
      // Operators only ever set PUBLISH_BASE_BRANCH; we bake it under a distinct
      // key so the runtime read survives the build.
      "process.env.PUBLISH_BASE_BRANCH_DEFAULT": JSON.stringify(
        pick("PUBLISH_BASE_BRANCH"),
      ),
    },
    plugins: [
      nitro({
        config: {
          preset,
          // Nitro auto-loads `app/plugins/secrets-hydrate.ts` via the default
          // scanDirs (rootDir × app/) — no explicit `plugins:` config needed.
          ...(preset === "aws_amplify"
            ? { awsAmplify: { runtime: "nodejs24.x" } }
            : {}),
        },
      }),
      tanstackStart({ srcDirectory: "app" }),
      react(),
    ],
  };
});
