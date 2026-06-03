import type { Config } from "jest";
import { cpus } from "node:os";

// OOM guard (see CLAUDE.md): cap workers at 10 so this suite can't fork enough
// heavyweight ts-jest / coverage workers to exhaust host RAM — yet never above
// jest's default (cores - 1), or a fixed cap would oversubscribe low-core CI
// runners and time out timing-sensitive tests.
const maxWorkers = Math.max(1, Math.min(10, cpus().length - 1));

const config: Config = {
  preset: "ts-jest/presets/default-esm",
  maxWorkers,
  workerIdleMemoryLimit: "512MB",
  testEnvironment: "node",
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    // ts-jest rewrites .js imports back to .ts source so we can extend
    // BaseTextAdapter without a build step.
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^@govtech-bb/(.*)$": "<rootDir>/../../../packages/$1/src/index.ts",
  },
  transform: {
    "^.+\\.ts$": ["ts-jest", { useESM: true }],
  },
};

export default config;
