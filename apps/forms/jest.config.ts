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
        astTransformers: {
          before: [
            {
              path: "ts-jest-mock-import-meta",
              options: {
                metaObjectReplacement: {
                  env: {
                    DEV: true,
                    PROD: false,
                    MODE: "test",
                    VITE_API_URL: "http://localhost:3001",
                    VITE_DESIGN_SYSTEM: "basic",
                  },
                },
              },
            },
          ],
        },
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
    "!**/main.tsx",
    "!**/routeTree.gen.ts",
    "!**/routes/admin/**",
  ],
  coverageReporters: ["text-summary", "lcov", "html"],
  coverageThreshold: {
    global: { branches: 70, functions: 80, lines: 85, statements: 85 },
  },
};

export default config;
