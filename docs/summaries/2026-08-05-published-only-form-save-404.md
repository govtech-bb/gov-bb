# Session summary — Published-only forms 404 on save

**Date:** 2026-08-05 · **Branch:** `worktree-fix-published-only-save-404` (off `main`) · found #2184

## Context

Reported symptom: saving an edit to the Sports training form in the form builder
failed with `No recipe found for formId: sports-training-programme-form-schema`,
even though the form is deployed, published and live.

## What shipped

`updateFormHandler` (`PUT /builder/forms/:formId`) in
[forms.ts](apps/form_builder_api/src/routes/forms.ts) now seeds the missing
`form_definitions` scratch row instead of 404ing, gated on the form actually
being present in the upstream published set. New spec:
[forms.update-published-only.spec.ts](apps/form_builder_api/src/routes/forms.update-published-only.spec.ts).

## Why it looks the way it does

- **This is conformance to ADR-0057, not a new decision.** That record already
  says, of the versionless model: *"After a merge-archive deletes the row, the
  builder reseeds the draft from the file."* The **read** path implements it —
  `resolveStoredRecipe` prefers the draft row and falls back to the published
  flat file — so a published-only form opens and edits normally. The **write**
  path never did, so it treated "no draft row" as "form not found." The form was
  editable and unsaveable at the same time. No new ADR was written for this
  reason; the decision already existed and only the write path hadn't caught up.

- **The error message is its own proof of state.** That string can only be
  produced by the zero-rows branch of the row lookup, so no DB query was needed
  to establish that the form has no scratch row while its recipe exists as a
  committed flat file.

- **Seed-if-published, not an unconditional upsert.** An unconditional upsert
  would be simpler and perfectly symmetric with the GET fallback, but
  `deleteFormHandler` deliberately writes **no tombstone** (disable is a separate
  concern), so a stale browser tab saving after a delete would silently resurrect
  the form. Gating on the published set costs nothing — `updateFormHandler`
  already called `fetchPublishedFormsFailOpen()` a few lines below for the title
  check, so the call was just moved above the row check and reused. A formId with
  neither a draft nor a published recipe still 404s.

- **The fail-open direction is deliberate.** `fetchPublishedFormsFailOpen`
  returns `[]` when upstream is unavailable, which for this gate means a
  published-only form keeps the pre-existing 404 during an outage. That is
  strictly no worse than the old behaviour and never writes a row we can't
  justify, so failing closed on the *seed* was preferred over guessing.

- **Raw `INSERT … ON CONFLICT` rather than TypeORM's `.upsert()`.** Two reasons.
  A plain insert would let two concurrent saves of the same published-only form
  (both seeing no row) collide on `UNIQUE(form_id)`, and unlike
  `createFormHandler` this handler has no 23505 catch — the loser would 500.
  `ON CONFLICT … DO UPDATE` makes that last-write-wins, matching the UPDATE
  branch's semantics. `.upsert()` was the first attempt and **failed the build**
  with `TS2322`: it types the payload through `QueryDeepPartialEntity`, which
  can't express the recipe's nested `elements` unions. Casting around that was
  rejected as noise; raw parameterized SQL is also what the UPDATE branch beside
  it already uses.

## What we almost got wrong

- **`tsc -b` is not a superset of the nx build.** `pnpm exec tsc -b --force`
  exited 0 on the `.upsert()` version that `nx run form-builder-api:build`
  rejected outright. The root `tsconfig.json` `references` list covers only
  form-types, form-conditions, form-validation, apps/forms and apps/api —
  `apps/form_builder_api` is not in that graph and is never type-checked by
  `tsc -b`. Both gates are needed; neither implies the other.

- **The unit specs mock the DataSource, so they cannot validate raw SQL.** They
  would have passed a typo'd column name or a conflict target with no matching
  constraint. The statement was therefore executed against a throwaway database
  built from the real post-migration DDL, confirming NULL `version` is accepted,
  `ON CONFLICT (form_id)` resolves against the real `UNIQUE(form_id)` constraint,
  a repeat run updates instead of raising 23505, and the UPDATE branch still
  works on the seeded row.

- **The local dev DB is behind on migrations** — `modular_forms` still has
  `version NOT NULL` and `UNIQUE(form_id, version)`, i.e. it predates
  `1781100000000-DedupFormDefinitionsUniqueFormId`. The seed statement cannot
  work there until migrations are run, which is worth knowing before anyone tries
  to reproduce this locally. It was left untouched; verification used a separate
  temporary database.

- **A dead workflow was masking the blast radius.** `archive-merged-drafts.yml`
  is what deletes draft rows post-merge, and it can no longer fire (stale
  `branches: [dev]`, plus a `paths:` filter pointing at a `recipes/` directory
  that moved in #1196 — the script it runs was updated for the move, the filter
  wasn't). Because archiving is dead, published forms normally keep their row,
  which is the only reason this bug wasn't hitting every published form. Filed as
  **#2184**, with an explicit warning to land this seed fix *first*: repairing
  that trigger on its own would start deleting rows post-merge and make every
  published form unsaveable.

## Open questions

- Why `sports-training-programme-form-schema` specifically has no scratch row is
  not pinned down. It predates the dead archive workflow; the recipe file was
  created by the #1196 dump-to-files migration, so a DB reset or an
  environment mismatch is the likely origin. The fix doesn't depend on the
  answer — any published-only form was affected.
- The accumulated backlog of stale draft rows (from archiving having been dead
  for months) may want a one-off cleanup; noted in #2184.
