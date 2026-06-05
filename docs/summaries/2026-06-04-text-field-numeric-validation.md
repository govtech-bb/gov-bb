# Text fields gain numeric and year validation rules (#830)

## Context

Form authors couldn't apply numeric comparisons (`gt`, `lt`, `min`, `max`) or
year bounds (`minYear`, `maxYear`) to text fields — the rules never appeared in
the builder's Add Rule dropdown. Filed as
[#830](https://github.com/govtech-bb/gov-bb/issues/830), then resolved in the
same session on `worktree-text-field-numeric-validation` (targets `sandbox`).

## What we did

- Added the six descriptors to the `text` entry of
  `VALIDATION_RULE_DESCRIPTORS` (`packages/form-builder/src/behaviors/validation-builder.ts`),
  mirroring the `number`/`date` shapes exactly. Only production-code change.
- New `validation-builder.spec.ts` pinning the text entries `toEqual` their
  `number`/`date` counterparts, plus a scope guard that `textarea` is unchanged.
- Updated `ref-swap.spec.ts`: number→text and date→text swaps now *carry* these
  rules (previously asserted dropped); added reverse-direction tests
  (text→number drops year rules, text→email drops both).
- Editor spec case asserting the dropdown offers all six for `htmlType="text"`.
- Decision record: `docs/decisions/0040-rule-availability-mirrors-runtime-capability.md`.

## Why we did it that way

- **Descriptor-only fix, no runtime change.** Exploration showed the
  `form-validation` runners are already type-agnostic: `toYear` accepts 4-digit
  strings (with tests), and the numeric runners coerce via `Number()` so
  non-numeric text yields `NaN` and fails the rule with its configured message
  — the desired authoring behavior, not a silent pass. The alternative
  (string-aware variants of the rules) would have duplicated runners for no
  behavioral gain.
- **Exact shape mirroring over shared constants.** The new text entries
  duplicate the `number`/`date` descriptor literals; the spec pins them
  `toEqual` the source entries instead of extracting shared objects — six small
  literals weren't worth the churn, and the pin catches drift.
- **ref-swap inverts for free.** Swap carry-over reads the same descriptor map,
  so number→text/date→text migrations now preserve the rules. The old tests
  asserting they're dropped were updated to assert the new (intended)
  carry behavior, not deleted.
- **Scope held at `text`.** `tel`/`textarea`/`email` unchanged — confirmed as a
  product decision, not an oversight (reviewer flagged the tel asymmetry; user
  chose to keep it out and revisit via a separate issue if needed).

## Open questions

- None. If `tel` ever needs the numeric rules, it's a descriptor-only change
  per ADR 0040.
