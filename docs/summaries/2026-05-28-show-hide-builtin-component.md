# registry: promote `show-hide` to a first-class builtin component

## Context

Implemented from `docs/plans/show-hide-builtin-component.md` on branch
`feat/show-hide-builtin` (merges into `sandbox`). Issue
[#367](https://github.com/govtech-bb/gov-bb/issues/367); follow-up registry
consolidation is [#369](https://github.com/govtech-bb/gov-bb/issues/369).

Published forms reference a show/hide toggle that today only resolves if a
matching `custom_components` DB row exists. The goal: make it a real builtin so
forms hydrate without depending on that row, and retire the legacy
`components/generic/show-hide` ref in favour of a clean `components/show-hide`.

## What we did

- **Three registries, identical builtin.** `components/show-hide` now resolves
  in all three places that matter:
  - `packages/registry/src/components/show-hide.ts` (source of truth) — wired
    into `index.ts` (export + import + `ALL`), and the compile-time
    `_componentCount` guard bumped 43 → 44.
  - `apps/api/src/registry/builtins/components/show-hide.ts` (the **live prod
    resolver** — `RegistryService.resolve()` only consults this local
    `BUILTIN_REGISTRY` + the `custom_components` cache, never
    `@govtech-bb/registry`) + export in the components `index.ts`.
  - `packages/form-builder/src/builtins/components/show-hide.ts` — a
    `ComponentDefinition` wrapper (`showHideComponent`) added to
    `BUILTIN_COMPONENTS`, so authors can place the toggle from the builder
    palette.
  The api + registry copies are byte-identical `ShowHidePrimitive` definitions
  (`fieldId: "show-hide"`, `htmlType: "show-hide"`, `label: "Show more"`, no
  validations — the toggle is not a validated field). `ShowHidePrimitive`
  already existed in `@govtech-bb/form-types`; no type work needed.
- **Retired `generic/show-hide` in 9 recipes.** For each affected recipe, added
  a new bumped version file (copy of the current latest, `version` bumped to
  match the filename, every `components/generic/show-hide` → `components/show-hide`).
  Old files kept as version history.

  | Recipe | New version |
  |---|---|
  | apply-for-conductor-licence | 1.3.0 |
  | cape-exam-registration-2024 | 1.2.0 |
  | csec-private-candidate-registration | 1.2.0 |
  | get-birth-certificate | 1.1.0 |
  | homeschooling-application-2024 | 1.2.0 |
  | jobstart-plus-programme | 1.1.0 |
  | primary-school-textbook-grant | 1.1.0 |
  | sell-goods-services-beach-park | 1.1.0 |
  | term-leave-application | 1.2.0 |

- **Tests** — extended `apps/api/src/registry/registry.service.spec.ts`:
  `resolve("components/show-hide")` returns the builtin (fieldId + htmlType), and
  `hydrateForm` applies `label`/`hint`/`fieldId` overrides onto a show-hide ref.
  Written RED first (confirmed failing with `UnresolvableComponentError`/null),
  then GREEN.

## Why we did it that way

- **All three registries, not just the source of truth.** Prod
  `RegistryService` never consults `@govtech-bb/registry`, so adding it only
  there would have left prod broken. The api/registry duplication is the
  deliberate, temporary state that #369 removes; the form-builder palette entry
  is a separate authoring-UX concern that stays.
- **Conductor jumps 1.0.0 → 1.3.0** to clear its known published DB row (1.2.0)
  so the fixed recipe also wins the dev/preview `"both"` higher-semver
  comparison. In **prod** the version target doesn't matter —
  `FormDefinitionsService.source()` forces `"files"`, so the file's latest
  version is authoritative regardless (issue #145). The other 8 single-step
  bumps assume file version == published DB version (confirmed acceptable with
  Isaiah); if any DB version turns out higher, only dev/preview would lag.
- **No alias for the legacy ref.** The goal is retirement, not compatibility.
  Bumping recipe versions makes the fixed recipe win resolution; the old files
  stay as dormant history.

## What we almost got wrong / discoveries

- **Real recipes still depend on `custom_components` DB rows.** The 9 recipes
  reference many *other* `components/generic/*` refs (radio, number, text,
  signature, table, date-input, file-upload, repeater, checkbox, textarea) that
  resolve via the DB cache, not builtins. So a clean builtins-only full-recipe
  hydration test isn't feasible (those refs throw regardless of show-hide) —
  this confirmed the plan's scope was correctly narrow: only show-hide is
  promoted here, the broader generic-ref migration is #369. The synthetic
  resolve + override-hydration tests are the coverage; a recipe-data regression
  guard was considered and declined (ship-as-is).
- **Old version files keep the legacy ref** — requesting an old version
  explicitly (`?version=1.0.0`) will now throw `UnresolvableComponentError`
  since `generic/show-hide` resolves nowhere. Accepted tradeoff (plan Decisions).
- Ran `pnpm install` in the worktree (symlinked `node_modules` breaks `tsc -b`),
  and reverted the spurious `apps/forms/src/routeTree.gen.ts` churn that nx
  build/test regenerates.

## Verification

- `nx run-many -t build --exclude=landing` → 12 projects compile.
- `tsc -b` → clean (the `_componentCount: 44` literal is a type-level assertion).
- `nx test api --testFile=registry.service.spec.ts` → new show-hide tests pass.
- Full `nx run-many -t test` → all suites pass; `form-builder-app:test` flagged
  flaky under run-many but passes on direct re-run (188/188).

## Open questions

- **Published DB versions for the 8 non-conductor forms** — assumed equal to the
  single file version present today. Only affects dev/preview resolution; prod
  is correct regardless. Confirm if any form misbehaves in preview.
