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
    // Web app path aliases
    "^@web/types$": "<rootDir>/types/index.ts",
    "^@web/lib$": "<rootDir>/lib/form-builder/index.ts",
    "^@web/form-api$": "<rootDir>/lib/api/forms.ts",
    "^@web/components$": "<rootDir>/components/index.ts",
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
    global: { branches: 11, functions: 8, lines: 19, statements: 22 },
  },
};

export default config;
