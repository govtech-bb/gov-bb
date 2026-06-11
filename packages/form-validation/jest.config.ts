import type { Config } from "jest";
import { cpus } from "node:os";

// OOM guard: cap workers at 8 so this suite can't fork enough
// heavyweight ts-jest / coverage workers to exhaust host RAM — yet never above
// jest's default (cores - 1), or a fixed cap would oversubscribe low-core CI
// runners and time out timing-sensitive tests.
const maxWorkers = Math.max(1, Math.min(8, cpus().length - 1));

const config: Config = {
  preset: "ts-jest",
  maxWorkers,
  workerIdleMemoryLimit: "512MB",
  testEnvironment: "node",
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  moduleNameMapper: {
    // The general mapper below carries a spurious extra `packages/` segment
    // (→ packages/packages/$1); root-symlinked deps still resolve via jest's
    // node fallback, but `expressions` (not root-symlinked) needs an explicit,
    // correctly-pointed entry. Listed first so it wins for that one module.
    "^@govtech-bb/expressions$": "<rootDir>/../../expressions/src/index.ts",
    "^@govtech-bb/(.*)$": "<rootDir>/../../$1/src/index.ts",
  },
  collectCoverage: true,
  collectCoverageFrom: ["**/*.ts", "!**/*.spec.ts", "!**/*.d.ts"],
  coverageReporters: ["text-summary", "lcov", "html"],
  coverageThreshold: {
    global: { branches: 88, functions: 90, lines: 90, statements: 90 },
  },
};

export default config;
