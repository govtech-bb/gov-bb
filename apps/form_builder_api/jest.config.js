// CommonJS config: this package is CJS ("type" is unset), and jest's native
// TypeScript-config loader silently falls back to defaults here without
// ts-node — so a .js config is the reliable choice.

/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
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
