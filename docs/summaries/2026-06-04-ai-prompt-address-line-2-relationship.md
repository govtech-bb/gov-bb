# AI prompt: address line 2 optional by default, relationship → select

**Date:** 2026-06-04
**Branch:** `worktree-address-line-2-optional-prompt`

## What changed

Two guardrail fixes in the embedded Form Builder AI system prompt
(`apps/form_builder_api/src/ai/system-prompt.ts`), each guarded by a new
content test in `system-prompt.spec.ts`:

1. **Address Line 2 is optional by default.** The CATEGORY 2
   inferred-required list now names "address line 1" instead of bare
   "address", and a new row tells the AI to NEVER infer `required` for
   "address line 2", "apt", "suite", "unit", or any second/continuation
   line — unless the form explicitly marks that line itself required.
2. **Relationship fields use `components/relationship`.** Rule 4 previously
   steered relationship fields to `components/generic-text`; it now mandates
   `components/relationship` (a registry select with baked-in options
   Spouse/Parent/…/Other) with a fieldId + label override. A Label Pattern
   row triggers on "relationship" labels, and the component reference now
   lists `components/relationship` (it was missing entirely).

## Why it looks this way

- **Bare "address" in the inferred-required list was the bug.** Nothing in
  the prompt distinguished line 1 from line 2, so the common-required-fields
  rule swept "Address Line 2" into required-by-default. The fix scopes the
  trigger word rather than adding an exception elsewhere — the AI reads the
  table row, not cross-references.
- **Continuation lines generalized per user direction** — apt/suite/unit
  follow the same logic as address line 2, so the rule names the pattern,
  not just the one field.
- **Rule 4 was actively wrong, not just silent.** `components/relationship`
  exists in the registry with baked-in options and a required validation,
  but the prompt told the AI to build relationship fields from
  `generic-text`. The rewrite also fixed the `components/name` reference
  line, which still suggested `generic-text` for "relationship description".
- **Spec guards assert phrasing the rules depend on** — e.g. a row-scoped
  regex proves "address line 1" (and not bare "address") sits inside the
  common-required-fields list, so a reworded row can't silently reintroduce
  the sweep. The relationship test bans the old "free-text relationship
  fields" guidance from returning.
- **Out of scope (deliberately):** `blocks/physical-address` /
  `blocks/emergency-contact-details` bundle a single `address` element with
  block-level validations in the registry — block-based forms have no
  line 2, so the prompt rule doesn't touch them. User chose not to open a
  follow-up.

## Verification

TDD both changes: tests written first and watched fail.
`system-prompt.spec.ts` 14/14, full `form-builder-api` suite green,
`nx run-many -t build --exclude=landing,cms` (13 projects), and
`pnpm exec tsc -b` all pass. Code-reviewer pass: 0 findings (verified the
prompt's cited option list matches `registry/src/components/relationship.ts`
exactly and no contradictory guidance remains).

Gotcha for future sessions: run `npx jest` for this spec from
`apps/form_builder_api/`, not the repo root — the root babel config lacks
the TS transform and fails with a bogus SyntaxError.
