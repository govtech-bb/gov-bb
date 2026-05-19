import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "app/routes",
      generatedRouteTree: "app/routeTree.gen.ts",
    }),
    tanstackStart({ target: "node" }),
    react(),
  ],
});
