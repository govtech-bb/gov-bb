# Plan: Enforce unique form title and unique formId in the form builder

**Issue:** [#545](https://github.com/govtech-bb/gov-bb/issues/545)

## Goal

Stop editors from creating indistinguishable forms. Each form must have a unique
title and a unique id:

- **`formId` (on create)** — a new form may not reuse a `formId` that already
  belongs to an existing form (any version). Publishing a new *version* of an
  existing form keeps its id and is unaffected.
- **`title`** — unique across the **latest version of each form**, compared
  **case-insensitively and whitespace-trimmed**. Applies on create *and* when
  renaming an existing form into another form's title.

## Approach

Two layers, with the API as the authoritative gate:

1. **API (`POST /builder/forms`, authoritative).** Add uniqueness checks that
   return `409` with a clear message. The title check reuses the existing
   "latest version per `formId`" aggregation that powers `GET /builder/forms`;
   the `formId`-on-create check is an existence lookup (reject if the id already
   exists under a *different* logical form — i.e. this submission is a create,
   not a new version of that id).
2. **Builder UI (fast feedback).** Mirror both checks before submit and surface
   them through the existing toolbar / submit-modal error pattern, so the editor
   gets an immediate error without a round-trip. The API check is still the
   backstop.

Both stay app-level checks. A DB unique constraint on `title` isn't viable
because versions of one form deliberately share a title; the existing
`UNIQUE(formId, version)` constraint stays as-is.

**Alternatives considered:**

- *DB-level unique constraint on title* — rejected: breaks versioning (versions
  share a title) and can't express "latest version only".
- *UI-only check* — rejected: not authoritative; concurrent editors or direct
  API calls would bypass it.

## Scope

- API: add `formId`-uniqueness-on-create and case-insensitive/trimmed
  title-uniqueness checks to the create path in
  `apps/form_builder_api/src/routes/forms.ts`, returning `409` with distinct,
  human-readable messages for each case.
- API: apply the same title-uniqueness check to the update/rename path
  (`PUT /builder/forms/:formId`) so renaming into another form's title is
  rejected, while a form keeping its own title is allowed.
- Shared helper for "latest version per formId" + normalized-title comparison,
  reused by both the list endpoint logic and the new checks (avoid duplicating
  the aggregation).
- UI: pre-submit mirror of both checks in the builder, wired into the existing
  error surfaces (toolbar `formId` error span + submit-modal error box).
- Tests for the API checks (create collision, version exempt, title
  case/whitespace collision, rename collision, rename-to-self allowed) and for
  the UI validation behaviour.

## Files (expected)

- `apps/form_builder_api/src/routes/forms.ts` — create + update uniqueness
  checks, `409` responses.
- `apps/form_builder/app/routes/builder/-toolbar.tsx` — surface `formId` /
  title uniqueness errors.
- `apps/form_builder/app/routes/builder/-submit-modal.tsx` — client-side
  pre-flight error display for collisions.
- `apps/form_builder/app/routes/builder/index.tsx` — wire pre-flight checks into
  validate/save/deploy flow.
- Possibly a small shared helper (location TBD — alongside the forms route or in
  a shared package) for normalized-title comparison + latest-version selection.
- Test files alongside the above.

## Verify

- Creating a form with an existing `formId` → rejected (UI error + API `409`).
- Publishing a new **version** of an existing form → allowed (id unchanged).
- Creating/renaming a form whose title matches another form's latest-version
  title (differing only by case or surrounding whitespace) → rejected.
- Renaming a form while keeping its own title → allowed.
- `pnpm exec nx run-many -t build --exclude=landing` and
  `pnpm exec nx run-many -t test` pass.

## Open questions

- Exact `409` message copy (two distinct messages: id-taken vs title-taken).
- Where the shared "latest version per formId" helper should live if one doesn't
  already exist to reuse.
