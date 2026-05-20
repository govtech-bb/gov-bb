# Recipe Builder — Implementation Plan

**Date:** 2026-05-19  
**Branch:** `platform/recipe-builder`  
**Reference spec:** `/plan.md`

---

## Goal

Deliver the internal Form Builder tool in four self-contained, committable phases:
a shared database package, a shared form-builder utilities package, the TanStack Start app's server layer, and the full builder UI.

---

## Approach

Build bottom-up along the dependency chain. Each phase produces a working, testable artifact before the next begins.

**Considered alternatives:**
- Build app first, extract packages later — rejected; would require refactoring across phases.
- Merge `packages/database` and `packages/form-builder` into one phase — rejected; they have no dependency on each other and keeping them separate makes commits smaller.

---

## Phase 1 — `packages/database`

**Goal:** Create `@govtech-bb/database` as a standalone TypeORM package containing all entities and migrations. The `apps/api` migration (updating its imports) is a separate task and is **out of scope here**.

**Scope:**
- Scaffold `packages/database` with `package.json` and `tsconfig.json`
- Copy entities from `apps/api/src/database/entities/` into `packages/database/src/entities/`
- Copy migrations from `apps/api/src/database/migrations/` into `packages/database/src/migrations/`
- Export a `createDataSource(config)` helper from the package index
- Re-export all entities and migrations from `src/index.ts`

**Files to create:**
```
packages/database/
├── src/
│   ├── entities/
│   │   ├── entity-base.ts
│   │   ├── form-definition.entity.ts
│   │   ├── form-component.entity.ts
│   │   ├── form-draft.entity.ts
│   │   ├── form-submission.entity.ts
│   │   ├── payment.entity.ts
│   │   ├── payment-transaction.entity.ts
│   │   └── index.ts
│   ├── migrations/
│   │   └── (all existing migration files, copied verbatim)
│   └── index.ts
├── package.json
└── tsconfig.json
```

**Verify:**
- Package builds (`tsc --noEmit`) without errors
- Entities can be imported from `@govtech-bb/database` in a local test import
- `apps/api` is **unchanged** (no import updates)

---

## Phase 2 — `packages/form-builder`

**Goal:** Create `@govtech-bb/form-builder` with all serialization, hydration, validation, catalog, and UI descriptor utilities the form_builder app needs.

**Scope:**
- Scaffold package with `package.json` and `tsconfig.json`
- Built-in component definitions (primitives: text, email, number, select, date, file, etc.)
- Built-in block definitions (address, name, date-of-birth, etc.)
- `BEHAVIOUR_TYPE_DESCRIPTORS` and parameter builders (`builtins/behaviors/behaviour-builder.ts`)
- Validation rule descriptors keyed by `htmlType` (`builtins/behaviors/validation-builder.ts`)
- `hydrateForm(recipe)` — resolves recipe refs into a full `ServiceContract` (`resolution.ts`)
- `serializeRecipeDraft(draft, { version })` and `deserializeRecipe(recipe)` (`serialization.ts`)
- `validateFormContract(recipe)` — schema-level validation (`validation.ts`)
- `getCatalog()` — merges builtins + custom components (`catalog.ts`)
- Public API re-exports (`index.ts`)

**Files to create:**
```
packages/form-builder/
├── src/
│   ├── builtins/
│   │   ├── components/         (one file per primitive)
│   │   ├── blocks/             (one file per block)
│   │   └── index.ts
│   ├── builtins/behaviors/
│   │   ├── behaviour-builder.ts
│   │   └── validation-builder.ts
│   ├── resolution.ts
│   ├── serialization.ts
│   ├── validation.ts
│   ├── catalog.ts
│   └── index.ts
├── package.json
└── tsconfig.json
```

**Verify:**
- Package builds without errors
- `serializeRecipeDraft` → `deserializeRecipe` round-trip is lossless (unit test or manual check)
- `validateFormContract` returns errors for a known-invalid recipe and passes for a valid one

---

## Phase 3 — `apps/form_builder` server layer

**Goal:** Scaffold the TanStack Start application with a working routing skeleton, TypeORM DataSource, and all server functions. No full builder UI yet — the `/builder` route renders a placeholder.

