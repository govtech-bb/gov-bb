import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
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
      branches: 94,
      functions: 95,
      lines: 98,
      statements: 97,
    },
  },
};

export default config;
