# Form removal: Delete (drafts) vs Disable/Enable (published)

## Context

Issue #576 flagged a stray-click data-loss risk: the Open dialog showed one red
**Delete** beside every form, live published services included. Investigation
(captured in `docs/plans/form-builder-delete-vs-disable.md`) found the risk was
worse than reported — the public API checks the disabled override *before*
loading the on-disk recipe, so deleting a published form took the live service
to **410**, recipe-on-disk notwithstanding. The old delete also *always* wrote a
tombstone, so deleting a draft poisoned future reuse of its `formId`.

## What we did

Split the all-in-one delete into three intent-matched operations and made the
picker surface disabled state instead of hiding it. See
[ADR 0028](../decisions/0028-form-removal-semantics-split-by-publish-state.md)
for the principle.

- **Backend** (`apps/form_builder_api/src/routes/forms.ts`): `DELETE /:formId`
  is now a pure draft delete (no tombstone); added `POST /:formId/disable` and
  `DELETE /:formId/disabled`.
- **Server layer** (`apps/form_builder/app/server/forms.ts`): `listForms` marks
  `isDisabled` and keeps disabled+published forms; `deleteForm` lost `reason`;
  added `disableForm` / `enableForm`.
- **UI**: per-row action by state (Delete / Disable / Enable + Disabled badge);
  reworked `-delete-modal` into a light no-reason draft confirm; new
  `-disable-modal` with required reason; Enable is a direct `window.confirm`.

## Why we did it that way

- **Split over UI-only hide.** The issue's first instinct (and the author's own
  comment on #576) was to just hide Delete for published forms. Rejected: that
  leaves published forms with no recoverable take-down/restore from the builder,
  and doesn't fix the draft-tombstone-reuse bug. The split costs a little more
  but matches the two real intents — and the tombstone becomes a *reversible*
  override (Disable/Enable), not a one-way delete.
- **Draft delete writes no tombstone.** This is the crux that fixes the
  `formId`-reuse poisoning. It deliberately supersedes the 0011 corollary that
  "every retire path writes the tombstone" — drafts aren't retired, they're
  discarded.
- **Modal split (open-Q3).** Kept two small files (`-delete-modal` light confirm,
  `-disable-modal` reason-required) over one parameterised modal. Reads clearer;
  the duplication is small. A reviewer flagged the dup as a nit — consciously
  left.
- **Enable is `window.confirm`, not a modal.** Clearing a tombstone is a
  one-click reversible restore, so a full modal would be ceremony. Deliberate
  per the plan.

## What we almost got wrong

- **The `#2` "existence check" suggestion.** A reviewer proposed 404-ing disable
  when the formId has no `form_definitions` rows. That's wrong *here*: a
  legitimately-published form (especially one authored outside the builder) may
  have **no** draft rows at all, and disable must still work for it.
  `form_builder_api` has no cheap local "is published" signal — it would need an
  upstream `/published` fetch. Skipped; the orphan-tombstone path is only
  reachable via the admin token (never the UI) and `listForms` drops orphans.
- **`isPublished` is derived from the version race, not publish membership.** A
  disabled published form with a *newer draft* gets `isPublished:false` and drops
  out of the picker, losing its Enable button (public 410 still holds). Accepted
  as-is for this ship; the author flagged it as significant for forms authored
  outside the builder (which have no draft rows), so it's tracked as #601.

## Build/test note

Full jest suites green (`form-builder-api` 60, `form-builder` 298). The
monorepo-wide `nx run-many` build couldn't run in the worktree (no
`node_modules`); no new cross-package import edges were added, so the
project-references gotcha doesn't apply. CI runs the real gate.

## Open questions

- #601 — fix `isPublished` to key off published-index membership.
- #599 — proposed **Erase** (delete the recipe folder via a Deploy-style PR);
  must clear the tombstone to avoid re-introducing the reuse-poisoning bug.
