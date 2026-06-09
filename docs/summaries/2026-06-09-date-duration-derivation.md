# Date-duration derivation (yearsSince / monthsSince / daysSince)

**Issue:** #1020 (Part of #992) · **Branch:** `date-duration-derivation` → `sandbox`

## Context

Forms couldn't gate or branch on a value *derived* from a date field. The
sharp edge was #992: a 1903 DOB was accepted for an eligibility form because
"applicant must be 16–24" was inexpressible — conditionals only had
`equal/notEqual/in/exists`, and validation had no age/duration rule. An
`age(dob)` helper existed in `packages/expressions` but fed neither engine.

## What we did

- Added `durationSince(date, unit)` to `@govtech-bb/expressions`; `age` now
  delegates to it.
- Added `gte/lte/gt/lt` operators and an optional `transform` to the conditional
  schemas, and the same `transform` to the validation config / numeric rule
  schemas (`packages/form-types`).
- Taught `packages/form-conditions` (numeric operators + transform) and
  `packages/form-validation` (transform in the `min/max/gt/lt` runners) to honour
  them.
- Surfaced the new operators + transform in the two builder editors.
- Recorded the principle in **ADR 0045**.

## Why we did it that way

- **One primitive + a `transform` keyword, not fused operators.** The big
  design fork was how to express the derivation. Fused operators
  (`yearsSinceGte`) explode combinatorially across units × operators × two
  engines; wiring the full JSONLogic `expressions` engine into both schemas is
  overkill for "turn a date into one number." We landed on a single
  `durationSince` consumed by both engines through a `transform` field, with
  ranges falling out of the existing implicit AND across stacked conditions. ADR
  0045 is the durable record.
- **`durationSince` accepts `unknown` (string *or* `{day,month,year}`), not just
  a string** — a deliberate deviation from the plan's `date: string` signature,
  agreed up front. Date fields store the `{day,month,year}` object;
  `form-conditions` has no date parser and its `String(v)` coercion would turn
  that object into `"[object Object]"` → `NaN`. Widening the primitive keeps the
  one parse in one place instead of duplicating DateValue handling in two
  engines, and matches `age(dob: unknown)`'s existing shape.
- **Verified, not duplicated, the client/server path.** The plan's open question
  was whether `apps/forms`' `behavior-helper.checkConditionalOn` re-implements
  operator logic. It doesn't — it delegates to the shared `evaluateCondition`,
  so client and server inherited the new operators with no second
  implementation. This was the first thing checked; it turned scope item 5 from
  a real edit into a confirmation.
- **Editor gating chose intent over field-type plumbing.** The plan said expose
  the conditional transform "when the target field is a date." Doing that
  literally needed an `isDate` flag threaded through `ResolvedFieldId` — which
  would have broken many existing spec fixtures (the known "add a required field,
  break every literal" trap). Instead the conditional transform selector is gated
  on **the operator being numeric** (gte/lte/gt/lt), which is semantically
  tighter anyway — transform only feeds a numeric comparison — and needs zero
  plumbing. Validation transform *is* date-gated, because there it's free: the
  rule descriptors are already per-htmlType.
- **Fail-closed on bad dates.** `NaN` from an invalid/empty date never matches a
  numeric operator and fails every bound, so the 1903 DOB and a blank DOB both
  reject. This is the actual #992 fix.
- **Review caught two editor footguns, both fixed.** (1) The conditional editor
  hid the transform control for non-numeric operators but didn't *clear* a stale
  `transform`, so switching `gte`+`yearsSince` → `equal` left an invisible
  derivation the runtime still applied — now cleared on operator change. (2) A
  date duration rule with `transform` unset compares the raw date (`NaN`) and can
  never pass, so the validation editor makes transform mandatory (seeded to
  `yearsSince`, no "none" option).

## What we almost got wrong

A long detour: the new `@govtech-bb/expressions` import wouldn't resolve under
jest in `form-conditions`/`form-validation`. The root cause turned out to be a
**pre-existing bug in those packages' jest `moduleNameMapper`** —
`<rootDir>/../../packages/$1` resolves to a non-existent `packages/packages/$1`.
Existing deps (`form-types`, `registry`) only resolve because they're symlinked
into the *root* `node_modules/@govtech-bb` (they're root `package.json` deps) and
jest falls back to node resolution; `expressions` isn't, so it fell straight
through. Adding `expressions` as a root dep "fixed" it but was a debugging
detour — reverted in favour of a correct, explicit `^@govtech-bb/expressions$`
mapper entry in both jest configs (ordered before the broken general one). The
general mapper was left untouched to avoid repo-wide churn. Worth knowing if the
next person adds a non-root-symlinked workspace dep to one of these packages.

## Open questions

None blocking. The plan's manual builder smoke (author a DOB field with a
`yearsSince` min/max and an age-range step conditional, confirm an out-of-range
DOB is blocked and the branch toggles) is Isaiah's to run in a real browser.
