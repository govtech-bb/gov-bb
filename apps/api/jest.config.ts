import type { Config } from "jest";
import { cpus } from "node:os";

// OOM guard: cap workers at 10 so this suite can't fork enough
// heavyweight ts-jest / coverage workers to exhaust host RAM — yet never above
// jest's default (cores - 1), or a fixed cap would oversubscribe low-core CI
// runners and time out timing-sensitive tests.
const maxWorkers = Math.max(1, Math.min(10, cpus().length - 1));

const config: Config = {
  preset: "ts-jest",
  maxWorkers,
  workerIdleMemoryLimit: "512MB",
  testEnvironment: "node",
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  testPathIgnorePatterns: ["file-upload\\.integration\\.spec\\.ts$"],
  testTimeout: 30000,
  moduleNameMapper: {
    "^@govtech-bb/(.*)$": "<rootDir>/../../../packages/$1/src/index.ts",
  },
  collectCoverage: true,
  collectCoverageFrom: [
    "**/*.ts",
    "!**/*.spec.ts",
    "!**/*.module.ts",
    "!**/migrations/**",
    "!**/entities/**",
    "!**/dto/**",
    "!**/main.ts",
    "!**/tracing.ts",
    "!**/tracing.interceptor.ts",
    // NestJS ConfigFactory functions — require full DI environment to evaluate
    "!**/config/app.config.ts",
    "!**/config/database.config.ts",
    "!**/config/email.config.ts",
    "!**/config/spreadsheet.config.ts",
    "!**/config/sqs.config.ts",
    "!**/config/index.ts",
    // Database infrastructure — requires live database connection
    "!**/database/data-source.ts",
    "!**/database/seed.ts",
    // Constant/event definition files — no executable logic
    "!**/payment.events.ts",
    // Registry behavior/validation builders — complex rule definitions, integration tests pending
    "!**/registry/builtins/behaviors/**",
    // Form builder AI module — integration in progress, tests to be added in follow-up
    "!**/form-builder/**",
  ],
  coverageReporters: ["text-summary", "lcov", "html"],
  coverageThreshold: {
    global: {
      branches: 89,
      functions: 95,
      lines: 98,
      statements: 97,
    },
  },
};

export default config;
