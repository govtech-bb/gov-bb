# Registry rename: `raw-*` → `generic-*` primitives

**Date:** 2026-05-29
**Branch:** feat/registry-generic-rename (worktree, branched off `sandbox`)
**Issue:** [#415](https://github.com/govtech-bb/gov-bb/issues/415)
**Plan:** [docs/plans/registry-rename-raw-to-generic.md](../plans/registry-rename-raw-to-generic.md)
**Supersedes naming from:** [2026-05-28-raw-primitive-components-session-1.md](2026-05-28-raw-primitive-components-session-1.md)

## What was done

Renamed the 10 `raw-*` registry primitives to `generic-*` — "generic" carries
more semantic meaning than "raw" for these minimally-opinionated primitives. No
behaviour change, no new components, no schema change, count unchanged at 44.

Three concerns kept in lockstep:

1. **Files** — `git mv raw-*.ts → generic-*.ts` (×10) plus
   `raw-primitives.spec.ts → generic-primitives.spec.ts`, so history follows.
2. **Symbols + ids** — `RawText → GenericText`, `fieldId: "raw-text" →
   "generic-text"`, etc.
3. **Refs** — `index.ts` (export/import/`PRIMITIVES` blocks), the spec's
   id-list and describe label, and the 10 `"ref": "components/raw-*"` strings
   in the two `smart-stream-vendor-registration` recipes (`1.1.0.json`,
   `1.1.1.json`).

**Id form is hyphen** (`components/generic-text`), deliberately *not* the
slash namespace of DB components (`components/generic/text`). The registry
primitives and the slash-namespaced `custom_components` DB entries are distinct
systems; the hyphen keeps them visibly separate.

## Why it looks the way it does

**`raw-date` became `GenericDateInput`, not `GenericDate` — the one deviation
from the mechanical pattern.** The plan verified there was no *id* collision
(`date.ts` has `fieldId: "date"` → `components/date`, distinct from the new
`generic-date`) but missed a *symbol* collision: `date.ts` already exports a
const named `GenericDate`. A mechanical `RawDate → GenericDate` rename would
have put two `GenericDate` bindings into the single barrel `index.ts`
(import + re-export from both `./date` and `./generic-date`) — a duplicate
identifier, `TS2300/TS2308`, build failure. Resolution (confirmed with Isaiah):
the renamed primitive's exported symbol is **`GenericDateInput`**; its
`fieldId` is still `generic-date`. `date.ts` was left untouched — renaming an
out-of-scope named component to free up the bare `GenericDate` name was the
larger-blast-radius alternative and was rejected. The diff shows the
`GenericDateInput` name but not *why* it isn't `GenericDate`; that's this note.

**No api-side mirror to update — the blast radius shrank since Session 1.**
Session 1 (2026-05-28) had to maintain a hand-written per-file mirror at
`apps/api/src/registry/builtins/components/raw-*.ts` because `apps/api` built
its own `BUILTIN_REGISTRY` and did not import `@govtech-bb/registry`. That
mirror is **gone** — commit `fe2045c` ("bundle @govtech-bb/registry in runtime
image") refactored the API to import `BUILTIN_REGISTRY` directly from the
package (`apps/api/src/registry/registry.service.ts:6`). So this rename
propagates to the API automatically; the only API-side edits were the two
recipe JSONs. Verified the built `BUILTIN_REGISTRY` map now carries all ten
`components/generic-*` keys and zero `components/raw-*`.

**`routeTree.gen.ts` churn was excluded from the commit.** `nx build`/`test`
rewrites `apps/forms/src/routeTree.gen.ts` in raw-generator style (memory note
`project_routetree_gen_churn`); an early `git add -A` swept it in. Reverted with
`git checkout` before committing — it is not part of this change.

## Verification

| Command | Result |
|---------|--------|
| `pnpm exec nx run-many -t build --exclude=landing` | 13 projects green (landing excluded per `project_landing_build_network_dep`) |
| `pnpm exec tsc -b` | Clean (CI Type Check parity, `project_ci_typecheck_tsc_build`) |
| `pnpm exec nx test registry` | 16/16 (renamed `generic-primitives.spec.ts` + `builtin-registry.spec.ts`) |
| `pnpm exec nx test api` | 608 passed, 1 pre-existing skip |
| `pnpm exec nx test form-builder-app` | 189/189 (run-many flake `project_form_builder_app_test_flaky`; passes in isolation) |
| Recipe resolution probe | Both recipes' refs resolve against built `REGISTRY_COMPONENTS` / `BUILTIN_REGISTRY`; `components/generic-date` and `components/date` coexist as distinct keys → no `onModuleInit` boot crash |
| Sanity grep | No `raw-*` / `Raw*` left in registry source or recipes |

## Key files

| File | Change |
|------|--------|
| `packages/registry/src/components/{raw → generic}-*.ts` (×10) | Renamed; symbol `Raw* → Generic*`, `fieldId raw-* → generic-*` |
| `packages/registry/src/components/generic-date.ts` | Symbol is `GenericDateInput` (collision avoidance), `fieldId: "generic-date"` |
| `packages/registry/src/components/index.ts` | Export/import/`PRIMITIVES` blocks updated; `_componentCount` stays `44` |
| `packages/registry/src/components/generic-primitives.spec.ts` | Renamed; id list, describe/it labels updated |
| `apps/api/.../smart-stream-vendor-registration/{1.1.0,1.1.1}.json` | `components/raw-* → components/generic-*` (text, email, radio) |

## Follow-on

- [#416](https://github.com/govtech-bb/gov-bb/issues/416) depends on this
  (memory note `reference_generic_db_components_resolution`): it repoints 11 of
  16 slash-namespaced `components/generic/*` DB components onto these registry
  `generic-*` primitives. Unblocked once #415 merges.
