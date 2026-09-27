import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@govtech-bb\/landing-v2-contract$/,
        replacement: r("../../packages/landing-v2-contract/src/index.ts"),
      },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.spec.ts"],
  },
});
