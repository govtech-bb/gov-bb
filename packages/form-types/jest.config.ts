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
    global: {
      branches: 98,
      // functions: now at 100% after comprehensive testing of index.ts exports
      functions: 98,
      lines: 98,
      statements: 98,
    },
  },
};

export default config;
