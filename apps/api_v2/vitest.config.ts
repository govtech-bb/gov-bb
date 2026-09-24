import { defineConfig } from "vitest/config";
import { alias } from "./vitest.shared";

export default defineConfig({
  resolve: { alias },
  test: {
    include: ["src/**/*.test.ts"],
    // PGlite compiles WASM on first use; the suite creates one database per
    // file, which is slower than a unit test and far cheaper than requiring a
    // live Postgres to run the tests at all.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
