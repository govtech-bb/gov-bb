// CommonJS config: this package is CJS ("type" is unset), and jest's native
// TypeScript-config loader silently falls back to defaults here without
// ts-node — so a .js config is the reliable choice.

const { cpus } = require("node:os");

// OOM guard: cap workers at 8 so this suite can't fork enough
// heavyweight ts-jest / coverage workers to exhaust host RAM — yet never above
// jest's default (cores - 1), or a fixed cap would oversubscribe low-core CI
// runners and time out timing-sensitive tests.
const maxWorkers = Math.max(1, Math.min(8, cpus().length - 1));

/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  maxWorkers,
  workerIdleMemoryLimit: "512MB",
  testEnvironment: "node",
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  moduleNameMapper: {
    "^@govtech-bb/(.*)$": "<rootDir>/../../../packages/$1/src/index.ts",
    // This app uses NodeNext-style ".js" suffixes on relative imports
    // (e.g. `from "../db.js"`); strip them so ts-jest resolves the ".ts".
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  // tsconfig.json sets isolatedModules: true, so ts-jest transpiles each
  // file on demand — spec files (excluded from the tsc build's tsconfig so
  // they never land in dist) still transform without a tsconfig.spec.json.
};
