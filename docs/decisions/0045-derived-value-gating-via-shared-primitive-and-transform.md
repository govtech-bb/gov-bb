# 0045 — Derived-value gating via a shared primitive and a `transform` keyword

**Date:** 2026-06-09
**Status:** Accepted

## Context

Forms need to react to and gate on a value *derived* from a field rather than
the raw answer — first and foremost an **age** computed from a date-of-birth.
Issue #992 surfaced the gap concretely: a 1903 DOB was accepted because there
was no way to express "applicant must be 16–24." Two separate mechanisms exist
and neither could express it:

- **Conditionals** (`fieldConditionalOn` / `optionalIf` / `stepConditionalOn`,
  in `packages/form-types/src/behavior.type.ts`, evaluated by
  `packages/form-conditions`) supported only `equal | notEqual | in | exists`.
- **Validation rules** (`packages/form-types/src/validation.type.ts`, run by
  `packages/form-validation`) had numeric `min`/`max`/`gt`/`lt` and date rules,
  but no age/duration rule.

An `age(dob)` helper already lived in `packages/expressions` (Luxon, Barbados
tz, whole-year truncation) but was wired into neither engine.

Several shapes were considered and rejected during planning (#1020):

- **Fused operators** (`yearsSinceGte`, `monthsSinceLte`, …) — a combinatorial
  explosion across units × operators, multiplied again across both engines.
- **Wiring the full `expressions` JSONLogic engine into both schemas** —
  overkill for a single derivation; pulls a general evaluator into two configs
  that only need one number.
- **A dedicated `age` rule/operator** — too narrow; months/days durations and
  the same primitive on both engines would each need their own bespoke wiring.

## Decision

A value derived from a field is gated on through **one shared primitive plus an
optional `transform` keyword**, never re-implemented per engine:

1. **One primitive.** `durationSince(date, unit)` in `@govtech-bb/expressions`
   is the single source of the derivation: `unit ∈ {"years","months","days"}`,
   reference point is **`now()` in `DEFAULT_ZONE` (Barbados)**, result is a
   **truncated whole integer**, and invalid/empty input → **`NaN`**. `age(dob)`
   is now a thin delegate (`durationSince(dob, "years")`) so existing callers
   are unchanged. The primitive accepts both an ISO string and the
   `{ day, month, year }` object a date field stores, so each engine passes its
   raw resolved value straight through — the date parsing lives in one place.

2. **A `transform` keyword on the config, not new operators.** Both the
   conditional schemas and the validation config carry an optional
   `transform: "yearsSince" | "monthsSince" | "daysSince"`
   (`durationTransformSchema` in form-types). When set, the field's value is run
   through `durationSince` *before* the generic comparison. The comparison uses
   the ordinary numeric operators — `gte/lte/gt/lt` were added to the
   conditional schema; validation reuses its existing `min/max/gt/lt` runners.

3. **Ranges compose through implicit AND.** A bounded range is two stacked
   conditions/rules (`gte 16` + `lte 24`), which the engines already AND
   together. No range combinator and no fused operator is introduced.

4. **Fail-closed.** A `NaN` from an invalid/empty/missing date never satisfies a
   numeric operator (`Number.isNaN` on either side → no match) and fails every
   validation bound. A missing or malformed date therefore reads as
   condition-not-met / validation-fail, consistent with existing coercion.

## Consequences

- **Future derived gates extend the primitive, not the operator set.** A new
  derivation (e.g. a duration between two arbitrary date fields, or a
  future-facing "until") is added by widening `durationSince` / the `transform`
  enum and reusing the numeric operators — not by inventing fused operators or
  threading a second evaluator into the schemas.
- **Client and server stay identical for free.** `apps/forms` (via
  `behavior-helper.checkConditionalOn`) and `apps/api` both delegate to the same
  `evaluateCondition` and the same validation runners, so branch and block
  verdicts match across client and server with no duplicated logic. Any new
  derivation must preserve this single-evaluator path rather than re-implementing
  it (cf. the "two hydrators diverge" trap).
- **Editors expose the capability without a type system for it.** The builder
  gates the `transform` selector on intent rather than re-deriving field types:
  the conditional editor shows it only for the numeric operators (and clears a
  stale `transform` when the operator switches back to a non-numeric one); the
  validation editor offers it only on a date field's numeric rules, treats it as
  **mandatory** (seeded to `yearsSince`, no "none" option), because a duration
  rule with no transform compares the raw date (`NaN`) and can never pass.
- **`transform` is meaningful only with a numeric comparison.** It produces a
  number; pairing it with `equal`/`in`/`exists` or with a non-numeric value is
  an authoring error the editor steers away from, not a supported combination.
