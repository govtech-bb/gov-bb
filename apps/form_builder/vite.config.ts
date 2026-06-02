import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

const preset = process.env.NITRO_PRESET || "aws_amplify";

// Amplify Hosting Compute doesn't pass branch env vars to the SSR Lambda
// at runtime, so we bake them into the bundle at build time via Vite's
// `define`. The runtime code that reads these MUST use the literal form
// `process.env.X` (not `process.env` as a whole object) for the substitution
// to apply — see app/server/env.ts for the corresponding shape.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const pick = (key: string, fallback = ""): string =>
    env[key] || process.env[key] || fallback;

  return {
    define: {
      // Auth + API
      "process.env.ADMIN_API_TOKEN": JSON.stringify(pick("ADMIN_API_TOKEN")),
      "process.env.SESSION_SECRET": JSON.stringify(pick("SESSION_SECRET")),
      "process.env.BUILDER_API_URL": JSON.stringify(pick("BUILDER_API_URL")),
      // GitHub OAuth (SSR sign-in flow + PR-publish callback)
      "process.env.GITHUB_OAUTH_CLIENT_ID": JSON.stringify(
        pick("GITHUB_OAUTH_CLIENT_ID"),
      ),
      "process.env.GITHUB_OAUTH_CLIENT_SECRET": JSON.stringify(
        pick("GITHUB_OAUTH_CLIENT_SECRET"),
      ),
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
