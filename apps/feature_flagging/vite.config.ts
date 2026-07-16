import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

const preset = process.env.NITRO_PRESET || "aws_amplify";

// Amplify Hosting Compute doesn't pass branch env vars to the SSR Lambda at
// runtime, so non-sensitive values are baked into the bundle at build time via
// Vite's `define`. Runtime code that reads these MUST use the literal form
// `process.env.X` (not the whole `process.env` object) for the substitution to
// apply. Sensitive values (SERVICE_STATUS_ADMIN_TOKEN, SESSION_SECRET,
// GITHUB_OAUTH_CLIENT_ID/SECRET) are intentionally NOT baked — only their
// Secrets Manager ARNs are, and app/server/secrets.ts fetches the real values
// at request time (mirrors form_builder, alpha-infra#202/#203).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const pick = (key: string, fallback = ""): string =>
    env[key] || process.env[key] || fallback;

  return {
    // Pin the local dev server to a fixed port so it matches the GitHub OAuth
    // App's callback URL and OAUTH_REDIRECT_BASE (http://localhost:3005). A
    // drifting port would break the OAuth redirect_uri match. strictPort fails
    // loudly instead of silently falling back. Ignored by the Amplify build.
    server: { port: 3005, strictPort: true },
    define: {
      // SM-backed secret ARNs (non-sensitive identifiers).
      "process.env.FEATURE_FLAGGING_TOKENS_SECRET_ARN": JSON.stringify(
        pick("FEATURE_FLAGGING_TOKENS_SECRET_ARN"),
      ),
      "process.env.FEATURE_FLAGGING_GITHUB_OAUTH_SECRET_ARN": JSON.stringify(
        pick("FEATURE_FLAGGING_GITHUB_OAUTH_SECRET_ARN"),
      ),
      // service_status API target (not a secret).
      "process.env.FEATURE_FLAGGING_API_URL": JSON.stringify(
        pick("FEATURE_FLAGGING_API_URL"),
      ),
      // Public origins the services table links out to (not secrets). Unset in
      // local dev → app/lib/service-url.ts falls back to the docker-stack
      // origins; deployed builds MUST set both per environment.
      "process.env.LANDING_URL": JSON.stringify(pick("LANDING_URL")),
      "process.env.FORMS_URL": JSON.stringify(pick("FORMS_URL")),
      // OAuth callback base (not a secret).
      "process.env.OAUTH_REDIRECT_BASE": JSON.stringify(
        pick("OAUTH_REDIRECT_BASE"),
      ),
      // GitHub org — team-membership login check.
      "process.env.GITHUB_ORG": JSON.stringify(pick("GITHUB_ORG")),
      // GitHub team slug whose members may sign in.
      "process.env.GITHUB_TEAM_SLUG": JSON.stringify(pick("GITHUB_TEAM_SLUG")),
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
