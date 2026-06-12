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
  testEnvironment: "node",
  rootDir: "app",
  // Match .spec.ts (server/logic suites, node env) and .spec.tsx (component
  // suites, which opt into jsdom per-file via a @jest-environment docblock).
  testRegex: ".*\\.spec\\.tsx?$",
  moduleNameMapper: {
    // CSS-module imports resolve to a proxy that echoes the class name, so
    // components importing `*.module.css` render in tests without a CSS loader.
    "\\.(css)$": "identity-obj-proxy",
    "^@govtech-bb/form-types$":
      "<rootDir>/../../../packages/form-types/src/index.ts",
    "^@govtech-bb/form-builder$":
      "<rootDir>/../../../packages/form-builder/src/index.ts",
    "^@govtech-bb/registry$":
      "<rootDir>/../../../packages/registry/src/index.ts",
    // marked is ESM-only; point Jest at its UMD build (same content,
    // CJS-loadable). Pulled in by the content BodyEditor, which the builder's
    // StepEditor reuses for confirmation-page copy.
    "^marked$": "<rootDir>/../node_modules/marked/lib/marked.umd.js",
    // TanStack Start is ESM-only and cannot be loaded by ts-jest (CJS mode).
    // Provide a minimal shim so server functions can be unit-tested.
    "^@tanstack/react-start$":
      "<rootDir>/../test-mocks/tanstack-react-start.js",
    "^@tanstack/react-start/(.*)$":
      "<rootDir>/../test-mocks/tanstack-react-start-$1.js",
  },
  transform: {
    // ts-jest runs in CJS mode, where `import.meta` is a syntax error. Modules
    // that read browser config via `import.meta.env` (per ADR 0005) — e.g.
    // lib/form-url.ts — need the references rewritten at compile time to a stub
    // object. Mirrors apps/forms/jest.config.ts.
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: false,
        // ts-jest emits CJS, so TS1343 ("import.meta only allowed when module
        // is esnext…") fires before the transformer below rewrites it. Ignore
        // only that code — unlike apps/forms (diagnostics: false), this keeps
        // the rest of form_builder's tests type-checked, which is its only
        // type-check in CI (it's noEmit / not in `tsc -b`).
        diagnostics: { ignoreCodes: [1343] },
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
                    VITE_FORMS_URL: "https://forms.example.test",
                    VITE_RECIPE_PREVIEW_TOKEN: "stub-token",
                  },
                },
              },
            },
          ],
        },
      },
    ],
  },
};

export default config;
