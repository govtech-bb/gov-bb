# Phase 0 — Extract `packages/form-renderer` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the form rendering engine out of `apps/forms/src` into a new shared, SSR-safe, transport-injected package `@govtech-bb/form-renderer`, and refactor `apps/forms` to consume it with **zero behaviour change**.

**Architecture:** The package owns the **pure form model** (contract→FormMeta build pipeline, validation/behaviour/repeatable helpers), the **React renderer** (form-renderer, field-renderer + siblings, review, submission-confirmation), **SSR-safe session storage**, and a **`FormTransport` interface + React context** for all network I/O. Everything Vite-specific stays in `apps/forms`: `import.meta.env` reads, `import.meta.glob` preview fixtures, `@tanstack/react-query` query options, `form-fetcher`, and the concrete `api/forms.ts` + `api/files.ts` (which become the app's `FormTransport` implementation). Router navigation is **injected** (no hard-coded `/forms/$formId/` route id).

**Tech Stack:** TypeScript, React 19, `@tanstack/react-form`, `@govtech-bb/form-types` / `form-conditions` / `form-validation`, `@govtech-bb/react` + `@govtech-bb/analytics`, `@maskito/*`, `react-markdown`, `uuid`. Build via nx `@nx/js:tsc`; tests via Vitest 4; monorepo is pnpm + nx.

## Global Constraints

- Package manager is **pnpm** only — never `npm`.
- New package MUST be a buildable nx project (`project.json` with `@nx/js:tsc` build target) **and** be listed in the `references` array of every strict-`tsc` consumer's `tsconfig.json`, or the build fails `TS6059`/`TS6307`.
- The package MUST NOT reference `import.meta.env`, `import.meta.glob`, `VITE_*`, or any Vite-only global — it builds under `@nx/js:tsc`, not Vite. All env/network/preview behaviour is injected.
- The package MUST be SSR-safe: no `window`/`document`/`sessionStorage`/`localStorage`/`File`/`Blob` access at module top-level or during render — only inside `useEffect`, event handlers, or `typeof window !== "undefined"` guards.
- Package path alias is registered in `tsconfig.base.json` (`@govtech-bb/form-renderer` → `packages/form-renderer/src/index.ts`), mirroring existing packages.
- **Zero behaviour change** is the acceptance bar: the existing `apps/forms` unit tests, live-smoke, and a11y suites are the regression net and must stay green **without changing their assertions**.
- Run `pnpm exec nx run-many -t build --exclude=landing` and the touched projects' tests before every commit (per repo CLAUDE.md; `landing` prebuild needs network).
- Commit messages end with the `Co-authored-by: Claude Opus 4.8 <noreply@anthropic.com>` trailer.

---

## File structure

**New package `packages/form-renderer/`:**

```
packages/form-renderer/
  project.json                     # nx @nx/js:tsc build target
  package.json                     # @govtech-bb/form-renderer, workspace deps
  tsconfig.json                    # composite, references form-types/conditions/validation
  vitest.config.ts                 # jsdom env for component tests
  src/
    index.ts                       # public barrel
    types/                         # MOVED from apps/forms/src/types (form-model types only)
      index.ts
      *.type.ts
    model/                         # MOVED pure build pipeline (was lib/form-builder, minus fetch/query)
      build-form.ts
      field-mapper.ts
      validation-builder.ts
      validation-methods.ts
      helpers/
        behavior-helper.ts
        value-tree.ts
        repeatable-helper.ts
      index.ts                     # pure-model barrel
    storage/
      session-storage.ts           # MOVED + SSR-guarded
    transport/
      types.ts                     # FormTransport interface (NEW)
      context.tsx                  # FormTransportProvider + useFormTransport (NEW)
    submission/
      submission-outcome.ts        # MOVED (pure)
    navigation/
      context.tsx                  # FormNavigation context (NEW) — injected navigate
    components/                    # MOVED renderer components
      form-renderer.tsx
      field-renderer/*             # index + all sibling renderers + render-context
      review.tsx
      submission-confirmation.tsx
      file-upload.tsx              # consumes injected transport
      markdown-components.tsx
      error-summary.tsx
      applicant-name-display.tsx
    hooks/
      use-step-guard.tsx           # MOVED, navigation injected
```

**Stays in `apps/forms/src/` (Vite/data/env/router glue):**

- `lib/api/forms.ts`, `lib/api/files.ts` — become the app's `FormTransport` implementation.
- `lib/form-builder/form-fetcher.ts`, `form-query.ts`, `preview-contracts.ts` + `contracts/*.json` fixtures — Vite `import.meta.*`.
- `lib/analytics.ts`, `lib/form-category.ts`, `lib/security/safe-payment-url.ts`, `lib/preview-url.ts`, `lib/env.ts` — Vite env / app config (see Task 9 for the analytics decision).
- `lib/transport.ts` (NEW) — builds the app `FormTransport` from `api/forms.ts` + `api/files.ts`.
- `routes/forms/$formId/index.tsx` — the consumer; rewired to pass transport + navigation.

**Extraction seam (what the package receives from the host):**

- A built `FormMeta` (host fetches the contract + runs `buildForm` — both re-exported from the package so the host's query layer calls package code).
- A `FormTransport` (submit + file upload) via `FormTransportProvider`.
- A navigation implementation via `FormNavigationProvider` (so no route id is hard-coded).
- Analytics: the package depends on `@govtech-bb/analytics` directly (Task 9).

---

## Task 1: Scaffold the buildable package

**Files:**
- Create: `packages/form-renderer/project.json`
- Create: `packages/form-renderer/package.json`
- Create: `packages/form-renderer/tsconfig.json`
- Create: `packages/form-renderer/src/index.ts`
- Create: `packages/form-renderer/vitest.config.ts`
- Modify: `tsconfig.base.json` (add path alias)

**Interfaces:**
- Produces: the `@govtech-bb/form-renderer` package with an empty barrel `export {}` and a passing `nx build form-renderer`.

- [ ] **Step 1: Create `project.json`** (mirror `packages/form-conditions/project.json`)

```json
{
  "name": "form-renderer",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "packages/form-renderer/src",
  "projectType": "library",
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/packages/form-renderer",
        "tsConfig": "packages/form-renderer/tsconfig.json",
        "main": "packages/form-renderer/src/index.ts"
      }
    },
    "test": {
      "executor": "nx:run-commands",
      "options": { "command": "vitest run", "cwd": "packages/form-renderer" }
    },
    "lint": {
      "executor": "@nx/eslint:lint",
      "options": { "lintFilePatterns": ["packages/form-renderer/**/*.ts", "packages/form-renderer/**/*.tsx"] }
    }
  },
  "tags": []
}
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "@govtech-bb/form-renderer",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": { "test": "vitest run" },
  "lint-staged": { "*.{ts,tsx}": "npx prettier --write" },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1",
    "lint-staged": "^16.4.0"
  },
  "dependencies": {
    "@govtech-bb/analytics": "workspace:*",
    "@govtech-bb/form-conditions": "workspace:*",
    "@govtech-bb/form-types": "workspace:*",
    "@govtech-bb/form-validation": "workspace:*",
    "@govtech-bb/react": "^1.0.0-alpha.17",
    "@maskito/core": "^5.2.2",
    "@maskito/react": "^5.2.2",
    "@tanstack/react-form": "catalog:",
    "react": "catalog:",
    "react-dom": "catalog:",
    "react-markdown": "^9.0.0",
    "remark-gfm": "^4.0.1",
    "uuid": "^11.1.1"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`** (composite lib; note `jsx` for `.tsx`, and `module: esnext`/`moduleResolution: bundler` because this package ships `.tsx` + React)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "declaration": true,
    "jsx": "react-jsx",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node", "vitest/globals"]
  },
  "references": [
    { "path": "../form-types" },
    { "path": "../form-conditions" },
    { "path": "../form-validation" },
    { "path": "../analytics" }
  ],
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist", "src/**/*.spec.ts", "src/**/*.spec.tsx", "src/**/*.test.ts", "src/**/*.test.tsx"]
}
```

- [ ] **Step 4: Create empty barrel** `packages/form-renderer/src/index.ts`

```ts
export {};
```

- [ ] **Step 5: Create `vitest.config.ts`** (jsdom for component tests)

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: [],
  },
});
```

