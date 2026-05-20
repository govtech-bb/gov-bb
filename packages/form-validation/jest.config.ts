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
    global: { branches: 88, functions: 94, lines: 95, statements: 93 },
  },
};

export default config;
