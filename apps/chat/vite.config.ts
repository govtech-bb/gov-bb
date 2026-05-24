import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    devtools(),
    nitro({
      preset: "aws_amplify",
      awsAmplify: {
        // @ts-ignore — Lambda supports nodejs24.x; nitro types lag.
        runtime: "nodejs24.x",
      },
      // Amplify Hosting Compute doesn't pass Console env vars to the SSR
      // Lambda at runtime. Read process.env at *build* time so the values
      // get baked into runtimeConfig defaults and ship with the bundle.
      runtimeConfig: {
        ragUrl: process.env.NITRO_RAG_URL ?? "",
        formApiUrl: process.env.NITRO_FORM_API_URL ?? "",
        databaseUrl: process.env.NITRO_DATABASE_URL ?? "",
        bedrockRegion: process.env.NITRO_BEDROCK_REGION ?? "ca-central-1",
        llmModel: process.env.NITRO_LLM_MODEL ?? "claude-haiku-4-5",
        rewriteModel: process.env.NITRO_REWRITE_MODEL ?? "claude-haiku-4-5",
      },
    }),
    tanstackStart(),
    viteReact(),
  ],
});