- [ ] **Step 6: Register the path alias** in `tsconfig.base.json` `compilerOptions.paths` (alongside the other `@govtech-bb/*` aliases, e.g. near line 33)

```jsonc
"@govtech-bb/form-renderer": ["packages/form-renderer/src/index.ts"],
```

- [ ] **Step 7: Install + build the empty package**

Run: `pnpm install`
Run: `pnpm exec nx build form-renderer`
Expected: build succeeds, emits `dist/packages/form-renderer`.

- [ ] **Step 8: Commit**

```bash
git add packages/form-renderer tsconfig.base.json pnpm-lock.yaml
git commit -m "chore(form-renderer): scaffold buildable package"
```

---

## Task 2: Move the shared client form-model types

`apps/forms/src/types/` is imported everywhere via the `@forms/types` alias. Move the **form-model** types into the package; leave **app-only** types (route search params, anything importing `@tanstack/react-router` route ids, Vite env types) in `apps/forms`.

**Files:**
- Read first: `apps/forms/src/types/index.ts` and every file it re-exports (`*.type.ts`).
- Create: `packages/form-renderer/src/types/*` (moved form-model type files)
- Modify: `packages/form-renderer/src/index.ts` (re-export types)
- Modify: `tsconfig.base.json` — repoint `@forms/types` → `packages/form-renderer/src/types/index.ts`
- Modify: `apps/forms/tsconfig.json` — add `{ "path": "../../packages/form-renderer" }` to `references`

**Interfaces:**
- Produces: `@govtech-bb/form-renderer` exports all form-model types (`ClientPrimitive`, `ClientServiceContract`, `ClientFormStep`, `FormMeta`, `FormValues`, `FormValuesByStep`, `FieldValidationProperties`, `FieldValidationErrors`, `FormRendererProps`, `SubmissionState`, `SubmissionConfirmationProps`, `RepeatableStepSettings`, `UploadedFile`, `UseStepGuardProps`, `AddRepeatableStepParams`, `RemoveRepeatableStepParams`, `InsetFieldEntry` — plus any others found in `types/`).
- Consumes: nothing new.

- [ ] **Step 1: Classify the type files.** Read `apps/forms/src/types/index.ts`. For each re-exported `*.type.ts`, mark it **form-model** (types describing the contract, fields, steps, FormMeta, validation, submission, repeatable, props of the moved components) or **app-only** (imports `@tanstack/react-router`, Vite env, or app route search). Record the split.

- [ ] **Step 2: Move the form-model type files**

```bash
git mv apps/forms/src/types/<form-model>.type.ts packages/form-renderer/src/types/
# repeat per form-model file
```

Create `packages/form-renderer/src/types/index.ts` re-exporting the moved files (copy the corresponding re-export lines from the old `apps/forms/src/types/index.ts`). Leave app-only type files in `apps/forms/src/types/` and keep a trimmed `apps/forms/src/types/index.ts` that re-exports the remaining app-only ones **and** re-exports the moved ones from `@govtech-bb/form-renderer` for backwards-compat:

```ts
// apps/forms/src/types/index.ts (top)
export * from "@govtech-bb/form-renderer";
// ...then remaining app-only re-exports
```

- [ ] **Step 3: Fix intra-type imports.** Any moved type file that imported a sibling via `@forms/types` or `./x.type` must use a relative path valid in the new location. Any moved type that referenced an app-only type is a classification error — revisit Step 1.

- [ ] **Step 4: Export types from the package barrel** `packages/form-renderer/src/index.ts`

```ts
export * from "./types";
```

- [ ] **Step 5: Repoint the alias** in `tsconfig.base.json`:

```jsonc
"@forms/types": ["packages/form-renderer/src/types/index.ts"],
```

- [ ] **Step 6: Add the reference** to `apps/forms/tsconfig.json` `references`:

```jsonc
{ "path": "../../packages/form-renderer" }
```

- [ ] **Step 7: Build both projects**

Run: `pnpm exec nx build form-renderer`
Run: `pnpm exec nx run forms:build` (or `nx build forms` if that is the target name)
Expected: both succeed. If `forms` reports a moved type as missing, add its re-export in `packages/form-renderer/src/types/index.ts`.

- [ ] **Step 8: Run forms unit tests**

Run: `pnpm exec nx run forms:test`
Expected: PASS (unchanged assertions).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(form-renderer): move shared client form-model types into package"
```

---

## Task 3: Move the pure form-model build pipeline

Move the **pure** parts of `apps/forms/src/lib/form-builder/` (no network, no `import.meta.env`, no react-query) into `packages/form-renderer/src/model/`. Leave `form-fetcher.ts`, `form-query.ts`, `preview-contracts.ts` in `apps/forms`.

**Files:**
- `git mv` into `packages/form-renderer/src/model/`: `build-form.ts`, `field-mapper.ts`, `validation-builder.ts`, `validation-methods.ts`, `helpers/behavior-helper.ts`, `helpers/value-tree.ts`, `helpers/repeatable-helper.ts`
- Create: `packages/form-renderer/src/model/index.ts` (pure-model barrel)
- Modify: `apps/forms/src/lib/form-builder/index.ts` (re-export moved symbols from the package; keep exporting the app-only fetch/query symbols)
- Modify: `packages/form-renderer/src/index.ts` (re-export model)

**Interfaces:**
- Produces (from `@govtech-bb/form-renderer`): `buildForm(contract: ClientServiceContract): FormMeta`; `mapContractToLocale(contract: ServiceContract): ClientServiceContract`; `getFullFieldId(stepId, fieldId): string`; `stepFieldIdConcactenator`; `buildValidation`; `buildFieldValidationProperties(field: ClientPrimitive): FieldValidationProperties`; `collectStepErrorCodes`; `RequiredState`; `parseDatePart`; `checkConditionalOn`; `getVisibleFields`; `getVisibleSteps`; `getStepConditonalTargets`; `buildStepScopedValues`; `splitCompositeId`; all `repeatable-helper` exports (`setupRepeatSteps`, `addRepeatableStep`, `removeRepeatableStep`, `restoreRepeatableStepsFromStorage`, `generateRepeatStepFields`, `generateRepeatableAddAnotherField`, `repeatStepConcactenator`, `getRepeatStepId`, `getRepeatStepCount`, `getInstanceMarker`, `getEffectiveRepeatBounds`).
- Consumes: `@govtech-bb/form-types`, `@govtech-bb/form-conditions`, `@govtech-bb/form-validation`, `@tanstack/react-form` (types only), and the package's own `../types`.

- [ ] **Step 1: Move the files**

```bash
git mv apps/forms/src/lib/form-builder/build-form.ts packages/form-renderer/src/model/build-form.ts
git mv apps/forms/src/lib/form-builder/field-mapper.ts packages/form-renderer/src/model/field-mapper.ts
git mv apps/forms/src/lib/form-builder/validation-builder.ts packages/form-renderer/src/model/validation-builder.ts
git mv apps/forms/src/lib/form-builder/validation-methods.ts packages/form-renderer/src/model/validation-methods.ts
mkdir -p packages/form-renderer/src/model/helpers
git mv apps/forms/src/lib/form-builder/helpers/behavior-helper.ts packages/form-renderer/src/model/helpers/behavior-helper.ts
git mv apps/forms/src/lib/form-builder/helpers/value-tree.ts packages/form-renderer/src/model/helpers/value-tree.ts
git mv apps/forms/src/lib/form-builder/helpers/repeatable-helper.ts packages/form-renderer/src/model/helpers/repeatable-helper.ts
```

- [ ] **Step 2: Rewrite imports in the moved files.** In each moved file, replace `@forms/types` with `../types` (or `../../types` from `helpers/`), and confirm no remaining import resolves back into `apps/forms/src`. These files import only `@govtech-bb/*` packages + sibling model files, so only the type alias and sibling relative paths change. If any moved file imports `../field-mapper` etc., keep it relative within `model/`.

- [ ] **Step 3: Create the model barrel** `packages/form-renderer/src/model/index.ts` — copy the re-export lines from the old `apps/forms/src/lib/form-builder/index.ts` for the moved symbols only (the pure ones listed in Interfaces above).

- [ ] **Step 4: Re-export model from the package barrel** — add to `packages/form-renderer/src/index.ts`:

```ts
export * from "./model";
```

- [ ] **Step 5: Update the app barrel** `apps/forms/src/lib/form-builder/index.ts` — re-export moved symbols from the package, and keep the app-only fetch/query exports local:

```ts
// pure model now lives in the package
export * from "@govtech-bb/form-renderer";
// app-only, stay here (they use import.meta.env / react-query):
export { fetchContract } from "./form-fetcher";
export {
  contractQueryOptions,
  formMetaQueryOptions,
  formSchemaCacheKey,
  CONTRACT_CACHE_KEY,
  FORM_SCHEMA_CACHE_KEY,
} from "./form-query";
```

- [ ] **Step 6: Fix `form-fetcher.ts` / `form-query.ts` imports.** They import `mapContractToLocale` (from `./field-mapper`, now moved) and `buildForm` (from `./build-form`, now moved). Repoint those to `@govtech-bb/form-renderer`.

- [ ] **Step 7: Build + test**

Run: `pnpm exec nx build form-renderer`
Run: `pnpm exec nx run forms:build`
Run: `pnpm exec nx run forms:test`
Run: `pnpm exec nx run api:test` (recipe/model helpers are shared — cheap safety check)
Expected: all PASS.

- [ ] **Step 8: Move the model unit tests.** Any `*.spec.ts` for the moved files (e.g. `build-form.spec.ts`, `repeatable-helper.spec.ts`, `behavior-helper.spec.ts`) `git mv` alongside their source into `packages/form-renderer/src/model/…`, fixing relative import paths. Run:

Run: `pnpm exec nx run form-renderer:test`
Expected: the moved tests PASS in the package.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(form-renderer): move pure form-model build pipeline into package"
```

---

## Task 4: Move `submission-outcome.ts` (pure)

**Files:**
- `git mv apps/forms/src/lib/submission-outcome.ts packages/form-renderer/src/submission/submission-outcome.ts`
- Move its spec if present.
- Modify: `packages/form-renderer/src/index.ts`

**Interfaces:**
- Produces: `resolveSubmissionOutcome(response: FormSubmissionResponse): SubmissionOutcome`; `applyPaymentReturn(state: SubmissionState, payment: "success" | "failed" | undefined): SubmissionState`; types `SubmissionOutcome`, `SubmissionEvent`.

- [ ] **Step 1: Move**

```bash
mkdir -p packages/form-renderer/src/submission
git mv apps/forms/src/lib/submission-outcome.ts packages/form-renderer/src/submission/submission-outcome.ts
```

- [ ] **Step 2: Fix imports** — replace `@forms/types` with `../types`.

- [ ] **Step 3: Export** — add to `packages/form-renderer/src/index.ts`:

```ts
export * from "./submission/submission-outcome";
```

- [ ] **Step 4: Repoint the app consumer.** In `apps/forms/src/routes/forms/$formId/index.tsx`, change the `../../../lib/submission-outcome` import to `@govtech-bb/form-renderer`.

- [ ] **Step 5: Build + test**

Run: `pnpm exec nx build form-renderer && pnpm exec nx run forms:build && pnpm exec nx run forms:test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(form-renderer): move submission-outcome into package"
```

---

## Task 5: Move + SSR-guard session storage

`apps/forms/src/lib/session-storage.ts` touches `sessionStorage` unguarded at lines `39, 47, 56, 57, 64, 68, 73, 78, 87, 132, 136, 141, 159`. In the package it must no-op under SSR.

**Files:**
- `git mv apps/forms/src/lib/session-storage.ts packages/form-renderer/src/storage/session-storage.ts`
- Test: `packages/form-renderer/src/storage/session-storage.spec.ts` (NEW)
- Modify: `packages/form-renderer/src/index.ts`

**Interfaces:**
- Produces: `storeFormData`, `getFormData`, `clearFormState`, `storeSubmissionState`, `getSubmissionState`, `clearSubmissionState`, `getCompletedSteps`, `markStepCompleted`, `isStepCompleted`, `getLastCompletedStep`, `getFirstIncompleteActiveStep`, `persistFormStartTime`, `getFormStartTime`, `clearFormStartTime`, `isStepAccessible` — signatures unchanged from the inventory.

- [ ] **Step 1: Write the failing SSR-safety test** `packages/form-renderer/src/storage/session-storage.spec.ts`

```ts
import { describe, it, expect, vi, afterEach } from "vitest";

describe("session-storage SSR safety", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("getFormData returns null when sessionStorage is unavailable (SSR)", async () => {
    vi.stubGlobal("sessionStorage", undefined);
    const { getFormData } = await import("./session-storage");
    expect(getFormData("any-form")).toBeNull();
  });

  it("storeFormData does not throw when sessionStorage is unavailable (SSR)", async () => {
    vi.stubGlobal("sessionStorage", undefined);
    const { storeFormData } = await import("./session-storage");
    expect(() => storeFormData("any-form", {} as never)).not.toThrow();
  });

  it("getCompletedSteps returns [] when sessionStorage is unavailable (SSR)", async () => {
    vi.stubGlobal("sessionStorage", undefined);
    const { getCompletedSteps } = await import("./session-storage");
    expect(getCompletedSteps("any-form")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec nx run form-renderer:test -- session-storage`
Expected: FAIL (current code calls `sessionStorage.getItem` → throws when undefined).

- [ ] **Step 3: Add the guard.** At the top of `packages/form-renderer/src/storage/session-storage.ts` add:

```ts
function getStore(): Storage | null {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined"
    ? window.sessionStorage
    : null;
}
```

Replace every direct `sessionStorage.getItem/setItem/removeItem` with a `getStore()` guard, e.g.:

```ts
export function getFormData(formId: string): FormValues | null {
  const store = getStore();
  if (!store) return null;
  const raw = store.getItem(`formData_${formId}`);
  return raw ? (JSON.parse(raw) as FormValues) : null;
}

export function storeFormData(formId: string, data: FormValues): void {
  const store = getStore();
  if (!store) return;
  store.setItem(`formData_${formId}`, JSON.stringify(stripNonSerializableValues(data)));
}
```

Apply the same `const store = getStore(); if (!store) return <empty>;` pattern to every exported function that touches storage. Read functions return `null`/`[]`/`false`/`undefined` as their existing return type dictates; write/remove functions return early. Keep the existing `formData_` / `completedSteps_` / etc. key strings **exactly** as they are today (do not rename keys — the smoke suite and payment round-trip depend on them). Fix `@forms/types` imports to `../types`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec nx run form-renderer:test -- session-storage`
Expected: PASS.

- [ ] **Step 5: Export + repoint consumers.** Add to `packages/form-renderer/src/index.ts`:

```ts
export * from "./storage/session-storage";
```

Repoint `apps/forms/src/routes/forms/$formId/index.tsx` (imports at `:26-36`) and any other app importer of `../lib/session-storage` to `@govtech-bb/form-renderer`. `use-step-guard.tsx` also imports it (handled in Task 8 when the hook moves).

- [ ] **Step 6: Build + full forms test**

Run: `pnpm exec nx build form-renderer && pnpm exec nx run forms:build && pnpm exec nx run forms:test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(form-renderer): move session-storage into package with SSR guards"
```

---

## Task 6: Define the `FormTransport` interface + context

The renderer's network I/O (submit, file upload) becomes an injected interface. The concrete Vite implementation stays in `apps/forms` (Task 10).

**Files:**
- Create: `packages/form-renderer/src/transport/types.ts`
- Create: `packages/form-renderer/src/transport/context.tsx`
- Test: `packages/form-renderer/src/transport/context.spec.tsx`
- Modify: `packages/form-renderer/src/index.ts`

**Interfaces:**
- Produces:
  - `interface FormTransport` with the exact method shapes below (derived from `api/forms.ts` `postFormSubmission` and `api/files.ts` `uploadFile`).
  - `FormTransportProvider({ transport, children })` and `useFormTransport(): FormTransport`.
- Consumes: `FormMeta`, `FormValuesByStep`, `UploadedFile`, `FormSubmissionResponse` from `../types`.

- [ ] **Step 1: Write `transport/types.ts`**

```ts
import type {
  FormMeta,
  FormValuesByStep,
  UploadedFile,
  FormSubmissionResponse,
} from "../types";

export interface SubmitArgs {
  formMeta: FormMeta;
  valuesBySteps: FormValuesByStep;
  previewToken?: string;
}

export interface UploadArgs {
  file: File;
  formId: string;
  stepId: string;
  fieldId: string;
  previewToken?: string;
  draftToken?: string;
}

export interface FormTransport {
  submit(args: SubmitArgs): Promise<FormSubmissionResponse>;
  uploadFile(args: UploadArgs): Promise<UploadedFile>;
}
```

- [ ] **Step 2: Write the failing context test** `transport/context.spec.tsx`

```tsx
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { FormTransportProvider, useFormTransport } from "./context";
import type { FormTransport } from "./types";

const stub: FormTransport = {
  submit: async () => ({}) as never,
  uploadFile: async () => ({}) as never,
};

describe("FormTransport context", () => {
  it("provides the injected transport", () => {
    const { result } = renderHook(() => useFormTransport(), {
      wrapper: ({ children }) => (
        <FormTransportProvider transport={stub}>{children}</FormTransportProvider>
      ),
    });
    expect(result.current).toBe(stub);
  });

  it("throws when used outside a provider", () => {
    expect(() => renderHook(() => useFormTransport())).toThrow(
      /useFormTransport must be used within a FormTransportProvider/,
    );
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm exec nx run form-renderer:test -- transport/context`
Expected: FAIL (module not found / not implemented).

- [ ] **Step 4: Write `transport/context.tsx`**

```tsx
import { createContext, useContext, type ReactNode } from "react";
import type { FormTransport } from "./types";

const FormTransportContext = createContext<FormTransport | null>(null);

export function FormTransportProvider({
  transport,
  children,
}: {
  transport: FormTransport;
  children: ReactNode;
}) {
  return (
    <FormTransportContext.Provider value={transport}>
      {children}
    </FormTransportContext.Provider>
  );
}

export function useFormTransport(): FormTransport {
  const ctx = useContext(FormTransportContext);
  if (!ctx) {
    throw new Error("useFormTransport must be used within a FormTransportProvider");
  }
  return ctx;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm exec nx run form-renderer:test -- transport/context`
Expected: PASS.

- [ ] **Step 6: Export** — add to `packages/form-renderer/src/index.ts`:

```ts
export * from "./transport/types";
export * from "./transport/context";
```

- [ ] **Step 7: Build + commit**

Run: `pnpm exec nx build form-renderer`

```bash
git add -A
git commit -m "feat(form-renderer): add FormTransport interface and context"
```

---

## Task 7: Define the navigation injection context

`review.tsx:21` and `use-step-guard.tsx:31` hard-code `useNavigate({ from: "/forms/$formId/" })`. The package must not assume that route. Inject a navigation function.

**Files:**
- Create: `packages/form-renderer/src/navigation/context.tsx`
- Test: `packages/form-renderer/src/navigation/context.spec.tsx`
- Modify: `packages/form-renderer/src/index.ts`

**Interfaces:**
- Produces:
  - `interface FormNavigation { goToStep(stepId: string): void }`
  - `FormNavigationProvider({ navigation, children })` and `useFormNavigation(): FormNavigation`.
- Consumes: nothing.

- [ ] **Step 1: Write the failing test** `navigation/context.spec.tsx`

```tsx
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { FormNavigationProvider, useFormNavigation } from "./context";
import type { FormNavigation } from "./context";

describe("FormNavigation context", () => {
  it("provides the injected navigation", () => {
    const nav: FormNavigation = { goToStep: vi.fn() };
    const { result } = renderHook(() => useFormNavigation(), {
      wrapper: ({ children }) => (
        <FormNavigationProvider navigation={nav}>{children}</FormNavigationProvider>
      ),
    });
    result.current.goToStep("step-2");
    expect(nav.goToStep).toHaveBeenCalledWith("step-2");
  });

  it("throws when used outside a provider", () => {
    expect(() => renderHook(() => useFormNavigation())).toThrow(
      /useFormNavigation must be used within a FormNavigationProvider/,
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec nx run form-renderer:test -- navigation/context`
Expected: FAIL.

- [ ] **Step 3: Write `navigation/context.tsx`**

```tsx
import { createContext, useContext, type ReactNode } from "react";

export interface FormNavigation {
  /** Navigate to a step within the current form (host maps stepId → URL). */
  goToStep(stepId: string): void;
}

