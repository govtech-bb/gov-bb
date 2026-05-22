import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

export default defineConfig({
  plugins: [
    nitro({
      config: {
        preset: "aws_amplify",
        awsAmplify: { runtime: "nodejs24.x" },
      },
    }),
    tanstackStart({ srcDirectory: "app" }),
    react(),
  ],
});
