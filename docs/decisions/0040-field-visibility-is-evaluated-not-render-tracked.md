# 0040 — Field visibility is evaluated, not render-tracked

## Status

Accepted (2026-06-04)

## Context

Conditional fields (`fieldConditionalOn` behaviours) carry a
`conditionallyHidden` flag that `field-renderer.tsx` mutates as a render
side-effect: when a field's conditions evaluate to `notRequired` at mount
time, the flag is set; when it renders, the flag is cleared. The flag is
therefore only valid for fields on the step currently being rendered — a
conditional field that never re-mounts after its controlling answer flips
(e.g. an inset field under a radio the user changed and navigated away from)
keeps whatever value the flag last had.

Two consumers trusted the flag for data decisions: the check-your-answers
page filtered display rows with it, and the submit path used it to build the
`hiddenFields` list whose values are deleted from the payload. Both were
wrong in the same way (#737): a user who answered Yes, filled the revealed
fields, then flipped to No saw the de-selected answers on check-your-answers
**and** submitted them in the payload — the leak was real, not display-only.

## Decision

Any consumer that needs to know which fields are visible — review display,
payload stripping, and future surfaces such as exports, recipient emails, or
validation summaries — derives it by **evaluating the field's behaviours
against current form state**, via `getVisibleFields(step, formApi)` in
`apps/forms/src/lib/form-builder/helpers/behavior-helper.ts` (which reuses
the same shared `@govtech-bb/form-conditions` evaluator the API uses). The
`conditionallyHidden` flag remains a render-time optimisation private to
`field-renderer.tsx`; no data decision reads it.

Corollary — **keep-but-hide**: de-selected conditional answers are hidden
from display and stripped from the payload, but never erased from form
state. Flipping the controlling answer back restores what the user typed; a
mis-click never destroys their work (GDS pattern).

Exception: fields on **repeatable steps** keep the flag-based behaviour for
now — their visibility is per-instance (`activeFieldsByInstance` in
`packages/form-conditions`), which a step-scoped evaluation cannot
represent. Extending evaluated visibility to repeatable instances is
follow-up work.

## Consequences

- New visibility consumers call `getVisibleFields`; reading
  `conditionallyHidden` outside `field-renderer.tsx` is a code smell.
- Hidden-field stripping on submit is the complement of the evaluated
  visible set, so client payloads agree with the server-side evaluator's
  verdict for the same values.
- Clearing dependent values when a controlling answer changes would violate
  keep-but-hide; do not "fix" stale-data bugs that way.
