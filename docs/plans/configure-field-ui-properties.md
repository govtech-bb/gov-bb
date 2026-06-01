# Configure field `ui` properties in the form builder

GitHub issue: #533

## Context

Fields carry a presentation `ui` object (`primitiveUISchema` in
`@govtech-bb/form-types`) that flows through `fieldOverridesSchema`'s `ui` pick
to the runtime `ClientPrimitive.ui`. It currently holds two keys:

- `ui.width` — `"short" | "medium" | "long"`
- `ui.hideLabel` — `boolean` (added in #522 / PR #532, with an editable
  checkbox in the field edit panel)

`hideLabel` is now editable in the builder, but `ui.width` is still
registry-only — authors can't set field width without hand-editing the recipe.
Rather than hand-add one bespoke control per `ui` key, this change introduces a
**schema-driven `ui` editor**: it reads the keys off `primitiveUISchema` and
renders the right control per key, so the existing `hideLabel` and the new
`width` control both come from the same code, and future `ui` keys surface
automatically with no panel wiring.

## Approach

Replace the standalone `hideLabel` checkbox in `OverrideForm` with a small
`UiPropertiesEditor` that introspects `primitiveUISchema.shape` and renders one
control per key:

- **Boolean key** (`ZodBoolean`) → checkbox. Unchecked ⇒ key `undefined`
  (exactly today's `hideLabel` behaviour).
- **Enum key** (`ZodEnum`) → native `<select>` with the enum's options. The
  selector's default value collapses the key to `undefined` (no persistence);
  any non-default value is written.

A tiny per-key metadata map supplies a human label and (for enums) the default
value:

```ts
const UI_FIELD_META: Partial<Record<keyof PrimitiveUI, { label: string; default?: string }>> = {
  width: { label: "Field width", default: "long" },
  hideLabel: { label: "Hide label" },
};
```

Keys absent from the map fall back to a humanized key name; boolean keys need no
entry. This keeps the editor schema-driven while letting us pick wording and the
enum default.

**Why `long` is the width default.** Today an unset `ui.width` renders
full-width — the runtime CSS (`apps/forms/src/styles/govtech.css`) only sizes
`short` (33%) and `medium` (50%); there is no rule for `long` or unset, so both
render full-width. Treating `long` as the default therefore needs **no CSS,
runtime, or schema change**: the selector shows `long` when `width` is unset,
and choosing `long` clears the value. Choosing `short`/`medium` persists it.
This keeps the "clean empty `ui` ⇒ `undefined`" override contract intact (ADRs
0013 / 0014).

### Alternatives considered

- **One-off width control** next to the existing checkbox — smallest diff, but
  every future `ui` key needs hand-wiring; rejected per the issue's request for
  a general pattern.
- **Make `medium` the true default** (add a CSS/runtime fallback so unset ⇒
  50%) — broader than "expose existing properties", changes rendering for every
  existing unset field, and needs a reachable full-width option. Rejected;
  `long`-as-default avoids all of it.

## Scope

- Add `UiPropertiesEditor` (schema-driven) and render it in `OverrideForm`,
  replacing the inline `hideLabel` checkbox.
- Width is editable via a select (short / medium / long), defaulting to `long`
  (unset). Choosing the default clears the key; `ui` collapses to `undefined`
  when it holds no set keys.
- Preserve any `ui` keys the editor doesn't render via the spread pattern
  (`{ ...overrides.ui, [key]: value }`), per ADR 0014.
- No changes to `primitiveUISchema`, the runtime renderer, or CSS.

## Files

- `apps/form_builder/app/routes/builder/-field-edit-panel.tsx` — add the
  `UiPropertiesEditor` component (zod-shape introspection + label/default
  metadata) and call it from `OverrideForm` where the `hideLabel` checkbox
  currently lives (~lines 152–172). Reuse the existing `fg()` / `patch()`
  helpers and `styles.formGroup` / `styles.checkRow` classes. Native `<select>`
  usage mirrors `-field-ref-picker.tsx` and `-validation-rules-editor.tsx`.
- `apps/form_builder/app/routes/builder/-field-edit-panel.spec.tsx` — add tests
  (below). Existing tests use `@testing-library/react` + `userEvent` and assert
  on the dispatched override payload.

### zod 4 introspection note

The repo is on **zod ^4.3.6** (root resolves 4.4.3). Confirm the unwrap/enum
APIs against the installed version during implementation — read keys via
`primitiveUISchema.shape`, unwrap `ZodOptional` to its inner type, branch on the
inner type (boolean vs enum), and read enum members from the inner schema.
Verify the exact accessors (`.unwrap()` / `.def` / `.options`) rather than
assuming the zod 3 shape.

## Verify

- `pnpm exec nx run-many -t build --exclude=landing` — compiles (form-builder +
  form-types).
- `pnpm exec nx run-many -t test` — all suites pass, including the new
  field-edit-panel tests.
- New unit tests in `-field-edit-panel.spec.tsx`:
  - Selecting `short`/`medium` dispatches an override with
    `ui.width` set to that value.
  - Selecting `long` (the default) on a field whose only `ui` key was `width`
    dispatches `ui: undefined` (collapsed, not `{}`).
  - Toggling `hideLabel` via the schema-driven editor still works and still
    collapses `ui` to `undefined` when it's the last key cleared (regression of
    #522 behaviour).
  - Setting `width` while `hideLabel` is already set preserves both keys.
- Manual: open the builder, edit a field, change width to `short`/`medium`,
  confirm the recipe override carries `ui.width`; set it back to `long` and
  confirm `ui` is gone from the override. (Renderer already has `data-field-width`
  coverage in `apps/forms/src/components/field-renderer.spec.tsx`.)

## Open questions

None outstanding. `long`-as-default is confirmed; no schema/CSS/runtime change.
