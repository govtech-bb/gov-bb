# Form Builder Bug Fixes & Alignment with Registry-Builder

**Date:** 2026-05-20  
**Branch:** platform/recipe-builder  
**Reference:** platform/registry-builder (source of truth for patterns)

---

## Overview

The current form builder (`apps/form_builder`) was re-implemented as a TanStack Start SSR app (server functions in-process) based on the earlier registry-builder Vite SPA + NestJS API. During that migration, several bugs and missing features were not carried over. This spec covers all fixes and the structural cleanup needed to align the two implementations.

Publish/unpublish is explicitly out of scope — it will be removed.

---

## Section 1: Bug Fixes

### Bug 1 — Step ID change closes the editor

**Files:** `-step-editor.tsx`, `index.tsx`

`StepEditor` gains an `onStepIdChange(oldId: string, newId: string)` prop. When the step ID input commits a valid new value, it calls this prop. `BuilderPage` handles it by calling `setSelectedStepId(newId)`, keeping the selection in sync with the rename.

Without this, `selectedStep = draft.steps.find(s => s.stepId === selectedStepId)` returns `null` the moment the ID changes, unmounting the editor.

### Bug 2 — Form ID and step ID accept invalid input

**Files:** `-toolbar.tsx`, `-step-editor.tsx`

`Toolbar` gains inline validation for the Form ID input:

```
FORM_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/
Error message: "Use lowercase letters, numbers, and hyphens only (e.g. birth-registration)"
```

Local `formIdError` state holds the error string. The input stores its raw value locally; dispatch only fires when the value is valid or empty. The error message renders below the input.

`StepEditor` already has `STEP_ID_PATTERN` validation in the registry-builder version — that code is ported directly with the same pattern and error message.

### Bug 3 — Version not bumped after successful submit

**Files:** `index.tsx`

After `handleSubmit` succeeds, call `nextVersion({ data: { formId: draft.formId } })` and apply the result to both `version` and `currentVersion` state. This matches the registry-builder's fire-and-forget post-submit version refresh and prevents a conflict error on subsequent submits of the same form.

### Bug 4 — Remove publish/unpublish

**Files:** `server/forms.ts`, `-toolbar.tsx`, `index.tsx`

- Remove `publishRecipe` and `unpublishRecipe` server functions from `server/forms.ts`
- Remove all publish-related state from `BuilderPage`: `isPublished`, `isPublishing`, `publishError`
- Remove `onPublish`, `onUnpublish`, `isPublished`, `isPublishing`, `publishError`, `onClearPublishError` props from `Toolbar`
- Remove the Publish/Unpublish buttons and publish error banner from the toolbar render

---

## Section 2: Missing Features

### Feature 5 — `canSubmit` gate

**Files:** `index.tsx`, `-toolbar.tsx`

Add derived state in `BuilderPage`:

```ts
const canSubmit = validateResult?.valid === true;
```

Pass `canSubmit: boolean` as a new prop to `Toolbar`. The Submit button is disabled when `!canSubmit`, enforcing validate-before-submit. No other toolbar changes are required for this item.

### Feature 6 — `ValidationPanel` dismiss button and placement

**Files:** `-validation-panel.tsx`, `index.tsx`

`ValidationPanel` gains an `onDismiss: () => void` prop and renders a Dismiss button alongside the heading (matching the registry-builder layout). `BuilderPage` wires `onDismiss={handleDismissValidation}` — which sets `validateResult` to `null`.

The `<ValidationPanel>` render also moves from after the `builderBody` div to inside the editor area, consistent with the registry-builder layout.

### Feature 7 — `isSubmitting` indicator and `lastSaveStatus` in toolbar

**Files:** `-toolbar.tsx`, `index.tsx`

`Toolbar` gains two new props:

- `isSubmitting: boolean` — disables the Submit button and shows "Submitting…" during in-flight requests
- `lastSaveStatus: "idle" | "success" | "error" | "submitted"` — renders a small status chip next to the Submit button:
  - `"idle"` → nothing
  - `"success"` → ✓ Saved
  - `"error"` → ✗ Error
  - `"submitted"` → ✓ Submitted

