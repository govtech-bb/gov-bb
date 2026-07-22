import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
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
  // React Hooks lint: rules-of-hooks (error) + exhaustive-deps (warn). Only
  // these two — react-hooks@7's `recommended` preset also enables the broader
  // React-Compiler rules, which are out of scope for #1976.
  {
    files: ["**/*.{jsx,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // form-renderer.tsx calls several hooks after an early `return null`
    // (rules-of-hooks violations). Fixing it is a risky refactor of the core
    // renderer, tracked in #1981 — downgrade to warn here so the rule stays
    // `error` for every other file. Remove this override when #1981 lands.
    files: ["**/components/form-renderer.tsx"],
    rules: { "react-hooks/rules-of-hooks": "warn" },
  },
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
