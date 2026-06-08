# 0043 — Preview is view-only; submissions require a published version

**Date:** 2026-06-08
**Status:** Accepted

## Context

A form can be opened in **preview mode** (`?preview=<token>`) so an operator can
confirm an unpublished draft renders and flows correctly before publishing. The
two recipe paths resolve from different sources, which made preview submittable
on the surface but broken at the end:

- `GET /form-definitions/:formId` honours the `X-Recipe-Preview` token and
  serves the unpublished **DB** draft, so the preview renders fine.
- `POST /submissions` has **no preview path** — it resolves from bundled **file**
  recipes only (`source()` forces `files` when `NODE_ENV !== development`, per
  ADR 0007 / issue #145). A draft-only version (e.g. `1.2.2`) isn't in files, so
  `findByFormId` threw `AppError.notFound` → an opaque "Something went wrong"
  404 at the final step (issue #934).

The fix had to choose what preview *means*. Two options were weighed:

- **Allow submissions on preview** (honour the token symmetrically on the submit
  path). Rejected: it would create real submission records, reference numbers,
  payments, and notification emails off an *unpublished* draft — re-opening
  exactly what ADR 0007 / #145 closed. Only a deliberate test-submission harness
  could justify that, and that is a separate, larger piece of work.
- **Backend-only clear error.** Rejected as the *sole* fix: it lets the operator
  fill the entire form and only learn at the last step that it was never
  submittable — wasted effort, worse UX.

## Decision

**Preview mode is view-only. A submission is only ever accepted against a
published (file) recipe version.**

1. **The frontend disables submission up front.** The renderer threads an
   `isPreview` flag (derived from `search.preview`): a persistent banner states
   the draft cannot be submitted, and the Submit button on the `declaration`
   step is disabled and relabelled, with the rest of the flow (Continue /
   Previous) fully navigable.
2. **The backend rejects preview-version submits with a clear 4xx, never a
   record.** `submission-pipeline` resolution, on a `NotFoundException` from the
   files path, probes `getRecipe({ preview: true })` (the DB-consulting path):
   a DB hit → `400` "This version is an unpublished preview and cannot be
   submitted. Publish the form before submitting."; a genuine miss → the
   existing `404` is preserved. No submission record, reference number, payment,
   or notification is ever produced for an unpublished version.
3. **Running a real submission off an unpublished draft is out of scope** until a
   deliberate test-submission harness feature exists (with its own issue and its
   own decision record).

## Consequences

- A future request to "let operators test-submit a preview" must not be met by
  honouring the preview token on `POST /submissions` — point at this record. The
  correct path is a dedicated test-submission harness that produces isolated,
  clearly-marked test artifacts, decided separately.
- The backend 400 is **defense-in-depth**, not the primary UX: the disabled
  button is what citizens/operators hit. The 400 covers stale tabs, direct
  POSTs, API consumers, and logs — cases the button can't.
- This sits alongside ADR 0007 / #145 (runtime recipes load from files, not the
  `form_definitions` table). That decision is *why* a preview version is
  unsubmittable in the first place; this record makes the resulting UX and the
  submit-path contract explicit rather than an accidental 404.
