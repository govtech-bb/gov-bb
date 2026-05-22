# valueIsEmpty — Session Summary

**Date:** 2026-05-22
**Branch:** fix/forms-failing-tests
**Decision record:** [docs/decisions/0006-valueIsEmpty-treats-false-as-empty-by-design.md](../decisions/0006-valueIsEmpty-treats-false-as-empty-by-design.md)

## What was built

One line in
`apps/forms/src/lib/form-builder/validation-methods.ts` changed from
`if (!value) return true;` to
`if (value === null || value === undefined) return true;`. That's it.
The rest of `valueIsEmpty` is untouched.

Effect: `0` (number) now reads as non-empty everywhere `valueIsEmpty`
is consulted — submission stripping, required-validation, and the
`exists` conditional guard. `false` (boolean) still reads as empty,
unchanged.

## Why it looks the way it does

The session started from a one-line pointer ("add explicit
null/undefined/empty-string/empty-array checks") sourced from a prior
forms-test review (`docs/plans/forms-test-review-source-fixes.md` on
`test/increase-coverage`). The pointer treated `false` and `0` as one
bug. The audit said otherwise.

**Three consumers, two different needs.** `valueIsEmpty` feeds
`formatDataForSubmission` (data shape), `checkRequired`
(form-validation gating), and `evaluateCondition` `case "exists":`
(conditional logic). The submission consumer wants `false` and `0`
preserved (the failing tests). The validation consumer — specifically
`checkRequired` driving required-checkbox enforcement — *needs*
`valueIsEmpty(false) === true` because it's the only path that flags an
unchecked required boolean checkbox. The "exists" case already
short-circuits on falsy via an outer `targetFieldValue &&`, so it's
unaffected by anything we do here.

**The `0` half is a real bug; the `false` half isn't.** A required
numeric field with value `0` (e.g. `dependents`, `years_resident`) was
being flagged as `requiredAndEmpty` *and* stripped from submissions —
real data loss. The number branch at line 30 is structurally
unreachable for any real number, which makes the intent obvious in
retrospect: any number, including 0, was meant to be non-empty.

**An unchecked required "I accept" checkbox is exactly the design
target** for the boolean branch's `return !value`. The line-29 comment
("It's a boolean. If it's required then it must be true") documents
this. If we'd applied the pointer's literal resolution
(`return false` for booleans), required-checkbox enforcement would
have silently weakened: an unchecked "I accept the terms" stored as
`false` would no longer have been flagged. No test in this branch's
suite would have caught that — `runCheckboxValidations` only runs
selection-length checks on boolean fields when the value is an array.

**Trade-off taken.** Test-side change moves to the test branch: remove
(or scope) `keeps fields with boolean false values` from
`forms.spec.ts`. `keeps fields with numeric 0 values` stays — it goes
green from this source change once branches share history. Verifying
red→green locally wasn't possible because the spec file isn't on this
branch (same constraint as the prior two source-fix sessions on this
backlog).

The decision-record exists to keep a future developer from "fixing"
the boolean branch in good faith. The asymmetry is intentional and the
constraint behind it (required-checkbox enforcement piggybacks on
`valueIsEmpty`) needs to outlive the diff.
