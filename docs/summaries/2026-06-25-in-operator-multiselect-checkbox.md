# Fixed conditional `in` operator for multi-select checkboxes (#1709)

## Context

Issue [#1709](https://github.com/govtech-bb/gov-bb/issues/1709): a
`fieldConditionalOn` / `stepConditionalOn` / `optionalIf` / `conditionalTitle`
condition using `operator: "in"` against a **multi-select checkbox** silently
stopped matching once the applicant ticked two or more boxes. The bug lived in
the shared evaluator, so every consumer (`apps/forms`, `apps/api`, `apps/chat`)
was affected.

Worked in worktree `worktree-in-operator-multiselect` (targets `sandbox`).

## What we did

- **`packages/form-conditions/src/internals.ts`** — the `in` case now detects an
  array-valued target and matches when **any** selected option is in the coerced
  list (`target.some(...)`); the scalar path is hoisted but otherwise unchanged.
- **`packages/form-conditions/src/index.spec.ts`** — 5 new cases under
  `describe("operator: in")`: 2+ ticked with one match (the regression),
  single-element selection, no overlap, empty selection, and a string array
  element against a numeric list (`#336` coercion, array form).

## Why it looks this way

- **The bug was a coincidence of `String([])`.** `coerce = (v) => String(v ?? "")`
  turns `["email","sms"]` into the joined string `"email,sms"`, which is never in
  the configured list. It *appeared* to work because `String(["email"])` ===
  `"email"` — so an author testing with one box ticked sees it pass and ships it.
  That's why the regression sat undetected and why the existing `in` tests (all
  scalar targets) never caught it.
- **Scoped to `in` only, deliberately.** The sibling `equal`/`notEqual` cases
  share the same `coerce()` weakness against arrays, but #1709 was filed against
  `in` specifically. The rejected alternative — normalising every target to an
  array up-front for all operators — would have changed `equal`/`notEqual`
  semantics (out of scope) and widened the blast radius across all three
  consumers. Keeping the change inside the `in` branch is surgical: the scalar
  path is byte-for-byte equivalent, so all prior `in` tests stay green for the
  same reason they did before.
- **`some` gives the right empty-selection answer for free.** `[].some(...)` is
  `false`, so an unticked multi-select reads as condition-not-met without a
  special case.

## Verification

- `pnpm exec nx run form-conditions:test --skip-nx-cache` — 69 pass (64 + 5),
  branch coverage 91.76% ≥ 85% gate (both the array and scalar paths covered).
- `pnpm exec nx run-many -t build --exclude=landing` — 16 projects.
- `pnpm exec tsc -b` (form-conditions tsconfig includes specs) — clean.

## Open questions

- Whether `equal`/`notEqual` should be defined at all against multi-select
  fields, and with what semantics. Deliberately deferred — a separate decision,
  not this fix.
