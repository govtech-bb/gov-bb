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
    global: {
      branches: 98,
      // functions: 100% — re-exporting schemas from index.ts evaluates all factory functions at module load
      functions: 98,
      lines: 98,
      statements: 98,
    },
  },
};

export default config;
