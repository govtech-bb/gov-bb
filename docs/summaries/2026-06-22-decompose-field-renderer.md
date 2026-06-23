# Decompose apps/forms FieldRenderer (issue #1390 / LIB-02, interim)

## Context

Issue #1390 (LIB-02) asked apps/forms to stop reimplementing form inputs and
consume `@govtech-bb/react` primitives. That migration is **parked**: the package
renders a Radix + Tailwind design system while forms is built on `@govtech-bb/styles`
`govbb-*` GOV.UK markup — adopting the primitives is a visual + a11y + behavioural
restyle of a live citizen-facing service, not a swap (see the issue's 2026-06-22
orientation comment and kelz-roberts' "Parked for now"). Team direction confirmed we
are not shifting to `@govtech-bb/react` anytime soon, so the package-adoption
remediation was off the table.

What remained, and what this session delivered, is the **interim fix**: the residual
problem that doesn't depend on the package — `field-renderer.tsx` was 864 lines, the
repo's #1 complexity hotspot (also tracked by TECH-01 / #1418).

## What we did

- Split `apps/forms/src/components/field-renderer.tsx` (864 lines) into a
  `field-renderer/` folder: `index.tsx` (default export, pre-field guard logic,
  `<form.Field>` wrapper, `htmlType` dispatch), `render-context.ts`
  (`buildFieldRenderContext`), `repeatable-field.tsx`, and one module per field type
  (`number-input`, `date-field`, `text-field`, `textarea-field`, `select-field`,
  `checkbox-field`, `radio-field`, `show-hide-field`). `file` still delegates to the
  existing `file-upload.tsx`.
- Moved `field-renderer.spec.tsx` into the folder (only its import path changed:
  `./field-renderer` → `.`).
- Largest non-spec module is now 133 lines; no hotspot remains.

## Why we did it that way

- **Black-box spec as the equivalence proof.** The existing 1013-line
  `field-renderer.spec.tsx` asserts rendered `govbb-*` DOM, ids, `aria-*` and runs axe —
  it tests output, not internals. So the decomposition's safety contract was: the spec
  passes **unchanged** (734 passed / 1 skipped, identical to baseline) before and after.
  This let us refactor aggressively without writing new tests — the contract was already
  encoded. We deliberately did *not* touch the spec's assertions; only the moved file's
  relative import changed.
- **Render functions, not sub-components.** Each field type is a plain
  `render*(ctx): JSX.Element` function, not a `<FieldX>` React component. Introducing a
  component boundary would have added a layer to the React tree that, while not visible
  in the DOM, is a behavioural change we didn't need. Plain functions keep the render
  tree byte-identical to the original switch arms.
- **Shared context over prop threading.** The original inline block computed ~12 derived
  values (error state, `commitChange`, `sharedProps`, ids, `labelClass`) once per render.
  `buildFieldRenderContext` returns them as one object typed via
  `ReturnType<typeof buildFieldRenderContext>` — deliberately inferred rather than a
  hand-written interface, so `sharedProps`/`requiredProps` keep the *exact* inferred
  types the original literals had and spreading them onto input/textarea/select compiles
  identically.
- **Deduped the field-array logic.** The text-like and textarea arms carried
  byte-identical ~60-line field-array blocks (add/remove/immutable-update + repeat
  loop + Add Another/Remove buttons). Extracted once into `renderRepeatableOrSingle`,
  which takes a `renderControl(value, onChange, withRequired)` callback — the only thing
  that differed between the two arms.
- **Recursion via direct import.** select/radio render nested `<FieldRenderer>` for
  conditional-reveal inset fields. They `import FieldRenderer from "./index"`, creating a
  circular import (index → select-field → index). This resolves fine because the import
  is only referenced at render time, not module-eval time; the passing inset-reveal tests
  confirm it. Prop-injection was the fallback if the bundler choked — it didn't.
- **Faithfully preserved a latent quirk:** the nested `FieldRenderer` calls do *not*
  forward `insetFieldsByOption`, matching the original. Not "fixed" — this is a behaviour
  preservation, not a cleanup.

## Open questions

None. The two plan-time open questions were resolved: spec moved into the folder (user
direction), recursion uses direct import.
