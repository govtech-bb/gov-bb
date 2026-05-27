# Form builder — delete a form — Implementation Session

**Date:** 2026-05-27
**Branch:** `worktree-feat+form-builder-delete-form` (worktree; based on and merging into `sandbox`)
**Issue:** [#220](https://github.com/govtech-bb/gov-bb/issues/220) — delete a form (hard-remove definitions + write tombstone)
**Plan:** `docs/plans/form-builder-delete-form.md`
**Decision record:** `docs/decisions/0011-form-availability-gated-by-disabled-overrides-tombstone.md`

## Context

Builder users had no way to remove a form. The requirement: hard-remove **every**
version from `form_definitions`, write a **tombstone** into
`form_disabled_overrides` so the `form_id` stays claimed and public fetches
return **410 Gone**, **preserve** all `form_submissions`, and drop the form from
the builder's list.

The load-bearing constraint comes from [ADR 0007](../decisions/0007-runtime-recipes-load-from-files-not-form_definitions-table.md):
the public site serves recipes from committed files, not `form_definitions`. So
deleting definition rows alone hides nothing publicly — the tombstone is the
only thing that retires a form. ADR 0011 (written this session) records that
invariant.

## What we did

Backend done with TDD (red → green), the rest wired and gated by build/test/tsc.

- **`apps/form_builder_api`** — `DELETE /builder/forms/:formId`: zod-validates
  `{reason, deletedBy}`; one `ds.transaction` runs `DELETE form_definitions …
  RETURNING id` + an `INSERT … ON CONFLICT (form_id) DO UPDATE` tombstone upsert
  (raw SQL — see below). Unknown form (no defs **and** no existing override) →
  404 with no write; otherwise `200 {ok, deletedVersions}`; re-delete is
  idempotent. Also `GET /builder/forms/disabled` → `string[]`, registered before
  `/:formId` so it isn't shadowed. Handlers extracted as named exports for unit
  testing.
- **New jest harness for `form_builder_api`** (it had none): `jest.config.js`,
  `test` script + jest/ts-jest/@types/jest devDeps. 9 unit tests across
  `forms.delete.spec.ts` + `forms.disabled.spec.ts`, mocked DataSource.
- **`apps/form_builder`** — `api-client.ts` gains `del`/`"DELETE"`; `forms.ts`
  gains a `deleteForm` server fn (`deletedBy` = session `login`) and `listForms`
  now filters tombstoned ids; per-row **Delete** button in `-form-picker.tsx`
  opens a new `-delete-modal.tsx` (required reason), wired in `index.tsx` with
  `router.invalidate()` to refresh the list and an editor reset if the deleted
  form was loaded.

## Decisions / notes

- **Tombstone is the gate, not row/file absence** — recorded as ADR 0011. The
  delete writes both the row removal and the tombstone in one transaction; the
  410 and the builder-list filter both read the tombstone. The GitHub recipe
  file is intentionally **not** removed (out of scope, per the issue).

- **Cross-app write via raw SQL.** `form_disabled_overrides` is owned by
  `apps/api` (entity + migration) and is **not** registered in the
  `@govtech-bb/database` DataSource `form_builder_api` uses, so it can't use a
  TypeORM repository for it — it writes via raw SQL against the shared DB, with
  column names pinned to apps/api's entity. Chosen over routing the builder
  through `apps/api` (no such client/route exists today) to keep this to one new
  route on the existing builder → `form_builder_api` path.

- **`listForms` leak.** After delete, draft rows are gone so the DB list already
  excludes the form — but `listForms` merges DB drafts with GitHub-published
  forms, and a published entry survives the delete. The new
  `GET /builder/forms/disabled` is fetched alongside drafts/published and its ids
  are filtered from the merged result.

- **jest config must be `.js`, not `.ts`, for this package.** `form_builder_api`
  is CommonJS (no `"type": "module"`). Jest 30 silently falls back to defaults
  when it can't load a `.ts` config (there is no `ts-node` in the workspace),
  which left `testRegex` empty and found no tests. `form_builder`'s `.ts` config
  works only because that package is ESM. A CommonJS `jest.config.js` is the
  reliable choice here.

- **Specs excluded from the tsc build.** `form_builder_api` builds via raw
  `tsc` over `src/**/*.ts` (unlike `apps/api`/nest or `form_builder`/vite), so
  `tsconfig.json` now excludes `**/*.spec.ts` to keep specs out of `dist`, and
  sets `isolatedModules: true` so ts-jest transpiles spec files per-file without
  a separate `tsconfig.spec.json`.

- **400 message** surfaces zod's flattened issues rather than a fixed string
  (review polish); reachable only in theory, since the UI caps reason at 2000
  and `deletedBy` is server-set.

## Verify

- `pnpm exec nx run-many -t build --exclude=landing` → 12 projects green
  (landing excluded; its prebuild needs network).
- `pnpm exec nx run-many -t test` → 12 projects green (incl. the new
  `form-builder-api` suite, 9 tests; nx infers its `test` target from the
  package.json script via `nx:run-script`). 562 passed / 1 skipped / 0 failed.
- `tsc --noEmit` on `form_builder` adds 0 new type errors (5 pre-existing in
  untouched files, identical to base).
- Manual browser + real-DB smoke (delete draft-only; delete published → 410;
  re-delete; unknown → 404; submissions preserved) deferred to the user, per
  standing preference for real-browser smoke over automated drivers.

## Out of scope

- **Recipe file removal** — the committed GitHub recipe file is not deleted; the
  tombstone gates the public 410 regardless.
- **Un-delete / restore** — no path to clear a tombstone yet; ADR 0011 notes a
  future restore must delete the `form_disabled_overrides` row.
- **Integration Postgres harness** — unit tests prove the handler wires both
  writes onto one transactional manager and never touches `form_submissions`;
  true atomicity is a property of `ds.transaction`, confirmed by the manual DB
  smoke.
