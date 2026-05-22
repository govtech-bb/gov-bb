import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: "app",
  testRegex: ".*\\.spec\\.ts$",
  moduleNameMapper: {
    "^@govtech-bb/form-types$":
      "<rootDir>/../../../packages/form-types/src/index.ts",
    "^@govtech-bb/form-builder$":
      "<rootDir>/../../../packages/form-builder/src/index.ts",
    "^@govtech-bb/registry$":
      "<rootDir>/../../../packages/registry/src/index.ts",
    "^@govtech-bb/database$":
      "<rootDir>/../../../packages/database/src/index.ts",
    // TanStack Start is ESM-only and cannot be loaded by ts-jest (CJS mode).
    // Provide a minimal shim so server functions can be unit-tested.
    "^@tanstack/react-start$":
      "<rootDir>/../test-mocks/tanstack-react-start.js",
    "^@tanstack/react-start/(.*)$":
      "<rootDir>/../test-mocks/tanstack-react-start-$1.js",
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { useESM: false }],
  },
};

export default config;
