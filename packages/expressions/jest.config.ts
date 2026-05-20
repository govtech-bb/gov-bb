import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  moduleNameMapper: {
    "^@govtech-bb/(.*)$": "<rootDir>/../../packages/$1/src/index.ts",
  },
  collectCoverage: true,
  collectCoverageFrom: ["**/*.ts", "!**/*.spec.ts", "!**/*.d.ts"],
  coverageReporters: ["text-summary", "lcov", "html"],
  coverageThreshold: {
    global: { branches: 86, functions: 50, lines: 81, statements: 71 },
  },
};

export default config;
