# Align form recipe IDs with frontend-alpha schema filenames — Session Summary

**Date:** 2026-06-03
**Branch:** worktree-620-align-recipe-ids (merging into `sandbox`)
**Issue:** [govtech-bb/gov-bb#620](https://github.com/govtech-bb/gov-bb/issues/620)
**PR:** (to be opened against `sandbox`)

## What was built

Two form recipes were renamed so their `formId` matches frontend-alpha's
`src/schema/` filename — the authoritative ID convention. No functional change
to the forms themselves.

| Form | Old ID | New ID |
|---|---|---|
| Fire service inspection | `request-fire-inspection` | `request-a-fire-service-inspection` |
| Community sports training | `community-sports-training` | `sports-training-programme-form-schema` |

For each recipe the directory under
`apps/api/src/forms/form-definitions/recipes/` and the `"formId"` field inside
`1.0.0.json` moved together (the loader asserts `directory === formId` at boot).
The sports form's landing `form_id` was updated in both
`register-for-community-sports-training-programme/{index,start}.md`. The fire
form has no landing page.

## Why it looks the way it does

**Directory and `formId` move as a unit.** `recipe-file-loader.service.ts`
throws at `onModuleInit` if a recipe's `formId` doesn't equal its directory
name. `recipe-invariants.spec.ts` guards the same invariant in CI (the build
gate doesn't boot the API). Renaming one without the other would pass a naive
grep but fail at startup / in that spec, so both always change together.

**The landing slug stays; only `form_id` changes.** The URL
`/work-employment/register-for-community-sports-training-programme` is
unaffected — only the `form_id` frontmatter value that the prebuild uses to
fetch the form from the live API was repointed.

**No backward-compat alias — deploy API before landing.** An alias that kept
the old ID resolving during the API→landing deploy gap was considered and
rejected (per the plan). The consequence: landing's
`form_id: sports-training-programme-form-schema` will not resolve until the API
is redeployed with the renamed recipe. **The API must be deployed before the
landing rebuild**, or the landing prebuild's form fetch breaks. This is called
out in the PR description.

**Scope limited to functional references.** Scratch SQL using the parallel
`*-test` ID convention, `FORM-MIGRATION-NOTES.md`, `FORM-CREATION-GUIDE.md`'s
illustrative mention, and historical `docs/audits|plans|summaries` were left
untouched — they're a separate convention or point-in-time records, not live
form wiring. A post-rename `git grep` of the old IDs returns only those
intentionally-excluded files.

## Key files

| File | Change |
|------|--------|
| `apps/api/.../recipes/request-a-fire-service-inspection/1.0.0.json` | dir renamed from `request-fire-inspection/`; `formId` updated |
| `apps/api/.../recipes/sports-training-programme-form-schema/1.0.0.json` | dir renamed from `community-sports-training/`; `formId` updated |
| `apps/landing/.../register-for-community-sports-training-programme/index.md` | `form_id` repointed |
| `apps/landing/.../register-for-community-sports-training-programme/start.md` | `form_id` repointed |
