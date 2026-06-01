# Scope conditional Target Field to selected Target Step — and fix the value space

## Context

Implemented from `docs/plans/scope-target-field-to-target-step.md` on worktree
branch `feat/519-scope-target-field` (merges into `sandbox`). Issue
[#519](https://github.com/govtech-bb/gov-bb/issues/519).

In the builder's conditional-logic editor, the **Target Field** and **Target
Step** `<select>`s were fully independent: `getFieldRefs()` returned one flat
list of every field across every step, so you could pick a Target Field that
didn't belong to the chosen step. Worse, each option's *value* was the registry
**ref** (`"components/text"`), but at runtime conditionals match
`b.targetFieldId === field.fieldId` against the resolved primitive id
(`"text"`) — so builder-authored conditionals silently never fired, and a block
ref couldn't map to a single target field at all.

## What we did

- **`-recipe-refs.ts`** — `getFieldRefs` now delegates to `resolveFieldIds`
  (from `@govtech-bb/form-builder`) instead of re-walking the draft. Renamed the
  value field `FieldRef.fieldRef` → `fieldId`.
- **`behaviour-builder.ts`** — reordered params so **Target Step** precedes
  **Target Field** for both `fieldConditionalOn` and `stepConditionalOn`.
- **`-field-ref-picker.tsx`** — added a `disabled` prop; React keys are
  `stepId:fieldId:index` so duplicate-id options don't collide.
- **`-behaviours-editor.tsx`** — accepts `currentStepId`; scopes/gates the field
  picker on the behaviour's selected step; defaults a new `fieldConditionalOn`'s
  step to `currentStepId`; clears `targetFieldId` on step change when it no
  longer belongs to the new step.
- **`-field-edit-panel.tsx`** — threads `stepId` → `currentStepId` for both the
  component form and per-block-child forms.
- Tests: new `-recipe-refs.spec.ts` and `-behaviours-editor.spec.tsx`.

## Why we did it that way

- **Reuse `resolveFieldIds`, don't re-derive (deviation from the plan).** The
  plan's Approach described teaching `getFieldRefs` to resolve refs itself
  (`primitive.fieldId`, expand `block.elements[].fieldId`). But `resolveFieldIds`
  in `duplicate-ids.ts` already does exactly that **and** applies per-field /
  per-child `fieldId` *overrides* — which the plan's hand-rolled version would
  have ignored. An author who sets a Field ID Override would otherwise get an
  option value that still didn't match the overridden runtime id, reintroducing
  the silent-never-fires bug for that field. Delegating keeps a single source of
  truth (ADR 0010) and gets override-correctness for free. Cost: a reader has to
  follow one more hop to `duplicate-ids.ts` to see the resolution rules.

- **Two plan-listed files left untouched.** The plan's Files section listed
  `-step-editor.tsx` and `-validation-rules-editor.tsx`. Neither needed editing:
  step-editor already calls `BehavioursEditor` without `currentStepId`, which is
  precisely the step-scope "leave the target step open / gated" behaviour; and
  the `fieldRef`→`fieldId` rename was transparent to the validation editor
  because it only consumes `FieldRef` through `FieldRefPicker`, never by property
  name. Grep-confirmed zero lingering `.fieldRef` references.

- **`targetStepId` stays optional in the schema.** Runtime already falls back to
  the field's own step (`condition.targetStepId ?? fieldStep`), and existing
  recipes omit it. Rather than tighten the schema, the editor just always
  populates it for field-scoped conditionals by defaulting to `currentStepId`.
  Keeps old recipes valid; the gating is a UI concern, not a contract change.

- **Prefixed block-child labels (`"Name › First Name"`).** The plan leaned
  toward bare child labels but flagged it as an open question. `resolveFieldIds`
  already emits the prefixed form, and it disambiguates same-labelled children
  of different blocks in one step — so we took the prefixed form for free and
  consistent with the duplicate-id collision messages.

- **Clear-on-step-change, keep-when-shared.** Changing the Target Step clears a
  now-incompatible Target Field — but a field id that *also* exists in the new
  step survives (tested). The clear logic compares against the new step's
  resolved ids, not a blunt "always reset".

## Open questions

- **Duplicate field ids within one step.** Two same-type components in a step
  still resolve to the same `fieldId`, yielding two same-value options. This is a
  pre-existing modelling concern guarded by `duplicate-ids.ts` elsewhere; not
  solved here. We verified the picker renders both without a React key collision
  rather than trying to fix the underlying ambiguity.