**Scope:**
- Scaffold app: `package.json`, `tsconfig.json`, `vite.config.ts`, `project.json`, `.env.example`
- TanStack Router setup: `app/router.tsx`, auto-generated `app/routeTree.gen.ts`
- Root layout: `app/routes/__root.tsx`
- Root redirect: `app/routes/index.tsx` → `/builder`
- Builder route shell: `app/routes/builder/index.tsx` (loader fires `getCatalog()` + `listForms()` in parallel; renders placeholder `<div>`)
- `app/lib/version.ts` — `bumpMinor()`, `compare()`, `validate()` semver utilities
- `app/types/index.ts` — `FormDefinitionSummary` local type
- `app/server/db.ts` — `getDataSource()` singleton
- `app/server/forms.ts` — `listForms`, `getRecipe`, `submitRecipe`, `updateRecipe`, `nextVersion`
- `app/server/registry.ts` — `getCatalog`, `getRegistryItem`, `getBuilderMetadata`, `validateRecipe`, `previewRecipe`

**Files to create:**
```
apps/form_builder/
├── app/
│   ├── lib/version.ts
│   ├── routes/
│   │   ├── __root.tsx
│   │   ├── index.tsx
│   │   └── builder/index.tsx   (loader + placeholder render)
│   ├── server/
│   │   ├── db.ts
│   │   ├── forms.ts
│   │   └── registry.ts
│   ├── types/index.ts
│   ├── router.tsx
│   └── routeTree.gen.ts        (auto-generated)
├── .env.example
├── package.json
├── project.json
├── tsconfig.json
└── vite.config.ts
```

**Verify:**
- `npm run dev` (or equivalent) starts the app without errors
- `GET /builder` loads without crashing (placeholder visible)
- Server functions resolve without TypeScript errors

---

## Phase 4 — `apps/form_builder` UI

**Goal:** Complete the builder UI — all components wired to the server functions and recipe reducer.

**Scope:**
- `app/routes/builder/index.tsx` — full page: `useReducer` with `RecipeDraft`, all `useState` UI state, `fieldRefs`/`stepRefs` memos, layout assembly
- `-recipe-reducer.ts` — pure reducer for all `RecipeDraft` actions
- `-recipe-refs.ts` — `fieldRefs` and `stepRefs` helpers
- `-toolbar.tsx` — form ID, title, version badge, action buttons, debounced `nextVersion` call
- `-step-list.tsx` — step list sidebar with add/remove/reorder
- `-step-editor.tsx` — step metadata, fields list, step behaviours
- `-field-picker.tsx` — modal with Components / Blocks / Custom tabs
- `-field-edit-panel.tsx` — field override modal (component and block modes)
- `-validation-rules-editor.tsx` — rule add/edit/remove per field
- `-behaviours-editor.tsx` — behaviour add/edit/remove (field and step scopes)
- `-field-ref-picker.tsx` — dropdown to pick a field or step by ref
- `-validation-panel.tsx` — inline validation result display
- `-preview-modal.tsx` — resolved contract read-only view
- `-submit-modal.tsx` — version input + create/update flow
- `-form-picker.tsx` — list and load existing form definitions
- `app/styles/builder.module.css` — builder layout styles

**Files to create/modify:**
```
apps/form_builder/app/
├── routes/builder/
│   ├── index.tsx                    (replace placeholder with full page)
│   ├── -recipe-reducer.ts
│   ├── -recipe-refs.ts
│   ├── -toolbar.tsx
│   ├── -step-list.tsx
│   ├── -step-editor.tsx
│   ├── -field-picker.tsx
│   ├── -field-edit-panel.tsx
│   ├── -validation-rules-editor.tsx
│   ├── -behaviours-editor.tsx
│   ├── -field-ref-picker.tsx
│   ├── -validation-panel.tsx
│   ├── -preview-modal.tsx
│   ├── -submit-modal.tsx
│   └── -form-picker.tsx
└── styles/builder.module.css
```

**Verify:**
- App starts and `/builder` renders the full layout
- Can create a step, add a field, edit overrides, and submit a recipe without errors
- Validate and Preview flows return results
- Form Picker loads existing forms and populates the draft

---

## Out of Scope (this branch)

- Migrating `apps/api` to import from `@govtech-bb/database`
- Delete recipe, version history browser, publish/unpublish workflow
- Auth/RBAC, form duplication, undo/redo

---

## Open Questions

- None — scope and phasing confirmed with user.
