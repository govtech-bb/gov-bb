import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // Lightweight stand-ins so component tests don't pull the full
      // markdown pipeline (same mocks the jest config used).
      {
        find: "react-markdown",
        replacement: r("./src/test/__mocks__/react-markdown.tsx"),
      },
      {
        find: "remark-gfm",
        replacement: r("./src/test/__mocks__/remark-gfm.ts"),
      },
      // Explicit workspace-package list — @govtech-bb/react and /design are
      // published npm packages and must resolve normally.
      {
        find: "@govtech-bb/form-types",
        replacement: r("../../packages/form-types/src/index.ts"),
      },
      {
        find: "@govtech-bb/form-conditions",
        replacement: r("../../packages/form-conditions/src/index.ts"),
      },
      {
        find: "@govtech-bb/form-validation",
        replacement: r("../../packages/form-validation/src/index.ts"),
      },
      {
        find: "@govtech-bb/expressions",
        replacement: r("../../packages/expressions/src/index.ts"),
      },
      {
        find: "@govtech-bb/registry",
        replacement: r("../../packages/registry/src/index.ts"),
      },
      {
        find: "@govtech-bb/form-renderer",
        replacement: r("../../packages/form-renderer/src/index.ts"),
      },
      { find: "@forms/types", replacement: r("./src/types/index.ts") },
      { find: "@forms/lib", replacement: r("./src/lib/form-builder/index.ts") },
      { find: "@forms/form-api", replacement: r("./src/lib/api/forms.ts") },
      {
        find: "@forms/components",
        replacement: r("./src/components/index.ts"),
      },
    ],
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.spec.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    env: {
      VITE_API_URL: "http://localhost:3001",
    },
  },
});
