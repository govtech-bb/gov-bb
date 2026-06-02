# 0028 — Form removal semantics are split by publish state

**Date:** 2026-06-02
**Status:** Accepted
**Supersedes:** part of [ADR 0011](0011-form-availability-gated-by-disabled-overrides-tombstone.md) (the "every code path that retires a form must write the tombstone" corollary)

## Context

[ADR 0011](0011-form-availability-gated-by-disabled-overrides-tombstone.md)
(issue #220) made the `form_disabled_overrides` tombstone the single source of
truth for public availability, and required the builder's delete to *both*
hard-remove `form_definitions` rows *and* write the tombstone in one
transaction.

That conflated two genuinely different intents behind one red **Delete** button
shown beside every form in the Open dialog — including live published services
like "Get a Death Certificate" (issue #576). It also carried a latent bug:
because the delete *always* wrote a tombstone, deleting a **draft** and later
creating a new form that reused the same `formId` would serve **410** on the new
form — the id stayed claimed by a tombstone that was only ever meant to retire a
*published* service.

A draft (builder scratch in `form_definitions`) and a published form (a recipe
file the public API serves, gated by the tombstone — see
[ADR 0007](0007-runtime-recipes-load-from-files-not-form_definitions-table.md))
are not the same thing and should not be removed the same way.

## Decision

**Form removal is split by publish state, and the tombstone is a runtime
availability *override*, not a deletion record.**

- **Draft (not published) → Delete.** Hard-removes the form's `form_definitions`
  rows and writes **no** tombstone. The `formId` is freed for reuse. A draft
  delete must never consult or write `form_disabled_overrides`.
- **Published, live → Disable.** Writes the `form_disabled_overrides` tombstone
  (reason + `disabled_by`, audited); the public API returns 410. The on-disk
  recipe is untouched.
- **Published, disabled → Enable.** Removes the tombstone; the service is
  restored. Disable/Enable is a reversible kill switch, not a delete.

This is realised across three endpoints in
`apps/form_builder_api/src/routes/forms.ts` (`DELETE /:formId` = draft delete,
`POST /:formId/disable`, `DELETE /:formId/disabled`) and surfaced as
state-dependent per-row actions in the builder's Open picker.

## Consequences

- **The 0011 corollary "every retire path writes the tombstone" no longer
  holds.** Only *disabling a published form* writes a tombstone. Draft deletion
  deliberately does not — that is the fix for the `formId`-reuse-poisoning bug.
- **Submitted data is still never cascade-deleted.** Removal touches
  `form_definitions` and `form_disabled_overrides` only; `form_submissions` is
  preserved (unchanged from 0011).
- **Legacy tombstones become orphans.** Tombstones written by the old
  always-tombstone draft delete are now "disabled + not published" with no UI
  home; `listForms` drops them. No migration — they were confirmed safe to hide.
- **Permanent recipe removal is a separate, PR-reviewed operation.** Deleting a
  published recipe file from disk is **Erase** (proposed in #599), modelled on
  the Deploy PR flow. Erase **must also clear the tombstone**, or the dangling
  override re-introduces the `formId`-poisoning bug this ADR fixes.
- **`isPublished` derivation is a known weak point.** The builder decides
  Delete-vs-Disable from `listForms`'s `isPublished`, which today is set by the
  draft-vs-published version race rather than published-index membership. A
  disabled published form with a *newer draft* can therefore drop out of the
  picker and lose its Enable affordance (the public 410 still holds). Tracked as
  a follow-up bug (#601); accepted as-is for the #576 ship.
