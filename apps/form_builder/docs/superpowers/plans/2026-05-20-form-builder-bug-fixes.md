# Form Builder Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all known bugs and structural issues in the TanStack Start form builder, aligning it with the registry-builder reference implementation.

**Architecture:** Server functions (`createServerFn`) handle data access in-process; React state + `useReducer` drives UI. Changes are bottom-up — leaf components first, `index.tsx` last — so TypeScript catches contract breaks incrementally.

**Tech Stack:** React 18, TanStack Start, TypeScript, `@govtech-bb/form-builder`, `@govtech-bb/form-types`

---

## File Map

| File | Change |
|---|---|
| `app/server/forms.ts` | Remove `publishRecipe`, `unpublishRecipe` |
| `app/routes/builder/-recipe-refs.ts` | Add `getFieldRefs`, `getStepRefs` plain functions alongside existing hooks |
| `app/routes/builder/-toolbar.tsx` | Remove publish props; add `formId` validation, `canSubmit`, `isSubmitting`, `lastSaveStatus` |
| `app/routes/builder/-validation-panel.tsx` | Use `RecipeValidateResponse` type; add `onDismiss` |
| `app/routes/builder/-field-picker.tsx` | Remove modal wrapper and `onClose`; rename callback to `onAddField` |
| `app/routes/builder/-field-edit-panel.tsx` | Remove modal wrapper, `fieldRefs`/`stepRefs` props, `onSave`; add `draft`, `dispatch`, `stepId` |
| `app/routes/builder/-step-editor.tsx` | Add `onStepIdChange`; step ID validation; inline `FieldPicker`/`FieldEditPanel`; internal refs via `useMemo` |
| `app/routes/builder/index.tsx` | Remove publish state/handlers; update `validateResult` type; add `canSubmit`/`lastSaveStatus`; add `handleStepIdChange`; remove `activeFieldPickerStepId`/`activeFieldEdit` |

**Type-check command** (run after every task):
```bash
cd /home/ish/Work/GovTech/Applications/modular-forms-monorepo/apps/form_builder && npx tsc --noEmit 2>&1 | head -40
```
Expected: no output (zero errors). Any output is a bug to fix before committing.

---

## Task 1: Remove publish/unpublish from server and toolbar

**Files:**
- Modify: `app/server/forms.ts`
- Modify: `app/routes/builder/-toolbar.tsx`
- Modify: `app/routes/builder/index.tsx`

- [ ] **Step 1: Remove `publishRecipe` and `unpublishRecipe` from `forms.ts`**

Delete lines 155–203 (the two server functions). The remaining exports are `listForms`, `getRecipe`, `submitRecipe`, `updateRecipe`, `nextVersion`.

- [ ] **Step 2: Remove publish-related imports from `index.tsx`**

Change the import on line 5:
```typescript
// Before
import { listForms, nextVersion, submitRecipe, updateRecipe, publishRecipe, unpublishRecipe } from "../../server/forms";

// After
import { listForms, nextVersion, submitRecipe, updateRecipe } from "../../server/forms";
```

- [ ] **Step 3: Remove publish state and handlers from `index.tsx`**

Remove these lines:
```typescript
const [isPublished, setIsPublished] = useState(false);
const [isPublishing, setIsPublishing] = useState(false);
const [publishError, setPublishError] = useState<string | null>(null);
```

Remove the `handlePublish` and `handleUnpublish` functions entirely (lines 193–221).

In `handleLoad`, remove the line:
```typescript
setIsPublished(forms.find((f) => f.formId === formId)?.isPublished ?? false);
```

In `handleNew`, remove:
```typescript
setIsPublished(false);
```

- [ ] **Step 4: Update the Toolbar props interface in `-toolbar.tsx`**

Replace the entire `ToolbarProps` interface and function signature:

```typescript
interface ToolbarProps {
  formId: string;
  title: string;
  version: string;
  isDirty: boolean;
  isValidating: boolean;
  isPreviewing: boolean;
  isSubmitting: boolean;
  canSubmit: boolean;
  lastSaveStatus: "idle" | "success" | "error" | "submitted";
  onFormIdChange: (id: string) => void;
  onTitleChange: (title: string) => void;
  onNew: () => void;
  onOpen: () => void;
  onValidate: () => void;
  onPreview: () => void;
  onSubmit: () => void;
}

export function Toolbar({
  formId,
  title,
  version,
  isDirty,
  isValidating,
  isPreviewing,
  isSubmitting,
  canSubmit,
  lastSaveStatus,
  onFormIdChange,
  onTitleChange,
  onNew,
  onOpen,
  onValidate,
  onPreview,
  onSubmit,
}: ToolbarProps) {
```

