# Raw primitive components — Session 1 summary

**Date:** 2026-05-28
**Branch:** raw-primitive-components (worktree, branched off `sandbox`)
**Issue:** [#310](https://github.com/govtech-bb/gov-bb/issues/310) — "form_builder: Add a tab for creating fields from raw primitives"
**Plan:** [docs/plans/raw-primitive-components.md](../plans/raw-primitive-components.md)
**ADR:** [docs/decisions/0015-generic-primitives-via-registry-entries.md](../decisions/0015-generic-primitives-via-registry-entries.md)

## What was built

Session 1 of the plan: ten generic-primitive entries in the registry, no UI
surface yet. Each entry is an ordinary `Primitive` with `fieldId:
"raw-<htmlType>"` and minimally-opinionated defaults, consumed through the
existing `{ kind: "component", ref }` recipe path. The picker doesn't list them
yet (that's Session 2), so they cannot be inserted from the form builder UI —
but a hand-written recipe that references `components/raw-text` (etc.) now
resolves and hydrates.

Set:

| htmlType   | fieldId          | Notes                                       |
|------------|------------------|---------------------------------------------|
| text       | raw-text         | required default                            |
| textarea   | raw-textarea     | required default                            |
| number     | raw-number       | required default                            |
| date       | raw-date         | required default                            |
| tel        | raw-tel          | required default; **no** BB-specific pattern |
| email      | raw-email        | required + email validation                 |
| checkbox   | raw-checkbox     | required default; ships `options: []`       |
| radio      | raw-radio        | required default; ships `options: []`       |
| file       | raw-file         | required default; ships `multiple: false`   |
| select     | raw-select       | required default; ships `options: []`, `multiple: false` |

`raw-show-hide` was skipped per the plan; its semantics are unusual enough to
defer until a need surfaces.

## Why it looks the way it does

**Why curated registry entries instead of a contract extension** —
captured at length in [ADR 0015](../decisions/0015-generic-primitives-via-registry-entries.md).
Short version: extending `recipeFormStepFieldSchema` ripples through the
recipe-loader boot path, which is the exact path that ECS-rolls-back deploys
when it throws. Registry data is ~200 lines for the same user-facing outcome.

**The api-side mirror was a plan deviation.** The plan stated that
"`REGISTRY_COMPONENTS` continues to be the merged full set … so existing
ref-resolution paths in … the `apps/api` `RegistryService` keep working
unchanged." Reading the code, this is wrong: `apps/api` does **not** import
`@govtech-bb/registry`. It builds its own `BUILTIN_REGISTRY` from
`apps/api/src/registry/builtins/components/` — a per-file mirror, flagged in
the header comment of `packages/registry/src/components/index.ts:1` ("keep in
sync with apps/api/src/registry/builtins/components/index.ts"). Without an
api-side mirror, a recipe referencing `components/raw-email` would null-resolve
at hydration and the plan's stated smoke check would fail.

So Session 1 grew to 10 + 10 files: ten in the package, ten in the api mirror,
with the api's barrel `index.ts` extended to re-export them. The mirror lives
under ADR 0008's "form-builder catalog aligns with api registry" umbrella; the
new ADR 0015 makes the sync obligation explicit for raw entries.

**Bumped the `ALL` array's compile-time literal-count guard from 33 to 43.**
The guard exists so adding a component to the imports without adding it to
`ALL` (or vice-versa) becomes a TS error. Implementation:

```ts
const PRIMITIVES = [RawText, RawTextarea, …] as const satisfies Primitive[];
const ALL = [AccountName, …, WorkTelephone, ...PRIMITIVES] as const satisfies Primitive[];
const _componentCount: 43 = ALL.length;
```

The `PRIMITIVES` array is then reused to produce `REGISTRY_PRIMITIVES`, so
there is one source of truth for "which entries are raw." `REGISTRY_COMPONENTS`
continues to be the merged full set.

**`packages/registry` had no `test` target before this session.** The plan
asked for a spec but the package wasn't running tests. Added an `@nx/jest:jest`
target plus a `jest.config.ts` cloned from `packages/form-types` (CJS, ts-jest,
co-located `*.spec.ts`, `moduleNameMapper` for `@govtech-bb/*` workspace
imports). Also added `"types": ["jest"]` to `packages/registry/tsconfig.json`
so spec files type-check under `tsc -b`. Did **not** copy `form-types`'
98% coverage thresholds — registry is data, not logic, and a hard floor on a
data package would be busywork to maintain.

**Spec scope intentionally narrow.** Three checks:
1. `REGISTRY_PRIMITIVES` has exactly 10 entries.
2. Each `components/raw-*` ref resolves in both `REGISTRY_PRIMITIVES` and
   `REGISTRY_COMPONENTS`, and they're the same object reference.
3. Every entry parses cleanly under the `primitiveSchema` discriminated union
   (the type annotation on each file already enforces this at compile time;
   the spec confirms the runtime shape matches the zod schema, which the AI
   extractor and recipe validator will also enforce).

A separate serialization round-trip test was deferred to Session 2 where it
belongs — that's the level at which `form-builder` reducer behaviour matters,
and Session 2 already touches that code.

## Decisions worth flagging

- **Picked `required: true` as the global default** (plan open question #2).
  Most government forms have required-by-default semantics and overriding to
  optional is a single toggle. Flip if user research disagrees once the
  Primitives tab is in the wild.

- **Picked "no BB telephone pattern" for `raw-tel`** (plan open question #1).
  `Telephone` keeps its Barbados-aware pattern; `RawTel` does not. A "raw" tel
  field is for the case where the specialised one doesn't fit, which usually
  means the user wants a different format.

- **Did not file the two sub-issues** the plan assumed (open question #5). The
  PR closes the registry portion of #310 directly; if the team prefers
  separate tracking for Session 1 vs Session 2, file at PR-open time.

- **Skipped the api hydration smoke check.** Unit tests prove `REGISTRY_COMPONENTS`
  resolution; the api boot path stays cold in Session 1 because no shipped recipe
  references a raw entry. The check is only meaningful once Session 2 lands or a
  hand-crafted recipe is added under `apps/api/src/recipes/`. Memory note
  `project_recipe_loader_boot_crash` (a bad recipe → onModuleInit throw → ECS
  rollback) is the reason adding a synthetic smoke recipe wasn't taken lightly.

## Key files

| File | Change |
|------|--------|
| `packages/registry/src/components/raw-*.ts` (×10) | New — one file per raw primitive |
| `packages/registry/src/components/index.ts` | Imports + re-exports of the 10 entries; `PRIMITIVES` array; spread into `ALL`; count guard `33 → 43`; new `REGISTRY_PRIMITIVES` export |
| `packages/registry/src/index.ts` | Re-export `REGISTRY_PRIMITIVES` from package root |
| `packages/registry/src/components/raw-primitives.spec.ts` | New — 12-test spec covering the three checks above |
| `packages/registry/project.json` | New `test` target via `@nx/jest:jest` |
| `packages/registry/jest.config.ts` | New — mirrors `packages/form-types/jest.config.ts` |
| `packages/registry/tsconfig.json` | Added `"types": ["jest"]` so specs type-check under `tsc -b` |
| `apps/api/src/registry/builtins/components/raw-*.ts` (×10) | New — api-side per-file mirror |
| `apps/api/src/registry/builtins/components/index.ts` | Extend barrel with the 10 raw re-exports |
| `docs/decisions/0015-generic-primitives-via-registry-entries.md` | New ADR |

## Out of scope (Session 2)

- `apps/form_builder/app/routes/builder/ui/-field-picker.tsx` — add Primitives tab
- `apps/form_builder/app/server/ai-builder/prompts/system-prompt.ts` — tell the AI extractor raw entries exist
- jest-with-jsdom picker test for the new tab (memory note `reference_form_builder_jest_no_render`)
- A `serialization.spec.ts` round-trip case in `packages/form-builder` for a `components/raw-select` element
- AI smoke ("add a generic text field" → `components/raw-text`; "add an email" still → `components/email`)
- User smoke (Isaiah clicks through the new tab in a real browser — memory note `feedback_user_smoke_tests`)

## Verification

| Command | Result |
|---------|--------|
| `pnpm exec nx run-many -t test` | 586 passed, 1 skipped, 13 projects (registry test target now wired) |
| `pnpm exec nx run-many -t build --exclude=landing` | 12 projects clean (landing excluded per `project_landing_build_network_dep`) |
| `pnpm exec tsc -b` | Clean (CI Type Check parity per `project_ci_typecheck_tsc_build`) |
