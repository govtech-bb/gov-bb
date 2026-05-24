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
    }),
    tanstackStart(),
    viteReact(),
  ],
});
