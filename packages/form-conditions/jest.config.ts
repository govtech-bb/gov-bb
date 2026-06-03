import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  // OOM guard (see CLAUDE.md): cap workers and recycle memory-heavy ts-jest /
  // coverage workers so this suite can't exhaust host RAM, alone or in parallel.
  maxWorkers: 10,
  workerIdleMemoryLimit: "512MB",
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
    global: { branches: 85, functions: 98, lines: 95, statements: 93 },
  },
};

export default config;
