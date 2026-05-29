# 0017 — Builder commit actions self-validate on click

**Date:** 2026-05-28
**Status:** Accepted
**Related:** [#344](https://github.com/govtech-bb/gov-bb/issues/344) — Form Builder: stale-green validate left buttons enabled. Supersedes the planned approach in the (now-deleted) `form-builder-validate-gate-reset.md`.

## Context

The UI builder's two committing actions — **Save draft** and **Deploy** — used
to be disabled until the user clicked a separate **Validate** button and got a
green result. The enable-gate (`canSubmit`) read a cached `validateResult`
alongside a few pre-flight derivations.

That cache was the bug surface. `validateResult` was *not* reset when the draft
was edited, so a green validate followed by an edit-into-invalid left the buttons
enabled against a stale result (#344). The fix proposed in
`form-builder-validate-gate-reset.md` kept the gate and reset `validateResult` on
every edit — but that still left an in-flight race (editing mid-request briefly
re-enabling the button) and preserved the two-click "Validate, then Save" flow.

## Decision

The builder's committing actions **validate the live draft at the moment of the
click** and branch on that fresh result. They are **never** gated behind a
cached validation flag.

Concretely: `runValidation()` runs the full flow (friendly pre-flight checks +
server `validateRecipe`), sets its state as before, **and returns** the
`RecipeValidateResponse` it computed. Save draft / Deploy `await` it per click
and open their modal only when `result.valid`. The buttons' `disabled` carries
only in-flight guards (`isValidating || isSubmitting` / `… || isPublishing`) to
prevent double-clicks — there is no readiness gate. The standalone **Validate**
button stays, for "check my work without committing."

## Consequences

- **A stale `validateResult` can never green-light a bad save.** Every commit
  re-validates the current draft first, so the cache-staleness class of bug (#344)
  is removed at the root rather than patched with edit-time resets.
- **No cross-action readiness flag.** `canSubmit` is gone. Future committing
  actions in the builder should follow the same shape — validate-on-click and act
  on the returned result — not reintroduce a derived "is it valid yet" gate that
  some other code path has to keep fresh.
- **One click, not two.** Validation is implicit in Save/Deploy; the explicit
  Validate button is now purely an optional check.
- **Pre-flight messaging is unchanged.** The friendlier client-side checks
  (no editable steps, an empty step, duplicate resolved ids) still surface in the
  validation panel — they're early returns inside `runValidation`, so a failing
  click shows the same errors it always did and leaves the modal closed.
- **`hasIdCollisions` is retained** independently of the removed gate: it still
  drives the red duplicate-ID banner below the body, and the collision pre-flight
  inside `runValidation` re-checks it per click.
