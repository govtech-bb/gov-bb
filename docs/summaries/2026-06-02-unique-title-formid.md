# Enforce unique form title and unique formId (#545)

## Context

Editors could create indistinguishable forms: `formId` had only client-side
*format* validation (no uniqueness), and `title` had none at all. The API gate
`POST /builder/forms` rejected only an exact `(formId, version)` repeat. Plan:
`docs/plans/form-builder-unique-title-id.md`.

## What we did

- Added app-level uniqueness checks to the builder API create/rename paths and
  a UI mirror for fast feedback. See [ADR 0025](../decisions/0025-form-uniqueness-is-enforced-app-level-not-via-db-constraint.md).
- API (`apps/form_builder_api/src/routes/`): new `form-uniqueness.ts`
  (`latestVersionPerFormSql`, `normalizeTitle`, pure `findTitleCollision`);
  extracted `createFormHandler`/`updateFormHandler` from inline router callbacks
  so they're unit-testable, and added the formId + title checks.
- UI (`apps/form_builder/app/`): new `-form-uniqueness.ts`; wired into
  `index.tsx` (live toolbar formId error + hard-gate on Save/Deploy) and
  `server/forms.ts` (threads the `isNew` flag).
- Tests on both sides; filed follow-up #556.

## Why we did it that way

- **App-level, not a DB constraint** — versions share a title/formId, so a
  `UNIQUE(title)` constraint would break versioning. This is the load-bearing
  decision; recorded in ADR 0025 so it isn't "fixed" with a migration later.
- **`isNew` flag, decided with the user.** The plan assumed the API could tell a
  create from a new version, but it can't: both `POST` with the same payload
  shape, and a version *bump* on a loaded form already goes through `POST` (only
  same-version saves use `PUT`). Rather than infer (fragile) or refactor all
  new-version saves onto `PUT` (largest blast radius), we carry create-intent
  explicitly as `isNew = draft.formId !== loadedFromId`. The API's formId check
  fires only when `isNew`, so legitimate new versions are never blocked.
- **Hard-gate at the click, not a submit-modal box.** The plan named the
  submit-modal for the UI error. But Save-draft deliberately lets an *invalid*
  draft through after a confirm — and a uniqueness collision must never be
  savable. So collisions block before the modal opens (in `handleSaveDraftClick`
  / `handleDeployClick`) and surface in the always-visible validation panel,
  mirroring the existing duplicate-field-ID gate. `-submit-modal.tsx` was left
  untouched. This was a conscious deviation from the plan's file list.
- **Reused the latest-version aggregation** via `latestVersionPerFormSql` so the
  list endpoint and the title check share one definition of "latest per formId"
  (the subtle semver-aware `DISTINCT ON` ordering).

## Open questions

- **Published-form collisions (#556).** The API check sees only drafts in
  `form_definitions`; the UI mirror also compares against published forms
  (merged in by `listForms`). So a collision against a *published-only* form is
  caught client-side but accepted by the API. Deferred deliberately — extending
  the API check pulls an upstream apps/api fetch onto the write path, with a
  fail-open question — after a code-review flagged it and we chose to scope it
  out, soften the "authoritative backstop" comments, and file the follow-up.

## What we almost got wrong

The first framing trusted the plan's "the API can distinguish create vs. new
version." Orienting on the actual save flow showed `POST` serves both, which
would have made the formId check either block real version bumps or be
unenforceable — caught before writing code, resolved with the `isNew` flag.
