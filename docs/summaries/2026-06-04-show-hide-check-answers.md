# Show-hide toggles excluded from "Check your answers" (#799)

## Context

[#799](https://github.com/govtech-bb/gov-bb/issues/799): opening a show-hide
disclosure toggle (e.g. "I don't have a National ID") made it appear on the
Check your answers page as a row reading "true". The boolean toggle state fell
through `getFieldDisplayValue()`'s `default` branch — `String(true)` →
`"true"` — and survived the blank-row filter. A *closed* toggle was only
coincidentally filtered (falsy value), so the leak showed up exactly when the
revealed fields also appeared.

## What we did

- `apps/forms/src/components/review.tsx` — added
  `field.htmlType !== "show-hide"` to the rows filter, alongside the existing
  `hidden`/`conditionallyHidden` checks (commit `f8ad5076`).
- `apps/forms/src/components/review.spec.tsx` — new test: a step with an
  opened show-hide plus a revealed answer field renders the answer row but no
  toggle label and no "true".

## Why we did it that way

- **Exclude from rows, not `case "show-hide": return null` in
  `getFieldDisplayValue()`.** A show-hide isn't an answer at all, so it
  shouldn't rely on the blank-value filter to disappear — filtering it out of
  the rows pipeline states the intent directly, next to the other "not a
  row" conditions.
- **Display-only.** The toggle boolean deliberately stays in form state and in
  the submission payload; only the review page rendering changes. Decided in
  planning to avoid touching submission semantics for a display bug.
- **Revealed fields need no change.** They're separate primitives:
  `conditionallyHidden` when the toggle is closed (already filtered), real
  answers when open. The new test asserts the revealed answer still renders,
  guarding against an over-broad fix.
- Code review confirmed `Review` is the only summary surface (single caller in
  `form-renderer.tsx`), so this one filter is the complete fix — no parallel
  path to patch.

## Open questions

None. Related but distinct: #737 (stale de-selected conditional data on the
same page) is untouched by this change.
