# 0029 — Date inputs reject invalid values rather than normalizing them

**Date:** 2026-06-02
**Status:** Accepted
**Related:** [#486](https://github.com/govtech-bb/gov-bb/issues/486), [ADR 0027](./0027-field-value-type-is-defined-by-its-renderer-not-htmltype-name.md)

## Context

The forms date field (`apps/forms/src/components/field-renderer.tsx`, `case
"date"`) renders Day / Month / Year as three separate inputs over a numeric
`DateValue` model (`{ day, month, year }` as numbers). Issue #486 switched those
inputs from `type="number"` to `type="text"` to follow the GOV.UK date-input
pattern (number spinners change on scroll, render stray arrows, and reject
leading zeros).

Text inputs accept anything, which exposed how loosely the date pipeline had
been treating bad input:

- **Overflow rolled over silently.** `dateValueToDate` built the date with
  `new Date(year, month - 1, day)`, which normalizes overflow — `month=22`
  becomes the following year, `day=32` the next month. An `onBlur` listener then
  *wrote that rolled-over value back* to the field, so entering month=22
  visibly bumped the year. Overflow also passed validation as a different but
  valid date.
- **Invalid input was indistinguishable from empty.** A non-numeric entry like
  `"33w"` was coerced to `undefined` — the same value the model uses for an
  empty field — so validation treated garbage as "not yet filled in" (a
  required/no-op result) rather than an invalid date.
- **The control fought the user.** Because the input was driven directly by the
  numeric value, anything that didn't parse to a number was wiped from the
  screen the instant it was typed.

## Decision

Date inputs **reject** invalid input and surface it as a validation error; they
never silently coerce or normalize it.

1. **`dateValueToDate` is the single validity gate.** It returns `null` for any
   value that does not **round-trip** — the constructed `Date`'s
   year/month/day must equal the input — so overflow (month=22, day=32),
   impossible dates (Feb 30), and `NaN` parts are all rejected. No code
   normalizes a date by writing a `Date`-constructor result back to the field.

2. **The `DateValue` model distinguishes empty from invalid.** A blank part is
   `undefined`; a non-numeric part is `NaN`. `parseDatePart` returns `undefined`
   only for an empty string and `Number(raw)` (i.e. `NaN`) for non-numeric text.
   Validation relies on this: `NaN` reaches `dateValueToDate` and fails the
   round-trip → "invalid date"; `undefined` is treated as not-yet-filled.

3. **The input preserves the user's raw text.** `DateField` holds each part's
   raw string in local state and displays that, so an invalid entry (`"33w"`)
   stays on screen until edited. A re-sync effect adopts the stored value only
   when it changes from outside the component, comparing with `Object.is` so a
   stored `NaN` matches the typed text and is never clobbered.

## Consequences

- **No `Date`-constructor normalization, ever.** Re-introducing the old
  "reflect the rolled-over date back" behaviour (or any `new Date(...)` whose
  result is written to field state) silently resurrects the month=22 → year++
  bug. Overflow must fail validation, not be rewritten.
- **`undefined` vs `NaN` is load-bearing.** "Tidying" `parseDatePart` to return
  `undefined` for `NaN` collapses invalid back into empty and stops non-numeric
  input from being flagged. The distinction is asserted in
  `field-renderer.spec.tsx` and `validation-methods.spec.tsx`.
- **Display is decoupled from the value model.** Rendering reads raw text
  (guarded by `displayDatePart`, which shows `""` for `null`/`undefined`/`NaN`),
  not the numeric value — so a `null`/`NaN` part never renders as the literal
  string `"null"`/`"NaN"`. Any future control that binds the numeric value
  directly to the input must re-solve raw-text preservation.
- **Range attributes are not the enforcement mechanism.** `min`/`max` are inert
  on `type="text"`; range/overflow enforcement lives entirely in
  `dateValueToDate`. Don't rely on HTML constraints for date validity.
- **Edge:** a non-numeric entry in one part while the others are empty is still
  reported as incomplete (required), because an `undefined` part outweighs a
  `NaN` one in the completeness check. Invalid-date errors fire once the date is
  otherwise complete.
