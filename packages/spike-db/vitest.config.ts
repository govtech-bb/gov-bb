import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    // PGlite boots a WASM Postgres per suite; the default 5s is tight.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