- [ ] **Step 5: Update the Toolbar render — remove publish buttons, update Submit disabled**

Replace the buttons section from `<button type="button" className={styles.btnPrimary} onClick={onSubmit}...` to the end of the return with:

```tsx
      <button
        type="button"
        onClick={onValidate}
        disabled={isValidating}
      >
        {isValidating ? "Validating…" : "Validate"}
      </button>
      <button
        type="button"
        onClick={onPreview}
        disabled={isPreviewing}
      >
        {isPreviewing ? "Previewing…" : "Preview"}
      </button>
      <button
        type="button"
        className={styles.btnPrimary}
        onClick={onSubmit}
        disabled={!canSubmit || isSubmitting}
      >
        {isSubmitting ? "Submitting…" : "Submit"}
      </button>
      {lastSaveStatus !== "idle" && (
        <span
          className={
            lastSaveStatus === "error" ? styles.statusError : styles.statusOk
          }
        >
          {lastSaveStatus === "success" && "✓ Valid"}
          {lastSaveStatus === "error" && "✗ Invalid"}
          {lastSaveStatus === "submitted" && "✓ Submitted"}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Wire the new Toolbar props in `index.tsx`**

Add derived state after the existing `isDirty` line:
```typescript
const canSubmit = validateResult?.valid === true;
const [isSubmitting, setIsSubmitting] = useState(false);
const [lastSaveStatus, setLastSaveStatus] = useState<"idle" | "success" | "error" | "submitted">("idle");
```

Replace the `<Toolbar .../>` JSX with:
```tsx
<Toolbar
  formId={draft.formId}
  title={draft.title}
  version={version}
  isDirty={isDirty}
  isValidating={isValidating}
  isPreviewing={isPreviewing}
  isSubmitting={isSubmitting}
  canSubmit={canSubmit}
  lastSaveStatus={lastSaveStatus}
  onFormIdChange={handleFormIdChange}
  onTitleChange={handleTitleChange}
  onNew={handleNew}
  onOpen={() => setIsPickerOpen(true)}
  onValidate={handleValidate}
  onPreview={handlePreview}
  onSubmit={() => { setSubmitSuccess(false); setSubmitError(null); setIsSubmitOpen(true); }}
/>
```

Also update `handleNew` and `handleLoad` to reset `lastSaveStatus`:
```typescript
// In handleNew:
setLastSaveStatus("idle");

// In handleLoad:
setLastSaveStatus("idle");
```

- [ ] **Step 7: Type-check**
```bash
cd /home/ish/Work/GovTech/Applications/modular-forms-monorepo/apps/form_builder && npx tsc --noEmit 2>&1 | head -40
```
Expected: no output.

- [ ] **Step 8: Commit**
```bash
git add apps/form_builder/app/server/forms.ts \
        apps/form_builder/app/routes/builder/-toolbar.tsx \
        apps/form_builder/app/routes/builder/index.tsx
git commit -m "feat(builder): remove publish/unpublish; add canSubmit, isSubmitting, lastSaveStatus to toolbar"
```

---

## Task 2: Update `ValidationPanel` — canonical type + dismiss button

**Files:**
- Modify: `app/routes/builder/-validation-panel.tsx`
- Modify: `app/routes/builder/index.tsx`

- [ ] **Step 1: Rewrite `-validation-panel.tsx`**

Replace the entire file:

```typescript
import type { RecipeValidateResponse } from "@govtech-bb/form-builder";
import styles from "../../styles/builder.module.css";

interface ValidationPanelProps {
  result: RecipeValidateResponse | null;
  onDismiss: () => void;
}

