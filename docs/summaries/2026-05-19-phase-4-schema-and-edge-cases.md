# Phase 4 — Schema and Edge-Case Coverage

**Branch:** `testing/coverage`  
**Commits:** `8173afd`, `b2453b3`, `59b9653`

## Context

Phase 3 added the first React unit tests for the web app and pushed its coverage from ~22% to ~24% statements. Phase 4 closes the remaining planned gaps: Zod schema coverage in `form-types`, edge-case paths in `form-conditions` and `form-validation`, and the two remaining untested API files (`form-definitions` controller, response interceptor).

## What we did

**New spec files:**

- `packages/form-types/src/form-step.type.spec.ts` — `formStepSchema` (required/optional fields, missing fields), `recipeFormStepSchema` (ref elements, plain primitive rejection, structural validation), `stepConditionalOnBehaviourSchema` (valid condition, missing operator, invalid operator value).

- `packages/form-types/src/form-field.type.spec.ts` — `primitiveSchema` discriminated union. All 11 `htmlType` variants tested with required fields. Variant-specific required fields validated: `checkbox`/`radio` require `options`, `select` requires `options` + `multiple`, `file` requires `multiple`. Common rejections: missing `fieldId`, missing `label`, missing `htmlType`, unknown `htmlType`.

- `apps/api/src/forms/form-definitions/form-definitions.controller.spec.ts` — `getAll` and `get` called directly. Covers the `version`-absent and `version`-present branches, plus error propagation.

- `apps/api/src/common/response.interceptor.spec.ts` — `intercept` tested via `lastValueFrom` on the returned Observable. Covers: data without `statusCode` passes through unchanged; data with `statusCode` calls `res.status()`; null data does not throw.

**Extended spec files:**

- `packages/form-types/src/service-contract.type.spec.ts` — added `dateTimeFormatSchema` (UTC, offset, milliseconds, date-only rejection, plain string rejection) and `serviceContractRecipeSchema` (component ref elements, plain primitive element rejection, missing `formId`, malformed `createdAt`).

- `packages/form-conditions/src/index.spec.ts` — added two edge cases: empty `steps` array returns empty sets without throwing; unknown operator string returns `false` without throwing (the `default` branch in `evaluateCondition`'s switch).

- `packages/form-validation/src/index.spec.ts` — unknown rule key in `validations` is silently skipped (`RULE_REGISTRY[type]` is `undefined` → `continue`), field remains valid.

- `packages/form-validation/src/rules/date.spec.ts` — `afterRunner` when the referenced field resolves to a non-date string: `parseDate` returns null, runner returns the error message rather than throwing.

- `packages/form-validation/src/rules/file.spec.ts` — `fileTypesRunner` with a mixed batch (first file passes, second fails): returns the error on the first failing file.

- `packages/form-validation/src/rules/number.spec.ts` — `gtRunner` when the referenced field is a non-numeric string: `Number("not-a-number")` = `NaN`, `z.number().gt(NaN)` always fails, runner returns the error message rather than throwing.

**Schema fix:**

`packages/form-types/src/form-step.type.ts` — `recipeFormStepFieldSchema` changed from `z.discriminatedUnion("ref", [...])` to `z.union([...])`. Zod v4 requires literal types for discriminated union discriminators; the two ref variants used `z.string().regex(...)`, which caused `safeParse` to throw an unhandled `"Invalid discriminated union option at index 0"` error rather than returning `{ success: false }`. The switch to `z.union` has no semantic impact — both variants are still matched correctly via Zod's standard union fallback logic — but eliminates the throw.

**Threshold updates:**

All five workspaces tightened to sit ~2 points below measured actuals after Phase 4:

| Workspace | Metric | Before | After (threshold) | Actual |
|---|---|---|---|---|
| form-types | statements | 50 | 58 | 60.15% |
| form-types | branches | 50 | 98 | 100% |
| form-conditions | functions | 90 | 98 | 100% |
| form-validation | branches | 86 | 88 | 90.15% |
| api | statements | 78 | 79 | 81.08% |
| api | functions | 68 | 70 | 71.74% |
| web | functions | 7 | 8 | 8.46% |
| web | branches | 10 | 11 | 11.74% |

## Why we did it that way

**`z.union` over `z.discriminatedUnion` for regex-matched fields** — the original intent was to use the faster `discriminatedUnion` path (O(1) lookup vs O(n) union fallback). With only two variants this makes no practical difference, and `z.union` is the only option when discriminators aren't literals. Any future addition of a third ref prefix (e.g. `blocks-v2/`) should continue using `z.union`.

**Controller methods called directly** — same rationale as Phase 2: the `FormDefinitionsController` is a thin delegation layer. Calling methods directly is simpler than standing up a NestJS HTTP adapter, and the behaviour under test is the delegation and response wrapping, not HTTP transport.

**`lastValueFrom` for interceptor tests** — `ResponseInterceptor.intercept` returns an `Observable`. `lastValueFrom` from RxJS converts it to a Promise, which Jest can await natively without a custom subscriber. This avoids `done` callbacks or manual subscription teardown.

**`packages/form-types/tsconfig.json` types addition** — `tsconfig.json` includes `src/**/*.ts`, which now covers spec files that reference Jest globals. Adding `"types": ["jest"]` satisfies `tsc` without creating a separate Jest-specific tsconfig (unlike the web app, which needed `tsconfig.jest.json` for the JSX/ESM incompatibility — that problem doesn't exist in the Node-only `form-types` package).

## Coverage after Phase 4

| Workspace | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| form-types | 60.15% | 100% | 6.52% | 61.78% |
| form-conditions | 94.93% | 86.79% | 100% | 97.26% |
| form-validation | 94.75% | 90.15% | 96% | 97.26% |
| api | 81.08% | 63.9% | 71.74% | 80.56% |
| web | 23.61% | 11.74% | 8.46% | 21.03% |

The low function coverage in `form-types` (6.52%) reflects that the package exports mostly Zod schema objects and inferred types — there are very few runtime functions to cover. The statements/lines numbers are more meaningful and sit at ~60%, gated by the many unexported internal schema helpers that `safeParse` exercises indirectly.
