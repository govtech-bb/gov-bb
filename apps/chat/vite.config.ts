import { defineConfig, loadEnv } from "vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  // Load env vars from .env.production (written by amplify.yml) and process.env
  const env = loadEnv(mode, process.cwd(), "");

  return {
    resolve: { tsconfigPaths: true },
    define: {
      // Bake server env vars into the bundle so they're available at Lambda runtime.
      // Amplify WEB_COMPUTE doesn't pass env vars to the Lambda — only to the build.
      "process.env.LLM_MODEL": JSON.stringify(
        env.LLM_MODEL || process.env.LLM_MODEL || "claude-haiku-4-5",
      ),
      "process.env.BEDROCK_REGION": JSON.stringify(
        env.BEDROCK_REGION || process.env.BEDROCK_REGION || "ca-central-1",
      ),
      "process.env.FORM_API_URL": JSON.stringify(
        env.FORM_API_URL || process.env.FORM_API_URL || "",
      ),
      "process.env.DATABASE_URL": JSON.stringify(
        env.DATABASE_URL || process.env.DATABASE_URL || "",
      ),
      "process.env.DB_SSL": JSON.stringify(
        env.DB_SSL || process.env.DB_SSL || "",
      ),
      "process.env.RAG_URL": JSON.stringify(
        env.RAG_URL || process.env.RAG_URL || "",
      ),
    },
    plugins: [
      tailwindcss(),
      devtools(),
      nitro({
        preset: "aws_amplify",
        awsAmplify: { runtime: "nodejs22.x" },
      }),
      tanstackStart(),
      viteReact(),
    ],
  };
});
