import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // Lightweight stand-ins so component tests don't pull the full
      // markdown pipeline (mirrors apps/forms's vitest config).
      {
        find: "react-markdown",
        replacement: r("./src/test/__mocks__/react-markdown.tsx"),
      },
      {
        find: "remark-gfm",
        replacement: r("./src/test/__mocks__/remark-gfm.ts"),
      },
    ],
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
