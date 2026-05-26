# 0009 — Form builder instance ids are editor-only

**Date:** 2026-05-26
**Status:** Accepted
**Related:** [#194](https://github.com/govtech-bb/gov-bb/issues/194)

## Context

In the form builder, two instances of the same component on a step share a
`ref` (the catalog key, e.g. `components/first-name`). The recipe reducer and
step editor used `ref` as if it were a per-instance identifier:
`UPDATE_FIELD_OVERRIDES` and `REMOVE_FIELD` filtered/mapped on
`f.ref === action.fieldRef`, and the step editor keyed list rows and the
edit-target selection on `ref`.

Because `ref` is shared, overriding or deleting one instance cascaded to every
sibling of the same `ref` on that step (#194). Each instance needs an identity
the editor can address independently.

The persisted format (`ServiceContractRecipe`) is **positional**: a step's
`elements[]` array distinguishes two instances of the same `ref` by their array
index. The wire format needs no per-element id to be unambiguous.

We considered two ways to give instances an identity:

- **(a) Persist an `id` in the recipe schema.** Rejected — it requires a schema
  change in `@govtech-bb/form-types` and touches the forms runtime and the API,
  for no behavioural gain. Order already disambiguates on the wire.
- **(b) Identify by `{stepId, index}`.** Rejected — every reducer/editor lookup
  would re-derive the index, and it is fragile under in-flight reorders.

## Decision

Recipe element identity is positional on the wire; per-instance identifiers
exist **only in editor state and are never persisted**.

`RecipeFieldDraft` carries an editor-only `id: string`. It is minted at the two
entry points to editor state — the reducer's `ADD_FIELD` and
`deserializeRecipe` (via `crypto.randomUUID()`) — and dropped by
`serializeRecipeDraft`. Reducer actions and editor state that need to address a
specific instance key on `id`, not `ref`.

Block child overrides are unaffected: a block instance gets its own draft (so
its own `id`), and `childOverrides` is keyed by the child's `fieldId` from the
block definition, which is unique within the block.

## Consequences

- The id is transient. It is **not** stable across a serialize/deserialize
  round-trip — reloading a draft mints fresh ids. Nothing may rely on id
  stability across sessions or persisted references.
- Anything that needs to distinguish two instances of the same `ref` must use
  the editor `id`, not the `ref`. Behaviour-targeting parameters (which select
  by data `fieldId` resolved from `ref`) are a separate concern and unchanged.
- If a future feature genuinely needs cross-session stable per-instance
  identity, that is a deliberate schema change — revisit this decision rather
  than leaning on the editor id.
