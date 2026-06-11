# Age-band / calculated payment amounts — #937 fast follow

## Context

The equality slice of [#937](https://github.com/govtech-bb/gov-bb/issues/937)
(shipped in #950) let an author set a payment amount that depends on a field
value. This session added the **fast follow**: amounts that depend on a
**calculated** value — the applicant's **age**, derived from a date-of-birth
field (birth-certificate pricing) — plus the **ordering operators** age bands
need.

Done on `age-band-amounts-937` (targets `sandbox`), branched off `sandbox`
after #950 merged.

## What we did

- **`-amount-rule.ts`** — the rule shape grew from `{ field, operator, value,
  amount }` to `{ subject, operator, value, amount }`, where `subject` is
  `{ kind: "field" | "age", path }`. Compile emits `{ var: "values.<path>" }`
  for a field and `{ age: [{ var: "values.<path>" }] }` for an age. Operators
  extended to `equal/notEqual/lessThan/lessThanOrEqual/greaterThan/greaterThanOrEqual`
  → `== != < <= > >=`. Comparison `value` is a string for field equality, a
  number for age/ordering. `JSONLOGIC_TO_OP` is now derived by inverting the
  forward map so the two can't drift.
- **`-amount-editor.tsx`** — each rule row gained a "Compare" selector (Field
  value / Age of field); the operator `<select>` offers all six; the comparison
  input switches `text`↔`number` and the value is re-coerced on any
  subject/operator change so a stale string never sits under a numeric
  comparison. Age bands are authored as ordered first-match rules (`age < 16 →
  $5`, `age < 66 → $10`, otherwise `$20`).
- **Fixed a shipped bug** in the same compiler: the `values.` var prefix (see
  ADR 0044).
- Specs rewritten test-first: `-amount-rule.spec.ts` (15) and
  `-amount-editor.spec.tsx` (7).

## Why we did it that way

- **The equality slice had a silent bug, found while orienting.** The server
  resolves an amount rule against `{ values, meta, submission }`, and JSONLogic
  `var` resolves from that root — so a submitted answer must be referenced as
  `{ var: "values.applicant.dob" }`. The equality slice emitted the bare
  `ValuePathPicker` path (`applicant.nationality`), which resolves to
  `undefined`: every conditional amount would have fallen through to its default
  in production. The unit tests were structural and the resolver tests separate,
  so nothing caught it. Folding the fix into this PR was cheapest (same file,
  same compiler, no recipe uses conditional amounts yet) — recorded as ADR 0044,
  with a regression test pinning the pre-fix shape to the read-only advanced
  fallback.
- **`age` is a server op we reuse, not new logic.** `@govtech-bb/expressions`
  already registers `age` and the API resolver tests already exercise
  `{ ">=": [{ age: [{ var: "values.applicant.dob" }] }, 60] }`. So this stays a
  builder-only change (ADR 0043): the compiler emits exactly that shape. The
  byte-for-byte match against the resolver's own test fixtures is the
  cross-check the equality slice lacked.
- **Bands as ordered rules, not a range widget.** JSONLogic `if` is first-match
  top-down, so `age < 16 → 5, age < 66 → 10, default 20` expresses bands without
  a two-sided range type. Keeps one rule = one condition and the model additive.
- **Comparison-value type is driven by subject/operator.** Age and ordering
  comparisons are numeric; field equality is text. String ordering would
  mis-sort multi-digit numbers (`"10" < "9"`), so the editor coerces the value's
  type whenever the subject or operator changes (`coerceValue` via `patchRule`).
- **The "age of" field picker is unfiltered.** `ResolvedFieldId` carries no
  reliable date-type flag, so the author picks the DOB field themselves; the
  server `age` op returns `NaN` for a non-date, which simply doesn't match.

## Verification

- `nx test form-builder-app` — 512 passed (22 amount specs, all TDD red→green).
- `tsc -b` clean; `nx run-many -t build --exclude=landing,cms` built 13 projects.
- Code-reviewer subagent: go, 0 must-fix; independently verified the `values.`
  prefix and single-operand `age` shape against the live resolver.

## Open questions

- **Manual builder round-trip check pending** (real browser): author an age band
  → save → reload, confirm the table re-renders and the recipe holds the
  expected `age` if-chain.
- The numeric comparison-value / rule-amount / default inputs snap empty→0
  mid-edit (a controlled-`type=number` nicety inherited from the equality
  slice); not a correctness issue since the stored output is always a number.
- Birth-certificate recipe authoring itself is unchanged work for a form author;
  this slice only makes the amount expressible in the builder.
