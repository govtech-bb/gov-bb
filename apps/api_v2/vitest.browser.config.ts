import { defineConfig } from "vitest/config";
import config from "./vitest.config";

/** Opt-in browser integration uses the normal isolated PostgreSQL setup, not the unit-test glob. */
export default defineConfig({
  ...config,
  test: {
    ...config.test,
    include: ["browser/**/*.test.ts"],
    testTimeout: 120_000,
  },
});
