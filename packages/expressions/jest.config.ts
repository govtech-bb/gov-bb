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
    // functions ~52% actual: zone.ts exports a constant, types.ts exports an interface — neither counts as a function.
    // Raise after reviewing coverage/index.html to identify which operation functions remain uncovered.
    global: { branches: 86, functions: 50, lines: 81, statements: 71 },
  },
};

export default config;