const FormNavigationContext = createContext<FormNavigation | null>(null);

export function FormNavigationProvider({
  navigation,
  children,
}: {
  navigation: FormNavigation;
  children: ReactNode;
}) {
  return (
    <FormNavigationContext.Provider value={navigation}>
      {children}
    </FormNavigationContext.Provider>
  );
}

export function useFormNavigation(): FormNavigation {
  const ctx = useContext(FormNavigationContext);
  if (!ctx) {
    throw new Error("useFormNavigation must be used within a FormNavigationProvider");
  }
  return ctx;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec nx run form-renderer:test -- navigation/context`
Expected: PASS.

- [ ] **Step 5: Export** — add to `packages/form-renderer/src/index.ts`:

```ts
export * from "./navigation/context";
```

- [ ] **Step 6: Build + commit**

Run: `pnpm exec nx build form-renderer`

```bash
git add -A
git commit -m "feat(form-renderer): add injectable navigation context"
```

---

## Task 8: Move the field-renderer tree + file-upload (transport-injected)

**Files:**
- `git mv` into `packages/form-renderer/src/components/field-renderer/`: `index.tsx`, `render-context.ts`, `text-field.tsx`, `textarea-field.tsx`, `number-input.tsx`, `date-field.tsx`, `select-field.tsx`, `checkbox-field.tsx`, `radio-field.tsx`, `show-hide-field.tsx`, `repeatable-field.tsx`
- `git mv apps/forms/src/components/file-upload.tsx packages/form-renderer/src/components/file-upload.tsx`
- Modify: `file-upload.tsx` to use `useFormTransport().uploadFile` instead of `../lib/api/files`
- Test: `packages/form-renderer/src/components/file-upload.spec.tsx` (NEW — verifies transport is called)
- Modify: `packages/form-renderer/src/index.ts`

**Interfaces:**
- Consumes: `useFormTransport` (Task 6); model helpers `RequiredState`, `checkConditionalOn` (Task 3, from `../../model`); types from `../../types`.
- Produces: `FieldRenderer` default export; `type InsetFieldEntry`; `buildFieldRenderContext`; `type FieldRenderContext`; `NumberInput`; the `render*Field` helpers.

- [ ] **Step 1: Move the field-renderer files**

```bash
mkdir -p packages/form-renderer/src/components/field-renderer
git mv apps/forms/src/components/field-renderer/* packages/form-renderer/src/components/field-renderer/
git mv apps/forms/src/components/file-upload.tsx packages/form-renderer/src/components/file-upload.tsx
```

- [ ] **Step 2: Rewrite imports across the moved files.** Replace `@forms/types` → `../../types`, `@forms/lib` → `../../model` (the pure model), `../file-upload` → `../file-upload` (still valid, now sibling), and any `../../lib/...` app import per the seam. `render-context.ts` already only imports external packages + `@forms/types` → repoint the latter.

- [ ] **Step 3: Rewire `file-upload.tsx` to the injected transport.** Read the file; it currently imports `uploadFile` (and `FileUploadError`, `UploadFileParams`) from `../lib/api/files`. Replace the direct import with the context hook and call it:

```tsx
import { useFormTransport } from "../transport/context";
// inside the component:
const transport = useFormTransport();
// replace the previous `await uploadFile({ file, formId, stepId, fieldId, previewToken, draftToken })`
// call with:
const uploaded = await transport.uploadFile({ file, formId, stepId, fieldId, previewToken, draftToken });
```

Keep the component's own error UI. `FileUploadError`/`UploadStage` stay defined in the app's `api/files.ts`; the package should catch generic errors from `transport.uploadFile` and render the same message it does today (preserve the existing catch/branching text). If the component currently switches on `FileUploadError.stage`, replace that with a single generic upload-failure branch that renders the identical user-facing string — behaviour to the user is unchanged (the stage was never shown to users; confirm by reading the current JSX).

- [ ] **Step 4: Write the file-upload transport test** `components/file-upload.spec.tsx`

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FileUpload from "./file-upload";
import { FormTransportProvider } from "../transport/context";
import type { FormTransport } from "../transport/types";

// NOTE: fill props from the real FileUpload signature when writing this test.
it("routes uploads through the injected transport", async () => {
  const uploadFile = vi.fn(async () => ({ /* UploadedFile shape */ }) as never);
  const transport: FormTransport = { submit: vi.fn() as never, uploadFile };
  // render <FileUpload .../> inside <FormTransportProvider transport={transport}>
  // simulate selecting a file, then:
  // expect(uploadFile).toHaveBeenCalledWith(expect.objectContaining({ fieldId: <expected> }))
  expect(transport.uploadFile).toBeDefined();
});
```

Before committing, replace the placeholder comments with the real props/`UploadedFile` shape read from `file-upload.tsx` and `types/`. The test MUST assert `uploadFile` is invoked on file selection.

- [ ] **Step 5: Export + build**

Add to `packages/form-renderer/src/index.ts`:

```ts
export { default as FieldRenderer } from "./components/field-renderer";
export * from "./components/field-renderer/render-context";
export { default as FileUpload } from "./components/file-upload";
```

Run: `pnpm exec nx build form-renderer`
Run: `pnpm exec nx run form-renderer:test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(form-renderer): move field-renderer tree and transport-injected file-upload"
```

---

## Task 9: Move review, submission-confirmation, and supporting components + analytics decision

**Files:**
- `git mv` into `packages/form-renderer/src/components/`: `review.tsx`, `submission-confirmation.tsx`, `markdown-components.tsx`, `error-summary.tsx`, `applicant-name-display.tsx`, `review-dwell.tsx`, `step-events.tsx`, `validation-error-event.tsx`
- `git mv` into `packages/form-renderer/src/`: `lib/analytics.ts` → `src/analytics.ts`, `lib/form-category.ts` → `src/form-category.ts` (see decision below)
- Handle `submission-confirmation.tsx`'s `../lib/security/safe-payment-url` dependency (reads `VITE_PAYMENT_ALLOWED_ORIGINS`)
- Rewire `review.tsx` navigation to `useFormNavigation`

**Analytics decision:** `../lib/analytics` in `apps/forms` wraps `@govtech-bb/analytics`. Read it first. If it only re-exports/wraps `@govtech-bb/analytics` with no `import.meta.env` reads, **move** it into the package (`src/analytics.ts`) and depend on `@govtech-bb/analytics` (already a package dep). If it reads `import.meta.env`, **keep it in the app** and inject `trackEvent` via a small `FormAnalyticsProvider` context (mirror Task 7). Record which branch you took.

**`safe-payment-url` decision:** `submission-confirmation.tsx` imports `isSafePaymentUrl` which reads `VITE_PAYMENT_ALLOWED_ORIGINS`. Since the package can't read Vite env, pass the allowed-origins list (or the `isSafePaymentUrl` predicate) into `SubmissionConfirmation` as a prop, defaulted by the host. Add `allowedPaymentOrigins?: string[]` (or `isSafePaymentUrl?: (url: string) => boolean`) to `SubmissionConfirmationProps` and thread the host value from the route.

**Interfaces:**
- Consumes: `useFormNavigation` (Task 7); model helpers `getInstanceMarker`, `getVisibleFields`, `buildStepScopedValues` (from `../model`); types from `../types`.
- Produces: `Review` default; `SubmissionConfirmation` default (with the new payment-origins prop); `markdownComponents`; `ErrorSummary`; `ApplicantNameDisplay`; `reviewDwellSeconds`; `stepCompleteEventName`; `buildValidationErrorPayload`.

- [ ] **Step 1: Move the component files** (git mv as listed).

- [ ] **Step 2: Resolve the analytics + form-category location** per the decision above; move or inject. Update imports in the moved components accordingly (`../lib/analytics` → `../analytics` or the injected hook; `../lib/form-category` → `../form-category` or injected).

- [ ] **Step 3: Rewire `review.tsx` navigation.** Replace `useNavigate({ from: "/forms/$formId/" })` and its `navigate({ search })` calls with `useFormNavigation().goToStep(stepId)`. Read the current `navigate` call to see what step it targets and map it to `goToStep`.

- [ ] **Step 4: Thread the payment-origins prop** into `submission-confirmation.tsx` and `SubmissionConfirmationProps` (move that prop type into the package types if it lived in `apps/forms/src/types/props.type`). Replace the direct `isSafePaymentUrl` import with the prop.

- [ ] **Step 5: Fix all remaining `@forms/*` / `../lib/*` imports** in the moved components to package-relative or package-external paths.

- [ ] **Step 6: Export + build + test**

Add barrel exports to `packages/form-renderer/src/index.ts` for the moved components.

Run: `pnpm exec nx build form-renderer && pnpm exec nx run form-renderer:test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(form-renderer): move review/confirmation components with injected nav and payment-origin prop"
```

---

## Task 10: Move `form-renderer.tsx` + `use-step-guard.tsx` (top of the tree)

**Files:**
- `git mv apps/forms/src/components/form-renderer.tsx packages/form-renderer/src/components/form-renderer.tsx`
- `git mv apps/forms/src/hooks/use-step-guard.tsx packages/form-renderer/src/hooks/use-step-guard.tsx`
- Modify: SSR-guard `window.scrollTo` (`form-renderer.tsx:341`); inject navigation in `use-step-guard.tsx`
- Modify: `packages/form-renderer/src/index.ts`

**Interfaces:**
- Consumes: everything moved in Tasks 3–9 (all now package-relative), `useFormNavigation`, `useFormTransport`.
- Produces: `FormRenderer` default export (props unchanged: `form, formMeta, stepId, visibleSteps, repeatableStepSettingsRef, submissionState, isDraft, previewToken, draftToken` — plus the new `allowedPaymentOrigins`/nav wiring flows via context/props, not new required props on `FormRenderer` itself unless unavoidable); `useStepGuard(props): { navigateToStep, completeAndContinue, currentIndex }`.

- [ ] **Step 1: Move both files** (git mv).

- [ ] **Step 2: Rewire `use-step-guard.tsx` navigation.** It currently calls `useNavigate({ from: "/forms/$formId/" })` and builds `navigate({ to, search: { step } })`. Replace the URL-building with `useFormNavigation().goToStep(targetStepId)`. Keep the storage calls (`getFirstIncompleteActiveStep`, `isStepAccessible`, `markStepCompleted`) pointing at `../storage/session-storage`. Keep the returned shape `{ navigateToStep, completeAndContinue, currentIndex }` identical.

- [ ] **Step 3: SSR-guard `window.scrollTo`** in `form-renderer.tsx`:

```ts
if (typeof window !== "undefined") {
  window.scrollTo({ top: 0, behavior: "smooth" });
}
```

(match the existing call's options).

- [ ] **Step 4: Fix all imports in `form-renderer.tsx`** — `@forms/types` → `../types`; `@forms/lib` → `../model`; `../hooks/use-step-guard` → `../hooks/use-step-guard`; `./field-renderer`, `./review`, `./submission-confirmation`, `./markdown-components`, `./error-summary`, `./applicant-name-display` stay sibling; `../lib/analytics`/`../lib/form-category`/`./review-dwell`/`./validation-error-event`/`./step-events` per Task 9's resolution; `../lib/form-builder/helpers/value-tree` → `../model/helpers/value-tree`.

- [ ] **Step 5: Export from the barrel**

```ts
export { default as FormRenderer } from "./components/form-renderer";
export * from "./hooks/use-step-guard";
```

- [ ] **Step 6: Write an SSR smoke test** `packages/form-renderer/src/components/form-renderer.ssr.spec.tsx` that renders `FormRenderer` (wrapped in transport + navigation providers, with a minimal `FormMeta` fixture) via `renderToString` and asserts it does not throw. Build the minimal `FormMeta`/`form` fixture from the `buildForm` output of a tiny inline contract (reuse an existing test fixture from the moved `build-form.spec.ts` if present).

```tsx
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
// import FormRenderer, providers, and build a minimal FormMeta via buildForm(...)
it("renders on the server without touching window/sessionStorage", () => {
  expect(() => renderToString(/* <providers><FormRenderer .../></providers> */ null)).not.toThrow();
});
```

Replace the comment with the real render tree before committing. This test is the guard that Phase 1's SSR host won't crash.

- [ ] **Step 7: Build + test**

Run: `pnpm exec nx build form-renderer && pnpm exec nx run form-renderer:test`
Expected: PASS (including the SSR smoke test).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(form-renderer): move FormRenderer and step-guard with SSR guard and injected nav"
```

