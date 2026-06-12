import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// https://vitejs.dev/config/
export default ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return defineConfig({
    define: {
      "process.env": {
        VITE_API_URL: env["VITE_API_URL"],
        SKIP_CONTINUE_VALIDATION: env["SKIP_CONTINUE_VALIDATION"],
        VITE_PAYMENT_ALLOWED_ORIGINS: env["VITE_PAYMENT_ALLOWED_ORIGINS"],
      },
    },
    resolve: {
      tsconfigPaths: true,
    },
    plugins: [
      tailwindcss(),
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
        // Spec files are co-located in routes/; newer router-plugin versions
        // reject unrecognized files in the routes dir instead of skipping.
        routeFileIgnorePattern: ".*\\.spec\\.(ts|tsx)$",
      }),
      react(),
    ],
  });
};
