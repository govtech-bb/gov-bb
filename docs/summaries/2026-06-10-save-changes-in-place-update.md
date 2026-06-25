# Save Changes overwrites in place instead of duplicating drafts (#329)

## Context

[#329](https://github.com/govtech-bb/gov-bb/issues/329) reported that every
**Save Changes** click in the form builder created a *new* draft row in the
backend — wasting version numbers and leaving the draft tracker showing
duplicates (e.g. an untouched `2.0.0` plus a new `2.0.1` on every save).
Resolved on `329-save-changes-in-place` (targets `sandbox`).

## What we did

- `apps/form_builder/app/routes/builder/index.tsx` — changed the save-path
  default from `bumpPatch(currentVersion)` to `currentVersion ?? "1.0.0"`, so the
  Save Changes modal opens at the loaded version.
- `apps/form_builder/app/routes/builder/-submit-modal.tsx` — pinned the Version
  field **read-only on the update path** (`readOnly={isUpdate}`) with a hint
  ("overwrites in place at vX; use Deploy to cut a new version"). New forms keep
  an editable picker.
- Added `.fieldHint` to `builder.module.css`.
- Tests (`index.spec.tsx`): hoisted `updateRecipe` to an assertable mock; flipped
  the re-save test to expect an in-place PUT at the unchanged version (publish
  badge preserved); replaced the old manual-typedown test with a read-only-field
  assertion; added a consecutive-saves test (two PUTs, zero POSTs, same row); and
  added an editable-field contrast on the new-form path.
- Recorded the convention in ADR 0046.

## Why we did it that way

- **The live bug was worse than the issue described.** The issue blamed a stale
  load-path `useEffect`; the current code's `saveDraftVersion = bumpPatch(...)`
  bumps *unconditionally*, so `submitVersion === currentVersion` was never true
  and the `updateRecipe`/PUT branch (`index.tsx:430-434`) was dead. The
  one-line default change revives that existing branch — no new routing logic.
- **Chose overwrite-in-place over a `pristineVersion` track.** The alternative
  still mints a patch row per save; it renames the duplicate rather than removing
  it. Save Changes = overwrite, Deploy = new version is the cleaner semantic
  (ADR 0046).
- **Made the version field read-only rather than leaving the fork escape hatch.**
  Initially the field stayed editable (type a higher version to fork). Per
  product call we removed that: Deploy is the single, unambiguous path to a new
  version, so the field is pinned on the update path. New forms still pick their
  initial version.
- **Kept the `bumpPatch` import** — the plan suggested removing it, but it's still
  used by the apply-AI-changes handler (`index.tsx:696`) to bump the working
  version on edit.

## Follow-up

- Tests + `nx build` + `tsc -b` all green this session. Worth a manual smoke on
  the PR preview: load an existing draft, Save Changes twice, confirm the form
  list shows one row at the unchanged version (no duplicate).
