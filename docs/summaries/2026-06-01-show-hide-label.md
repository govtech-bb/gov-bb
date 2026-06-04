# Rename the show/hide component label from "Show more" to "Show / hide"

## Context

Worktree branch `worktree-fix+show-hide-label` (merges into `sandbox`). No
GitHub issue — reported directly: the show/hide component appears in the form
builder's field-picker palette as **"Show more"**, which reads like a generic
"reveal more text" control rather than a show/hide toggle.

The palette (`apps/form_builder/app/routes/builder/-field-picker.tsx`) renders
each component's `primitive.label`. For show/hide that label was hardcoded
`"Show more"` in two places: the registry definition
(`packages/registry/src/components/show-hide.ts`) — the source the palette
actually reads — and the (currently vestigial, see issue #515) builtin
definition (`packages/form-builder/src/builtins/components/show-hide.ts`).

## What we did

- Changed `label: "Show more"` → `label: "Show / hide"` in both
  `packages/registry/src/components/show-hide.ts` and
  `packages/form-builder/src/builtins/components/show-hide.ts` (kept in sync).

## Why we did it that way

- **Changed the `label` directly, not the palette rendering.** The palette
  shows the field's `label` rather than a dedicated type name (the builtin's
  `displayName: "Show / hide toggle"` is unused by the palette). The cleaner
  long-term fix would decouple palette display from the field label, but that
  touches the picker and would need a display-name concept on registry
  primitives. We deliberately scoped to the one-line label change.

- **Accepted the downstream side effect.** That same `label` is the *default
  clickable button text on the rendered end-user form*
  (`apps/forms/src/components/field-renderer.tsx` renders `field.label`). So new
  show/hide fields now default their button text to "Show / hide" too, until a
  form author overrides it per-field. This was raised and accepted as in-scope
  rather than introducing a separate palette-only name.
