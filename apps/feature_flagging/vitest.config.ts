import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Server functions need the no-RPC shim: the real module wants the Start
      // server runtime (AsyncLocalStorage context) at call time.
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
    css: {
      modules: {
        classNameStrategy: "non-scoped",
      },
    },
  },
});
