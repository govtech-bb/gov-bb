# Surface inherited component validation rules in the field edit panel (#618)

## Context

When an author added a registry component with base validations — e.g. the
**National ID number** component, which declares a `pattern` rule
(`packages/registry/src/components/national-id.ts`) — the builder's **Validation
Rules** section rendered empty. The rule was enforced at runtime (the resolver's
`applyOverrides` deep-merges base + override validations,
`packages/form-builder/src/resolution.ts`), but the panel only ever passed
`overrides.validations` to `ValidationRulesEditor`, which derived its rows
solely from those override keys. A freshly-added component has no overrides, so
nothing showed — the author couldn't see the rule, let alone change it.

The panel already threaded base context for *some* controls (`defaultRequired`,
`defaultOptions`); general validation rules had no equivalent base pass-through.
Plan: `docs/plans/form-builder-inherited-validation-rules.md`.

## What we did

- **`-validation-rules-editor.tsx`** — added a `baseRules` prop and rewrote the
  body to render the **union** of base + override rule types in three states:
  - *inherited* (base-only): read-only row showing the base value/error, a
    muted "Inherited from component" tag, and an **Override** action that seeds
    an editable override from the base value.
  - *overridden* (base + override): editable row reusing the `overrideField`
    highlight, with **Reset** (drops the override key, falling back to base).
  - *author-added* (override-only, no base): editable row with the existing
    delete (`×`) — unchanged behaviour.
- **`-field-edit-panel.tsx`** — threaded base validations into the editor for
  both paths: `item.primitive.validations` (primitive) and `element.validations`
  (block child), alongside the existing `defaultRequired`/`defaultOptions`.
- **`builder.module.css`** — `.inheritedRow` (dashed muted border) and
  `.inheritedTag` to distinguish inherited from overridden rows.
- Tests: new `-validation-rules-editor.spec.tsx` (12 cases) covering all three
  row states, the seed/reset/delete flows, multi-override removal preserving
  siblings, post-override editing, union ordering, and `required` exclusion;
  plus two `-field-edit-panel.spec.tsx` integration tests against the real
  National ID component.

## Why we did it that way

- **Read-only + Override, not pre-filled inputs.** We deliberately did *not*
  pre-fill editable inputs with base values. Doing so would copy base values
  into `overrides.validations` on save, bloating the recipe with non-deltas and
  violating the override contract (ADRs 0013/0014/0024). Nothing is written
  until the author explicitly overrides; Reset removes the key; an emptied
  override set collapses to `undefined` so the recipe holds only genuine deltas.
- **`required` excluded entirely from this editor.** It is owned by the
  dedicated Required checkbox (which already reads the base via `defaultRequired`
  and writes the `{value:false}` off-sentinel). Surfacing it here too — as a row
  *or* an Add-Rule option — would be a confusing double control, so `isManaged`
  filters it from both.
- **Per-instance, via the existing merge.** Overrides live on `field.overrides`
  (`RecipeFieldDraft`), so overriding National ID's pattern on one field affects
  only that instance — never the shared registry component or other instances.
  We changed only the *visibility/editing surface*; the merge semantics in
  `resolution.ts` are untouched.
- **True removal of an inherited rule left out (per plan).** The merge has no
  "subtract a base rule" semantics — only value replacement — and the
  off-sentinel exists for `required` only. Removing an inherited non-`required`
  rule would need new tombstone/serialization support; tracked as a separate
  future enhancement rather than smuggled in here.
