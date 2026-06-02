# Date picker uses text inputs; reject invalid dates instead of coercing (#486)

## Context

The forms date field rendered Day / Month / Year as `type="number"` inputs.
Issue #486 asked to switch them to `type="text"` (+ `inputmode="numeric"`) to
follow the GOV.UK date-input pattern, keeping the numeric `DateValue` model.
The minimal switch was straightforward — but text inputs accept anything, and
exercising them surfaced a chain of pre-existing weaknesses in how the date
pipeline handled bad input. The session became one issue plus five follow-up
fixes. Plan: `docs/plans/date-picker-text-inputs.md`.

## What we did

- **#486 itself.** Day/Month/Year switched to `type="text"` + `inputMode="numeric"`;
  preserved the numeric `DateValue` model and `Number()` coercion; updated the
  two `input[type="number"]` spec assertions.
- **Overflow no longer rolls over.** `dateValueToDate` now rejects any value
  that doesn't round-trip (`getFullYear/Month/Date` must match the input), so
  month=22 / day=32 / Feb 30 return `null` → "invalid date". Removed the `onBlur`
  normalization that rewrote the field with the `Date`-constructor's rolled-over
  result (the direct cause of month=22 bumping the year).
- **No more "NaN" / "null" in the boxes.** A non-numeric or `null` part used to
  render the literal string. `displayDatePart` now shows `""` for
  `null`/`undefined`/`NaN`.
- **Raw text is preserved.** Extracted a `DateField` component that holds each
  part's raw string in local state, so `"33w"` stays on screen until edited
  instead of being wiped. A re-sync effect adopts external value changes (cache
  restore / reset) but, via `Object.is`, never clobbers what the user typed.
- **Non-numeric input is validated as invalid.** `parseDatePart` returns `NaN`
  for non-numeric text and `undefined` only for empty, so validation tells
  "filled in wrong" from "not filled in" and flags garbage as an invalid date.
- Tests at each step (renderer + validation), all test-first. See
  [ADR 0029](../decisions/0029-date-inputs-reject-invalid-values-rather-than-normalizing.md).

## Why we did it that way

- **Fixed overflow at `dateValueToDate`, not at `onBlur`.** The visible symptom
  was the `onBlur` write-back, but the root cause was the `Date` constructor
  silently normalizing overflow. Guarding `dateValueToDate` fixes both the
  write-back (its `if (!date) return` now short-circuits) *and* the latent bug
  where an overflow date passed validation as a different valid date. Patching
  only `onBlur` would have left the second bug hidden.
- **`undefined` (empty) vs `NaN` (invalid) is the key insight.** The numeric
  model can't hold `"33w"`, so the question was how validation distinguishes
  garbage from blank. Encoding invalid as `NaN` lets it flow through the same
  round-trip gate that rejects overflow — no separate "is this raw text valid"
  channel needed. This reversed an earlier same-session decision to store
  `undefined` for non-numeric (which had been chosen to avoid a "NaN" display,
  before display was decoupled from the value model).
- **Raw-text state, not an uncontrolled input.** Preserving `"33w"` meant the
  input could no longer be driven by the numeric value. We chose controlled
  local raw-text state (in a dedicated `DateField`) over an uncontrolled input
  so external value changes (cache restore / form reset) still flow in. The
  `Object.is` comparison in the re-sync effect is load-bearing: with plain `!==`,
  a stored `NaN` would never equal the typed text and the effect would wipe the
  user's invalid entry on the next render.
- **`null` display regression caught at finish.** Decoupling display from the
  value via `displayDatePart` re-introduced a "null" render, because the old
  `value?.part ?? ""` had been quietly absorbing `null` from restored data. The
  fix was a nullish check — a reminder that `?? ""` was doing more than it looked.

## What we almost got wrong

- **`min`/`max` are now inert.** They were carried over from the `type="number"`
  inputs; on `type="text"` the browser ignores them. We deliberately **kept**
  them (range enforcement lives in `dateValueToDate`, and they document intent /
  ease a hypothetical revert), but they must not be treated as the validity
  mechanism — see ADR 0029.
- **Scope outside this branch.** The unrelated `form_builder`/`chat` build
  failures seen during full builds are a missing `@dnd-kit/core` dependency, not
  caused by this work; the generated `routeTree.gen.ts` churn was kept out of
  every commit.
