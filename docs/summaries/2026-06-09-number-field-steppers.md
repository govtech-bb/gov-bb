# Number fields use the design-system steppers (#647)

## Context

Number inputs in the forms app rendered with the **browser's default** up/down
spinner arrows — inconsistent across browsers and clashing with the rest of the
gov bb form controls
([#647](https://github.com/govtech-bb/gov-bb/issues/647)). Number fields shared
the generic text-input path in `field-renderer.tsx`
(`text` / `number` / `tel` / `email`), rendering through `MaskedInput` with the
`.govbb-input` class, which does nothing to native spinners. Resolved on
`forms/number-field-steppers-647` (targets `sandbox`).

## What we did

- Added a module-level **`NumberInput`** component in
  `apps/forms/src/components/field-renderer.tsx`: a native
  `<input type="number" class="govbb-number-input">` (native spinners
  suppressed) wrapped in `.govbb-number-input-wrapper`, with a
  `.govbb-number-input__steppers` block holding Increment / `__divider` /
  Decrement (`--down`) buttons. These are the BEM classes
  `@govtech-bb/styles` already ships; the arrows are pure CSS, so the buttons
  carry no content.
- Increment/decrement use **controlled JS**: parse the current string value,
  ±1, push through the existing `commitChange` flow. Blank/non-numeric → 0
  (so up → `1`, down → `-1`). No min/max — the number primitive schema carries
  no numeric constraints.
- Kept number in the shared switch case but swap the rendered control via a
  small `renderControl` helper; applied in both the single-field and
  "Add another" array paths. `text` / `tel` / `email` are untouched.
- Tests in `field-renderer.spec.tsx`: split `number` out of the shared
  `["number","tel","email"]` render test; added markup, increment, decrement,
  blank-stepping, and array-path coverage.

## Why we did it that way

- **CSS classes, not the `@govtech-bb/react` `NumberInput` component.** The
  issue floated rendering that exported component. But the forms app is built
  entirely on `@govtech-bb/styles` BEM classes + plain HTML wired to TanStack
  Form via controlled `value`/`onChange` — it does not consume the React
  component library. The exported `NumberInput` is a *Tailwind* component with
  its own label/hint/error markup and a `number | ''` value; dropping it in
  would have fought FieldRenderer's existing layout and string-valued flow. The
  BEM-class route matches every other field in the file.
- **Dropped `MaskedInput` for number.** The masking concern in the issue is
  moot: no number field uses a mask in practice (the one masked field, National
  ID, is `htmlType: "text"`), and Maskito does not work on a native
  `type="number"` input anyway.
- **A `renderControl` helper instead of a separate `case`.** The plan said to
  split `number` into its own `case`, but that would have duplicated ~45 lines
  of the array-path add/remove/update boilerplate. Branching the *input
  element* inside the shared case via `renderControl` reaches the same outcome
  (number off `MaskedInput`, text/tel/email unchanged) without the duplication.
- **Steppers are `tabIndex={-1}`.** A native `type="number"` already handles
  ↑/↓ keys (which fire the input's own `onChange`), so the custom buttons are
  pointer affordances only — mirroring the `@govtech-bb/react` component's
  semantics. They carry `aria-label` + `aria-controls`, and the input's
  `aria-invalid` drives the steppers' error border via the stylesheet's
  `:has(...)` rules.

## Follow-up

- The "Add another" array path gives every repeated input the same `id`
  (pre-existing); the new steppers' `aria-controls` now make that duplication
  semantically meaningful for assistive tech. Tracked separately — out of scope
  for this change.
