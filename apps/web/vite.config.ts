import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// https://vitejs.dev/config/
export default ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return defineConfig({
    define: {
      'process.env': {
        ...env
      }
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

}
