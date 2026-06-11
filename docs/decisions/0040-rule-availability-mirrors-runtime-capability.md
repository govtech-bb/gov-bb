# 0040 — Builder rule availability mirrors runtime capability

## Context

`VALIDATION_RULE_DESCRIPTORS` (`packages/form-builder/src/behaviors/validation-builder.ts`)
is the single source of truth for which validation rules a field type offers in
the builder UI — and, via `migrateOverridesForRef`, which rules survive a
field-type swap. Until now its entries roughly tracked field-type *semantics*:
numeric comparisons lived only under `number`, year bounds only under `date`.

Issue #830 surfaced the gap: authors needed `gt`/`lt`/`min`/`max` and
`minYear`/`maxYear` on text fields, and the runtime rule runners in
`@govtech-bb/form-validation` (the sole home for rule execution, per ADR 0029)
already handle string values — `toYear` accepts 4-digit strings, the numeric
runners coerce via `Number()` and fail cleanly on `NaN`.

## Decision

A field type offers a validation rule in the builder when the **runtime
validator handles that field's value type** — not when the rule "semantically
belongs" to the field type. Semantics of a field are defined by its renderer
and value shape (ADR 0027), so a text field whose values may be numeric is a
legitimate target for numeric rules.

Today's instance: the `text` descriptor entry gained `gt`, `lt`, `min`, `max`,
`minYear`, `maxYear`, with shapes mirroring the `number`/`date` entries.

## Consequences

- Future "should field type X offer rule Y?" questions are answered by reading
  the rule runner: if it copes with X's value type (including coercion that
  fails loud, like `Number()` → `NaN` → rule failure), the descriptor entry may
  list it. If it would misbehave silently, it must not.
- Withholding a runtime-capable rule from a field type (e.g. `tel` today) is a
  deliberate product choice, not an architectural constraint — extending it
  later is a descriptor-only change.
- Swap carry-over follows automatically: rules survive any swap whose target
  descriptor lists them (`ref-swap.ts`), so widening a descriptor also widens
  what migrations preserve.