---

## Task 11: Wire `apps/forms` to the package

Now `apps/forms` provides the concrete transport + navigation and renders via the package. `api/forms.ts`, `api/files.ts`, `form-fetcher.ts`, `form-query.ts`, `preview-contracts.ts` stay in the app.

**Files:**
- Create: `apps/forms/src/lib/transport.ts` (implements `FormTransport`)
- Modify: `apps/forms/src/routes/forms/$formId/index.tsx` (providers + package imports)
- Modify: `apps/forms/src/components/index.ts` barrel (re-export `FormRenderer` from the package or update importers)
- Delete: any now-empty dirs / orphaned re-export shims the moves left behind

**Interfaces:**
- Consumes: `FormTransport`, `FormTransportProvider`, `FormNavigation`, `FormNavigationProvider`, `FormRenderer`, `useStepGuard`, model + storage + submission from `@govtech-bb/form-renderer`.
- Produces: unchanged app behaviour.

- [ ] **Step 1: Implement the app transport** `apps/forms/src/lib/transport.ts`

```ts
import type { FormTransport } from "@govtech-bb/form-renderer";
import { postFormSubmission } from "./api/forms";
import { uploadFile } from "./api/files";

export const formTransport: FormTransport = {
  submit: ({ formMeta, valuesBySteps, previewToken }) =>
    postFormSubmission(formMeta, valuesBySteps, previewToken),
  uploadFile: (args) => uploadFile(args),
};
```

