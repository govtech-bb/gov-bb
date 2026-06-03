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
    "^@govtech-bb/(.*)$": "<rootDir>/../../$1/src/index.ts",
  },
};

export default config;
