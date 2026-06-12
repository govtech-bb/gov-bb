import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@govtech-bb/form-types": r("../../packages/form-types/src/index.ts"),
      "@govtech-bb/form-builder": r("../../packages/form-builder/src/index.ts"),
      "@govtech-bb/registry": r("../../packages/registry/src/index.ts"),
      // Server functions still need the no-RPC shim: the real module wants
      // the Start server runtime (AsyncLocalStorage context) at call time.
      "@tanstack/react-start/server": r(
        "./test-mocks/tanstack-react-start-server.js",
      ),
      "@tanstack/react-start": r("./test-mocks/tanstack-react-start.js"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["app/**/*.spec.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    // import.meta.env values the suites rely on (was ts-jest-mock-import-meta).
    env: {
      VITE_FORMS_URL: "https://forms.example.test",
      VITE_RECIPE_PREVIEW_TOKEN: "stub-token",
    },
    // Component specs opt into jsdom per-file via a @vitest-environment
    // docblock, mirroring the old per-file @jest-environment pattern.
    css: {
      modules: {
        // Echo class names instead of hashing, so components importing
        // *.module.css render with readable class names (replaces
        // identity-obj-proxy).
        classNameStrategy: "non-scoped",
      },
    },
  },
});
