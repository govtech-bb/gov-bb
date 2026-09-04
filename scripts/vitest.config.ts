import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Root-level maintenance scripts live flat in this dir, not under src/.
    include: ["*.spec.ts"],
  },
});
