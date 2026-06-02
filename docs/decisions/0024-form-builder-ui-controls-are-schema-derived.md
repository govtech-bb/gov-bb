# 0024 — Form builder `ui` controls are schema-derived

**Date:** 2026-06-01
**Status:** Accepted
**Related:** [#533](https://github.com/govtech-bb/gov-bb/issues/533), [#522](https://github.com/govtech-bb/gov-bb/issues/522), [ADR 0013](./0013-form-builder-round-trip-preserves-unauthored-fields.md), [ADR 0014](./0014-form-builder-processor-config-edits-preserve-unrendered-keys.md)

## Context

A field's presentation `ui` object (`primitiveUISchema` in
`@govtech-bb/form-types`) flows through `fieldOverridesSchema`'s `ui` pick to the
runtime `ClientPrimitive.ui`. It currently holds `ui.width`
(`"short" | "medium" | "long"`) and `ui.hideLabel` (`boolean`).

`hideLabel` was first exposed in the builder (#522) as a bespoke checkbox wired
by hand into `OverrideForm`. `ui.width` had no builder control at all — authors
had to hand-edit the recipe. The straightforward fix was to add a second bespoke
control next to the checkbox, but that path means **every future `ui` key needs
its own hand-wired control**, and each one re-implements the same
"clear-to-default ⇒ collapse `ui` to `undefined`" logic, inviting drift.

## Decision

The form builder **derives `ui` controls from the schema** rather than wiring
one per key. A single `UiPropertiesEditor`
(`apps/form_builder/app/routes/builder/-field-edit-panel.tsx`) introspects
`primitiveUISchema.shape`, unwraps each `ZodOptional`, and renders one control
per key by inner type:

- **`ZodBoolean`** → checkbox. Unchecked clears the key.
- **`ZodEnum`** → native `<select>` over the enum members. Selecting the
  configured default clears the key.

A small `UI_FIELD_META` map supplies a human label and (for enums) the default
value that collapses to `undefined`; keys absent from the map fall back to a
humanized key name. Clearing the last set key collapses the whole `ui` object to
`undefined`, preserving the override contract.

Consequence by construction: **adding a `ui` property is a schema change, not a
panel change.** Extend `primitiveUISchema`, add a label/default entry if the
defaults aren't acceptable, and the control surfaces automatically.

## Consequences

- **Any new `ui` key must be expressible by the schema-driven renderer.** A key
  whose inner type is neither boolean nor enum will not render until
  `UiPropertiesEditor` learns that type — the editor `log`s nothing and silently
  skips unknown types, so an unhandled type is a no-op control, not an error.
  Adding a new control type is the place to extend, not per-field code.
- **The clear/collapse predicate must not assume truthiness.** A key is dropped
  only on `false` (checkbox off) or `undefined` (enum at default), never via
  `value || undefined` — a future falsy-but-valid value (`0`, `""`) must
  survive. This is the one spot that would otherwise quietly break the
  schema-driven promise.
- **Enum defaults live in `UI_FIELD_META`, not the schema.** `width` defaults to
  `long` because an unset/`long` width already renders full-width at runtime (no
  CSS/runtime/schema change). The hardcoded default is load-bearing: it both
  pre-selects the dropdown and defines the value that clears the key. A test
  guards that it stays a real schema enum member so a reorder/rename can't
  silently desync it.
- This is the **control-generation** counterpart to ADR 0013/0014. Those govern
  what is *preserved* through round-trip and edits; 0024 governs how `ui`
  controls are *produced* — from the schema, once, for all keys.
