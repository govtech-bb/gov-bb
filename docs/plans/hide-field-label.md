# Plan: Optionally hide a field's label

GitHub issue: [#522](https://github.com/govtech-bb/gov-bb/issues/522) — *Form builder: optionally hide a field's label (render field only)*

## Goal

Let a form author optionally hide a field's visible label so only the field
control renders, without losing the field's accessible name for screen-reader
users. Configurable per field from the form-builder; respected by the form
runtime.

## Approach

Add an optional `hideLabel` flag to the field's `ui` object
(`PrimitiveUI`). The renderer keeps the existing `<label>`/`<legend>` element in
the DOM but applies the existing `.govbb-visually-hidden` class when the flag is
set — preserving `htmlFor`/`<legend>` semantics (and therefore the accessible
name) while removing the label visually.

**Why `ui.hideLabel` over a top-level `hideLabel`:** label visibility is a
presentation concern, consistent with the existing `ui.width`. `ui` is already
in the `fieldOverridesSchema` pick-list and flows straight through to the
runtime `ClientPrimitive.ui`, so no extra plumbing in the override mapper.

**Why visually-hidden over `aria-label`:** keeping the element preserves the
exact `htmlFor` association (and `<legend>` group semantics for
checkbox/radio/date) rather than diverging per field type. It matches the
pattern already used in `field-renderer.tsx` for the repeatable-field
Remove/Add buttons.

Alternatives considered and rejected: top-level `hideLabel` (more plumbing, no
benefit); `aria-label` on the control (loses `<legend>` grouping, diverges per
type).

## Scope

- Add `hideLabel?: boolean` to `primitiveUISchema` in `@govtech-bb/form-types`.
- In `field-renderer.tsx`, conditionally append `.govbb-visually-hidden` to the
  label/legend for the supported field types:
  - `<label className="govbb-label">` — **text, textarea, number, tel, email,
    select**
  - `<legend className="govbb-fieldset__legend">` — **date, checkbox (single +
    multi), radio**
- **show-hide** and **file** ignore the flag (no-op): show-hide's label is the
  toggle's only text; file's label is the dropzone title. Leave them unchanged.
- Add a **"Hide label"** checkbox to the form-builder field edit panel
  (`-field-edit-panel.tsx`). This is the first `ui`-property control in the
  panel — patch via `ui: { ...overrides.ui, hideLabel: ... }`, writing
  `undefined`/cleaning empty `ui` when unchecked to keep contracts clean.

Out of scope: editing `ui.width` in the builder (still registry-only); changing
the default (labels remain visible unless the flag is explicitly set).

## Files

- `packages/form-types/src/primitive.type.ts` — add `hideLabel` to
  `primitiveUISchema` (~line 33-35). No change needed to
  `fieldOverridesSchema` (already picks `ui`) or
  `apps/forms/src/types/field-mapper.type.ts` (`ClientPrimitive.ui` is
  `PrimitiveUI`, inherits the field automatically).
- `apps/forms/src/components/field-renderer.tsx` — conditional class on the 5
  label sites + 4 legend sites. Consider a small local helper
  (e.g. `labelClass(base)` returning `base` or `${base} govbb-visually-hidden`)
  to avoid repetition.
- `apps/form_builder/app/routes/builder/-field-edit-panel.tsx` — add the
  "Hide label" checkbox, mirroring the existing Disabled/Hidden checkbox rows
  (~line 142-151).

## Verify

- `pnpm exec nx run-many -t build --exclude=landing` and
  `pnpm exec nx run-many -t test` both green.
- Unit: extend `field-renderer.spec.tsx` — assert that with `ui.hideLabel: true`
  the label/legend carries `govbb-visually-hidden` and is still present in the
  DOM (so `htmlFor`/accessible name intact); without the flag it does not.
  Cover at least one `<label>` type and one `<legend>` type.
- Manual: in the form-builder, toggle "Hide label" on a text field and a radio
  group; confirm the rendered form hides the label visually but a screen
  reader / accessibility tree still announces the field name.
- Confirm show-hide and file fields are unaffected by the flag.

## Open questions

- None blocking. Minor: whether to add a brief tooltip/help text next to the
  builder checkbox clarifying it stays accessible to screen readers — decide
  during implementation.
