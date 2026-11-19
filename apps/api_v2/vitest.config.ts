import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // One migrated template per run; each test clones it (see test-db.ts).
    globalSetup: ["src/test-global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