(Confirm `postFormSubmission`/`uploadFile` param order against `api/forms.ts:256` and `api/files.ts:158`; adapt the adapter if names differ.)

- [ ] **Step 2: Build the app navigation** in `apps/forms/src/routes/forms/$formId/index.tsx`. Using the route's existing `useNavigate`, create:

```tsx
const routeNavigate = useNavigate({ from: "/forms/$formId/" });
const navigation: FormNavigation = {
  goToStep: (stepId) =>
    routeNavigate({ search: (prev) => ({ ...prev, step: stepId }) }),
};
```

(Match the exact `search` shape the route currently uses for `step` — read the current `navigate` calls to preserve preview/draft params.)

- [ ] **Step 3: Wrap the render tree** with both providers:

```tsx
<FormTransportProvider transport={formTransport}>
  <FormNavigationProvider navigation={navigation}>
    <FormRenderer
      form={form}
      formMeta={formMeta}
      stepId={step ?? ""}
      visibleSteps={visibleSteps}
      repeatableStepSettingsRef={repeatableStepSettingsRef}
      submissionState={submissionState}
      isDraft={isDraft}
      previewToken={preview}
      draftToken={draft}
      allowedPaymentOrigins={/* host value from api env, per Task 9 */}
    />
  </FormNavigationProvider>
</FormTransportProvider>
```

