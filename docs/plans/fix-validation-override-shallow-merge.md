# Fix: email/telephone format validation silently dropped by shallow override merge

Resolves [#371](https://github.com/govtech-bb/gov-bb/issues/371).

## Goal

Citizen-facing forms should reject malformed email and telephone values. Today a
citizen can type `notanemail` and `abc` into the conductor-licence form's contact
step, click Continue, and the form advances — the format checks the primitives
ship with are being silently disabled.

## Root cause (verified)

The bug is **not** missing validation infrastructure. Both rules exist and are
shipped by default:

- `packages/registry/src/components/email.ts` — `EmailAddress` ships
  `validations.required` **and** `validations.email`.
- `packages/registry/src/components/telephone.ts` — `Telephone` ships
  `validations.required` **and** `validations.pattern`.

The citizen-facing form is hydrated through
`apps/api/src/registry/resolution.ts`, whose merge helpers are **shallow**:

```ts
function applyPrimitiveOverrides(primitive, overrides) {
  return { ...primitive, ...overrides };          // overrides.validations REPLACES the whole object
}
function applyBlockOverrides(block, overrides) {
  // ...
  return { ...el, ...fieldOverride };              // same bug for block children
}
```

When a recipe overrides `validations` at all — even just to reword the
`required` error — the spread replaces the entire `validations` object and the
primitive's `email`/`pattern` rule is dropped. The conductor-licence recipe does
exactly this, so its format checks never fire.

This affects **any** primitive shipping more than one rule, not just
email/telephone.

## Approach

Port the deep-merge that **already exists** in the sibling hydration path
(`packages/form-builder/src/resolution.ts` — `mergeValidations` + `applyOverrides`,
with a regression test at `resolution.spec.ts:133`) into the API path. Merge
`validations` key-by-key so override keys win but un-overridden primitive rules
survive.

Apply it in **both** `applyPrimitiveOverrides` (standalone primitives) and
`applyBlockOverrides` (block child fields) — both have the identical bug.

### Alternatives considered

- **Extract the merge into a shared package** both paths import. Rejected for
  now: the two `resolution.ts` files are already near-total duplicates (entire
  `hydrateForm`/`hydrateStep` differ, not just the helper), so a shared helper
  wouldn't meaningfully de-duplicate them, and cross-package references carry
  real build gotchas in this monorepo (see CLAUDE.md, `TS6059`/`TS6307`).
  Unifying the two hydration paths is worth a **separate follow-up issue**.
- **The issue's original suggestions** (add a `tel` runner, migrate `raw-text`
  email recipes to `raw-email`). Rejected: the runners already exist and work —
  they were only being switched off by the shallow merge. Confirmed unnecessary.

## Scope

- Add a `mergeValidations` helper to `apps/api/src/registry/resolution.ts`,
  mirroring the form-builder implementation.
- Use it in `applyPrimitiveOverrides`.
- Use it in `applyBlockOverrides` (per-child merge).
- Regression tests asserting: primitive/child ships rules A+B, recipe overrides
  only A, hydrated result still has overridden-A **and** preserved-B.

## Files

- `apps/api/src/registry/resolution.ts` — add `mergeValidations`; deep-merge
  `validations` in both `applyPrimitiveOverrides` and `applyBlockOverrides`.
- `apps/api/src/registry/registry.service.spec.ts` — add regression tests beside
  the existing `mergeEntry` block (one for a standalone primitive, one for a
  block child).

## Verify

- New tests fail before the fix, pass after.
- `pnpm exec nx run-many -t build --exclude=landing`
- `pnpm exec nx run-many -t test`
- Manual (optional): conductor-licence contact step — `notanemail` / `abc` now
  surface format errors and the step does not advance.

## Open questions

- None blocking. Phone/email *format strictness* (E.164 vs local pattern, Zod
  `z.email()` vs RFC 5322) is out of scope — the primitives' current patterns are
  preserved as-is; this change only stops them being dropped.

## Follow-up (not in this change)

- Consider unifying the two parallel hydration paths
  (`apps/api/src/registry/resolution.ts` vs
  `packages/form-builder/src/resolution.ts`) to prevent this class of drift.
