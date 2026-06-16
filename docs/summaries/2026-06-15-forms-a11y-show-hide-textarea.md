# Forms Accessibility: show/hide, textarea fall-through, skip link — Implementation Session

**Date:** 2026-06-15
**Branch:** `worktree-forms-a11y-show-hide-textarea`
**Issue:** #341 (consolidates the skip-link gap from #321)

## Context

Issue #341 listed accessibility gaps in `apps/forms`. The id/ARIA wiring and
error-summary anchors had already been fixed; three concrete gaps remained:

1. The **show/hide** field was a hand-rolled `<button aria-expanded>` with a
   CSS-drawn arrow, losing native disclosure semantics and keyboard behaviour.
2. A **textarea fall-through bug** — `case "textarea"` only `return`ed inside
   `if (!fieldArray)`, so a `fieldArray` textarea fell into `case "text"` and
   rendered an `<input>`.
3. **No skip-to-content link**, and `<main>` had no `id` to target.

## What we did

- **show/hide → native `<details>`** (`field-renderer.tsx`): renders
  `<details className="govbb-show-hide" open={isOpen} onToggle={…}>` +
  `<summary className="govbb-show-hide__summary">`, driving the boolean through
  TanStack-Form via `onToggle` (guarded with `next !== isOpen` so it only
  commits on a real state change). The revealed-content wrapper in
  `form-renderer.tsx` moved from `.form-page__show-hide-content` to the
  package's `.govbb-show-hide__content`, and the now-dead `.form-page__show-hide-*`
  rules were deleted from `govtech.css`.
- **textarea fall-through closed** (`field-renderer.tsx`): the `case "textarea"`
  now handles the `fieldArray` path with the full Add Another / Remove
  repeatable UI, mirroring the text path, and is fully closed with its own
  `return`.
- **skip link** (`__root.tsx`): a `.govbb-visually-hidden-focusable`
  "Skip to main content" link is the first focusable element, and `<main>` got
  `id="main-content"`.

## Why we did it that way

**Reused `@govtech-bb/styles` classes rather than restyling.** `<details>` +
`.govbb-show-hide*` gives the marker rotation, teal/underline summary, and the
content border for free — consistent with ADR 0007 (forms UI styled with
govbb-styles). The content wrapper stays a _sibling_ of `<details>` (rendered by
`form-renderer`, not inside the disclosure) exactly as before; its vertical
spacing now comes from the parent `.form-page__step` flex `gap`, so deleting the
hand-rolled `margin-top` was safe. The package `.govbb-hint` carries no default
margin, so the old `margin: 0` reset was also unnecessary.

**The repeatable textarea must commit immutable arrays.** The first cut mirrored
an _older_ in-place-mutation version of the text path (`values.push("")`) that I
had read from the main checkout before entering the worktree. Code review caught
that `origin/sandbox`'s text path had since switched to immutable updates
(`[...values, ""]`, `values.slice(0, -1)`) precisely because TanStack's store
dedupes by reference — a mutated-in-place array handed back to `handleChange`
can be dropped as "unchanged", making Add Another / Remove silent no-ops at
runtime. The fix matches the current text path. The unit tests were hardened to
assert a _fresh_ array is committed (`not.toBe(original)`) and the stored value
is untouched, since asserting only the argument value passes even with the bug.

## Verification

- `nx run forms:test` → 738 pass / 1 skipped (new jest-axe assertions on the
  `<details>` disclosure; a `fieldArray` textarea regression test proving
  `<textarea>` not `<input>`; immutability assertions; toggle/reveal parity).
- `nx run forms:build` → success.
- `tsc -b` (catches spec-only type errors CI's Type Check runs) → rc 0.

## Notes

- No new ADR: the show/hide migration is an instance of ADR 0007, not a new
  principle.
- Pre-existing and out of scope: array field items still share `id`/`name`
  (`field.id`) across rows — identical to the text path; the repeatable-textarea
  block also duplicates the text path's array-render logic, a candidate for a
  shared helper later.
