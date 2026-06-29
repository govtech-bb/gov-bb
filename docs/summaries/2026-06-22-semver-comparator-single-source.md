# Single-sourced the recipe-version semver comparator into `@govtech-bb/form-types`

## Context

This is PR1 of a three-PR consolidation (issue [#1395](https://github.com/govtech-bb/gov-bb/issues/1395) / DUP-02, grouped with #1397 and #1399 under
`docs/plans/1395-dup-form-types-contract-consolidation.md`). An `apps/`
duplication audit found the recipe-version comparator — the single most
load-bearing ordering operation in the platform (selecting the latest published
recipe) — implemented **four** ways with divergent edge-case semantics:

- `apps/api/.../recipe-file-loader.service.ts` — `parseVersion` (`-Infinity`
  fallback) + `compareSemver` (pad-and-compare).
- `apps/form_builder/app/server/github-recipes.ts` — a **byte-identical** copy.
- `apps/form_builder/app/lib/version.ts` — `compare()` destructured only **3**
  segments via `.map(Number)`, so it returned `NaN` for 4-segment / non-numeric
  versions and had no `-Infinity` guard. This file also owned
  `validate`/`bumpMinor`/`bumpPatch`.
- `apps/form_builder_api/src/routes/form-uniqueness.ts` — raw SQL
  `ORDER BY string_to_array(version,'.')::int[] DESC`.

The real bug: for an odd version string, the prod-serving path and the
builder-publish path could select a **different** "latest" version.

Worked in worktree `worktree-dup-02-semver-form-types` (branch targets
`sandbox`).

## What we did

- **New canonical source** `packages/form-types/src/semver.ts` — `compareSemver`
  (the `-Infinity` pad-and-compare impl), `validate`, `bumpMinor`, `bumpPatch`.
  Exported from `packages/form-types/src/index.ts`. `validate` reuses the
  in-package `SEMVER_PATTERN` rather than re-inlining the regex.
- **`packages/form-types/src/semver.spec.ts`** (TDD, written first) — covers the
  edge cases the old 3-segment `compare` got wrong: `1.10.0 > 1.2.0`, 4-segment
  ordering both directions, a non-numeric tag sorting below any valid version,
  and a `reduce`-to-latest agreement check across mixed strings.
- **`apps/api`** — `recipe-file-loader.service.ts` dropped its local
  `parseVersion`/`compareSemver`; `form-definitions.service.ts` now imports
  `compareSemver` from `@govtech-bb/form-types` directly (removed the
  indirection that re-exported it through the loader).
- **`apps/form_builder`** — `lib/version.ts` is now a thin re-export of the
  canonical four (this **deletes the 3-segment divergence**). `-submit-modal.tsx`
  and `server/forms.ts` swapped `compare` → `compareSemver` (killing the alias).
  `server/github-recipes.ts` dropped its byte-identical copy and imports
  `compareSemver` from `lib/version`; `server/publish.ts` (which previously
  imported *two* comparators) now gets `compareSemver` from `lib/version`.
- **`apps/form_builder_api`** — `form-uniqueness.ts` SQL ordering left as-is,
  now commented as the one deliberate DB-side copy, pointing at the canonical
  comparator.

## Why it looks this way

- **form-types is the right home.** It already owns the recipe contract
  (`ServiceContractRecipe`, `KEBAB_ID_PATTERN`, `SEMVER_PATTERN`) and is already
  a dependency of api/form_builder/form_builder_api, so no new package edge or
  project-reference was introduced — the consolidation is a pure symbol add.
- **The SQL copy stays, deliberately.** Re-implementing semver ordering in SQL
  is the correct DB-side approach; the `int[]` cast matches the TS comparator's
  numeric segment-wise semantics. It's commented as the single permitted second
  copy rather than removed.
- **The name divergence was removed, not papered over.** Two call sites used
  `compare` (one aliased `compare as compareSemver`); both now use the canonical
  `compareSemver`. One name, one impl.
- **Behavior change is real but safe.** `-submit-modal.tsx` and `forms.ts`
  previously used the lenient 3-segment `compare` (NaN on odd strings); they now
  use the robust canonical comparator. Identical for well-formed `X.Y.Z`, and
  the modal site is guarded by `validate()` before the compare runs, so
  malformed input is unreachable there. The api and form_builder-server sites
  already used the pad-and-compare variant, so for them the swap is a behavioral
  no-op.
- **`bumpMinor`/`bumpPatch` moved too** (not just `compareSemver`) so the whole
  version vocabulary has one source; `form_builder/app/lib/version.spec.ts`
  still exercises them through the re-export, which incidentally verifies the
  re-export wiring resolves.

## Verification

- Tests green: `form-types`, `forms`, `api`, `form-builder-app`,
  `form-builder-api`, `form-builder` (form-types branch coverage 100%).
- `pnpm exec nx run-many -t build --exclude=landing,cms` — 13 projects build.
- `pnpm exec tsc -b` — exit 0.

PR2 (#1397, MdaContact) and PR3 (#1399, wire types) follow in separate PRs.