- [ ] **Step 4: Repoint all remaining app imports** to `@govtech-bb/form-renderer`: `FormRenderer` (was `@forms/components`), `useStepGuard` (was `../hooks/use-step-guard`), model helpers still via `@forms/lib` (which now re-exports the package — OK), session-storage, submission-outcome. Update `apps/forms/src/components/index.ts` to re-export `FormRenderer` from the package if other app code imports it from `@forms/components`.

- [ ] **Step 5: Remove orphans.** Delete any files/dirs the moves left empty and any re-export shim no longer needed. Only remove code the moves orphaned — do not touch unrelated app code.

- [ ] **Step 6: Full build + all forms tests**

Run: `pnpm exec nx run forms:build`
Run: `pnpm exec nx run forms:test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(forms): render via @govtech-bb/form-renderer with app-provided transport and navigation"
```

---

## Task 12: Whole-repo verification + live parity

**Files:** none (verification only).

- [ ] **Step 1: Build everything except landing**

Run: `pnpm exec nx run-many -t build --exclude=landing`
Expected: all projects compile (this is the CI gate).

- [ ] **Step 2: Run the full test suite**

Run: `pnpm exec nx run-many -t test`
Expected: PASS across projects.

- [ ] **Step 3: Run the forms live-smoke + a11y suites** against `apps/forms` (unchanged assertions).

