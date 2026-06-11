# Editing a published form cuts a new draft instead of failing

## Context

A user reported that updating the published **project-protégé-mentor** form in
the builder failed with "Cannot update a published recipe", wouldn't let them
change the version, and left the stored version at `1.0.0` even though the editor
showed `1.0.1`. Diagnosed as a consequence of ADR 0046 (#329): Save Changes now
*overwrites in place at the loaded version* (version field read-only), which is
correct for drafts but impossible for a published version — the API forbids
mutating a published row. So a published form had no working Save-draft path at
all. Resolved on `worktree-form-builder-published-edit-autobump` (targets
`sandbox`).

## What we did

- `apps/form_builder/app/types/index.ts` — added `publishedVersion?: string` to
  `FormDefinitionSummary`: the exact version in the published index, distinct
  from the merged `version` (which may be a higher unpublished draft).
- `apps/form_builder/app/server/forms.ts` — `listForms` populates
  `publishedVersion` from the published index (no `apps/api` change).
- `apps/form_builder/app/routes/builder/index.tsx` — derived
  `currentVersionIsPublished` (`publishedVersion === currentVersion`); when true,
  `saveDraftVersion` bumps the patch and `isInPlaceUpdate` is excluded, so the
  save routes to a new-version POST. Both optimistic upserts (`handleSubmit` and
  `handlePublish`) now preserve `isPublished`/`publishedVersion` as a refetch
  would.
- `apps/form_builder/app/routes/builder/-submit-modal.tsx` — new
  `currentVersionIsPublished` prop swaps the "overwrites in place" hint for
  "vX is published, so Save Changes saves a new draft (vY)".
- Tests: published-version edit → POST at bumped version; draft-over-published →
  still in-place PUT; `listForms` `publishedVersion` projection; Deploy-path
  upsert preserves `publishedVersion`; both SubmitModal hint branches.
- Amended ADR 0046 with the published-version exception.

## Why we did it that way

- **Code drift bit first.** Initial analysis was against the main checkout, which
  sat on an older commit *before* #329 — there `saveDraftVersion = bumpPatch(...)`
  so editing a published form would have worked. The worktree (fresh
  `origin/sandbox`) had #329's `saveDraftVersion = currentVersion`, which is what
  actually breaks published edits. Re-read the current files before designing the
  fix.
- **Precise `publishedVersion`, not a coarse `isPublished` flag.** A higher
  unpublished draft sitting over a published version (e.g. a `1.0.1` draft over
  published `1.0.0`) must *still* overwrite in place — only the exact loaded
  version being the published one should force a bump. `isPublished` is
  per-formId and can't distinguish those; `publishedVersion === currentVersion`
  can. This is also why the existing in-place tests stayed green unchanged
  (their fixtures have no `publishedVersion`, so they read as drafts).
- **Enforce at save, not "immediately on edit."** The user's instinct was to bump
  the moment a published form is edited; we kept the working-version display as-is
  and bump only at save (the modal opens at the bumped patch). Same end result —
  a published version can't be overwritten — with a smaller change that doesn't
  touch the load/edit state machine.
- **`handlePublish` upsert fix came out of code review.** The first cut only
  preserved `publishedVersion` in `handleSubmit`; review caught the parallel
  Deploy-path upsert dropping the newly-introduced field, diverging from a
  refetch. Not a crash (the deploy target isn't published yet) but an
  inconsistency the field's contract forbids — fixed plus a test.

## Follow-up

- Tests (60 pass across `index.spec`, `-submit-modal.spec`, `forms.spec`),
  `nx build` (`form-builder-app`), and `tsc -b` (no new errors — pre-existing
  `registry.ts` red herring only) all green this session.
- The live DB state couldn't be inspected (prod is off-limits; local DB is
  empty), so the fix was verified via the integration test that reproduces the
  load→edit→save flow. Worth a manual smoke on the PR preview: open a published
  form, edit, Save Changes, confirm it lands a new `x.y.(z+1)` draft with no
  error and the published badge intact.
- Issues #1174/#1175 (Project Protégé mentor chatbox feedback) are about the
  form's *content* (field order, optional address line 2, phone format) — a
  separate form-design task, not resolved by this builder fix.
