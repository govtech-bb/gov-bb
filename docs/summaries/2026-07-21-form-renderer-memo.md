# Session summary — Form-renderer per-keystroke re-render fix (#1991)

**Date:** 2026-07-21 · **Branch:** `perf-1991-form-renderer-memo` (off current
`main`) · **Builds on:** #1981 (merged; the `FormRenderer → ActiveStep` split).

## What shipped

`ActiveStep` re-rendered on every keystroke and re-ran its O(n²) field-grouping
each time. Two fixes in `apps/forms/src/components/form-renderer.tsx`:
- **`shallow` comparator** (from `@tanstack/react-store`) as the 3rd arg to the
  three selectors that return a fresh object each call — `errors`,
  `showHideValues`, `repeatableStepValues` — so `ActiveStep` only re-renders when
  their contents actually change.
- **`useMemo`** on `currentFields` (dep `currentStep`) and `fieldGroups`
  (dep `currentFields`) so `buildFieldGroups` runs only on a step change.

Added `@tanstack/react-store` as a direct dep of forms via the pnpm **catalog**
(`^0.9.3`).

## Why it looks the way it does

- **Reference-equality is the root cause.** `useStore` defaults to
  `(a,b) => a === b`. Selectors returning a new object every call therefore always
  compare "changed" → a re-render per store update (per keystroke). `shallow`
  compares contents, so an unchanged result no longer re-renders. Confirmed by
  reading the installed `useStore.d.ts` (`compare?: (a,b)=>boolean`) and
  `shallow.d.ts` before wiring.

- **Bonus stabilisation.** `shallow` on `repeatableStepValues` also fixes the
  effect keyed on it (`[repeatableStepValues]`), which previously fired every
  render.

- **`isSubmitting` (boolean) and `resolvedStepTitle` (string) left untouched** —
  primitives are already stable under `===`.

- **`shallow` sourced from the library, added properly.** `@tanstack/react-form`
  (which forms already uses for `useStore`) does not re-export `shallow`; it lives
  in `@tanstack/react-store`, previously only a transitive dep. Added it as a
  direct dep via the pnpm catalog at the exact resolved version (0.9.3), rather
  than importing a transitive package or hand-rolling a `shallowEqual` — reuse the
  library's own, declared honestly.

## Verification

`forms:test` 776/776 (the existing renderer/step/validation/repeatable tests are
the behaviour safety net); forms lint clean (react-hooks satisfied with the memo
deps); `forms:build` compiles. The actual render-count win is confirmable
manually with a temporary `console.count` in `ActiveStep`/`buildFieldGroups`
while typing.
