import { fileURLToPath } from "node:url";
import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [
    // Vitest's esbuild transform cannot emit the design:paramtypes metadata
    // NestJS DI resolves constructor dependencies from — swc can.
    swc.vite({
      jsc: {
        parser: { syntax: "typescript", decorators: true },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
        target: "es2022",
      },
      module: { type: "es6" },
    }),
  ],
  resolve: {
    alias: [
      {
        find: /^@govtech-bb\/(.*)$/,
        replacement: r("../../packages") + "/$1/src/index.ts",
      },
      {
        find: /^@\/(.*)$/,
        replacement: r("./src") + "/$1",
      },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.spec.ts"],
    exclude: ["**/file-upload.integration.spec.ts"],
    testTimeout: 30000,
    coverage: {
      enabled: true,
      provider: "istanbul",
      include: ["src/**/*.ts"],
      exclude: [
        "**/*.spec.ts",
        "**/*.module.ts",
        "**/migrations/**",
        "**/entities/**",
        "**/dto/**",
        "**/main.ts",
        "**/tracing.ts",
        "**/tracing.interceptor.ts",
        // NestJS ConfigFactory functions — require full DI environment to evaluate
        "**/config/**",
        // Database infrastructure — requires live database connection
        "**/database/data-source.ts",
        "**/database/seed.ts",
        // Registry behavior/validation builders — integration tests pending
        "**/registry/builtins/behaviors/**",
        // Form builder AI module — integration in progress
        "**/form-builder/**",
      ],
      reporter: ["text-summary", "lcov", "html"],
      thresholds: {
        branches: 89,
        functions: 95,
        lines: 98,
        statements: 97,
      },
    },
  },
});
