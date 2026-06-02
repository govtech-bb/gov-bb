# 0025 — Form `title`/`formId` uniqueness is enforced app-level, not via a DB constraint

**Date:** 2026-06-02
**Status:** Accepted
**Related:** [#545](https://github.com/govtech-bb/gov-bb/issues/545), [#556](https://github.com/govtech-bb/gov-bb/issues/556)

## Context

The form builder stores every version of a form as its own row in
`form_definitions`, keyed by `UNIQUE(formId, version)`. All versions of one form
deliberately share the same `formId` *and* the same `title`.

#545 required that editors can't create indistinguishable forms: a new form may
not reuse an existing `formId`, and a `title` must be unique across the **latest
version of each form** (compared case-insensitively and whitespace-trimmed),
on both create and rename.

The obvious-looking enforcement — a database `UNIQUE` constraint on `title` (or
on a normalized title) — is wrong here, and reaching for it later would silently
break versioning.

## Decision

Form-level uniqueness is enforced in **application code**, never with a DB
unique constraint. The existing `UNIQUE(formId, version)` constraint is the only
DB-level uniqueness and stays as-is.

- The checks live in `createFormHandler` / `updateFormHandler`
  (`apps/form_builder_api/src/routes/forms.ts`), returning `409` with distinct
  messages for an id collision vs. a title collision.
- Title comparison reuses the same "latest version per `formId`" aggregation
  that powers `GET /builder/forms`, factored into `latestVersionPerFormSql`
  (`apps/form_builder_api/src/routes/form-uniqueness.ts`) so the list endpoint
  and the check can't drift.
- The builder UI mirrors both checks (`-form-uniqueness.ts`) for immediate
  feedback; the API is the re-check on save.

## Consequences

- **Do not add a `UNIQUE(title)` (or normalized-title) constraint to
  `form_definitions`.** Versions of one form share a title, so a column
  constraint would reject every new version after the first. "Unique across the
  *latest* version of each form" is not expressible as a column constraint —
  it's inherently a query over the aggregated latest-per-`formId` set.
- **`formId`-on-create cannot be inferred from the payload.** A brand-new form
  and a new *version* of an existing form both `POST /builder/forms` with the
  same shape; only the client knows which it is. So create-intent is carried
  explicitly via an `isNew` flag on the request — the formId-existence check
  only fires when `isNew` is set. Future endpoints touching form creation should
  carry intent explicitly rather than guessing from `formId`/`version`.
- **The app-level check sees only drafts (`form_definitions`), not forms
  published to the upstream apps/api.** The UI mirror compares against the
  merged drafts+published list, so a collision against a published-only form is
  caught client-side but not by the API. Closing that asymmetry is deferred to
  #556 because it adds an upstream dependency to the write path; the trade-off
  was taken deliberately to keep create/update independent of upstream
  availability.
