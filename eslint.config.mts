import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import json from "@eslint/json";
import css from "@eslint/css";
import { tailwind4 } from "tailwind-csstree";
import { defineConfig } from "eslint/config";

export default defineConfig([
  { ignores: ["apps/forms/**", "**/*.gen.ts", "**/dist/**", "**/node_modules/**"] },
  { files: ["**/*.{js,mjs,cjs,ts,mts,cts}"], plugins: { js }, extends: ["js/recommended"], languageOptions: { globals: {...globals.browser, ...globals.node} } },
  tseslint.configs.recommended,
  {
    files: ["**/*.{ts,mts,cts}"],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    // Test files legitimately use `any` for mocks, fixtures and spies;
    // no-explicit-any stays strict on production code.
    files: ["**/*.spec.{ts,tsx}", "**/*.test.{ts,tsx}"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  { files: ["**/*.json"], plugins: { json }, language: "json/json", extends: ["json/recommended"] },
  {
    files: ["**/*.css"],
    plugins: { css },
    language: "css/css",
    languageOptions: { customSyntax: tailwind4 },
    extends: ["css/recommended"],
    // Design tokens (--color-*, --spacing-*, etc.) are defined in the imported
    // @govtech-bb/design package, which the linter can't resolve — so var()
    // references to them are false positives, not undefined variables.
    rules: { "css/no-invalid-properties": ["error", { allowUnknownVariables: true }] },
  },
]);
