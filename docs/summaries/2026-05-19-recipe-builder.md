# Recipe Builder — Implementation Session

**Date:** 2026-05-19  
**Branch:** `platform/recipe-builder`  
**Plan:** `docs/plans/recipe-builder.md`

## What was built

Four packages/apps were created from scratch in dependency order:

### `packages/database`

TypeORM entities and migrations were extracted from `apps/api/src/database/` into a standalone `@govtech-bb/database` package. `apps/api` is unchanged — it still owns its own entity copies for now; the database package is available for new consumers (`apps/form_builder`).

Key decision: `@ApiProperty` / `@nestjs/swagger` decorators were stripped from the extracted entities. The package must stay framework-agnostic because it will be imported by a TanStack Start app that has no NestJS dependency.

A new migration (`1778500000000-AddFormDefinitionUniqueConstraint`) was added during review after it emerged that no database-level unique constraint existed on `(form_id, version)` — the application-level duplicate check in `submitRecipe` was a TOCTOU race.

### `packages/form-builder`

A utility package providing everything the builder UI needs but the DB doesn't own: built-in component and block definitions, `BEHAVIOUR_TYPE_DESCRIPTORS`, `VALIDATION_RULE_DESCRIPTORS` keyed by `HtmlTypes`, `hydrateForm`, `serializeRecipeDraft`/`deserializeRecipe`, and `validateFormContract` (re-exported from `form-types`).

The `RecipeDraft` family of types lives here by design — they are UI-layer types, not canonical schema (see decision record 0001). The `getCatalog()` function returns builtins only; the server layer merges in DB custom components before passing the catalog to `hydrateForm`.

A circular import between `catalog.ts` and `builtins/index.ts` was broken cleanly by extracting `ComponentDefinition` / `BlockDefinition` into `definition-types.ts`.

During review: custom component lookup in `getRegistryItem` was found to never search `catalog.custom` (silent drop); `deserializeRecipe` always returned `kind: "component"` even for custom fields; and `description` was not round-tripped. All three were fixed.

### `apps/form_builder` server layer

A TanStack Start application scaffolded on top of `@tanstack/react-start` 1.168.6. The existing monorepo already had TanStack Start installed (used by `apps/web` for the router plugin), so no new npm installs were needed.

Key server-side decisions made or discovered during review:
- `getDataSource()` used an in-flight promise guard (`_initPromise`) to prevent concurrent initialization races, with a reset on failure so transient DB errors don't permanently break the singleton.
- All three TypeORM `findOne({ order: { version: "DESC" } })` calls were replaced with raw SQL using `string_to_array(version, '.')::int[]` after it emerged that varchar semver sorting is lexicographic and wrong for versions past `1.9.x`.
- `getCatalogFn` caches the DB custom component query for 60 seconds.

### `apps/form_builder` UI

A single-page builder at `/builder` using `useReducer` with 12 action types and 14 co-located route-private components. All components use plain HTML + CSS Modules — no external component library.

Issues caught in review before merge:
- `handleValidate` and `handlePreview` silently swallowed errors with no user feedback — catch blocks added.
- `ADD_STEP` used `steps.length + 1` for ID generation, producing duplicate IDs after deletions — replaced with `Math.max(...existing step numbers) + 1`.
- `BehavioursEditor` used array-index `key` props, causing React to reuse stale DOM for inputs after deletion — changed to `key={behaviour.type}` (safe because the editor prevents duplicates).

Post-session: `_initPromise` was found to never reset on `ds.initialize()` failure (permanent rejection on transient DB error) — fixed with a try/catch that nulls the promise on error. `OverrideForm` was also missing `fieldId` override and `Required` toggle inputs from the spec — both added (`Required` toggles `validations.required`, since `required` is a validation rule, not a field property in `basePrimitiveSchema`).

## What was deferred

- Migrating `apps/api` to import entities from `@govtech-bb/database` (out of scope for this branch)
- Round-trip unit tests for `serializeRecipeDraft` / `deserializeRecipe` / `hydrateForm` (noted during review, not added)
- Delete recipe, version history browser, publish/unpublish workflow, auth/RBAC (explicitly out of scope per spec)

## Commits

```
36f25fe docs: add decision record — RecipeDraft is a UI-layer type
e99ac39 fix: reset _initPromise on DB init failure and add fieldId/required to OverrideForm
2c7e4d9 fix: address error handling, step ID collision, behaviour key, and import cleanup in builder UI
1a33531 feat: implement full builder UI for apps/form_builder
38c41e5 fix: resolve DataSource race, semver sort, unique constraint, and cache in apps/form_builder
826957c fix: use semver-aware ordering in listForms query
5f00955 feat: scaffold apps/form_builder server layer
771a32c fix: address custom component lookup, round-trip description, and review feedback in packages/form-builder
e67c473 feat: scaffold @govtech-bb/form-builder package
d912f8f fix: add CustomComponent entity, project.json, and type consistency to packages/database
3663c5f feat: scaffold @govtech-bb/database package with entities and migrations
```
