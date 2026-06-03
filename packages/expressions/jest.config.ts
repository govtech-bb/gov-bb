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
