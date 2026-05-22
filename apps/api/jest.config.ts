import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
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
    // Form builder AI module — integration in progress, tests to be added in follow-up
    "!**/form-builder/**",
  ],
  coverageReporters: ["text-summary", "lcov", "html"],
  coverageThreshold: {
    global: {
      branches: 68,
      functions: 76,
      lines: 84,
      statements: 84,
    },
  },
};

export default config;
