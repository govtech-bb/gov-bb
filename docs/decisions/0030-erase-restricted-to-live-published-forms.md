# 0030 — Erase is restricted to live published forms

**Date:** 2026-06-03
**Status:** Accepted
**Refines:** the "Permanent recipe removal … Erase **must also clear the
tombstone**" consequence in [ADR 0028](0028-form-removal-semantics-split-by-publish-state.md)

## Context

[ADR 0028](0028-form-removal-semantics-split-by-publish-state.md) split form
removal by publish state (Delete drafts / Disable+Enable published) and, in its
consequences, anticipated **Erase** (issue #599) — the permanent removal of a
published form's on-disk recipe folder via a Deploy-style review PR. It stated
that Erase "**must also clear the tombstone**, or the dangling override
re-introduces the `formId`-poisoning bug this ADR fixes."

That framing assumed Erase could be invoked on a form in *any* published state,
including a disabled one — hence the obligation to also clear
`form_disabled_overrides`. But clearing the tombstone and deleting the recipe
do not happen atomically: the tombstone lives in the DB and clears immediately,
whereas the recipe only truly disappears when the PR **merges**, with no merge
hook to coordinate the two. An Erase that cleared the tombstone up front would
open a window where the form is live again (public API back to 200) while its
recipe is still on disk — and on a disabled form, re-introduce exactly the
`formId`-reuse poison ADR 0028 set out to kill.

## Decision

**Erase operates only on *live* published forms — never on disabled ones — and
therefore never reads or clears a tombstone.**

- Erase is offered (and server-side enforced) only when a form is published and
  **not** disabled. A disabled form must be **Enabled** first; Erase refuses it.
- Because a live form has no `form_disabled_overrides` tombstone, there is
  nothing for Erase to clear. The merge-timing hazard above cannot arise: there
  is neither a "live again while the recipe is still on disk" window nor a
  dangling-override id-reuse poison.
- Erase removes only the on-disk recipe folder. Newer DB draft rows and (by
  construction, none-existent) tombstones are left untouched.

The "not disabled" check is enforced **server-side** in `eraseRecipe`
(`apps/form_builder/app/server/publish.ts`) against `/builder/forms/disabled`
before any branch is created — the client Erase button is gated too, but the
client is bypassable, so the server is the authority. This mirrors Deploy's
server-side `/validate` gate.

## Consequences

- **The ADR 0028 obligation "Erase must also clear the tombstone" no longer
  applies** — it is replaced by "Erase never touches a tombstone, because it
  only runs where none exists." Future work must **not** add tombstone-clearing
  to the Erase path; if a disabled form needs erasing, the flow is Enable →
  Erase.
- **Retire lifecycle is ordered:** Delete (draft) · Disable ⇄ Enable (runtime
  kill switch) · Erase (permanent, live-only, PR-reviewed). Erase sits at the
  end and is reachable only from the live state.
- **The destructive action still goes through human review/merge** — the
  builder never deletes from the base branch directly. Erase opens a single
  Git Data API commit whose diff is solely the deleted `recipes/<formId>/`
  folder; revert is a PR revert.
- **Server-side validation is at least as strict as Disable's.** Erase requires
  a non-empty, ≤2000-char reason (the audit trail for a permanent deletion),
  enforced both by the input validator and re-checked in the handler for the
  in-process call path.
