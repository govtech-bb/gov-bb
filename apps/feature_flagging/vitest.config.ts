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
    // `*.spec.ts` picks up build-env.spec.ts, which sits next to the
    // vite.config.ts that calls the guard it covers.
    include: ["app/**/*.spec.{ts,tsx}", "*.spec.ts"],
    setupFiles: ["./vitest.setup.ts"],
    css: {
      modules: {
        classNameStrategy: "non-scoped",
      },
    },
  },
});
