import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import css from "@eslint/css";
import { defineConfig } from "eslint/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs,mts,cts,jsx}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  ...tseslint.configs.recommended,
  {
    // Honour the `_` prefix for deliberately-unused bindings, matching the
    // repo root config (e.g. `const { url: _url, ...ref } = …` to drop a key).
    files: ["**/*.{ts,tsx}"],
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
    // Type-aware linting only for files tsconfig.json actually includes (src,
    // minus spec/test). e2e specs, src specs and root config files aren't in
    // the project, so they're still linted — just without type information.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.spec.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: __dirname,
      },
    },
  },
  pluginReact.configs.flat.recommended,
  // This app uses the modern JSX runtime, so React needn't be in scope —
  // disables react/react-in-jsx-scope and react/jsx-uses-react.
  pluginReact.configs.flat["jsx-runtime"],
  {
    // Test and e2e files legitimately use `any` for mocks and fixtures;
    // no-explicit-any stays strict on production src.
    files: ["**/*.spec.{ts,tsx}", "**/*.test.{ts,tsx}", "e2e/**/*.{ts,tsx}"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    files: ["**/*.css"],
    plugins: { css },
    language: "css/css",
    extends: ["css/recommended"],
  },
]);
