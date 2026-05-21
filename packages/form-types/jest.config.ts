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
      // functions exemption: this package exports Zod schema objects, not callable
      // functions. 6.52% is the structural floor. Do not raise without adding
      // runtime utility functions to the package intentionally.
      functions: 5,
      lines: 65,
      statements: 63,
    },
  },
};

export default config;
