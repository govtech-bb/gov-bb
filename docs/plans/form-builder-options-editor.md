# Form builder: options editor for select / radio / checkbox fields

Issue: https://github.com/govtech-bb/gov-bb/issues/311

## Goal

In the form-builder field-edit modal, expose an **options editor** for fields
whose `htmlType` is `select`, `radio`, or `checkbox`, plus a **`multiple`
toggle** for `select`. Today these fields can only get their options from the
registry default or via AI generation / raw recipe-JSON editing — the modal
silently drops the most important controls for the field type. The data model
already supports per-field option overrides (`fieldOverridesSchema` includes
`options` and `multiple`); this is purely a UI gap.

Block-child fields edit through the same `OverrideForm`, so the editor lands
for them automatically.

## Approach

A new `OptionsEditor` component, rendered conditionally inside `OverrideForm`
when `htmlType ∈ { select, radio, checkbox }`. Follows the existing
`-key-value-editor.tsx` idiom — plain JSX, native `<input>`s, CSS-module
styling, no form library, no DnD library.

Per row: **Label** input, **Value** input, **Disabled** checkbox, **↑ / ↓ / ✕**
buttons. An **Add option** button appends a blank row. A **Reset to defaults**
button (visible only when an override is set) clears the override and snaps
the editor back to registry defaults.

The `multiple` toggle is a separate checkbox above the options list, rendered
only when `htmlType === "select"` (radio is single by definition; checkbox is
multi by definition — the toggle would be meaningless on those).

**Pre-population from registry defaults.** When `overrides.options` is
undefined, the editor displays the field's *default* options (from the
registry primitive for top-level fields, or from the block element's
primitive for block-child fields). This requires threading two new props
through `OverrideForm`:

- `defaultOptions?: Option[]` — the registry-default options to show when no
  override is set
- `defaultMultiple?: boolean` — likewise for the `multiple` flag

The parent (`FieldEditPanel`) reads these from the resolved registry item:
- Top-level component: `item.primitive.options` / `item.primitive.multiple`
- Block child: `element.options` / `element.multiple` (block elements are
  primitives)

**Touching → override.** Any add / edit / reorder / delete on the options
list sets `overrides.options` to the current displayed array (initialising
from defaults on first touch). Toggling `multiple` likewise sets
`overrides.multiple`. The **Reset to defaults** button sets both back to
`undefined`, removing the override.

This keeps the "did the user edit?" decision declarative — the presence of
`overrides.options` *is* the override marker, exactly like `overrides.label`
today — and avoids a separate dirty flag.

**No schema or persistence work.** `fieldOverridesSchema` already has
`options` and `multiple`; `applyOverrides` already shallow-merges them onto
the resolved primitive. Drafts, publish, and preview already carry these
fields end-to-end.

Alternatives considered:

- *Pull in `@dnd-kit/sortable` for proper drag-and-drop reordering* —
  rejected: no DnD library exists in the monorepo, the repo's editor idiom
  (KeyValueEditor) uses simple controls, and up/down arrows are sufficient
  for option lists that are typically <20 rows.
- *Auto-derive `value` from `label`* — rejected: existing recipes use
  meaningful value codes (parish codes, ISO country codes) that aren't a slug
  of the label. Two explicit inputs match the KeyValueEditor pattern and
  avoid surprising the user.
- *Skip per-option `disabled` flag for v1* — rejected (with the user): the
  schema supports it and exposing it costs one checkbox per row.

## Scope

- New component `OptionsEditor` in
  `apps/form_builder/app/routes/builder/ui/-options-editor.tsx`:
  - props: `value: Option[]`, `defaultValue: Option[]`,
    `isOverridden: boolean`, `onChange: (next: Option[] | undefined) => void`
  - renders one row per option: Label input, Value input, Disabled checkbox,
    ↑ / ↓ / ✕ buttons (disable ↑ on first row, ↓ on last row)
  - **Add option** appends `{ label: "", value: "" }`
  - **Reset to defaults** (only when `isOverridden`) emits `onChange(undefined)`
- Wire into `OverrideForm` in `-field-edit-panel.tsx`:
  - Add `defaultOptions?: Option[]` and `defaultMultiple?: boolean` to
    `OverrideFormProps`.
  - Render the section only when `htmlType ∈ { select, radio, checkbox }`.
  - Show the `multiple` checkbox only when `htmlType === "select"`.
  - Apply the existing `styles.overrideField` outline to highlight when
    `overrides.options !== undefined` (or `overrides.multiple !== undefined`),
    matching how Label/Hint already signal override state.
- Thread defaults from `FieldEditPanel`:
  - Top-level: pass `item.primitive.options` / `item.primitive.multiple`
    (guarded for non-primitive items).
  - Block-child: pass `element.options` / `element.multiple` (block elements
    are primitives and carry these directly).
- Co-located spec test
  `apps/form_builder/app/routes/builder/ui/-options-editor.spec.tsx`,
  modelled on `-key-value-editor.spec.tsx`:
  - renders defaults when not overridden
  - add / edit / delete emits the expected `Option[]`
  - reorder via ↑ / ↓ emits the expected `Option[]`
  - Reset to defaults emits `undefined`
  - per-row `disabled` checkbox toggles the flag

## Files

- `apps/form_builder/app/routes/builder/ui/-options-editor.tsx` (new) — the
  component.
- `apps/form_builder/app/routes/builder/ui/-options-editor.spec.tsx` (new) —
  Jest + RTL, `@jest-environment jsdom` docblock per the form_builder pattern.
- `apps/form_builder/app/routes/builder/ui/-field-edit-panel.tsx` — add
  `defaultOptions` / `defaultMultiple` to `OverrideFormProps`, render
  `OptionsEditor` and the `multiple` checkbox conditionally on `htmlType`,
  pass defaults from the block-child branch and the top-level branch.
- `apps/form_builder/app/styles/builder.module.css` — small styles for the
  options-editor row layout (label / value / disabled / buttons) if existing
  utility classes don't cover it. Reuse `styles.overrideField` /
  `styles.checkRow` / `styles.sectionTitle` where possible.

## Verify

- `nx test form-builder-app` — the new `-options-editor.spec.tsx` and
  existing specs pass. (Per repo memory, the project name is
  `form-builder-app`, not `form_builder`.)
- `pnpm exec nx run-many -t build --exclude=landing` — all packages compile.
- `pnpm exec tsc -b` from the repo root — the CI Type Check job is a
  separate `tsc -b` pass that nx build (Vite) doesn't catch.
- Smoke test in the browser (Isaiah):
  - Open a recipe with a `select` field (e.g. parish picker) → editor shows
    the registry defaults; add a row, reorder, save; reload the draft and
    confirm the override persists; click **Reset to defaults** and confirm
    the field falls back to registry options.
  - Open a `radio` field → editor renders without the `multiple` toggle.
  - Open a `checkbox` field → same.
  - Open a block (e.g. `physical-address`) whose elements include a select
    (parish) → the per-child `OverrideForm` shows the options editor for
    that child only.
  - Preview the form after each change and confirm the rendered options
    match the editor.

## Open questions

- None blocking. Style polish (row spacing, disabled-row visual treatment)
  to be decided during implementation against the existing builder CSS.
