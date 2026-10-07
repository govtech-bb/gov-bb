# 0073 — A derived authoring default tracks its source until an author overwrites it

**Date:** 2026-09-17
**Status:** Accepted

## Context

The Form Builder derives values for the author: a required error message from
the field's Label (#2710), a step id from the step's Title
(`step-editor.tsx`), a Field ID from a typed string via `kebabize`. Each one
has the same two failure modes, and the tool had been picking one or the other
almost at random.

Leave the derived value alone after it is first written and it goes stale: a
field renamed from "Employer" to "Employer name" keeps telling the applicant
"Employer is required". Re-derive it unconditionally and the tool destroys
copy someone wrote on purpose — which is the bug #2710 was opened about, where
ticking a checkbox labelled "Required" silently replaced the registry's
"Email address is required" with nothing.

The tempting fix is to record which values are auto-generated — a boolean
beside the value. But the recipe is the published contract consumed by the
forms renderer, the validator and the analytics dashboard. A flag there is
authoring state leaking into an artifact that has no use for it, and it must
then be kept correct through every path that writes the field: the panel, the
AI apply path, a ref swap, a block child.

## Decision

**A value the builder derives from another field re-derives while it still
reads as derived, and stops the moment the author writes something else.
"Reads as derived" is decided by recomputing the derivation from the
_previous_ source value and comparing — never by storing a flag in the
recipe.**

Concretely, for a derivation `f(source)`, on a change from `source` to
`source'` the stored value is replaced with `f(source')` when it is absent,
equal to `f(source)`, or equal to the system default the derivation exists to
replace. Otherwise it is left exactly as it is.

Corollaries:

- **Recipes carry no authoring metadata.** Nothing in a recipe records how a
  value got there.
- **The predicate is pure and lives beside the editor**, not in the component —
  it is the part worth testing exhaustively
  (`builder/required-message.ts`).
- **A registry default written in the derived shape is treated as derived.**
  `components/email` ships "Email address is required" against the label
  "Email address", so renaming the field carries the message; a bespoke
  message like "Enter your employer's name" does not match and survives.
- **The comparison runs against the value the applicant actually gets**, which
  for a field resolved through `applyFieldOverrides` is not a per-key fallback:
  `shallowMergeDefined` replaces a whole rule object, so an override's bare
  `{ value: true }` discards the base's message entirely. Reading the base's
  message in that state would freeze the field on the generic default
  (`effectiveRequiredMessage`).
- **The accepted cost:** an author who hand-types exactly the derived string
  loses the distinction, and a later rename will re-derive it. The result is
  the string they would have typed anyway.

## Consequences

Future derived defaults in the builder — a hint from a component, an option
value from an option label, a step id from a title — implement this predicate
rather than inventing a third behaviour. Anything that genuinely cannot be
recomputed from its source needs a different design, not a flag in the recipe.

The predicate is only as good as the derivation's stability: change the house
pattern (`"{Label} is required"`) and every message written under the old
pattern stops reading as derived and freezes. That is the right failure — it
preserves author intent — but it means the pattern is a published interface,
documented in `.claude/skills/form-design/SKILL.md`, not an implementation
detail.