Run: `pnpm exec nx run forms:test` plus the playwright smoke/a11y as configured (`apps/forms/playwright.smoke.config.ts`, `playwright.a11y.config.ts`) per the repo's usual invocation.
Expected: PASS — this proves zero behaviour change.

- [ ] **Step 4: Manual parity drive** (use the `verify` skill / `run` skill): start `apps/forms`, complete a multi-step form with a conditional field, a file upload, and (if available) a paid form to the confirmation screen; confirm `sessionStorage` persistence across `?step=` navigation still works. Observe behaviour, don't just trust tests.

- [ ] **Step 5: Grep for leftover coupling** — confirm the package has no Vite/SSR-unsafe references:

Run: `grep -rn "import.meta" packages/form-renderer/src` → expected: no matches.
Run: `grep -rn "sessionStorage\.\|window\.\|document\." packages/form-renderer/src | grep -v "typeof window"` → expected: only guarded uses remain.

- [ ] **Step 6: Final commit (if any cleanup)**

```bash
git add -A
git commit -m "chore(form-renderer): phase 0 verification cleanup"
```

---

## Self-review notes (coverage against the design spec)

- **Extract renderer + build pipeline + hooks + storage + submission-outcome** → Tasks 2–5, 8–10. ✔
- **Injected transport (fetch/submit/presign)** → Tasks 6, 8 (file-upload), 11 (app impl). Note: `fetchContract`/query stay in the app (Vite `import.meta.env`); submit + upload are injected. Contract build (`buildForm`/`mapContractToLocale`) is package code the app's query layer calls. ✔
- **SSR-safe** → Task 5 (storage guards), Task 10 (`window.scrollTo` guard + SSR smoke test), Task 12 grep gate. ✔
- **`apps/forms` consumes it, zero behaviour change** → Task 11 + Task 12 smoke/a11y/manual parity. ✔
- **Buildable + referenced package** → Task 1 (`project.json`), Task 2 (`references` in `apps/forms/tsconfig.json`). ✔
- **Router coupling removed** → Task 7 + rewires in Tasks 9–11. ✔

**Open items the executor must resolve by reading file bodies (concrete transformations, not placeholders):** the form-model vs app-only type split (Task 2 Step 1), the analytics move-vs-inject branch (Task 9), the `safe-payment-url` prop threading (Task 9), and the exact `search` shape for navigation (Task 11). Each has a defined decision rule and a defined resulting interface.
