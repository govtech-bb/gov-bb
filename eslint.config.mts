import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import json from "@eslint/json";
import css from "@eslint/css";
import { tailwind4 } from "tailwind-csstree";
import { defineConfig } from "eslint/config";

const primitiveColorClasses = /(?:bg|text|border(?:-[trblxy])?|ring(?:-offset)?|outline|divide|fill|stroke|decoration|from|via|to|shadow)-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]+)\b|\bdark:|(?:bg|text|border|ring|fill|stroke)-\[(?:#|rgba?\(|hsla?\(|oklch\(|oklab\()/;

export default defineConfig([
  {
    files: [
      "apps/form_builder/app/component/ui/**/*.{ts,tsx}",
      "apps/form_builder/app/routes/-ui-catalogue.tsx",
      "apps/form_builder/app/routes/dev.ui.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...["Literal[value", "TemplateElement[value.raw"].map((selector) => ({
          selector: `${selector}=/${primitiveColorClasses.source}/]`,
          message: "Use GovTech semantic color tokens instead of raw color or dark-mode classes.",
        })),
      ],
    },
  },

  {
    ignores: [
      "apps/forms/**",
      "**/*.gen.ts",
      "**/dist/**",
      "**/.amplify-hosting/**",
      "**/node_modules/**",
    ],
  },
  { files: ["**/*.{js,mjs,cjs,ts,mts,cts}"], plugins: { js }, extends: ["js/recommended"], languageOptions: { globals: {...globals.browser, ...globals.node} } },
  tseslint.configs.recommended,
  {
    // Include tsx/jsx so the `_`-prefix convention for intentionally-unused
    // bindings is honoured in React files too, not just plain .ts.
    files: ["**/*.{ts,tsx,mts,cts,jsx}"],
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
  // React Hooks lint for the apps governed by this root config (form_builder,
  // feature_flagging). Only the two classic rules: rules-of-hooks (error) and
  // exhaustive-deps (warn). react-hooks@7 also ships broader React-Compiler
  // rules via its `recommended` preset — deliberately left off (#1976 scopes to
  // these two). apps/forms and apps/landing enable the same rules in their own
  // eslint configs.
  {
    files: ["**/*.{jsx,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
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