export function ValidationPanel({ result, onDismiss }: ValidationPanelProps) {
  if (result === null) return null;

  if (result.valid) {
    return (
      <div className={styles.validationSuccess} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>Recipe is valid — no issues found.</span>
        <button type="button" onClick={onDismiss} style={{ marginLeft: 8 }}>Dismiss</button>
      </div>
    );
  }

  return (
    <div className={styles.validationErrors}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <strong>{result.issues.length} validation {result.issues.length === 1 ? "issue" : "issues"} found</strong>
        <button type="button" onClick={onDismiss}>Dismiss</button>
      </div>
      <ul>
        {result.issues.map((issue, i) => (
          <li key={i}>
            {issue.path && <code>{issue.path}: </code>}
            {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Update `validateResult` state type in `index.tsx`**

Add the import:
```typescript
import type { RecipeDraft, ValidationIssue, ValidationResult, RecipeValidateResponse } from "@govtech-bb/form-builder";
```

Change the state declaration:
```typescript
// Before
const [validateResult, setValidateResult] = useState<{ valid: boolean; errors: ValidationIssue[] } | null>(null);

// After
const [validateResult, setValidateResult] = useState<RecipeValidateResponse | null>(null);
```

- [ ] **Step 3: Fix `handleValidate` mapping in `index.tsx`**

```typescript
const handleValidate = async () => {
  setIsValidating(true);
  try {
    const recipe = serializeRecipeDraft(draft, { version });
    const raw = await validateRecipe({ data: { recipe } }) as ValidationResult;
    const result: RecipeValidateResponse = { valid: raw.ok, issues: raw.ok ? [] : raw.issues };
    setValidateResult(result);
    setLastSaveStatus(raw.ok ? "success" : "error");
  } catch (e) {
    const result: RecipeValidateResponse = {
      valid: false,
      issues: [{ path: "", message: e instanceof Error ? e.message : "Validation request failed" }],
    };
    setValidateResult(result);
    setLastSaveStatus("error");
  } finally {
    setIsValidating(false);
  }
};
```

- [ ] **Step 4: Add `handleDismissValidation` and wire `onDismiss` in `index.tsx`**

Add the handler:
```typescript
const handleDismissValidation = () => {
  setValidateResult(null);
  setLastSaveStatus("idle");
};
```

Update the `<ValidationPanel>` render:
```tsx
<ValidationPanel result={validateResult} onDismiss={handleDismissValidation} />
```

Also reset `lastSaveStatus` to `"idle"` inside `handleDismissValidation` (already included above).

- [ ] **Step 5: Type-check**
```bash
cd /home/ish/Work/GovTech/Applications/modular-forms-monorepo/apps/form_builder && npx tsc --noEmit 2>&1 | head -40
```
Expected: no output.

- [ ] **Step 6: Commit**
```bash
git add apps/form_builder/app/routes/builder/-validation-panel.tsx \
        apps/form_builder/app/routes/builder/index.tsx
git commit -m "fix(builder): use canonical RecipeValidateResponse type; add dismiss button to ValidationPanel"
```

---

## Task 3: Add Form ID validation to Toolbar

**Files:**
- Modify: `app/routes/builder/-toolbar.tsx`

- [ ] **Step 1: Add the validation pattern and local state**

At the top of the file, after the imports, add:
```typescript
const FORM_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const FORM_ID_ERROR =
  "Use lowercase letters, numbers, and hyphens only (e.g. birth-registration)";
```

Inside the `Toolbar` function, add local state for the error:
```typescript
const [formIdError, setFormIdError] = useState<string>("");
```

- [ ] **Step 2: Replace the Form ID input JSX**

Replace the current `<label>Form ID:...` block with:

```tsx
<div style={{ display: "flex", flexDirection: "column" }}>
  <label>
    Form ID:
    <input
      type="text"
      value={formId}
      onChange={(e) => {
        const raw = e.target.value.toLowerCase().replace(/\s+/g, "-");
        if (raw.length > 0 && !FORM_ID_PATTERN.test(raw)) {
          setFormIdError(FORM_ID_ERROR);
        } else {
          setFormIdError("");
          onFormIdChange(raw);
        }
      }}
      style={{ marginLeft: 4 }}
      aria-describedby={formIdError ? "form-id-error" : undefined}
      aria-invalid={formIdError ? true : undefined}
    />
  </label>
  {formIdError && (
    <span id="form-id-error" role="alert" style={{ fontSize: "0.75rem", color: "red" }}>
      {formIdError}
    </span>
  )}
</div>
```

- [ ] **Step 3: Add `useState` import if not already present**

The file already uses `styles` — confirm the top of the file has:
```typescript
import { useState } from "react";
```
Add it if missing.

- [ ] **Step 4: Type-check**
```bash
cd /home/ish/Work/GovTech/Applications/modular-forms-monorepo/apps/form_builder && npx tsc --noEmit 2>&1 | head -40
```
Expected: no output.

- [ ] **Step 5: Commit**
```bash
git add apps/form_builder/app/routes/builder/-toolbar.tsx
git commit -m "fix(builder): add form ID kebab-case validation to toolbar"
```

---

## Task 4: Fix version not bumped after submit

**Files:**
- Modify: `app/routes/builder/index.tsx`

- [ ] **Step 1: Update `handleSubmit` to fetch next version after success**

Replace `handleSubmit` with:

```typescript
const handleSubmit = async (submitVersion: string) => {
  setIsSubmitting(true);
  setSubmitError(null);
  try {
    const recipe = serializeRecipeDraft(draft, { version: submitVersion });
    if (loadedFromId && currentVersion && submitVersion === currentVersion) {
      await updateRecipe({ data: { formId: loadedFromId, recipe } });
    } else {
      await submitRecipe({ data: { recipe } });
    }
    setSubmitSuccess(true);
    setLastSaveStatus("submitted");
    setLoadedFromId(draft.formId);

    // Bump to next version so a follow-up submit doesn't conflict
    try {
      const next = await nextVersion({ data: { formId: draft.formId } }) as { currentVersion: string | null; nextVersion: string };
      setCurrentVersion(next.currentVersion ?? submitVersion);
      setVersion(next.nextVersion);
    } catch {
      setCurrentVersion(submitVersion);
      setVersion(bumpMinor(submitVersion));
    }
  } catch (e) {
    setSubmitError(e instanceof Error ? e.message : "Submission failed");
  } finally {
    setIsSubmitting(false);
  }
};
```

- [ ] **Step 2: Type-check**
```bash
cd /home/ish/Work/GovTech/Applications/modular-forms-monorepo/apps/form_builder && npx tsc --noEmit 2>&1 | head -40
```
Expected: no output.

- [ ] **Step 3: Commit**
```bash
git add apps/form_builder/app/routes/builder/index.tsx
git commit -m "fix(builder): bump version to next after successful submit"
```

---

## Task 5: Add plain ref helper functions to `recipe-refs.ts`

These non-hook versions let `StepEditor` and `FieldEditPanel` compute refs inside `useMemo` without violating React hook rules.

**Files:**
- Modify: `app/routes/builder/-recipe-refs.ts`

- [ ] **Step 1: Extract `getFieldRefs` and `getStepRefs` plain functions**

Replace the entire file:

```typescript
import { useMemo } from "react";
import { getRegistryItem } from "@govtech-bb/form-builder";
import type { RecipeDraft, RegistryCatalog } from "@govtech-bb/form-builder";

export interface FieldRef {
  stepId: string;
  fieldRef: string;
  displayName: string;
}

export interface StepRef {
  stepId: string;
  title: string;
}

export function getFieldRefs(
  draft: RecipeDraft,
  catalog: RegistryCatalog,
): FieldRef[] {
  const refs: FieldRef[] = [];
  for (const step of draft.steps) {
    for (const field of step.fields) {
      const item = getRegistryItem(field.ref, catalog);
      refs.push({
        stepId: step.stepId,
        fieldRef: field.ref,
        displayName: item?.displayName ?? field.ref,
      });
    }
  }
  return refs;
}

export function getStepRefs(draft: RecipeDraft): StepRef[] {
  return draft.steps.map((s) => ({ stepId: s.stepId, title: s.title }));
}

// React hook wrappers — kept for any consumers that prefer the hook form.
export function useFieldRefs(
  draft: RecipeDraft,
  catalog: RegistryCatalog,
): FieldRef[] {
  return useMemo(() => getFieldRefs(draft, catalog), [draft, catalog]);
}

export function useStepRefs(draft: RecipeDraft): StepRef[] {
  return useMemo(() => getStepRefs(draft), [draft.steps]);
}
```

- [ ] **Step 2: Type-check**
```bash
cd /home/ish/Work/GovTech/Applications/modular-forms-monorepo/apps/form_builder && npx tsc --noEmit 2>&1 | head -40
```
Expected: no output.

- [ ] **Step 3: Commit**
```bash
git add apps/form_builder/app/routes/builder/-recipe-refs.ts
git commit -m "refactor(builder): add getFieldRefs/getStepRefs plain functions alongside hooks"
```

---

## Task 6: Convert `FieldPicker` from modal to inline palette

**Files:**
- Modify: `app/routes/builder/-field-picker.tsx`

- [ ] **Step 1: Read the current FieldPicker render to understand the full structure**

Read `apps/form_builder/app/routes/builder/-field-picker.tsx` lines 40 to end to get the tabs + item rendering logic. You will keep all of that; only the wrapper and callback change.

- [ ] **Step 2: Rewrite the `FieldPickerProps` interface and remove the modal wrapper**

Replace the interface:
```typescript
interface FieldPickerProps {
  catalog: RegistryCatalog;
  onAddField: (field: RecipeFieldDraft) => void;
}
```

Replace the function signature and remove the modal wrapper. The component should start directly with the tabs and list content:

```typescript
export function FieldPicker({ catalog, onAddField }: FieldPickerProps) {
  const [activeTab, setActiveTab] = useState<Tab>("Components");

  // Keep all existing tab + item rendering logic unchanged.
  // Remove the outer modal div and the Close button.
  // Call onAddField(field) directly (no onClose call needed).

  return (
    <div>  {/* was: <div className={styles.modal}> */}
      {/* Remove the Close button header entirely */}
      <div className={styles.tabs}>
        {/* ...existing tab buttons unchanged... */}
      </div>
      {/* ...existing item list unchanged, calling onAddField instead of onPick... */}
    </div>
  );
}
```

Concretely, every place that previously called `handlePick(field)` should now call `onAddField(field)` directly (no need to also call `onClose` since there is no modal to close).

- [ ] **Step 3: Type-check**
```bash
cd /home/ish/Work/GovTech/Applications/modular-forms-monorepo/apps/form_builder && npx tsc --noEmit 2>&1 | head -40
```
Expected: errors about callers of `FieldPicker` that still pass `onPick`/`onClose`. Those will be fixed in Task 8 when `StepEditor` is updated. Note the errors but do not fix them yet.

- [ ] **Step 4: Commit**
```bash
git add apps/form_builder/app/routes/builder/-field-picker.tsx
git commit -m "refactor(builder): convert FieldPicker from modal to inline palette"
```

---

## Task 7: Refactor `FieldEditPanel` — remove modal, props-drill; add `dispatch` + `draft`

**Files:**
- Modify: `app/routes/builder/-field-edit-panel.tsx`

- [ ] **Step 1: Update imports**

```typescript
import { useState, useMemo } from "react";
import { getRegistryItem } from "@govtech-bb/form-builder";
import type { RecipeFieldDraft, RegistryCatalog, ChildOverrides, BlockDefinition, RecipeDraft } from "@govtech-bb/form-builder";
import type { FieldOverrides, HtmlTypes } from "@govtech-bb/form-types";
import type { FieldRef, StepRef } from "./-recipe-refs";
import { getFieldRefs, getStepRefs } from "./-recipe-refs";
import type { RecipeAction } from "./-recipe-reducer";
import { ValidationRulesEditor } from "./-validation-rules-editor";
import { BehavioursEditor } from "./-behaviours-editor";
import styles from "../../styles/builder.module.css";
```

- [ ] **Step 2: Replace `FieldEditPanelProps`**

```typescript
interface FieldEditPanelProps {
  field: RecipeFieldDraft;
  catalog: RegistryCatalog;
  draft: RecipeDraft;
  stepId: string;
  dispatch: React.Dispatch<RecipeAction>;
  onClose: () => void;
}
```

- [ ] **Step 3: Update the `FieldEditPanel` function signature and internals**

Replace the function signature and the internal ref computation:

```typescript
export function FieldEditPanel({
  field,
  catalog,
  draft,
  stepId,
  dispatch,
  onClose,
}: FieldEditPanelProps) {
  const fieldRefs: FieldRef[] = useMemo(() => getFieldRefs(draft, catalog), [draft, catalog]);
  const stepRefs: StepRef[] = useMemo(() => getStepRefs(draft), [draft]);

  // Keep all existing override form state and OverrideForm rendering unchanged.
  // Replace the Save button handler — dispatch directly instead of calling onSave.
```

- [ ] **Step 4: Replace the save handler**

Find the existing `handleSave` / save button call and replace it:

```typescript
function handleSave(overrides: FieldOverrides, childOverrides?: ChildOverrides) {
  dispatch({
    type: "UPDATE_FIELD_OVERRIDES",
    stepId,
    fieldRef: field.ref,
    overrides,
    childOverrides,
  });
  onClose();
}
```

- [ ] **Step 5: Remove the modal wrapper from the JSX**

The outermost `<div className={styles.modal}>` and its backdrop click handler should be removed. The component should render as an inline panel (e.g., `<div className={styles.fieldEditPanel}>` or a plain `<div>`). Keep all inner content (override form fields, Save/Cancel buttons) unchanged.

- [ ] **Step 6: Type-check**
```bash
cd /home/ish/Work/GovTech/Applications/modular-forms-monorepo/apps/form_builder && npx tsc --noEmit 2>&1 | head -40
```
Expected: errors about callers in `index.tsx` that still pass the old props. Note them; they will be fixed in Task 8.

- [ ] **Step 7: Commit**
```bash
git add apps/form_builder/app/routes/builder/-field-edit-panel.tsx
git commit -m "refactor(builder): FieldEditPanel — inline panel, dispatch directly, compute refs internally"
```

---

## Task 8: Rewrite `StepEditor` — inline panels, internal refs, `onStepIdChange`, step ID validation

This is the largest single task. It replaces `StepEditor` so it:
1. Manages `FieldPicker` and `FieldEditPanel` as inline components (no page-level modals)
2. Computes `fieldRefs`/`stepRefs` internally via `useMemo`
3. Handles step ID edits with validation and notifies the parent via `onStepIdChange`
4. Dispatches all field actions directly (no callback props for field operations)

**Files:**
- Modify: `app/routes/builder/-step-editor.tsx`

- [ ] **Step 1: Replace the imports**

```typescript
import { useState, useMemo } from "react";
import type { RecipeDraft, RecipeStepDraft, RecipeFieldDraft, RegistryCatalog } from "@govtech-bb/form-builder";
import { getRegistryItem } from "@govtech-bb/form-builder";
import type { Behaviour } from "@govtech-bb/form-types";
import type { RecipeAction } from "./-recipe-reducer";
import { getFieldRefs, getStepRefs } from "./-recipe-refs";
import { BehavioursEditor } from "./-behaviours-editor";
import { FieldPicker } from "./-field-picker";
import { FieldEditPanel } from "./-field-edit-panel";
import styles from "../../styles/builder.module.css";

const STEP_ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const STEP_ID_ERROR =
  "Use lowercase letters, digits, and hyphens only. Must start with a letter (e.g. my-step, step-1).";
```

- [ ] **Step 2: Replace the `StepEditorProps` interface**

```typescript
interface StepEditorProps {
  step: RecipeStepDraft;
  draft: RecipeDraft;
  dispatch: React.Dispatch<RecipeAction>;
  catalog: RegistryCatalog;
  onStepIdChange: (oldId: string, newId: string) => void;
}
```

- [ ] **Step 3: Write the `StepEditor` function body**

```typescript
export function StepEditor({ step, draft, dispatch, catalog, onStepIdChange }: StepEditorProps) {
  const [localStepId, setLocalStepId] = useState(step.stepId);
  const [stepIdError, setStepIdError] = useState("");
  const [editingFieldRef, setEditingFieldRef] = useState<string | null>(null);

  // Keep localStepId in sync when the selected step changes.
  // Also close any open field edit panel.
  useState(() => { /* no-op init */ });
  // Use effect to sync:
  const prevStepIdRef = { current: step.stepId };

  const fieldRefs = useMemo(() => getFieldRefs(draft, catalog), [draft, catalog]);
  const stepRefs = useMemo(() => getStepRefs(draft), [draft]);

  const editingField =
    editingFieldRef !== null
      ? step.fields.find((f) => f.ref === editingFieldRef) ?? null
      : null;
```

Wait — the `useEffect` pattern is needed here. Rewrite the body using `useEffect`:

```typescript
export function StepEditor({ step, draft, dispatch, catalog, onStepIdChange }: StepEditorProps) {
  const [localStepId, setLocalStepId] = useState(step.stepId);
  const [stepIdError, setStepIdError] = useState("");
  const [editingFieldRef, setEditingFieldRef] = useState<string | null>(null);

  // Keep localStepId in sync when a different step is selected from the sidebar.
  useEffect(() => {
    setLocalStepId(step.stepId);
    setStepIdError("");
    setEditingFieldRef(null);
  }, [step.stepId]);

  const fieldRefs = useMemo(() => getFieldRefs(draft, catalog), [draft, catalog]);
  const stepRefs = useMemo(() => getStepRefs(draft), [draft]);

  const editingField =
    editingFieldRef !== null
      ? step.fields.find((f) => f.ref === editingFieldRef) ?? null
      : null;

  function handleStepIdChange(newId: string) {
    setLocalStepId(newId);
    if (!STEP_ID_PATTERN.test(newId)) {
      setStepIdError(STEP_ID_ERROR);
      return;
    }
    setStepIdError("");
    dispatch({ type: "UPDATE_STEP_META", stepId: step.stepId, meta: { stepId: newId } });
    onStepIdChange(step.stepId, newId);
  }

  function handleAddField(field: RecipeFieldDraft) {
    dispatch({ type: "ADD_FIELD", stepId: step.stepId, field });
  }

  function handleRemoveField(fieldRef: string) {
    if (!window.confirm("Remove this field?")) return;
    dispatch({ type: "REMOVE_FIELD", stepId: step.stepId, fieldRef });
    if (editingFieldRef === fieldRef) setEditingFieldRef(null);
  }

  function handleMoveFieldUp(index: number) {
    if (index <= 0) return;
    dispatch({ type: "REORDER_FIELDS", stepId: step.stepId, fromIndex: index, toIndex: index - 1 });
  }

  function handleMoveFieldDown(index: number) {
    if (index >= step.fields.length - 1) return;
    dispatch({ type: "REORDER_FIELDS", stepId: step.stepId, fromIndex: index, toIndex: index + 1 });
  }

  function handleSetBehaviours(behaviours: Behaviour[]) {
    dispatch({ type: "SET_STEP_BEHAVIOURS", stepId: step.stepId, behaviours });
  }

  // ...JSX below
}
```

- [ ] **Step 4: Write the JSX**

```tsx
  return (
    <div className={styles.stepEditor}>
      {/* Step Metadata */}
      <div className={styles.sectionTitle}>Step Metadata</div>
      <div className={styles.formGroup}>
        <label>Step ID</label>
        <input
          type="text"
          value={localStepId}
          onChange={(e) => handleStepIdChange(e.target.value)}
          aria-invalid={stepIdError ? true : undefined}
        />
        {stepIdError && (
          <span role="alert" style={{ fontSize: "0.75rem", color: "red" }}>
            {stepIdError}
          </span>
        )}
      </div>
      <div className={styles.formGroup}>
        <label>Title</label>
        <input
          type="text"
          value={step.title}
          onChange={(e) =>
            dispatch({ type: "UPDATE_STEP_META", stepId: step.stepId, meta: { title: e.target.value } })
          }
        />
      </div>
      <div className={styles.formGroup}>
        <label>Description</label>
        <input
          type="text"
          value={step.description ?? ""}
          onChange={(e) =>
            dispatch({ type: "UPDATE_STEP_META", stepId: step.stepId, meta: { description: e.target.value || undefined } })
          }
        />
      </div>

      {/* Fields */}
      <div className={styles.sectionTitle}>Fields ({step.fields.length})</div>
      {step.fields.map((field, idx) => {
        const item = getRegistryItem(field.ref, catalog);
        const displayName = item?.displayName ?? field.ref;
        return (
          <div key={field.ref} className={styles.fieldRow}>
            <span style={{ flex: 1 }}>{displayName}</span>
            <button type="button" onClick={() => handleMoveFieldUp(idx)} disabled={idx === 0}>↑</button>
            <button type="button" onClick={() => handleMoveFieldDown(idx)} disabled={idx === step.fields.length - 1}>↓</button>
            <button type="button" onClick={() => setEditingFieldRef(field.ref)}>Edit</button>
            <button type="button" onClick={() => handleRemoveField(field.ref)}>✕</button>
          </div>
        );
      })}

      {/* Inline field picker palette */}
      <div className={styles.sectionTitle}>Add field</div>
      <FieldPicker catalog={catalog} onAddField={handleAddField} />

      {/* Inline field edit panel */}
      {editingField !== null && editingFieldRef !== null && (
        <FieldEditPanel
          field={editingField}
          catalog={catalog}
          draft={draft}
          stepId={step.stepId}
          dispatch={dispatch}
          onClose={() => setEditingFieldRef(null)}
        />
      )}

      {/* Step behaviours */}
      <div className={styles.sectionTitle}>Step Behaviours</div>
      <BehavioursEditor
        scope="step"
        value={step.behaviours}
        onChange={handleSetBehaviours}
        fieldRefs={fieldRefs}
        stepRefs={stepRefs}
      />
    </div>
  );
```

Also add `useEffect` to the import list at the top:
```typescript
import { useState, useMemo, useEffect } from "react";
```

- [ ] **Step 5: Type-check**
```bash
cd /home/ish/Work/GovTech/Applications/modular-forms-monorepo/apps/form_builder && npx tsc --noEmit 2>&1 | head -40
```
Expected: errors about `index.tsx` passing old StepEditor props. Note them; next task fixes that.

- [ ] **Step 6: Commit**
```bash
git add apps/form_builder/app/routes/builder/-step-editor.tsx
git commit -m "feat(builder): rewrite StepEditor — inline panels, internal refs, onStepIdChange, step ID validation"
```

---

## Task 9: Update `index.tsx` — wire new `StepEditor`, clean up stale state

**Files:**
- Modify: `app/routes/builder/index.tsx`

- [ ] **Step 1: Add `handleStepIdChange`**

Add this handler after `handleRemoveStep`:
```typescript
const handleStepIdChange = (_oldId: string, newId: string) => {
  setSelectedStepId(newId);
};
```

- [ ] **Step 2: Remove stale field-picker and field-edit state from `index.tsx`**

Remove these state declarations:
```typescript
const [activeFieldEdit, setActiveFieldEdit] = useState<{ stepId: string; fieldRef: string } | null>(null);
const [activeFieldPickerStepId, setActiveFieldPickerStepId] = useState<string | null>(null);
```

Remove the `fieldBeingEdited` derived computation:
```typescript
// Remove this block:
const fieldBeingEdited = activeFieldEdit
  ? draft.steps
      .find((s) => s.stepId === activeFieldEdit.stepId)
      ?.fields.find((f) => f.ref === activeFieldEdit.fieldRef) ?? null
  : null;
```

Remove the `useFieldRefs` and `useStepRefs` calls (they are now inside `StepEditor`):
```typescript
// Remove:
const fieldRefs = useFieldRefs(draft, catalog);
const stepRefs = useStepRefs(draft);
```

Remove the `useFieldRefs`, `useStepRefs` import from `./-recipe-refs`.

- [ ] **Step 3: Remove stale state resets in `handleNew` and `handleLoad`**

In `handleNew`, remove:
```typescript
setActiveFieldEdit(null);
setActiveFieldPickerStepId(null);
```

In `handleLoad`, remove:
```typescript
setActiveFieldEdit(null);
setActiveFieldPickerStepId(null);
```

- [ ] **Step 4: Replace the `<StepEditor>` JSX**

Replace the current `<StepEditor ... >` block in the render with:
```tsx
{selectedStep !== null ? (
  <StepEditor
    step={selectedStep}
    draft={draft}
    dispatch={dispatch}
    catalog={catalog}
    onStepIdChange={handleStepIdChange}
  />
) : (
  <div className={styles.noStepSelected}>Select or add a step to begin</div>
)}
```

- [ ] **Step 5: Remove the page-level `<FieldPicker>` and `<FieldEditPanel>` renders**

Delete these blocks from the return JSX:
```tsx
{/* Remove: */}
{activeFieldPickerStepId && (
  <FieldPicker ... />
)}

{activeFieldEdit && fieldBeingEdited && (
  <FieldEditPanel ... />
)}
```

Remove the `FieldPicker` and `FieldEditPanel` imports from index.tsx since they are now only used inside `StepEditor`.

Also remove these handler functions (no longer needed at page level):
```typescript
// Remove:
const handleAddStep = () => { ... };  // Only if it was also calling setActiveFieldPickerStepId
```

Actually `handleAddStep` dispatches `ADD_STEP` — keep it. Only remove handlers that solely managed `activeFieldPickerStepId`/`activeFieldEdit`.

- [ ] **Step 6: Update `handleNew` to also reset `selectedStepId` with `null`**

Verify `handleNew` already has `setSelectedStepId(null)` — if using a string sentinel instead, change to null to be consistent:
```typescript
setSelectedStepId(null);
```

Note: `selectedStepId` type in `index.tsx` is currently `string | null`. Verify this is still consistent after removal of activeFieldEdit state.

- [ ] **Step 7: Type-check**
```bash
cd /home/ish/Work/GovTech/Applications/modular-forms-monorepo/apps/form_builder && npx tsc --noEmit 2>&1 | head -40
```
Expected: no output.

- [ ] **Step 8: Commit**
```bash
git add apps/form_builder/app/routes/builder/index.tsx
git commit -m "refactor(builder): remove page-level field panels; wire onStepIdChange; clean up stale state"
```

---

## Task 10: Manual smoke test + update `docs/issues.md`

- [ ] **Step 1: Start the dev server**
```bash
cd /home/ish/Work/GovTech/Applications/modular-forms-monorepo/apps/form_builder && pnpm dev
```

- [ ] **Step 2: Test each fixed behaviour in the browser**

| Scenario | Expected |
|---|---|
| Type an invalid Form ID (e.g. `My Form`) | Inline error appears; draft does not update |
| Type a valid Form ID (e.g. `my-form`) | No error; formId updates |
| Add a step; change its Step ID to `My Step` | Inline error; step ID does not change |
| Change step ID to `my-step` | Step ID updates; editor stays open (no collapse) |
| Validate a minimal form | Result banner appears with Dismiss button |
| Click Dismiss | Banner clears |
| Submit a valid form | Version in toolbar bumps to next after modal closes |
| Submit again (same session) | No conflict error; new version shows |
| Verify Publish/Unpublish buttons are gone | Toolbar shows only Validate, Preview, Submit |

- [ ] **Step 3: Clear `docs/issues.md`**

The two tracked bugs are now fixed. Truncate the file to empty:
```bash
echo -n "" > /home/ish/Work/GovTech/Applications/modular-forms-monorepo/apps/form_builder/docs/issues.md
```

- [ ] **Step 4: Final commit**
```bash
git add apps/form_builder/docs/issues.md
git commit -m "docs(builder): clear resolved issues"
```
