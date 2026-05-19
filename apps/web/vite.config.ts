import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// https://vitejs.dev/config/
export default ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return defineConfig({
    define: {
      "process.env": {
        VITE_API_URL: env["VITE_API_URL"],
        DESIGN_SYSTEM: env["DESIGN_SYSTEM"],
        SKIP_CONTINUE_VALIDATION: env["SKIP_CONTINUE_VALIDATION"],
        VITE_POSTHOG_KEY: env["VITE_POSTHOG_KEY"],
        VITE_POSTHOG_HOST: env["VITE_POSTHOG_HOST"],
        VITE_POSTHOG_ENV: env["VITE_POSTHOG_ENV"],
        NODE_ENV: env["NODE_ENV"] ?? mode,
      },
    },
    resolve: {
      tsconfigPaths: true,
    },
    plugins: [
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
      }),
      react(),
    ],
  });
};
