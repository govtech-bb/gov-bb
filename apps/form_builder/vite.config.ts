import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

const preset = process.env.NITRO_PRESET || "aws_amplify";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    define: {
      "process.env.AI_PROVIDER": JSON.stringify(env.AI_PROVIDER || process.env.AI_PROVIDER || "bedrock"),
      "process.env.AI_MODEL": JSON.stringify(env.AI_MODEL || process.env.AI_MODEL || ""),
      "process.env.BEDROCK_REGION": JSON.stringify(env.BEDROCK_REGION || process.env.BEDROCK_REGION || "ca-central-1"),
      "process.env.SESSION_SECRET": JSON.stringify(env.SESSION_SECRET || process.env.SESSION_SECRET || ""),
      "process.env.ADMIN_API_TOKEN": JSON.stringify(env.ADMIN_API_TOKEN || process.env.ADMIN_API_TOKEN || ""),
      "process.env.DB_HOST": JSON.stringify(env.DB_HOST || process.env.DB_HOST || ""),
      "process.env.DB_PORT": JSON.stringify(env.DB_PORT || process.env.DB_PORT || "5432"),
      "process.env.DB_NAME": JSON.stringify(env.DB_NAME || process.env.DB_NAME || ""),
      "process.env.DB_USERNAME": JSON.stringify(env.DB_USERNAME || process.env.DB_USERNAME || ""),
      "process.env.DB_PASSWORD": JSON.stringify(env.DB_PASSWORD || process.env.DB_PASSWORD || ""),
    },
    plugins: [
      nitro({
        config: {
          preset,
          ...(preset === "aws_amplify" ? { awsAmplify: { runtime: "nodejs24.x" } } : {}),
        },
      }),
      tanstackStart({ srcDirectory: "app" }),
      react(),
    ],
  };
});
