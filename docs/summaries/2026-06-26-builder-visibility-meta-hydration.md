# Form builder showed "public" for preview-gated forms — hydrate `meta` from the published recipe

**Date:** 2026-06-26
**Branch:** `worktree-fix-builder-visibility-meta-hydration` → merges into `sandbox`
**Issue context:** defect in Recipe visibility Phase 2 (#1682); affects the #1517 flagged forms

## What

`apps/form_builder/app/server/forms.ts` (`resolveStoredRecipe`) now backfills a
recipe's `meta` from the published flat file when the preferred DB scratch row
has none. The builder's visibility control (`getRecipeVisibility`) therefore
shows a form's true launch-gate value instead of defaulting to "public". Four
tests added in `forms.spec.ts`. No other files changed.

## Why

The symptom: `apply-for-conductor-licence` (and four other #1517-flagged forms)
showed visibility **"public"** in the builder even though their published recipe
sets `meta.visibility: "preview"`.

The read chain — form_builder_api ↔ DB ↔ server fn ↔ `deserializeRecipe` ↔
reducer ↔ toolbar — was verified end-to-end and preserves `meta` everywhere, so
this was **not** a code defect in the load chain. It was a data divergence:

- `getRecipe` → `resolveStoredRecipe` prefers the **DB scratch row** over the
  published flat file (#1196) and returns it raw.
- The five forms' `meta.visibility: "preview"` was written **straight into the
  published flat files** in #1676 (commit `258ee2ac`), bypassing the builder's
  save flow — so their DB scratch rows never received `meta`.
- With no `meta` on the preferred row, `getRecipeVisibility` fell back to its
  `"public"` default.

The obvious alternative (the GitHub default branch lacking the meta) was ruled
out: the default branch is `sandbox`, and `origin/sandbox`'s flat file does
carry `meta.visibility: "preview"`. The only way to see "public" is a lingering
DB row without `meta`.

The fix hydrates `meta` from the published recipe **only when the working copy
is silent** (`draft.meta === undefined`), so an author's in-progress visibility
edit always wins and a never-deployed draft stays metaless (→ public). See
ADR-0059 for the principle: launch-gate visibility is sourced from the published
recipe; #1196's "DB scratch wins" is scoped to content.

## Notes

- **Why in `resolveStoredRecipe`, not `getRecipe`:** the hydration belongs in the
  one place that knows "this is the DB draft and it lacks meta." Doing it in
  `getRecipe` would re-fetch the published file even in the published-fallback
  case (which already fetched it).
- **Accepted minor cost:** `resolveStoredRecipe` is also reached on the save path
  via `restoreSecretsForSave`, so a save that both carries a redacted secret and
  has a metaless draft now triggers one extra published-recipe fetch whose result
  is discarded (the secret-restore reads only `processors`). Rare and harmless;
  not worth a suppression flag.
- **Not addressed here:** the five stale DB rows themselves are left as-is — the
  builder now reads correctly regardless, and the next builder save/deploy
  re-syncs `meta` into the row. A one-off DB backfill was considered and declined
  in favour of the robust load-time fix.
- Verified via `form-builder-app:test` (full suite green, incl. the 4 new tests),
  `form-builder-app:build`, and `tsc -b` (exit 0). `form-builder-app:lint` is
  pre-existing-red on sandbox; the gate is build + tests.
