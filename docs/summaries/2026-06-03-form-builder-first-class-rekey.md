# Form builder: first-class form re-key (#674)

Date: 2026-06-03
Issue: [#674](https://github.com/govtech-bb/gov-bb/issues/674)
Branch: `worktree-form-builder-first-class-rekey` → `sandbox`
Plan: [docs/plans/674-form-builder-first-class-rekey.md](../plans/674-form-builder-first-class-rekey.md)

## Why this work happened

Changing an existing form's **Form ID** was impossible without an absurd
workaround. The builder keyed a form's *identity* on its Form ID, so any ID
change was modeled as **creating a new form** (`isNew = draft.formId !==
loadedFromId`). The create path then ran the title-uniqueness check against
*all* forms — including the form's own prior record, still living under the old
ID with the same title — and rejected the save as a false self-collision. Even
had the title check passed, nothing moved the old record, so you'd be left with
two draft rows sharing a title.

## The shape of the fix

The plan chose **Approach A**: model a re-key as a real, atomic identity move
rather than a create. The key realization driving the design: only **drafts**
live in `form_definitions`; published forms live upstream and the PUT handler
already refuses to mutate them. So a row move only ever makes sense for
draft-only forms — which is why the published guard is load-bearing, not
cosmetic.

A dedicated endpoint `POST /builder/forms/:oldFormId/rekey` performs the whole
operation in one DB transaction so there's never a half-applied move:

1. Load the old-ID rows (404 if none).
2. **Block if published** — any old-ID DB row with `published_at` set (the
   authoritative signal) *or* the old ID in the upstream published set (which
   fails open, consistent with the existing collision checks).
3. New-ID uniqueness against *other* forms (drafts + published), excluding the
   old ID.
4. Title uniqueness with `excludeFormId = oldFormId` — **this is the
   false-collision fix**: the form's own prior record is skipped.
5. Move the rows (`UPDATE form_definitions SET form_id = $new WHERE form_id =
   $old`). Step 3 guarantees no `(newId, *)` row exists, so the move can't trip
   the `UNIQUE(form_id, version)` constraint.
6. Upsert the saved version's content under the new ID — UPDATE the just-moved
   row, or INSERT when the re-key also bumps the version.

## Decisions made while building

- **Why a dedicated endpoint, not an overloaded create.** Threading an
  `originalFormId` into the create POST would give one route two behaviours. A
  named `/rekey` route makes the identity move explicit and keeps the create
  path single-purpose. (Plan-level decision; reaffirmed in code.)

- **`findTitleCollisionInDb` narrowed to `{ query }`.** The handler runs inside
  `ds.transaction`, so the title check had to run against the transaction's
  `EntityManager`, not the live `DataSource`. Rather than duplicate the query,
  its parameter type was widened structurally to `{ query: (sql) =>
  Promise<FormTitleRow[]> }` — satisfied by both the DataSource (create/update
  paths) and the manager (re-key path). Reuse over a parallel helper.

- **Re-key forces a full picker refetch, not a one-row upsert.** A re-save
  patches its row in place to skip the slow `listForms()` waterfall. A re-key
  can't: a single-row upsert can't *drop* the stale old-ID row. So the
  `handleSubmit` refresh branch became `isCreate || isRekey → refetchForms()`.

- **Published re-key is pre-blocked client-side.** `checkRekeyPublished`
  mirrors the API's 409 in the editor so the user gets immediate feedback via
  the existing uniqueness/submit-error slot instead of only seeing the failure
  after a round-trip. It deliberately excludes an empty new ID (left to the
  "Form ID is required" gate).

- **`isRekey` excludes an empty id too (review hardening).** Code review caught
  that `handleSubmit`'s `isRekey` guard didn't mirror `checkRekeyPublished`'s
  empty-id exclusion: a "save draft anyway" with a *cleared* Form ID would route
  an empty-id recipe to the rekey endpoint and round-trip to a harmless 400.
  Added `&& draft.formId !== ""` so the frontend is self-consistent and an empty
  id can never be treated as a re-key.

## Deliberate non-changes

- **Tombstones are left untouched.** A re-key moves only `form_definitions`
  rows; any old-ID `form_disabled_overrides` tombstone stays (old ID remains
  claimed). This is unreachable through the UI — `listForms` drops
  disabled-and-unpublished drafts, so a disabled draft can't be opened to
  re-key — but a code comment now records the omission as intentional (plan
  open-question #2, accepted).

- **The client uniqueness mirror needed no logic change.** It already excludes
  `loadedFromId` from both the id and title checks, so a re-key to a fresh
  id + kept title produces no false error. Confirmed with an added test case
  rather than changed.

## Verification

- TDD throughout (RED → GREEN at every layer).
- `form_builder_api` routes: **69/69 pass** (11 suites), incl. 9 new re-key
  handler tests (happy path, self-title-allowed, published-block via DB and via
  upstream, new-ID collision, other-form title collision, 404, 400).
- `form_builder` touched suites: **server forms (15), client mirror (14),
  builder index (21)** all pass, incl. new `rekeyRecipe`, `checkRekeyPublished`,
  re-key routing, published pre-block, and empty-id-guard tests.
- **Full `nx` build/test gate deferred to CI**: `nx`/`tsc` can't run a complete
  build from the worktree (workspace `@govtech-bb/*` declaration outputs aren't
  linked there). `ts-jest` does full type-checking, and every changed file is
  imported by a passing spec, so the touched files are type-clean; the
  workspace-wide `nx run-many -t build --exclude=landing` is left to CI.
