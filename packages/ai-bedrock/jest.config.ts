import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest/presets/default-esm",
  // OOM guard (see CLAUDE.md): cap workers and recycle memory-heavy ts-jest /
  // coverage workers so this suite can't exhaust host RAM, alone or in parallel.
  maxWorkers: 10,
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
