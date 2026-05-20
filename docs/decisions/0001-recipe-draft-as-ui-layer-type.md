# 0001 — RecipeDraft is a UI-layer type; ServiceContractRecipe is the canonical persisted form

**Date:** 2026-05-19  
**Branch:** `platform/recipe-builder`

## Context

The form builder needs to hold mutable draft state in the browser (steps can be reordered, fields added mid-edit, behaviours toggled) while the database stores a stable, serialisable canonical form. These two representations have different shapes and different lifetimes.

`ServiceContractRecipe` (defined in `@govtech-bb/form-types`) is validated by Zod, versioned, and stored as JSONB in `form_definitions`. It is the source of truth.

`RecipeDraft` (defined in `@govtech-bb/form-builder`) is optimised for the builder UI: fields are an ordered array with a `kind` discriminant, steps carry `behaviours` as a mutable list, and overrides are held separately from the base component definition.

## Decision

`RecipeDraft`, `RecipeStepDraft`, and `RecipeFieldDraft` are UI-layer types only. They must never be persisted directly or sent to the server as-is.

All data flow between the builder UI and the server passes through the conversion functions in `@govtech-bb/form-builder`:

- **Draft → DB:** `serializeRecipeDraft(draft, { version })` → `ServiceContractRecipe`
- **DB → Draft:** `deserializeRecipe(recipe, catalog?)` → `RecipeDraft`

Server functions (`submitRecipe`, `updateRecipe`, `getRecipe`, `previewRecipe`, `validateRecipe`) accept and return `ServiceContractRecipe` exclusively.

## Consequences

- Any new field added to `RecipeDraft` must have a corresponding round-trip path in `serializeRecipeDraft` / `deserializeRecipe`, or it will be silently dropped on save.
- New server functions that operate on form recipes must accept `ServiceContractRecipe`, not `RecipeDraft`.
- UI components that need the recipe shape for display should either receive `RecipeDraft` (for editing) or `ServiceContract` (for preview) — never raw DB entities.
- `RecipeDraft` types stay in `@govtech-bb/form-builder`; they must not migrate into `@govtech-bb/form-types`, which is reserved for the canonical, persisted schema.
