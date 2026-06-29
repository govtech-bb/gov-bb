import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@govtech-bb\/(.*)$/,
        replacement: `${r("../../packages")}/$1/src/index.ts`,
      },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.spec.ts"],
    coverage: {
      enabled: true,
      provider: "istanbul",
      include: [
        "src/build-form-categories.ts",
        "src/form-categories.ts",
        "src/form-categories.generated.ts",
      ],
      exclude: ["**/*.spec.ts", "**/*.d.ts"],
      reporter: ["text-summary", "lcov", "html"],
      thresholds: {
        branches: 98,
        functions: 98,
        lines: 98,
        statements: 98,
      },
    },
  },
});
