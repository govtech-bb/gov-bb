import type { Config } from "jest";
import { cpus } from "node:os";

// OOM guard: cap workers at 8 so this suite can't fork enough
// heavyweight ts-jest / coverage workers to exhaust host RAM — yet never above
// jest's default (cores - 1), or a fixed cap would oversubscribe low-core CI
// runners and time out timing-sensitive tests.
const maxWorkers = Math.max(1, Math.min(8, cpus().length - 1));

const config: Config = {
  preset: "ts-jest",
  maxWorkers,
  workerIdleMemoryLimit: "512MB",
  testEnvironment: "jsdom",
  rootDir: "src",
  testRegex: ".*\\.spec\\.tsx?$",
  setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],
  moduleNameMapper: {
    // react-markdown / remark-gfm are ESM-only; mock them so ts-jest (CJS)
    // doesn't choke on their untransformed ESM. See test/__mocks__/.
    "^react-markdown$": "<rootDir>/test/__mocks__/react-markdown.tsx",
    "^remark-gfm$": "<rootDir>/test/__mocks__/remark-gfm.ts",
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
    // `functions` was lowered 90 -> 89 when field rule-checking moved out of
    // this app into `@govtech-bb/form-validation` (issue #433): ~22 fully
    // covered pure validation functions were deleted here (their logic, and
    // coverage, now live in that package), shrinking the function pool enough
    // to drop the global ratio. Branches/lines/statements are unaffected.
    global: { branches: 89, functions: 89, lines: 95, statements: 94 },
  },
};

export default config;
