import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // PGlite compiles WASM on first use; the suite creates one database per
    // file, which is slower than a unit test and far cheaper than requiring a
    // live Postgres to run the tests at all.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
