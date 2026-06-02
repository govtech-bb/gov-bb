# Configure field `ui` properties in the form builder

## Context

Implemented from `docs/plans/configure-field-ui-properties.md` on worktree
branch `feat/533-configure-field-ui-properties` (merges into `sandbox`). Issue
[#533](https://github.com/govtech-bb/gov-bb/issues/533).

`ui.hideLabel` had been made editable in the builder (#522) via a bespoke
checkbox, but `ui.width` was still registry-only — authors couldn't set field
width without hand-editing the recipe. The issue asked for a general,
schema-driven pattern so future `ui` keys surface without per-key wiring, rather
than a second one-off control.

The session opened on a **stale `sandbox`**: the plan assumed #522 had landed,
but locally `primitiveUISchema` still had only `width` and there was no
`hideLabel` checkbox to migrate. PR #532 had in fact merged remotely — pulling
the updated `sandbox` resolved the drift before any code was written.

## What we did

- **`UiPropertiesEditor`** in `apps/form_builder/.../-field-edit-panel.tsx` —
  introspects `primitiveUISchema.shape`, unwraps each `ZodOptional`, and renders
  a checkbox per `ZodBoolean` key and a native `<select>` per `ZodEnum` key. It
  replaces the bespoke `hideLabel` checkbox, so `hideLabel` and the new `width`
  control both come from one code path.
- **`UI_FIELD_META`** supplies a label and (for enums) the default that clears
  the key; unmapped keys fall back to `humanize()`.
- **Width defaults to `long`** — choosing it clears the key; `short`/`medium`
  persist. See ADR 0024 for the reasoning and constraints this establishes.
- **Tests** — width set/clear, `ui` collapse to `undefined`, the #522 hideLabel
  regression, width+hideLabel coexistence, plus two guard tests added during
  review (default-stays-a-real-enum-member, `humanize` fallback).

## Why we did it that way

- **Schema-driven over a second bespoke control** — the per-key path re-wires the
  panel and re-implements the clear/collapse logic for every future `ui` key.
  Reading controls off the schema makes "add a `ui` property" a schema change,
  not a panel change. This is the convention recorded in
  [ADR 0024](../decisions/0024-form-builder-ui-controls-are-schema-derived.md).
- **`long`-as-default needs no CSS/runtime/schema change** — verified in
  `apps/forms/src/styles/govtech.css`: at ≥768px only `short` (33%) and `medium`
  (50%) are sized; `long`/unset already render full-width. So treating `long` as
  the default that clears the key keeps the "empty `ui` ⇒ `undefined`" contract
  with zero rendering change. Making `medium` the true default was rejected — it
  would alter every existing unset field and need a CSS fallback.
- **zod 4 introspection** — confirmed against the installed `zod` 4.4.3 before
  relying on it: `shape[k].unwrap()` → inner, `inner.def.type` is
  `"enum"`/`"boolean"`, `inner.options` gives enum members. The plan flagged this
  as zod-version-sensitive, so it was checked at runtime rather than assumed.
- **Clear/collapse drops only on `false`/`undefined`, not `value || undefined`** —
  a review-driven change. Truthiness-collapse is safe for today's keys but would
  silently drop a future falsy-but-valid value, defeating the schema-driven
  point. The one spot the abstraction could quietly leak, so it's explicit and
  commented.
- **Enum label associated via `htmlFor`/`id`** (review nit) — matches the
  text-input rows' visual layout while giving the `<select>` a real programmatic
  label; the redundant `aria-label` was dropped.

## Open questions

None.