`BuilderPage` derives `lastSaveStatus` from existing state using the same logic as registry-builder:
- Set to `"success"` when validate returns valid
- Set to `"error"` when validate returns invalid or throws
- Set to `"submitted"` on successful submit
- Reset to `"idle"` on `handleNew`, `handleLoad`, and `handleDismissValidation`

---

## Section 3: Architecture / Type Inconsistencies

### Issue 8 — Canonical `RecipeValidateResponse` type

**Files:** `-validation-panel.tsx`, `index.tsx`

Replace the local `{ valid: boolean; errors: ValidationIssue[] }` type with `RecipeValidateResponse` from `@govtech-bb/form-builder`, which uses `issues` (not `errors`).

`validateResult` state in `BuilderPage` becomes `RecipeValidateResponse | null`. In `handleValidate`, map the server function result once at the call site:

```ts
const raw = await validateRecipe({ data: { recipe } }) as ValidationResult;
setValidateResult({ valid: raw.ok, issues: raw.ok ? [] : raw.issues });
```

`ValidationPanel` props update to accept `RecipeValidateResponse` and reference `result.issues` throughout.

### Issue 9 — Move `fieldRefs` / `stepRefs` computation into `StepEditor`, and move `FieldPicker` / `FieldEditPanel` rendering inside `StepEditor`

**Files:** `index.tsx`, `-step-editor.tsx`, `-field-picker.tsx`, `-field-edit-panel.tsx`, `-recipe-refs.ts`

Currently `FieldPicker` and `FieldEditPanel` are page-level modals, with `activeFieldPickerStepId` and `activeFieldEdit` state managed in `BuilderPage`. In the registry-builder, both are inline components rendered directly inside `StepEditor`. This spec aligns the current branch with that pattern.

**Changes to `BuilderPage` (`index.tsx`):**
- Remove `useFieldRefs`, `useStepRefs`, `activeFieldPickerStepId`, `activeFieldEdit` state and handlers
- Remove the conditional `<FieldPicker>` and `<FieldEditPanel>` renders
- `StepEditor` now receives only: `step`, `draft`, `dispatch`, `catalog`, `onStepIdChange`

**Changes to `StepEditor` (`-step-editor.tsx`):**
- Compute `fieldRefs` / `stepRefs` internally via `React.useMemo` using `getFieldRefs` / `getStepRefs` from `-recipe-refs`
- Manage `editingFieldDraftId: string | null` as local state
- Render `<FieldPicker>` inline (as a palette at the bottom of the fields card — not a modal)
- Render `<FieldEditPanel>` conditionally at the bottom of the component when `editingFieldDraftId` is set

**Changes to `FieldPicker` (`-field-picker.tsx`):**
- Remove the modal wrapper (`styles.modal`) and `onClose` prop
- Rename the pick callback from `onPick` to `onAddField` to match registry-builder
- Component becomes a pure inline palette

**Changes to `FieldEditPanel` (`-field-edit-panel.tsx`):**
- Remove `fieldRefs` / `stepRefs` props (now available from `StepEditor`'s parent scope via closure or passed as internal props from `StepEditor`)
- Replace `onSave` with `dispatch` + `step` props so the panel can dispatch overrides directly
- Remove modal overlay wrapper; render as an inline panel

This eliminates three prop-drilling paths, removes two page-level modal states, and matches the registry-builder's encapsulation model.

---

## Out of Scope

- Publish / unpublish workflow (removed, not replaced)
- Changes to `apps/api` or `packages/`
- Any new UI features beyond what is described above

---

## Affected Files

| File | Change type |
|---|---|
| `app/routes/builder/index.tsx` | Bug fixes, state cleanup, new derived state |
| `app/routes/builder/-toolbar.tsx` | New props, validation, remove publish |
| `app/routes/builder/-step-editor.tsx` | `onStepIdChange` prop, step ID validation, internal refs |
| `app/routes/builder/-validation-panel.tsx` | `onDismiss` prop, canonical type |
| `app/routes/builder/-field-picker.tsx` | Remove `fieldRefs`/`stepRefs` props |
| `app/routes/builder/-field-edit-panel.tsx` | Remove `fieldRefs`/`stepRefs` props |
| `app/server/forms.ts` | Remove `publishRecipe`, `unpublishRecipe` |
