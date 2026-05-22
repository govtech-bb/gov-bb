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
    "^@tanstack/react-start$": "<rootDir>/__mocks__/@tanstack/react-start.ts",
    "^@tanstack/react-start/server$":
      "<rootDir>/__mocks__/@tanstack/react-start-server.ts",
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { useESM: false }],
  },
};

export default config;
