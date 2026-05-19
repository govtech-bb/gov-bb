import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
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
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { useESM: false }],
  },
};

export default config;
