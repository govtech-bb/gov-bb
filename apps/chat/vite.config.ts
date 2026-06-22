import { defineConfig, loadEnv } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import tailwindcss from "@tailwindcss/vite";

// Amplify Hosting Compute doesn't pass Console env vars to the SSR Lambda
// at runtime, so we bake them into the bundle at build time via Vite's
// `define`. In dev, Vite's `loadEnv` reads `.env.local` directly into
// `process.env`, so the same `process.env.X` reads work without baking.
//
// DATABASE_URL is intentionally NOT baked here (issue #202). The value is
// a Secrets Manager value fetched at SSR runtime via the compute role; only
// the *ARN* (non-sensitive identifier) is baked, and `src/lib/db/index.ts`
// reads the actual connection string from SM on first use.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const pick = (key: string, fallback = ""): string =>
    env[key] || process.env[key] || fallback;

  return {
    resolve: { tsconfigPaths: true },
    define: {
      "process.env.RAG_URL": JSON.stringify(pick("RAG_URL")),
      "process.env.CHAT_DATABASE_URL_SECRET_ARN": JSON.stringify(
        pick("CHAT_DATABASE_URL_SECRET_ARN"),
      ),
      "process.env.FORM_API_URL": JSON.stringify(pick("FORM_API_URL")),
      "process.env.LANDING_URL": JSON.stringify(
        pick("LANDING_URL", "https://alpha.gov.bb"),
      ),
      "process.env.BEDROCK_REGION": JSON.stringify(
        pick("BEDROCK_REGION", "ca-central-1"),
      ),
      "process.env.LLM_MODEL": JSON.stringify(
        pick("LLM_MODEL", "claude-sonnet-4-6"),
      ),
      "process.env.REWRITE_MODEL": JSON.stringify(
        pick("REWRITE_MODEL", "claude-haiku-4-5"),
      ),
      // Feature gates + behaviour flags. Amplify Compute can't read runtime
      // env, so these MUST be baked too — otherwise the form features stay off
      // and submit stays dry-run in a deployed env no matter what's configured.
      // Default "" → off / dry-run (boolFlag treats only "1"/"true" as true).
      "process.env.FEATURE_FORMS": JSON.stringify(pick("FEATURE_FORMS")),
      "process.env.FEATURE_FEEDBACK": JSON.stringify(pick("FEATURE_FEEDBACK")),
      "process.env.FEATURE_OFFERS": JSON.stringify(pick("FEATURE_OFFERS")),
      "process.env.RAG_ONLY": JSON.stringify(pick("RAG_ONLY")),
      "process.env.SUBMIT_LIVE": JSON.stringify(pick("SUBMIT_LIVE")),
      "process.env.BEDROCK_PROMPT_CACHE": JSON.stringify(
        pick("BEDROCK_PROMPT_CACHE"),
      ),
      "process.env.TURN_TIMEOUT_MS": JSON.stringify(pick("TURN_TIMEOUT_MS")),
    },
    plugins: [
      tailwindcss(),
      devtools(),
      nitro({
        preset: "aws_amplify",
        awsAmplify: {
          // @ts-ignore — Lambda supports nodejs24.x; nitro types lag.
          runtime: "nodejs24.x",
        },
      }),
      tanstackStart(),
      viteReact(),
    ],
  };
});
