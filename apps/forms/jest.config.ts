import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  rootDir: "src",
  testRegex: ".*\\.spec\\.tsx?$",
  setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],
  moduleNameMapper: {
    // Internal workspace packages
    "^@govtech-bb/form-types$":
      "<rootDir>/../../../packages/form-types/src/index.ts",
    "^@govtech-bb/form-conditions$":
      "<rootDir>/../../../packages/form-conditions/src/index.ts",
    "^@govtech-bb/form-validation$":
      "<rootDir>/../../../packages/form-validation/src/index.ts",
    // Forms app path aliases
    "^@forms/types$": "<rootDir>/types/index.ts",
    "^@forms/lib$": "<rootDir>/lib/form-builder/index.ts",
    "^@forms/form-api$": "<rootDir>/lib/api/forms.ts",
    "^@forms/components$": "<rootDir>/components/index.ts",
    // CSS modules
    "\\.module\\.css$": "<rootDir>/test/styleMock.js",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: false,
        tsconfig: "<rootDir>/../tsconfig.jest.json",
        diagnostics: false,
      },
    ],
  },
  collectCoverage: true,
  collectCoverageFrom: [
    "**/*.ts",
    "**/*.tsx",
    "!**/*.spec.ts",
    "!**/*.spec.tsx",
    "!**/*.d.ts",
  ],
  coverageReporters: ["text-summary", "lcov", "html"],
  coverageThreshold: {
    global: { branches: 10, functions: 7, lines: 19, statements: 21 },
  },
};

export default config;
