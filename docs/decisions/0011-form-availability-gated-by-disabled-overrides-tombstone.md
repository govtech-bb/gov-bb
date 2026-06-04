# 0011 — Form availability is gated by the `form_disabled_overrides` tombstone

**Date:** 2026-05-27
**Status:** Accepted

## Context

[ADR 0007](0007-runtime-recipes-load-from-files-not-form_definitions-table.md)
established that runtime recipes load from JSON files committed to the repo,
not from the `form_definitions` table (builder scratch space). A direct
consequence: you cannot make a published form "go away" for end users by
deleting its `form_definitions` rows — the public site never read them — nor by
deleting the committed recipe file alone, since file removal is a separate PR
and out of band from any admin action.

The delete-form feature (issue #220) needed a single, authoritative answer to
"is this form retired?" that the public API, the builder's form list, and the
delete action all agree on. The mechanism already existed for the disable
"kill switch": `apps/api`'s `GET /form-definitions/:formId` returns **410 Gone**
when a row exists in `form_disabled_overrides`, regardless of whether a
definition or recipe file is present.

## Decision

**A form's public availability is governed solely by the
`form_disabled_overrides` table.** A row keyed on `form_id` (the "tombstone")
means the form is retired and the `form_id` stays claimed. Presence or absence
of `form_definitions` rows or recipe files does **not** determine availability.

Corollaries:

- **Every code path that retires a form must write the tombstone.** Deleting a
  form hard-removes its `form_definitions` rows *and* upserts a
  `form_disabled_overrides` row in one transaction
  (`apps/form_builder_api/src/routes/forms.ts`,
  `DELETE /builder/forms/:formId`). Removing rows or files without the tombstone
  does not retire the form.
- **Every consumer deciding visibility must consult the tombstone.** The public
  API gates on it for 410 (`apps/api` `FormDefinitionsController`). The builder
  list excludes tombstoned ids via `GET /builder/forms/disabled`, which a
  GitHub-published form would otherwise survive
  (`apps/form_builder/app/server/forms.ts`, `listForms`).
- **The table is owned by `apps/api`** (entity + migration
  `1779466523478-CreateFormDisabledOverrides`). It is not registered in the
  `@govtech-bb/database` DataSource that `form_builder_api` uses, so
  `form_builder_api` writes it via raw SQL. The column names
  (`form_id`, `reason`, `disabled_by`, `disabled_at`) are pinned to that entity.

## Consequences

- **Submitted data is never cascade-deleted.** Retiring a form touches
  `form_definitions` and `form_disabled_overrides` only; `form_submissions`
  rows are preserved by design.
- **The recipe file is not removed on delete** (out of scope for #220). The 410
  comes from the tombstone, not the file's absence — so a stale committed
  recipe file is harmless once the tombstone exists.
- **Re-deleting is idempotent; unknown forms 404.** With no definitions and no
  existing tombstone the delete returns 404 and writes nothing — a form that
  never existed does not get a tombstone.
- **A future "un-delete"/restore path must delete the tombstone**, mirroring the
  disable kill switch's `enable()`. Until it does, the `form_id` remains
  claimed and the public site keeps returning 410.
