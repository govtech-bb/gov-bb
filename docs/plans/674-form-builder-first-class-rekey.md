# 674 — Form builder: first-class form re-key

Issue: https://github.com/govtech-bb/gov-bb/issues/674

## Goal

Let a user change the **Form ID** of an existing, draft-only form and save it,
without hitting a false title collision against the form's own prior record. A
re-key becomes a real identity change: the existing draft rows move to the new
ID and the old-ID rows are gone — no lingering duplicate, no manual
rename-delete-rename workaround.

## Background (current behaviour)

- Frontend `handleSubmit` (`apps/form_builder/app/routes/builder/index.tsx:340`)
  computes `isNew = draft.formId !== loadedFromId`. Changing a loaded form's ID
  therefore routes the save through the **create** path
  (`submitRecipe` → `POST /builder/forms` with `isNew: true`).
- The API create path (`apps/form_builder_api/src/routes/forms.ts:289-302`) runs
  the title-uniqueness check with `excludeFormId = recipe.formId` — the **new**
  ID. The form's own prior record still lives under the **old** ID with the same
  title, so it isn't excluded → false self-collision.
- Even if the title check passed, nothing moves the old record: you'd end up with
  two draft rows (old ID + new ID) sharing a title.
- The client mirror (`-form-uniqueness.ts`) already excludes `loadedFromId` (the
  old ID) from the title check, so the UI shows no error — it diverges from the
  API, which then rejects with a 409.

Only **drafts** live in `form_definitions` (plus `form_disabled_overrides`
tombstones). Published forms live upstream (GitHub/external) and the PUT handler
refuses to mutate them — so a row move only makes sense for draft-only forms.

## Approach

**Approach A — a first-class, atomic re-key operation** (chosen).

A dedicated endpoint expresses the re-key, and a single Save performs the move
and the content write in one server operation:

`POST /builder/forms/:oldFormId/rekey`  body `{ recipe }` (where
`recipe.formId` is the new ID).

The handler, in order:

1. **Load** the old-ID rows. If none → `404`.
2. **Block if published.** If any old-ID DB row has `published_at != null`, or
   the old ID appears in the upstream published set, → `409`
   (`Cannot change the ID of a published form`). The upstream check fails open
   (consistent with the existing collision checks); the DB `published_at` check
   is authoritative.
3. **ID uniqueness** for the *new* ID against *other* forms (drafts + published).
   Reuse the existing id-collision logic, excluding the old ID. → `409` with the
   existing "ID already exists" message.
4. **Title uniqueness** with `excludeFormId = oldFormId` so the form's own prior
   record is skipped. → `409` with the existing "title already exists" message.
5. **Move** the rows: `UPDATE form_definitions SET form_id = $new WHERE form_id
   = $old`. Every moved row is a draft (guaranteed by step 2).
6. **Persist content** for the saved version under the new ID: if a `(newId,
   version)` row exists (the just-moved one), `UPDATE` its `schema`; otherwise
   `INSERT` (covers a re-key combined with a version bump).

All in one DB transaction so there's no half-applied state.

### Alternatives considered

- **B — narrow: exclude self from the title check only.** Thread the original
  `formId` so the create path skips the form's own record. Smaller, but leaves a
  stale old-ID row and doesn't model an intentional identity move. Rejected in
  favour of A (per issue + discussion).
- **C — make Form ID immutable after creation.** Sidesteps the problem but
  removes a capability users expect. Rejected.
- **Transport: extend the create POST with `originalFormId`.** Overloads the
  create path with two behaviours. Rejected in favour of a dedicated endpoint.
- **Atomicity: pure identity move + separate content save.** Two non-atomic
  round-trips from one Save. Rejected in favour of the atomic move+save.

## Scope

API (`apps/form_builder_api`):
- Add `rekeyFormHandler` + `formsRouter.post("/:formId/rekey", …)` in
  `src/routes/forms.ts`, wrapped in a transaction.
- Reuse `findTitleCollisionInDb` / `findTitleCollision` (exclude old ID),
  `fetchPublishedFormsFailOpen`, and the id-uniqueness query.

Server fn (`apps/form_builder/app/server/forms.ts`):
- Add `rekeyRecipe` (`createServerFn`, `requireSession`) → `POST
  /builder/forms/:oldFormId/rekey` with `{ oldFormId, recipe }`.

Frontend (`apps/form_builder/app/routes/builder/index.tsx`):
- In `handleSubmit`, add a third branch:
  - `loadedFromId === null` → create (unchanged).
  - `loadedFromId !== null && draft.formId !== loadedFromId` → **re-key** via
    `rekeyRecipe`.
  - `draft.formId === loadedFromId` → in-place update / new version (unchanged).
- After a successful re-key: `setLoadedFromId(draft.formId)` and `refetchForms()`
  (the old-ID picker row must disappear and the new one appear — a full refetch,
  not an `upsertForm` patch).
- Pre-block the re-key in the UI when the loaded form's picker row is
  `isPublished`, mirroring the API guard so the user gets immediate feedback
  instead of only a 409. (Surface via the existing submit-error/uniqueness slot.)

Client mirror (`-form-uniqueness.ts`):
- Expected to need no logic change (it already excludes `loadedFromId` and flags
  a new ID owned by another form). Confirm with a re-key test case; adjust only
  if the published pre-block needs a hook here.

## Files

- `apps/form_builder_api/src/routes/forms.ts` — new `rekeyFormHandler` + route.
- `apps/form_builder_api/src/routes/form-uniqueness.ts` — reuse only; change only
  if a helper needs a small tweak.
- `apps/form_builder/app/server/forms.ts` — new `rekeyRecipe` server fn.
- `apps/form_builder/app/routes/builder/index.tsx` — `handleSubmit` branch +
  post-save refetch + published pre-block.
- Tests: `forms.ts` handler tests (re-key happy path, self-title-collision now
  allowed, block-if-published, new-ID-collision-with-other-form, title-collision-
  with-other-form, 404 on unknown old ID); `-form-uniqueness.spec.ts` re-key case.

## Verify

- `pnpm exec nx run form_builder_api:test` and `pnpm exec nx run form_builder:test`
  (only the touched projects).
- `pnpm exec nx run-many -t build --exclude=landing` green.
- Manual: form A (`birth-reg-old`, "Birth Registration") → change ID to
  `birth-registration` → Save → succeeds, picker shows one row under the new ID,
  old ID gone, title preserved.
- Manual guards still fire: re-key to an ID owned by another form → ID error;
  re-key to a title owned by another form → title error; re-key a published form
  → blocked.

## Open questions

1. **Published pre-block reliability.** The upstream published-set check fails
   open — a flaky upstream could let an upstream-published form be re-keyed.
   Accepting that (DB `published_at` stays authoritative); flag if stricter is
   wanted.
2. **Tombstones.** Plan leaves `form_disabled_overrides` untouched, so an old-ID
   tombstone stays and the old ID remains claimed. Confirm that's the desired
   behaviour for a re-key of a previously-disabled draft.
3. **Re-key + version bump in one Save.** Handler upserts the saved version's
   row after the move, so this works — confirm we want to allow both in a single
   action rather than restricting re-key to the current version.
