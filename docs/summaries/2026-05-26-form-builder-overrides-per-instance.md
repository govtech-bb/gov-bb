# form-builder per-instance overrides — Session Summary

**Date:** 2026-05-26
**Branch:** fix/form-builder-overrides-per-instance (base: origin/sandbox)
**Related:** [#194](https://github.com/govtech-bb/gov-bb/issues/194), [0009 — instance ids are editor-only](../decisions/0009-form-builder-instance-ids-are-editor-only.md), [plan](../plans/fix-form-builder-component-overrides-per-instance.md)

## Context

Pointer: the plan at `docs/plans/fix-form-builder-component-overrides-per-instance.md`.
In the builder edit page, overriding or deleting one component on a step
cascaded to every sibling of the same type. Root cause: the reducer and step
editor treated `ref` (the shared catalog key) as a per-instance identifier.

The fix and its rejected alternatives are recorded in decision 0009. In short:
add an editor-only `id` to `RecipeFieldDraft` and key instance-addressing
lookups on `id` instead of `ref` — no schema or wire-format change.

## What we did

- `packages/form-builder/src/types.ts` — added editor-only `id: string` to
  `RecipeFieldDraft`.
- `packages/form-builder/src/serialization.ts` — `deserializeRecipe` mints a
  fresh `crypto.randomUUID()` per field. `serializeRecipeDraft` already builds
  wire elements explicitly, so it drops the id with no change.
- `apps/form_builder/app/routes/builder/ui/-recipe-reducer.ts` — `ADD_FIELD`
  accepts a draft without an id and mints one; `REMOVE_FIELD` and
  `UPDATE_FIELD_OVERRIDES` renamed their action property `fieldRef` → `fieldId`
  and now look up by `f.id`. `REORDER_FIELDS` already keyed on indices —
  untouched.
- `-step-editor.tsx` — `editingFieldRef` → `editingFieldId`; row `key={field.id}`;
  dispatches and edit-target selection by id.
- `-field-picker.tsx` — `onAddField` prop narrowed to
  `Omit<RecipeFieldDraft, "id">` so callers stay simple; the reducer mints the id.
- Tests: 3 regression tests in `-recipe-reducer.spec.ts` (ADD_FIELD mints
  distinct ids; UPDATE/REMOVE touch only the targeted instance), 2 in
  `serialization.spec.ts` (deserialize stamps unique ids; serializer drops id).

`getFieldRefs` in `-recipe-refs.ts` was left untouched — its `fieldRef` is for
behaviour targeting (selects by data `fieldId` resolved from `ref`), not editor
instance identity. The plan's open question resolves: no change needed.

## Compatibility with feat/form-builder-save-draft-dev-iteration

The user asked to confirm this is compatible with the in-flight save-draft
branch (the eventual merge target). Only `-field-picker.tsx` overlaps — that
branch's `2cd11b9` restructured the picker's tabs. `git merge-tree` reports no
conflicts; a no-commit trial merge auto-merged, and on the merged tree the full
suites pass (39 form-builder + 83 form_builder-app). The 5 pre-existing tsc
errors (`ai/index.tsx`, `sessions.ts`, `registry.ts`) are untouched by either
branch and predate this work.

## Verification

- `nx test form-builder`: 39 passed. `pnpm --filter @govtech-bb/form-builder-app test`: 83 passed.
- Manual smoke in the browser (Isaiah): add two of the same component, override
  one, the other untouched; delete/reorder/edit behave per-instance; round-trip
  through reload stays per-instance. Confirmed working.
