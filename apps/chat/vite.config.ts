import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import tailwindcss from "@tailwindcss/vite";

const config = defineConfig({
  resolve: { tsconfigPaths: true },
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
});

export default config;
