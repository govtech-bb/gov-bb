# Plan — Delete a form (hard-remove definitions + write tombstone)

Tracking issue: [#220](https://github.com/govtech-bb/gov-bb/issues/220)

## Goal

Give builder users a confirmed **Delete** action that permanently removes a
form. Deleting a form:

1. Hard-removes **every** version of the form from `form_definitions`.
2. Writes a **tombstone** into `form_disabled_overrides` (keyed on `form_id`,
   capturing `reason` + who deleted it), so the `form_id` stays claimed and any
   public fetch returns **410 Gone**.
3. **Preserves** all `form_submissions` — no cascade delete of submitted data.
4. Removes the form from the builder's forms list.

## Approach

**Chosen: implement the delete in `form_builder_api` (Express)** as
`DELETE /builder/forms/:formId`, performing both writes inside one TypeORM
transaction. This reuses the existing builder → `form_builder_api` path
(`api-client.ts`, shared `X-Admin-Token`) and the raw-SQL-over-shared-DataSource
style already in `routes/forms.ts`. One new route, no new network hop.

**Alternative considered (issue's recommendation): implement in `apps/api`**
(NestJS) reusing `FormDisabledOverridesService` + `BaseRepository.tx()`, next to
the 410 logic and its existing tests. Rejected for now because the builder has
**no** route to `apps/api` today — it would require a new client/base-URL or a
proxy through `form_builder_api`, a bigger change than option 1.

### Two consequences of choosing option 1 (recorded deliberately)

- **The tombstone table is owned by `apps/api`.** `form_disabled_overrides` (its
  entity + migration `1779466523478-CreateFormDisabledOverrides`) lives in
  `apps/api`, and is **not** registered in the `@govtech-bb/database` DataSource
  that `form_builder_api` uses. So `form_builder_api` cannot use a TypeORM
  repository for it — it writes via **raw SQL** (`INSERT … ON CONFLICT (form_id)
  DO UPDATE`), relying on the table already existing in the shared DB (apps/api
  owns the migration). This is intentional cross-app coupling; the column names
  (`form_id`, `reason`, `disabled_by`, `disabled_at`) are pinned to apps/api's
  entity.
- **`form_builder_api` has no test harness today** — no test target, no config,
  no specs. We stand one up as part of this work (jest, matching `form_builder`
  and `apps/api`). See the Tests scope below.

## Scope

### Backend — `apps/form_builder_api`

- Add `DELETE /builder/forms/:formId` to `routes/forms.ts`.
  - Validate the body with zod (already a dep): `{ reason: string (1–2000),
    deletedBy: string (1–255) }` — mirrors apps/api's `DisableFormDto`.
  - In a single `ds.transaction(async (manager) => { … })`:
    1. `DELETE FROM form_definitions WHERE form_id = $1` (all versions).
    2. `INSERT INTO form_disabled_overrides (form_id, reason, disabled_by)
       VALUES ($1,$2,$3) ON CONFLICT (form_id) DO UPDATE
       SET reason = EXCLUDED.reason, disabled_by = EXCLUDED.disabled_by`
       (`disabled_at` defaults to `NOW()`).
    3. Never touch `form_submissions` or `form_components`.
  - **Idempotency / unknown-form:** before writing, if there are **no**
    `form_definitions` rows **and** no existing override row for the `form_id`,
    return **404** (don't create a tombstone for a form that never existed).
    Otherwise proceed; re-deleting an already-tombstoned form is a 200 no-op-ish
    success. (Exact 404-vs-200 confirmed in review — see Open Questions.)
  - Respond `200 { ok: true, deletedVersions: <count> }`.

### Tests — `apps/form_builder_api` (new harness)

Stand up a **minimal jest target**, mirroring `form_builder` / `apps/api`:

- Add `apps/form_builder_api/jest.config.ts`: `preset: "ts-jest"`,
  `testEnvironment: "node"`, `rootDir: "src"`, `testRegex: ".*\\.spec\\.ts$"`,
  `moduleNameMapper` for `@govtech-bb/*` → `packages/$1/src/index.ts`. Because
  this app is CommonJS but uses `.js`-suffixed relative imports
  (`from "../db.js"`), add a mapper to strip the suffix for ts-jest:
  `"^(\\.{1,2}/.*)\\.js$": "$1"`.
- Add `"test": "jest --config jest.config.ts"` to `package.json` scripts (nx
  infers the `test` target from the script, as it does for `form_builder`), plus
  devDeps `jest`, `ts-jest`, `@types/jest` (present elsewhere in the repo).
- `routes/forms.delete.spec.ts` (unit, mocked DataSource/manager):
  - zod rejects missing/empty `reason` or `deletedBy` → 400.
  - unknown form (no definitions, no existing override) → 404, **no** tombstone
    written.
  - happy path: both the `DELETE form_definitions` and the override upsert run on
    the **same** transactional `manager` inside one `ds.transaction` callback;
    `form_submissions` is never referenced.
  - idempotent re-delete (override already present) → 200.
- **Scope honesty:** unit tests prove the handler *wires* both writes into a
  single `ds.transaction` and never touches submissions. True atomicity is a
  property of TypeORM's `ds.transaction` and is confirmed by the manual DB check
  in Verify (the repo's smoke-test preference) — we do not add an integration
  Postgres harness here.

### Builder list filtering — `apps/form_builder`

- After deletion, draft rows are gone, so `GET /builder/forms` (which selects
  from `form_definitions`) **already** excludes the form. The only leak is a
  **GitHub-published** form: `listForms` merges DB drafts with
  `listPublishedForms(token)` pulled from GitHub, and the published entry
  survives the delete.
- Fix: add `GET /builder/forms/disabled` → `string[]` of tombstoned `form_id`s
  (raw `SELECT form_id FROM form_disabled_overrides`). In `listForms`, fetch it
  alongside drafts/published and exclude those `form_id`s from the merged result.
- Note: the GitHub recipe **file** is not removed (out of scope, matches the
  issue). The public site still returns 410 because apps/api's
  `GET /form-definitions/:formId` reads the same override — the tombstone is the
  gate, not the file's absence.

### Builder UI + server function — `apps/form_builder`

- `app/server/api-client.ts`: add a `del` method and `"DELETE"` to the method
  union (fetch with a JSON body).
- `app/server/forms.ts`: add `deleteForm` server function (`requireSession`),
  input `{ formId, reason }`, that reads `context.session.login` as `deletedBy`
  and calls `api.del('/builder/forms/:formId', { reason, deletedBy })`. Update
  `listForms` to filter tombstoned forms (above).
- UI: add a **Delete** action with a confirmation + reason modal (mirror
  `-submit-modal.tsx` → new `-delete-modal.tsx`), triggered from the form list
  (`-form-picker.tsx`) and/or toolbar. On success: refresh the list (re-run the
  route loader / refetch `listForms`) and reset the editor if the deleted form
  was loaded. (Exact placement confirmed at dev-start.)

## Files

**Add**
- `apps/form_builder/app/routes/builder/ui/-delete-modal.tsx` — confirm + reason.
- `apps/form_builder_api/jest.config.ts` — ts-jest, node, `.spec.ts`.
- `apps/form_builder_api/src/routes/forms.delete.spec.ts` — delete-route tests.

**Modify**
- `apps/form_builder_api/src/routes/forms.ts` — `DELETE /:formId`,
  `GET /disabled`.
- `apps/form_builder_api/package.json` — `test` script + jest devDeps.
- `apps/form_builder/app/server/api-client.ts` — `del` method + `"DELETE"`.
- `apps/form_builder/app/server/forms.ts` — `deleteForm` fn; `listForms` filter.
- `apps/form_builder/app/routes/builder/ui/index.tsx` — wire delete handler +
  modal + list refresh.
- `apps/form_builder/app/routes/builder/ui/-form-picker.tsx` — per-row delete
  trigger (and/or toolbar).

## Verify

- Manual (real DB, per the repo's smoke-test preference):
  - Delete a **draft-only** form → gone from list; `form_definitions` rows for
    its `form_id` all removed; one `form_disabled_overrides` row with the reason
    + GitHub login; its `form_submissions` rows still present.
  - Delete a **published** form → gone from builder list; `GET
    /form-definitions/:formId` on apps/api returns **410 Gone**.
  - Re-delete the same form → no error.
  - Delete an unknown `form_id` → 404 (no tombstone created).
- Build gate (CLAUDE.md): `pnpm exec nx run-many -t build` and
  `pnpm exec nx run-many -t test` green before push. The new
  `form-builder-api` test target now runs in that sweep — confirm it's picked up
  (`pnpm exec nx test form-builder-api`).

## Resolved decisions

- **Backend tests:** minimal **jest** target for `form_builder_api` (matches
  `form_builder` and `apps/api`; vitest rejected as it's used only by
  `apps/landing`). Unit-level with a mocked DataSource — see Tests scope. _(was
  the headline open question)_

## Open questions

1. **404 vs 200 on edge cases** — unknown form (no defs, no override) = 404;
   already-tombstoned re-delete = 200 idempotent. Confirm in review.
2. **UI placement** — delete from the form picker rows, the toolbar (current
   form), or both.
3. **Auth/identity** — `deletedBy` = GitHub `login` from the session, passed in
   the body (`form_builder_api` only sees the shared admin token). OK as the
   record of "who", pending the #11 auth work.
