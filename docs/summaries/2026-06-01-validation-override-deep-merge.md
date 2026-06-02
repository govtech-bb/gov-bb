# Fix: validation overrides no longer drop primitive format rules (#371)

**Date:** 2026-06-01
**Issue:** [#371](https://github.com/govtech-bb/gov-bb/issues/371)

## What changed

`apps/api/src/registry/resolution.ts` now deep-merges a field's `validations`
object when applying recipe overrides, instead of shallow-spreading it. Both
`applyPrimitiveOverrides` (standalone primitives) and `applyBlockOverrides`
(block child fields) go through the new `mergeValidations` helper.

## Why

Citizen-facing forms (e.g. apply-for-conductor-licence) accepted `notanemail`
and `abc` as email/telephone and advanced past the step. The first diagnosis in
the issue blamed missing validation infrastructure — a non-existent `tel` runner,
`raw-text` email fields bypassing format checks — and proposed building new
runners and migrating recipes.

That diagnosis was wrong, and chasing it would have added dead code. Tracing the
conductor-licence form showed the runners already exist and the primitives
already ship the rules:

- `components/email` ships `validations.required` **and** `validations.email`.
- `components/telephone` ships `validations.required` **and** `validations.pattern`.

The real cause was the merge. `applyPrimitiveOverrides` did
`{ ...primitive, ...overrides }` — a shallow spread, so `overrides.validations`
**replaced** the whole `validations` object. A recipe that overrode only the
`required` error message silently deleted every other rule the primitive shipped.
This affects any primitive with more than one rule, not just email/telephone.

The fix already existed in the sibling preview path
(`packages/form-builder/src/resolution.ts` — `mergeValidations` + `applyOverrides`,
plus a regression test). We ported that proven pattern into the API path rather
than inventing anything new.

## Decisions

- **Ported, didn't extract.** The two `resolution.ts` files are already
  near-total duplicates (whole `hydrateForm`/`hydrateStep` differ, not just the
  merge helper), and cross-package references carry build gotchas in this
  monorepo. A shared helper wouldn't meaningfully de-duplicate them, so we
  duplicated the small helper and flagged "unify the two hydration paths" as a
  separate follow-up.
- **Format strictness left untouched.** The email/telephone patterns themselves
  (Zod `z.email()`, the existing phone regex) are preserved as-is. This change
  only stops them from being dropped; choosing stricter patterns is out of scope.

## Tests

Two regression tests in `registry.service.spec.ts`, mirroring the form-builder
test: override only `required` on `components/email` (standalone) and on the
`email` child of `blocks/contact-information`, assert the shipped `email` rule
survives. Both fail under the old shallow merge.

`nx test api` (626 tests) and `nx build api` green.
