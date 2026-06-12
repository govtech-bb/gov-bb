import { defineConfig } from "vitest/config";

export default defineConfig({
  // Map @govtech-bb/* to package source via tsconfig.base paths —
  // tests must not depend on built dist output.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.spec.ts"],
  },
});
