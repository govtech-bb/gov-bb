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
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const pick = (key: string, fallback = ""): string =>
    env[key] || process.env[key] || fallback;

  return {
    resolve: { tsconfigPaths: true },
    define: {
      "process.env.RAG_URL": JSON.stringify(pick("RAG_URL")),
      "process.env.DATABASE_URL": JSON.stringify(pick("DATABASE_URL")),
      "process.env.FORM_API_URL": JSON.stringify(pick("FORM_API_URL")),
      "process.env.BEDROCK_REGION": JSON.stringify(
        pick("BEDROCK_REGION", "ca-central-1"),
      ),
      "process.env.LLM_MODEL": JSON.stringify(
        pick("LLM_MODEL", "claude-haiku-4-5"),
      ),
      "process.env.REWRITE_MODEL": JSON.stringify(
        pick("REWRITE_MODEL", "claude-haiku-4-5"),
      ),
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
