# Fix form_builder: component overrides apply per-instance, not per-type

Issue: [#194](https://github.com/govtech-bb/gov-bb/issues/194)

## Goal

In the form_builder edit page, overriding a single component on a step affects only that component. Adding or deleting an override on one instance does not cascade to siblings of the same type.

## Approach

Give every `RecipeFieldDraft` an editor-only instance `id`, and switch every lookup that currently uses `ref` as an identifier to use `id` instead.

**Why this works.** The bug is that `ref` is the catalog key (e.g. `"components/first-name"`) and two instances of the same component share it. The reducer's `UPDATE_FIELD_OVERRIDES` / `REMOVE_FIELD` / `REORDER_FIELDS` and the step editor's row `key` and edit-target selection all treat `ref` as if it were unique per instance. It isn't.

**Why editor-only and not persisted.** `ServiceContractRecipe` element order is positional — the wire format doesn't need ids to disambiguate, because two instances of the same `ref` are distinguished by their array index in `elements[]`. Persisting an id would require a schema change in `@govtech-bb/form-types` and touch the forms runtime and API for no behavioural gain. Transient ids regenerated on `ADD_FIELD` and on `deserializeRecipe` are sufficient.

**Alternatives considered.**
- *Persist id in the recipe schema.* Rejected — bigger blast radius, no runtime benefit (order is already meaningful).
- *Identify by `{stepId, index}`.* Rejected — every reducer/editor lookup re-derives, and it's fragile under in-flight reorders.

## Scope

1. Add an editor-only instance id to the draft type.
2. Generate ids in the two entry points to the editor state: `ADD_FIELD` and `deserializeRecipe`.
3. Switch reducer actions that currently key on `fieldRef` to key on `fieldId`.
4. Switch the step editor's row key and edit-target state from `ref` to `id`.
5. Update reducer tests to match the new identifier.
6. Manual smoke in the browser per [[feedback_user_smoke_tests]] — Isaiah to click through.

Blocks need no special handling. A block instance gets its own draft (so its own id), and `childOverrides` inside that instance is already keyed by the child's `fieldId` from the block definition (which is unique within the block).

## Files

**Modify**
- `packages/form-builder/src/types.ts` — add `id: string` to `RecipeFieldDraft`.
- `packages/form-builder/src/serialization.ts` — assign `id` in `deserializeRecipe`. Serializer drops it (no change needed beyond not emitting it).
- `apps/form_builder/app/routes/builder/ui/-recipe-reducer.ts` — generate id in `ADD_FIELD`; rename `fieldRef` → `fieldId` in `UPDATE_FIELD_OVERRIDES`, `REMOVE_FIELD`, `REORDER_FIELDS` (this last one keys on indices already, but the spec test setup needs auditing); look up by `f.id` instead of `f.ref`.
- `apps/form_builder/app/routes/builder/ui/-step-editor.tsx` — `editingFieldRef` → `editingFieldId`; `key={field.id}`; dispatch with field id; lookups by id.
- `apps/form_builder/app/routes/builder/ui/-field-edit-panel.tsx` — uses the field object directly, but verify no ref-keyed lookups slip through.
- `apps/form_builder/app/routes/builder/ui/-field-picker.tsx` — `onAddField` callsites already build a `RecipeFieldDraft` without id; either move id generation into the picker, or (preferred) let the reducer's `ADD_FIELD` assign it so callers stay simple.
- `apps/form_builder/app/routes/builder/ui/-recipe-reducer.spec.ts` — update assertions and helpers to use `id` instead of `ref` for targeting.

**Touch lightly if surfaced by tests**
- `apps/form_builder/app/routes/builder/ui/-recipe-refs.ts` — `getFieldRefs` is used for the field-ref picker dropdown; check whether it also needs to expose ids.

## Verify

1. **Reducer tests** pass — `pnpm --filter @govtech-bb/form-builder test` and the form_builder app's own unit tests covering `-recipe-reducer.spec.ts`.
2. **Type check** — `pnpm --filter form_builder typecheck` (or repo-wide).
3. **Manual smoke** in Isaiah's browser:
   - Add two of the same component to a step. Override one. The other stays untouched.
   - Delete the override on one. The other's override is preserved.
   - Reorder them. Edit one. The right one updates.
   - Reload the draft (round-trip through serialize/deserialize). Behaviour still per-instance.
   - Repeat for two instances of the same block (verify childOverrides are per-block-instance).
4. **Existing form recipes load unchanged** — open a previously-saved recipe with no duplicates; nothing visibly changes.

## Open questions

- Whether `getFieldRefs` in `-recipe-refs.ts` needs to surface instance ids alongside refs — will know once the step-editor change is wired. Will resolve during implementation, not now.
