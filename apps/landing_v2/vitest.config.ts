import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Deliberately NOT the app's vite.config.ts, as in apps/landing: booting
// nitro (an SSR server) for unit tests leaks file handles, so vitest can't
// exit. Only the plugins the suites exercise are loaded — Start (the
// server-function transform) and React (JSX).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [tanstackStart(), viteReact()],
});
