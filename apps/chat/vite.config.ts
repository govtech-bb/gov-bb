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
      // Runtime config: defaults baked in, NITRO_* env vars override at
      // runtime. This is the only path that gets env vars into the
      // Amplify SSR Lambda — plain process.env doesn't work there.
      runtimeConfig: {
        ragUrl: "",
        formApiUrl: "",
        databaseUrl: "",
        bedrockRegion: "ca-central-1",
        llmModel: "claude-haiku-4-5",
        rewriteModel: "claude-haiku-4-5",
      },
    }),
    tanstackStart(),
    viteReact(),
  ],
});
