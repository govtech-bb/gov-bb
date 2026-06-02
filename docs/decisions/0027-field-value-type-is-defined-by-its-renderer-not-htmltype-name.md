# 0027 — A field's value type is defined by its renderer, not its `htmlType` name

**Date:** 2026-06-02
**Status:** Accepted
**Related:** [#565](https://github.com/govtech-bb/gov-bb/issues/565), [ADR 0010](./0010-form-data-fieldids-are-recipe-wide-unique.md)

## Context

The form builder lets an author make a field or step *conditional on* another
field's value. To capture that value correctly, the builder needs to know the
**runtime value type** of the target field — a boolean target wants a
`true`/`false` control storing a real `boolean`, a text target wants free text,
and so on (#565).

The obvious-looking signal is the field's `htmlType`. Issue #565 and its plan
both reasoned from the name: they grouped `checkbox` *and* `show-hide` as
"boolean fields." That intuition is wrong. The authoritative answer is **what
the renderer actually stores**, verified in
`apps/forms/src/components/field-renderer.tsx`:

- **`show-hide`** stores a real `boolean` — `f.state.value as boolean`, toggled
  with `f.handleChange(!isOpen)` (`field-renderer.tsx`, `case "show-hide"`).
- **`checkbox`** stores its selected **option value** — a `string` for a
  single-option checkbox (e.g. the `confirmation` component stores
  `"confirmed"`), or a `string[]` for a multi-option checkbox
  (`field-renderer.tsx`, `case "checkbox"`). The `checkbox` primitive schema
  even requires an `options` array.

Both evaluators string-coerce the comparison (`packages/form-conditions`
`internals.ts`; `apps/forms` `validation-methods.ts`), so a `checkbox`
conditional matches against the option-value *string*. Had we trusted the name
and rendered a `true`/`false` control for `checkbox`, the captured value could
never match the stored string — a silent regression vs. the free-text input
that lets an author type the real option value.

## Decision

Code that **infers a field's value type** — to pick a capture control, coerce a
value, or validate a type — must map from **verified renderer behaviour**, not
from the `htmlType` label.

Concretely, for the #565 boolean inference: `BOOLEAN_HTML_TYPES`
(`packages/form-builder/src/duplicate-ids.ts`) contains **only `show-hide`**.
`checkbox` is deliberately excluded despite its name, and a comment at the
definition records why.

## Consequences

- **The boolean condition-value control is scoped to `show-hide` only.** A
  `checkbox` (incl. `confirmation` / `generic-checkbox`) target keeps the
  free-text value input, which still matches its stored option value.
- **The number-target follow-up (out of scope here) inherits this rule.** Before
  treating any `htmlType` as a number, confirm the renderer stores a real
  `number`; do not assume from the name.
- **`htmlType` is a rendering hint, not a value-type contract.** The set of
  htmlTypes that store a given JS type is small and worth asserting in tests
  (see `duplicate-ids.spec.ts` and `-recipe-refs.spec.ts`), so a future renderer
  change that alters a stored type fails loudly rather than silently desyncing
  the capture control.
- This complements [ADR 0010](./0010-form-data-fieldids-are-recipe-wide-unique.md):
  `resolveFieldIds` is the single detector for recipe-wide-unique runtime field
  *ids* (per ADR 0010); 0027 establishes that the same resolution is where
  runtime value-*type* facts (like `isBoolean`) belong, derived from the
  primitive — again, from behaviour, not from the type name.
