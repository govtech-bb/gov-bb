import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(() => {
  return {
    resolve: { tsconfigPaths: true },
    define: {
      // Non-secret defaults safe to bake. Override with runtime env if needed.
      "process.env.LLM_MODEL": JSON.stringify(
        process.env.LLM_MODEL || "claude-haiku-4-5",
      ),
      "process.env.BEDROCK_REGION": JSON.stringify(
        process.env.BEDROCK_REGION || "ca-central-1",
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
