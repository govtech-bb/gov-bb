# Conditional payment amounts — equality slice (#937)

## Context

Form authors could only set a single fixed payment amount; a rule-based amount
(e.g. marriage certificate: $10 nationals, $20 non-nationals) "cannot be
authored" per
[#937](https://github.com/govtech-bb/gov-bb/issues/937). This session shipped
the **equality-based slice**: a `when field is/is not value → charge X` table
plus a mandatory default. Age-band / calculated amounts (birth certificate,
price-by-age-from-DOB) remain an explicit fast follow on the same issue.

Done on `conditional-payment-amounts-937` (targets `sandbox`), based off the
`docs/plans/conditional-payment-amounts.md` plan.

## What we did

- **`-amount-rule.ts`** (new) — pure compile/parse between the editable
  `{ field, operator, value, amount }[] + default` table and a JSONLogic
  `if`-chain. `compileAmount`: empty rules → bare default number; otherwise
  `{ if: [cond, amt, …, default] }`. `parseAmount`: number/undefined → fixed,
  the exact shape we emit → conditional, anything else → `advanced`. Operator
  maps `equal`→`==`, `notEqual`→`!=`.
- **`-amount-editor.tsx`** (new) — `AmountEditor`: a Fixed/Conditional toggle,
  conditional rule rows (reusing `ValuePathPicker` for the field), and the
  "Otherwise charge" default. Advanced expressions render read-only.
- **`-processor-config-form.tsx`** — payment case renders `<AmountEditor>` in
  place of the lone numeric `amount` input.
- Specs: `-amount-rule.spec.ts` (14, round-trip + edge cases) and
  `-amount-editor.spec.tsx` (6, UI behaviour), both written test-first.
- Tightened one assertion in `-processors-editor.spec.tsx`: the old `/amount/i`
  matcher now collides with the new "Amount type" label, so it uses the exact
  "Amount" label and asserts the toggle defaults to `fixed`.

## Why we did it that way

- **Persist JSONLogic; the table is builder-UI state only.** The author schema
  already stores `amount` as `dynamic(z.number().nonnegative())` and the server
  already resolves it to a literal via `ExpressionsService.resolveProcessors`.
  So a conditional amount is stored exactly like a literal one — an `if`-chain
  in the same slot — with **zero change** to `processor.type.ts`, the resolver,
  or the payment DB entity. This is now recorded as a principle: ADR 0043.
- **A separate `-amount-editor.tsx`, not inline in the config form.** The
  fixed/conditional mode can't be derived from `amount` alone — an empty
  conditional table compiles to a bare default *number*, indistinguishable from
  a fixed amount — so the toggle needs local state. React hooks can't live
  inside the `switch` in `ProcessorConfigForm`, so the editor had to be its own
  component. This is the one deviation from the plan's file list, and it made
  the UI directly unit-testable. Mode state is seeded once on mount; safe
  because each processor card is keyed by `id`.
- **Conservative parse, read-only fallback.** `parseAmount` only decompiles the
  exact shape the editor emits (single-key `==`/`!=`, `{var:string}` lhs, string
  rhs, numeric amounts + default). Numeric comparison values, ordering
  operators, or non-numeric amounts all fall to `advanced` so a hand- or
  AI-authored expression is shown read-only and never clobbered. This keeps the
  round-trip deterministic rather than best-effort.
- **Equality-only, additive for the fast follow.** Operators are `equal` /
  `notEqual` only this slice (matching `equalityOperationsSchema`, which has no
  ordering operators). The compiler is structured so adding `<`/`<=` and a
  calculated-field (`age`) reference later is additive, not a rewrite.

## Verification

- `nx test form-builder-app` — 510 passed (incl. the 20 new specs).
- `tsc -b` clean (CI Type Check gate); `nx run-many -t build --exclude=landing,cms`
  built 13 projects.
- Code-reviewer subagent: go, 0 must-fix.

## Open questions

- **Manual builder check still pending** (Isaiah, real browser): author a
  marriage-cert rule, save, reload, confirm the table round-trips and the saved
  recipe's `amount` holds the expected `if`-chain; confirm an existing
  literal-amount recipe opens as Fixed.
- A rule left with an empty field path compiles `{var:""}` — an author mistake
  surfaced at resolve time, not caught at save. Save-time validation of field
  paths is a candidate follow-up, out of scope for this equality-only slice.
