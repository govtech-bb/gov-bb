# dump-recipes: drop unused date fields from PublishedRow

Issue: #110

## Goal

Remove the type lie in the recipe-dump migration script. `PublishedRow`
declares `published_at`/`created_at`/`updated_at` as `Date`, but the script
queries via raw `pg` (not TypeORM), and the columns are `TIMESTAMP` (no time
zone) — so `pg` hands back ISO **strings**, not `Date` objects. Nothing reads
these fields, so the lie is invisible today but would `TypeError` for any future
caller (e.g. `row.updated_at.toISOString()`).

## Approach

The issue lists three fixes; we chose a fourth. Since the three date fields are
**never read anywhere** (`writePublishedRecipes` touches only `id`, `form_id`,
`version`, `schema`), drop them entirely from the type and the query rather than
re-typing them as `string` (issue's option 1). Less surface, no
documentation-only fields that can drift out of sync with the schema.

Alternatives considered:
- **Option 1 — re-type as `string`**: keeps the fields for row-shape
  documentation. Rejected as carrying dead weight that has to be kept honest.
- **Option 2 — cast strings to `Date` at the query boundary**: more code to
  serve callers that don't exist. Rejected.
- **Option 3 — migrate columns to `TIMESTAMPTZ`**: schema change, out of scope
  (see Open questions).

## Scope

- Shrink `PublishedRow` to `{ id, form_id, version, schema }`.
- Drop the three date columns from the `SELECT` list in `runDump`. Keep
  `WHERE published_at IS NOT NULL` — you can filter on a column without
  selecting it.
- Update the spec's `loadFixture` to stop parsing/returning the date fields and
  drop the `new Date(...)` wrapping (so the fixture shape matches the type).
- Optionally strip the now-unused date keys from the two published fixtures
  (`published-row.json`, `published-row-v2.json`) so the fixtures stay honest.

## Files

- `packages/database/scripts/dump-recipes-to-files.ts`
  - `PublishedRow` type (lines 6–14) → drop `published_at`, `created_at`,
    `updated_at`.
  - `runDump` query (lines 177–182) → `SELECT id, form_id, version, schema`.
- `packages/database/scripts/dump-recipes-to-files.spec.ts`
  - `loadFixture` (lines 12–32) → drop the three date fields from both the
    parsed-shape type and the returned object; remove the `new Date(...)` calls.
- `packages/database/scripts/__fixtures__/published-row.json`,
  `published-row-v2.json` (optional) → remove `published_at`/`created_at`/
  `updated_at` keys.

## Verify

- `pnpm exec nx run-many -t build` — script compiles (the `@nx/js:tsc` build
  catches the type mismatch if `loadFixture` still returns the dropped fields).
- `tsc -b` for the database package — CI's Type Check job is separate from the
  Vite build / jest, so run it locally or a type error sails through.
- Database package test suite passes — all existing `writePublishedRecipes`
  specs are unaffected (none assert on date fields).

## Open questions

- **Long-term (out of scope):** migrate `form_definitions`' `TIMESTAMP` columns
  to `TIMESTAMPTZ` (issue #110 option 3) so raw `pg` returns `Date`s and the
  TZ-naive timestamps stop being a bug magnet. Tracked in #110; not done here.
