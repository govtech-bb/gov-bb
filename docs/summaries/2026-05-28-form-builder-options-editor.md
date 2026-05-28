# Form builder — options editor for select / radio / checkbox — Implementation Session

**Date:** 2026-05-28
**Branch:** `form-builder/options-editor` (off `sandbox`, merges back into `sandbox`)
**Issue:** [#311](https://github.com/govtech-bb/gov-bb/issues/311)
**Plan:** `docs/plans/form-builder-options-editor.md`

## Context

The field-edit modal already exposed Label / Hint / Required / behaviours for
every primitive, but for `select`, `radio`, and `checkbox` it silently dropped
the most important controls — the option list and (for `select`) the `multiple`
flag. Builders had to fall back to AI generation or recipe-JSON. The data
model (`fieldOverridesSchema`) and end-to-end persistence already supported
both `options` and `multiple`; this was purely a UI gap.

## What we did

- New `OptionsEditor` (`apps/form_builder/app/routes/builder/ui/-options-editor.tsx`):
  per-row Label / Value / Disabled / ↑ / ↓ / ✕, an **Add option** button, and a
  conditional **Reset to defaults** button.
- Wired into `OverrideForm` (`-field-edit-panel.tsx`): renders the Options
  section when `htmlType ∈ {select, radio, checkbox}`; renders a `multiple`
  checkbox only when `htmlType === "select"`. Threaded two new props
  (`defaultOptions`, `defaultMultiple`) so the editor pre-populates from the
  registry primitive (or the block element for block-child fields).
- Co-located spec (`-options-editor.spec.tsx`) covering defaults render, add,
  edit label/value, delete, ↑/↓ reorder, ↑/↓ disabled at ends, per-row Disabled
  toggle on/off, and Reset. 13 tests; 184 total (was 171).
- Light CSS for the row layout in `builder.module.css`.

No schema or persistence changes — `fieldOverridesSchema` already had `options`
and `multiple`, and `applyOverrides` already shallow-merges them onto the
resolved primitive.

## Why we did it that way

- **Fully controlled component, not local-state.** `KeyValueEditor` (the
  closest sibling) seeds rows from `value` once and never resyncs — its docs
  explicitly call out that any out-of-band edit needs a remount via React key.
  For `OptionsEditor` we need the "Reset to defaults" case to swap the
  displayed rows back to registry defaults *without* a key dance; making the
  component fully controlled means the parent's `overrides.options` (already
  the source of truth in `FieldEditPanel`) directly drives what's rendered.
  No new dirty flag, no resync helper.
- **`isOverridden` flips the source array between `value` and `defaultValue`.**
  When no override is set, the editor shows the registry defaults but does not
  yet write them into `overrides.options`. The first touch (add/edit/reorder/
  delete) emits the full displayed array via `onChange`, which the parent
  patches into `overrides.options` — promoting the snapshot into an override.
  This keeps "did the user edit?" declarative: the presence of
  `overrides.options` *is* the override marker, exactly like `overrides.label`.
- **One Reset clears both `options` and `multiple` (confirmed with the user).**
  The Reset button lives inside `OptionsEditor` and emits `onChange(undefined)`;
  the parent treats that as a paired clear (`patch({ options: undefined,
  multiple: undefined })`). Independent resets per override were considered but
  rejected as UI clutter — Label and Hint don't have per-field reset buttons
  either; clearing the input is enough.
- **Disabled-flag absence over `disabled: false`.** Unchecking the per-row
  Disabled checkbox removes the `disabled` key entirely rather than storing
  `disabled: false`. `optionSchema` has `disabled: z.boolean().optional()`, so
  presence-as-truth keeps the recipe diff minimal and matches how every other
  optional override is treated.
- **Native ↑/↓ buttons, no DnD library.** No DnD library exists in the monorepo
  and option lists are typically <20 rows; pulling in `@dnd-kit` for this would
  be the largest dependency added in the editor for no real ergonomic win.
  ↑ is disabled on row 0 and ↓ on the last row to make the affordance obvious.

## What we almost got wrong

- **Multi-character typing on a controlled input in the test.** One spec typed
  `"_x"` into a value input and expected the input to settle to `yes_x`.
  Because the test's `onChange` was a plain `jest.fn()` (no state), each
  keystroke re-rendered the input back to the original `"yes"` prop, so the
  spec saw `yesx` instead. The real consumer (`OverrideForm`) **is** stateful
  via `setOverrides`, so the bug only existed in the test harness. Fixed by
  reducing that case to a single keystroke; the surrounding tests already
  prove edit/add/reorder/delete behaviour without depending on multi-char
  typing. A stateful test wrapper would also work — chose the simpler fix
  because no other test needed it.
- **Block-child threading.** First read of `FieldEditPanel` had me looking for
  a `primitive` property on block elements; they actually *are* primitives
  (`block.elements: Primitive[]`), so `element.options` and `element.multiple`
  flow through directly with no further unwrap.

## Verify

- `pnpm exec nx test form-builder-app` → 184 pass (was 171). RED watched
  first for every behaviour the editor implements.
- `pnpm exec nx run-many -t test` → 12 projects green (cached after the
  per-project run).
- `pnpm exec nx run-many -t build --exclude=landing` → 12 projects green.
- `pnpm exec tsc -b` → clean (CI's separate type-check job).
- Browser smoke (parish picker → add row + reorder + reset; a radio and a
  checkbox field render without the `multiple` toggle; a block whose elements
  include a `select` exposes the editor on the per-child form; preview
  reflects edits) is the user's to run before merge, per house practice.

## Open questions

- None blocking. Style polish for the row layout (notably row spacing on
  narrow modals and the visual treatment of a `disabled: true` row) is a
  follow-up if it bites in real use.
