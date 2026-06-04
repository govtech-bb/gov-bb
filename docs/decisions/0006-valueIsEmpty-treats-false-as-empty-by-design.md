# 0006 — `valueIsEmpty` treats boolean `false` as empty by design

**Date:** 2026-05-22
**Status:** Accepted

## Context

`apps/forms/src/lib/form-builder/validation-methods.ts` exports
`valueIsEmpty(value: FieldValue)`. It feeds three consumers:

1. `formatDataForSubmission` (`apps/forms/src/lib/api/forms.ts`) — strips
   "empty" entries from a form before POSTing it.
2. `checkRequired` (same file) — produces the `RequiredState`
   (`requiredAndEmpty` / `notRequiredAndEmpty` / `notEmpty` /
   `unknownState`) that drives required-field error display.
3. `evaluateCondition` `case "exists":` (same file) — branch for
   conditional show/hide logic. (Its outer `targetFieldValue &&` guard
   already short-circuits on `false`/`0` independently of this helper;
   tracked as a separate backlog item.)

Original code at line 23 was `if (!value) return true;`. That falsy
short-circuit meant `valueIsEmpty(0)` and `valueIsEmpty(false)` both
returned `true` regardless of the per-type branches below. A prior code
review flagged this as one bug — "valueIsEmpty falsy-strips false and
0" — and pinned red tests under `formatDataForSubmission › empty values
stripping`:

- `keeps fields with boolean false values`
- `keeps fields with numeric 0 values`

Re-auditing the consumers showed the two halves are not symmetrical:

- For numeric `0`: every consumer wants `0` treated as a real value.
  `dependents: 0`, `previous_loans: 0`, `years_resident: 0` are
  legitimate submissions. The number branch at line 30
  (`value.toString().length === 0`) is structurally unreachable
  ("0".length === 1), so the intent there was clearly "any number is
  non-empty." Pure bug.
- For boolean `false`: `checkRequired` is the *only* enforcement point
  for required boolean checkboxes (e.g. "I accept the terms"). The
  validation builder routes single-boolean checkboxes through
  `checkRequired` and `runCheckboxValidations` (which only checks
  selection length on arrays — not booleans). If `valueIsEmpty(false)`
  returns `false`, an unchecked required boolean checkbox would no
  longer be flagged as `requiredAndEmpty`, silently weakening
  enforcement. The line-29 comment — "It's a boolean. If it's required
  then it must be true" — encodes this on purpose.

## Decision

`valueIsEmpty` is intentionally asymmetric:

- `null`, `undefined`, `""`, `[]`, incomplete `DateValueInput`, and
  boolean `false` read as **empty**.
- `0`, `true`, non-empty strings, non-empty arrays, and complete dates
  read as **non-empty**.

The `false` semantic is load-bearing for required-checkbox enforcement.
**Do not "fix" the boolean branch to make `false` non-empty without
first migrating required-checkbox enforcement to a different signal**
(for example, a dedicated `runRequiredBooleanCheck` that asserts
`value === true`).

The fix on `fix/forms-failing-tests` is therefore minimal: replace the
generic falsy short-circuit with `value === null || value === undefined`
so `0` falls through to the number branch and reads as non-empty, while
`false` still falls through to the boolean branch (`return !value`) and
reads as empty.

This supersedes the prior framing in commit `37bdd09` that listed the
boolean and numeric cases together as one source bug. They are two
cases; only the numeric one was a bug.

## Consequences

- `formatDataForSubmission` keeps `0` in submissions (the
  `keeps fields with numeric 0 values` test on `test/increase-coverage`
  goes green).
- `formatDataForSubmission` still strips `false` from submissions. The
  `keeps fields with boolean false values` test on
  `test/increase-coverage` no longer matches intent and needs to be
  removed (or scoped to a future "optional boolean checkbox" semantic).
  Tracked as a follow-up on the test branch.
- `checkRequired` now correctly treats `0` as `notEmpty` (was previously
  `requiredAndEmpty` for numeric-zero on required fields — silent data
  loss surfaced as a "this field is required" error).
- `checkRequired` continues to flag unchecked required boolean
  checkboxes as `requiredAndEmpty` via the boolean branch.
- If the codebase later grows a notion of "optional checkbox where
  `false` is a meaningful saved answer" (distinct from "required
  checkbox that must be `true`"), `valueIsEmpty` will not be the right
  abstraction — split into submission-shape and validation-shape
  helpers at that point rather than re-overloading this one.
