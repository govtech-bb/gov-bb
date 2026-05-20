# Form Builder Bug Fixes Batch 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address the 10 issues logged in `apps/form_builder/docs/issues.md` covering validation gaps, UX bugs, an architectural extraction (`packages/registry`), and styling.

**Architecture:**
- New shared package `packages/registry` is a 1:1 copy of `apps/api/src/registry/builtins/` (components + blocks), consumed by the form_builder app. The API keeps its own copy — dual-source until a future consolidation pass.
- The form_builder FieldPicker grows from `Components | Blocks | Custom` to `Primitives | Components | Blocks | Custom`: "Primitives" are the existing `BUILTIN_COMPONENTS` (renamed in UI only); "Components" come from the new `packages/registry`.
- Required system steps (`declaration`, `submission-confirmation`) are added by the reducer's `RESET` action and treated as non-removable. The step list UI hides remove/reorder controls for them and pins them to the last two positions on display.
- Validation gaps are closed at the form_builder seam: `handleSubmit` and `handleValidate` reject empty drafts before they reach the server. The Zod schema bug (`z.discriminatedUnion("ref", ...)`) is fixed in `packages/form-types` by switching to `z.union`.

**Tech Stack:** React 18, TanStack Start, TypeScript, Zod, pnpm workspace, `@govtech-bb/form-builder`, `@govtech-bb/form-types`, new `@govtech-bb/registry`.

---

## File Map

| File | Change |
|---|---|
| `packages/registry/package.json` | Create — new workspace package |
| `packages/registry/tsconfig.json` | Create |
| `packages/registry/src/index.ts` | Create — exports `REGISTRY_COMPONENTS` and `REGISTRY_BLOCKS` |
| `packages/registry/src/components/*.ts` | Create — copy of `apps/api/src/registry/builtins/components/*.ts` |
| `packages/registry/src/components/index.ts` | Create — re-exports all components |
| `packages/registry/src/blocks/*.ts` | Create — copy of `apps/api/src/registry/builtins/blocks/*.ts` |
| `packages/registry/src/blocks/index.ts` | Create — re-exports all blocks |
| `apps/form_builder/package.json` | Modify — add `@govtech-bb/registry: workspace:*` |
| `apps/form_builder/app/routes/builder/-field-picker.tsx` | Modify — add `Primitives` tab (rename current "Components"), new `Components` tab sources from `@govtech-bb/registry` |
| `apps/form_builder/app/routes/builder/-field-edit-panel.tsx` | Modify — restore modal wrapper; add override highlighting markers |
| `apps/form_builder/app/routes/builder/-step-editor.tsx` | Modify — step-id auto-derive on title blur; override-badge per field row |
| `apps/form_builder/app/routes/builder/-step-list.tsx` | Modify — hide remove/reorder controls for required steps |
| `apps/form_builder/app/routes/builder/-recipe-reducer.ts` | Modify — `RESET` seeds required steps; `nextStepId` returns `""` for new steps; reject `REMOVE_STEP` of required ids |
| `apps/form_builder/app/routes/builder/index.tsx` | Modify — pre-submit validation guards (no steps / no fields); render `FieldEditPanel` overlay through portal-style modal |
| `apps/form_builder/app/styles/builder.module.css` | Modify — select field styling; checkbox row alignment; override highlight; modal restoration for `.fieldEditPanel` |
| `packages/form-types/src/form-step.type.ts` | Modify — replace `z.discriminatedUnion("ref", ...)` with `z.union([...])` |
| `apps/form_builder/docs/issues.md` | Modify — clear at the end |

**Type-check command** (run after every task):
```bash
cd /home/ish/Work/GovTech/Applications/modular-forms-monorepo/apps/form_builder && npx tsc --noEmit 2>&1 | head -40
```
Expected: no output.

**Workspace-wide build check** (run after package creation):
```bash
cd /home/ish/Work/GovTech/Applications/modular-forms-monorepo && pnpm -r --filter='@govtech-bb/registry' build 2>&1 | tail -20
```

---

## Task 1: Create the `packages/registry` skeleton

**Files:**
- Create: `packages/registry/package.json`
- Create: `packages/registry/tsconfig.json`
- Create: `packages/registry/src/index.ts`

- [ ] **Step 1: Look up the reference package layout**

```bash
cat /home/ish/Work/GovTech/Applications/modular-forms-monorepo/packages/form-builder/package.json
cat /home/ish/Work/GovTech/Applications/modular-forms-monorepo/packages/form-builder/tsconfig.json
```

Match the same shape (build target, exports, peer deps on `@govtech-bb/form-types`).

- [ ] **Step 2: Write `packages/registry/package.json`**

```json
{
  "name": "@govtech-bb/registry",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "dependencies": {
    "@govtech-bb/form-types": "workspace:*",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

Use the exact `zod` version pinned by `packages/form-types` — check that first:
```bash
grep '"zod"' /home/ish/Work/GovTech/Applications/modular-forms-monorepo/packages/form-types/package.json
```
Use the value you find (substitute below in place of `^3.23.0` if it differs).

- [ ] **Step 3: Write `packages/registry/tsconfig.json`**

```json
{
  "extends": "../form-builder/tsconfig.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*.ts"]
}
```

If `packages/form-builder/tsconfig.json` does not extend, copy its `compilerOptions` verbatim instead of extending.

- [ ] **Step 4: Write the initial `packages/registry/src/index.ts`**

```typescript
export { REGISTRY_COMPONENTS } from "./components";
export { REGISTRY_BLOCKS } from "./blocks";
```

The two folders are created in Tasks 2 and 3. After this step, `tsc` will complain — that's expected.

- [ ] **Step 5: Add the package to the form_builder dependency list**

In `apps/form_builder/package.json`, under `dependencies`, add:
```json
"@govtech-bb/registry": "workspace:*"
```

- [ ] **Step 6: Run `pnpm install` to wire the workspace symlink**

```bash
cd /home/ish/Work/GovTech/Applications/modular-forms-monorepo && pnpm install
```
Expected: completes without errors. A new symlink `apps/form_builder/node_modules/@govtech-bb/registry` should exist.

- [ ] **Step 7: Commit**

```bash
git add packages/registry/package.json packages/registry/tsconfig.json packages/registry/src/index.ts apps/form_builder/package.json pnpm-lock.yaml
git commit -m "feat(registry): scaffold new @govtech-bb/registry package"
```

---

## Task 2: Copy api components into `packages/registry/src/components`

**Files:**
- Create: `packages/registry/src/components/*.ts` (one file per api component)
- Create: `packages/registry/src/components/index.ts`

- [ ] **Step 1: Copy the entire components directory**

```bash
cp -r /home/ish/Work/GovTech/Applications/modular-forms-monorepo/apps/api/src/registry/builtins/components/*.ts \
      /home/ish/Work/GovTech/Applications/modular-forms-monorepo/packages/registry/src/components/
```

- [ ] **Step 2: Verify the copy**

```bash
ls /home/ish/Work/GovTech/Applications/modular-forms-monorepo/packages/registry/src/components/ | wc -l
```
Expected: at least 34 `.ts` files (33 components + index).

Open one file and confirm import paths still resolve (they import from `@govtech-bb/form-types`, which the new package depends on, so they should be fine):
```bash
head -3 /home/ish/Work/GovTech/Applications/modular-forms-monorepo/packages/registry/src/components/first-name.ts
```
Expected: `import type { TextPrimitive } from "@govtech-bb/form-types";`

- [ ] **Step 3: Write `packages/registry/src/components/index.ts`**

Replace the file with the block below. It re-exports each component (mirroring the api side) and then builds the `REGISTRY_COMPONENTS` record from explicit imports — no `import * as` self-reference, so there's no circular dependency.

```typescript
// Re-exports — keep in sync with apps/api/src/registry/builtins/components/index.ts
export { AccountName } from "./account-name";
export { AccountNumber } from "./account-number";
export { AccountType } from "./account-type";
export { AdditionalDetails } from "./additional-details";
export { Address } from "./address";
export { Bank } from "./bank";
export { Confirmation } from "./confirmation";
export { ContactTelephone } from "./contact-number";
export { Country } from "./country";
export { GenericDate } from "./date";
export { DateOfBirth } from "./date-of-birth";
export { EmailAddress } from "./email";
export { FaxNumber } from "./fax-number";
export { FirstName } from "./first-name";
export { HomeTelephone } from "./home-telephone";
export { LastName } from "./last-name";
export { MiddleName } from "./middle-name";
export { MobileTelephone } from "./mobile-telephone";
export { Name } from "./name";
export { NationalIdNumber } from "./national-id";
export { NationalInsuranceNumber } from "./national-insurance-number";
export { Nationality } from "./nationality";
export { Parish } from "./parish";
export { PassportNumber } from "./passport-number";
export { Postcode } from "./post-code";
export { Relationship } from "./relationship";
export { Sex } from "./sex";
export { TamisNumber } from "./tamis-number";
export { Telephone } from "./telephone";
export { Town } from "./town";
export { UploadDocument } from "./upload-document";
export { WorkTelephone } from "./work-telephone";
export { Title } from "./title";

import { AccountName } from "./account-name";
import { AccountNumber } from "./account-number";
import { AccountType } from "./account-type";
import { AdditionalDetails } from "./additional-details";
import { Address } from "./address";
import { Bank } from "./bank";
import { Confirmation } from "./confirmation";
import { ContactTelephone } from "./contact-number";
import { Country } from "./country";
import { GenericDate } from "./date";
import { DateOfBirth } from "./date-of-birth";
import { EmailAddress } from "./email";
import { FaxNumber } from "./fax-number";
import { FirstName } from "./first-name";
import { HomeTelephone } from "./home-telephone";
import { LastName } from "./last-name";
import { MiddleName } from "./middle-name";
import { MobileTelephone } from "./mobile-telephone";
import { Name } from "./name";
import { NationalIdNumber } from "./national-id";
import { NationalInsuranceNumber } from "./national-insurance-number";
import { Nationality } from "./nationality";
import { Parish } from "./parish";
import { PassportNumber } from "./passport-number";
import { Postcode } from "./post-code";
import { Relationship } from "./relationship";
import { Sex } from "./sex";
import { TamisNumber } from "./tamis-number";
import { Telephone } from "./telephone";
import { Town } from "./town";
import { UploadDocument } from "./upload-document";
import { WorkTelephone } from "./work-telephone";
import { Title } from "./title";
import type { Primitive } from "@govtech-bb/form-types";

const ALL: Primitive[] = [
  AccountName, AccountNumber, AccountType, AdditionalDetails, Address, Bank,
  Confirmation, ContactTelephone, Country, GenericDate, DateOfBirth, EmailAddress,
  FaxNumber, FirstName, HomeTelephone, LastName, MiddleName, MobileTelephone,
  Name, NationalIdNumber, NationalInsuranceNumber, Nationality, Parish,
  PassportNumber, Postcode, Relationship, Sex, TamisNumber, Telephone, Town,
  Title, UploadDocument, WorkTelephone,
];

export const REGISTRY_COMPONENTS: Record<string, Primitive> = Object.fromEntries(
  ALL.map((c) => [`components/${c.fieldId}`, c]),
);
```

- [ ] **Step 4: Type-check the new package**

```bash
cd /home/ish/Work/GovTech/Applications/modular-forms-monorepo/packages/registry && npx tsc --noEmit 2>&1 | head -20
```
Expected: errors about missing `./blocks` (Task 3 fixes that).

- [ ] **Step 5: Commit**

```bash
git add packages/registry/src/components/
git commit -m "feat(registry): copy api builtin components into packages/registry"
```

---

## Task 3: Copy api blocks into `packages/registry/src/blocks`

**Files:**
- Create: `packages/registry/src/blocks/*.ts`
- Create: `packages/registry/src/blocks/index.ts`

- [ ] **Step 1: Copy block files**

```bash
cp -r /home/ish/Work/GovTech/Applications/modular-forms-monorepo/apps/api/src/registry/builtins/blocks/*.ts \
      /home/ish/Work/GovTech/Applications/modular-forms-monorepo/packages/registry/src/blocks/
```

- [ ] **Step 2: Inspect the api blocks index to capture exports**

```bash
cat /home/ish/Work/GovTech/Applications/modular-forms-monorepo/apps/api/src/registry/builtins/blocks/index.ts
```

- [ ] **Step 3: Write `packages/registry/src/blocks/index.ts`**

Mirror the named exports you saw in Step 2, then add the aggregator. Replace `[EXPORT1]`, `[EXPORT2]` etc. with the actual names from Step 2. Concretely:

```typescript
export { ApplicantDeclaration } from "./applicant-declaration";
export { AdditionalInformation } from "./additional-information";
export { ContactInformation } from "./contact-information";
export { EmergencyContactDetails } from "./emergency-contact-details";
export { PersonalInformation } from "./personal-information";
export { PhysicalAddress } from "./physical-address";
export { ProvingYourIdentity } from "./proving-your-identity";
export { SupportingDocuments } from "./supporting-documents";

import { ApplicantDeclaration } from "./applicant-declaration";
import { AdditionalInformation } from "./additional-information";
import { ContactInformation } from "./contact-information";
import { EmergencyContactDetails } from "./emergency-contact-details";
import { PersonalInformation } from "./personal-information";
import { PhysicalAddress } from "./physical-address";
import { ProvingYourIdentity } from "./proving-your-identity";
import { SupportingDocuments } from "./supporting-documents";
import type { Block } from "@govtech-bb/form-types";

const ALL_BLOCKS: Block[] = [
  ApplicantDeclaration,
  AdditionalInformation,
  ContactInformation,
  EmergencyContactDetails,
  PersonalInformation,
  PhysicalAddress,
  ProvingYourIdentity,
  SupportingDocuments,
];

export const REGISTRY_BLOCKS: Record<string, Block> = Object.fromEntries(
  ALL_BLOCKS.map((b) => [`blocks/${b.blockId}`, b]),
);
```

**Verify** the named exports in Step 2 match this list. If they differ, update the imports/exports here to match.

- [ ] **Step 4: Type-check**

```bash
cd /home/ish/Work/GovTech/Applications/modular-forms-monorepo/packages/registry && npx tsc --noEmit 2>&1 | head -20
```
Expected: no output.

Also confirm the consumer side:
```bash
cd /home/ish/Work/GovTech/Applications/modular-forms-monorepo/apps/form_builder && npx tsc --noEmit 2>&1 | head -20
```
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add packages/registry/src/blocks/
git commit -m "feat(registry): copy api builtin blocks into packages/registry"
```

---

## Task 4: Fix Zod discriminated-union bug in `form-step.type.ts`

The root cause of issue #4 ("Invalid discriminated union option at index '0'") is that `z.discriminatedUnion("ref", [...])` requires the discriminator to be a `z.literal` or `z.enum`, but both branches use `z.string().regex(...)`. Zod cannot dispatch and falls through with the cryptic error. The fix is a plain `z.union`.

**Files:**
- Modify: `packages/form-types/src/form-step.type.ts`

- [ ] **Step 1: Write a failing test**

Create `packages/form-types/src/form-step.spec.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { recipeFormStepFieldSchema } from "./form-step.type";

describe("recipeFormStepFieldSchema", () => {
  it("accepts a component field", () => {
    const result = recipeFormStepFieldSchema.safeParse({
      ref: "components/first-name",
      overrides: { label: "Custom" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a block field", () => {
    const result = recipeFormStepFieldSchema.safeParse({
      ref: "blocks/name",
      overrides: { "first-name": { label: "Given" } },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown ref prefix", () => {
    const result = recipeFormStepFieldSchema.safeParse({
      ref: "garbage/foo",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Determine the project's test runner**

```bash
cd /home/ish/Work/GovTech/Applications/modular-forms-monorepo/packages/form-types && cat package.json | grep -E '"test"|"jest"|"vitest"'
```
If the project uses `jest`, change `import { describe, it, expect } from "vitest"` to remove that import (Jest globals).

- [ ] **Step 3: Run the test — it should fail today**

```bash
cd /home/ish/Work/GovTech/Applications/modular-forms-monorepo/packages/form-types && npx jest form-step.spec --no-coverage 2>&1 | tail -30
```
(Or `pnpm vitest run form-step.spec` if vitest.) Expected: at least the "accepts a component field" case fails with the "Invalid discriminated union" error.

- [ ] **Step 4: Replace the discriminated union with a plain union**

In `packages/form-types/src/form-step.type.ts`, find:

```typescript
export const recipeFormStepFieldSchema = z.discriminatedUnion("ref", [
  recipeComponentFieldSchema,
  recipeBlockFieldSchema,
]);
```

Replace with:

```typescript
export const recipeFormStepFieldSchema = z.union([
  recipeComponentFieldSchema,
  recipeBlockFieldSchema,
]);
```

- [ ] **Step 5: Run the test — it should pass**

```bash
cd /home/ish/Work/GovTech/Applications/modular-forms-monorepo/packages/form-types && npx jest form-step.spec --no-coverage 2>&1 | tail -10
```
Expected: 3 passing.

- [ ] **Step 6: Type-check workspace and form_builder**

```bash
cd /home/ish/Work/GovTech/Applications/modular-forms-monorepo/apps/form_builder && npx tsc --noEmit 2>&1 | head -10
cd /home/ish/Work/GovTech/Applications/modular-forms-monorepo/packages/form-types && npx tsc --noEmit 2>&1 | head -10
```
Expected: no output for both.

- [ ] **Step 7: Commit**

```bash
git add packages/form-types/src/form-step.type.ts packages/form-types/src/form-step.spec.ts
git commit -m "fix(form-types): switch recipeFormStepFieldSchema from discriminatedUnion to union"
```

---

## Task 5: Add "Primitives" + "Components" tabs to `FieldPicker`

Rename the existing UI tab "Components" to "Primitives" (its data — `BUILTIN_COMPONENTS` from form-builder — is already HTML-level primitives). Add a new "Components" tab sourced from `@govtech-bb/registry`. Blocks tab keeps form-builder's existing blocks; we'll surface registry blocks alongside in a follow-up if needed (out of scope for this batch).

**Files:**
- Modify: `apps/form_builder/app/routes/builder/-field-picker.tsx`

- [ ] **Step 1: Add the new import**

At the top of `-field-picker.tsx`, add:
```typescript
import { REGISTRY_COMPONENTS } from "@govtech-bb/registry";
```

- [ ] **Step 2: Update tab list and types**

Replace:
```typescript
type Tab = "Components" | "Blocks" | "Custom";
const TABS: Tab[] = ["Components", "Blocks", "Custom"];
```

With:
```typescript
type Tab = "Primitives" | "Components" | "Blocks" | "Custom";
const TABS: Tab[] = ["Primitives", "Components", "Blocks", "Custom"];
```

And change the initial state:
```typescript
const [activeTab, setActiveTab] = useState<Tab>("Primitives");
```

- [ ] **Step 3: Rename the existing "Components" tab body to "Primitives"**

Find the block that renders `catalog.components.map(...)` (currently gated by `activeTab === "Components"`). Change the guard to `activeTab === "Primitives"`. The body stays the same.

- [ ] **Step 4: Add the new Components tab body**

Immediately after the renamed Primitives block, add:

```tsx
{activeTab === "Components" && (
  <div>
    {Object.entries(REGISTRY_COMPONENTS).length === 0 && (
      <p style={{ color: "#888" }}>No registry components available.</p>
    )}
    {Object.entries(REGISTRY_COMPONENTS).map(([ref, primitive]) => (
      <div
        key={ref}
        className={styles.fieldRow}
        style={{ cursor: "pointer" }}
        onClick={() =>
          onAddField({ kind: "component", ref, overrides: {} })
        }
      >
        <span style={{ flex: 1 }}>{primitive.label}</span>
        <span className={styles.badge}>{primitive.fieldId}</span>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 5: Type-check**

```bash
cd /home/ish/Work/GovTech/Applications/modular-forms-monorepo/apps/form_builder && npx tsc --noEmit 2>&1 | head -20
```
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add apps/form_builder/app/routes/builder/-field-picker.tsx
git commit -m "feat(builder): add Primitives and Components tabs to FieldPicker"
```

---

## Task 6: Restore `FieldEditPanel` as a modal

Reverse part of the previous batch's Task 7: wrap the edit panel in the existing modal styles (`.modal` + `.modalContent`) so it floats above the page. Keep the dispatch-based save flow and internal-ref computation.

**Files:**
- Modify: `apps/form_builder/app/routes/builder/-field-edit-panel.tsx`
- Modify: `apps/form_builder/app/styles/builder.module.css` (remove the inline `.fieldEditPanel` style added last batch)

- [ ] **Step 1: Wrap the return in modal markup**

In `-field-edit-panel.tsx`, replace the outermost `<div className={styles.fieldEditPanel}>...</div>` with:

```tsx
<div className={styles.modal} onClick={onClose}>
  <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        marginBottom: 12,
      }}
    >
      <strong>Edit Field: {item?.displayName ?? field.ref}</strong>
      <button type="button" onClick={onClose}>Close</button>
    </div>

    {/* ...keep the existing isBlock-conditional + OverrideForm body unchanged... */}

    <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
      <button type="button" onClick={handleSave}>Save</button>
      <button type="button" onClick={onClose}>Cancel</button>
    </div>
  </div>
</div>
```

The inner body (the `isBlock && blockDef ? (...) : (...)` chunk) stays identical.

- [ ] **Step 2: Remove the now-unused inline panel class**

In `apps/form_builder/app/styles/builder.module.css`, delete the `.fieldEditPanel` rule added in the previous batch:

```css
/* Remove this block: */
.fieldEditPanel {
  margin-top: 16px;
  padding: 16px;
  border: 1px solid var(--color-border, #e2e2e2);
  border-radius: 6px;
  background: var(--color-surface);
}
```

- [ ] **Step 3: Type-check**

```bash
cd /home/ish/Work/GovTech/Applications/modular-forms-monorepo/apps/form_builder && npx tsc --noEmit 2>&1 | head -10
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add apps/form_builder/app/routes/builder/-field-edit-panel.tsx apps/form_builder/app/styles/builder.module.css
git commit -m "fix(builder): restore FieldEditPanel as modal (keep FieldPicker inline)"
```

---

## Task 7: Step-id auto-derive from title on blur

When a new step is added, `stepId` should be empty. When the user blurs the **Title** field, if `stepId` is still empty, derive it as a kebab-cased version of the title. Once the user types into `stepId` manually, do not auto-derive again — this is a one-shot helper.

**Files:**
- Modify: `apps/form_builder/app/routes/builder/-recipe-reducer.ts`
- Modify: `apps/form_builder/app/routes/builder/-step-editor.tsx`

The reducer's `ADD_STEP` continues to use `nextStepId(...)` as a placeholder (`step-N`) so the new step always has a unique React key and can be selected immediately. The auto-fill helper treats any id matching that placeholder pattern as "still default" and replaces it from the title on blur. As soon as the user types into the Step ID field manually, the placeholder is gone and auto-fill no longer fires.

- [ ] **Step 1: Add an onBlur auto-fill to the Title input in `StepEditor`**

In `-step-editor.tsx`, near the top of the file add a kebab utility (or inline):
```typescript
const STEP_ID_DEFAULT_PATTERN = /^step-\d+$/;

function kebabize(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

Find the Title `<input>` block. Replace it with:

```tsx
<div className={styles.formGroup}>
  <label>Title</label>
  <input
    type="text"
    value={step.title}
    onChange={(e) =>
      dispatch({
        type: "UPDATE_STEP_META",
        stepId: step.stepId,
        meta: { title: e.target.value },
      })
    }
    onBlur={(e) => {
      const title = e.target.value;
      if (!title) return;
      // Auto-derive stepId only if it's still the default placeholder (step-N)
      // and the user has not started editing it manually.
      const isDefault = STEP_ID_DEFAULT_PATTERN.test(step.stepId);
      const localUntouched = localStepId === step.stepId;
      if (isDefault && localUntouched) {
        const derived = kebabize(title);
        if (derived && derived !== step.stepId) {
          dispatch({
            type: "UPDATE_STEP_META",
            stepId: step.stepId,
            meta: { stepId: derived },
          });
          onStepIdChange(step.stepId, derived);
        }
      }
    }}
  />
</div>
```

- [ ] **Step 2: Type-check**

```bash
cd /home/ish/Work/GovTech/Applications/modular-forms-monorepo/apps/form_builder && npx tsc --noEmit 2>&1 | head -10
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/form_builder/app/routes/builder/-step-editor.tsx
git commit -m "feat(builder): auto-derive step ID from title on blur when still default"
```

---

## Task 8: Required system steps — `declaration` and `submission-confirmation`

Seed every new draft with two required steps at the end. They are editable (title, fields, behaviours) but cannot be removed or reordered out of the last two positions.

**Files:**
- Modify: `apps/form_builder/app/routes/builder/-recipe-reducer.ts`
- Modify: `apps/form_builder/app/routes/builder/-step-list.tsx`
- Modify: `apps/form_builder/app/routes/builder/index.tsx`

- [ ] **Step 1: Define the required step ids and a seeding helper**

At the top of `-recipe-reducer.ts`, after imports, add:

```typescript
export const REQUIRED_STEP_IDS = ["declaration", "submission-confirmation"] as const;
export type RequiredStepId = (typeof REQUIRED_STEP_IDS)[number];

export function isRequiredStep(stepId: string): stepId is RequiredStepId {
  return (REQUIRED_STEP_IDS as readonly string[]).includes(stepId);
}

function makeRequiredSteps(): RecipeStepDraft[] {
  return [
    { stepId: "declaration", title: "Declaration", description: undefined, fields: [], behaviours: [] },
    { stepId: "submission-confirmation", title: "Submission Confirmation", description: undefined, fields: [], behaviours: [] },
  ];
}
```

- [ ] **Step 2: Seed required steps on RESET and as part of EMPTY_DRAFT**

Update the `EMPTY_DRAFT` constant:

```typescript
export const EMPTY_DRAFT: RecipeDraft = {
  formId: "",
  title: "",
  steps: makeRequiredSteps(),
};
```

Update the `RESET` case to use the same helper:

```typescript
case "RESET": {
  return { formId: "", title: "", steps: makeRequiredSteps() };
}
```

- [ ] **Step 3: Reject removal of required steps and pin them last**

Update `REMOVE_STEP`:

```typescript
case "REMOVE_STEP": {
  if (isRequiredStep(action.stepId)) return state; // ignore
  return {
    ...state,
    steps: state.steps.filter((s) => s.stepId !== action.stepId),
  };
}
```

Update `ADD_STEP` so new steps are inserted *before* the required tail:

```typescript
case "ADD_STEP": {
  const stepId = nextStepId(state.steps);
  const n = parseInt(stepId.replace("step-", ""), 10);
  const newStep: RecipeStepDraft = {
    stepId,
    title: `Step ${n}`,
    description: undefined,
    fields: [],
    behaviours: [],
  };
  const requiredCount = REQUIRED_STEP_IDS.length;
  const insertAt = Math.max(0, state.steps.length - requiredCount);
  const before = state.steps.slice(0, insertAt);
  const after = state.steps.slice(insertAt);
  return { ...state, steps: [...before, newStep, ...after] };
}
```

Update `REORDER_STEPS` to clamp so required steps cannot move out of the tail:

```typescript
case "REORDER_STEPS": {
  const requiredCount = REQUIRED_STEP_IDS.length;
  const lastEditableIndex = state.steps.length - requiredCount - 1;
  const { fromIndex, toIndex } = action;
  // Refuse to move into or out of the required tail.
  if (fromIndex > lastEditableIndex || toIndex > lastEditableIndex) return state;
  const steps = [...state.steps];
  const tmp = steps[fromIndex];
  steps[fromIndex] = steps[toIndex];
  steps[toIndex] = tmp;
  return { ...state, steps };
}
```

Update `LOAD_DRAFT` to normalize: if the loaded draft lacks one of the required ids, append the missing one. If they exist but aren't last, move them to the tail in the required order.

```typescript
case "LOAD_DRAFT": {
  const incoming = action.draft.steps;
  const byId = new Map(incoming.map((s) => [s.stepId, s]));
  const editable = incoming.filter((s) => !isRequiredStep(s.stepId));
  const required = REQUIRED_STEP_IDS.map((id) => {
    const existing = byId.get(id);
    return (
      existing ?? {
        stepId: id,
        title: id === "declaration" ? "Declaration" : "Submission Confirmation",
        description: undefined,
        fields: [],
        behaviours: [],
      }
    );
  });
  return { ...action.draft, steps: [...editable, ...required] };
}
```

- [ ] **Step 4: Hide remove/reorder controls for required steps in `StepList`**

Read `-step-list.tsx` to find the per-step row rendering. Where the remove/up/down buttons are rendered, add a guard:

```tsx
{!isRequiredStep(step.stepId) && (
  <>
    <button type="button" onClick={() => onMoveUp(idx)} disabled={idx === 0}>↑</button>
    <button type="button" onClick={() => onMoveDown(idx)} disabled={idx === steps.length - 1}>↓</button>
    <button type="button" onClick={() => onRemove(step.stepId)}>×</button>
  </>
)}
```

Add the import at the top of `-step-list.tsx`:
```typescript
import { isRequiredStep } from "./-recipe-reducer";
```

If the existing render uses different button labels or icons, preserve them — only add the conditional wrapper.

- [ ] **Step 5: Also disable Step ID editing for required steps in StepEditor**

In `-step-editor.tsx`, find the Step ID input. Wrap its `onChange` to no-op when the step is required, and mark the input `readOnly`:

```tsx
<input
  type="text"
  value={localStepId}
  readOnly={isRequiredStep(step.stepId)}
  onChange={(e) => {
    if (isRequiredStep(step.stepId)) return;
    handleStepIdChange(e.target.value);
  }}
  aria-invalid={stepIdError ? true : undefined}
/>
```

Add the import:
```typescript
import { isRequiredStep } from "./-recipe-reducer";
```

- [ ] **Step 6: Type-check**

```bash
cd /home/ish/Work/GovTech/Applications/modular-forms-monorepo/apps/form_builder && npx tsc --noEmit 2>&1 | head -20
```
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add apps/form_builder/app/routes/builder/-recipe-reducer.ts \
        apps/form_builder/app/routes/builder/-step-list.tsx \
        apps/form_builder/app/routes/builder/-step-editor.tsx
git commit -m "feat(builder): seed required declaration + submission-confirmation steps and lock them"
```

---

## Task 9: Pre-submit validation guards — no steps, no fields

The server `submitRecipe` will throw on schema violations, but the user experience is better if the builder refuses to submit obviously-invalid drafts. We block submit on:
- Zero non-required steps (i.e., draft has only `declaration` + `submission-confirmation` and nothing else)
- Any step (including required ones) with zero fields

Required steps without fields are still a problem; this guard surfaces it.

**Files:**
- Modify: `apps/form_builder/app/routes/builder/index.tsx`

- [ ] **Step 1: Extend `handleValidate` and compute a richer `canSubmit`**

Find `canSubmit`:
```typescript
const canSubmit = validateResult?.valid === true;
```

Replace with:
```typescript
const editableSteps = draft.steps.filter(
  (s) => s.stepId !== "declaration" && s.stepId !== "submission-confirmation",
);
const hasEditableSteps = editableSteps.length > 0;
const allStepsHaveFields = draft.steps.every((s) => s.fields.length > 0);
const canSubmit =
  validateResult?.valid === true && hasEditableSteps && allStepsHaveFields;
```

- [ ] **Step 2: Surface the reason in `handleValidate`**

Add pre-checks at the top of `handleValidate`:

```typescript
const handleValidate = async () => {
  setIsValidating(true);
  try {
    // Pre-flight checks that the server schema would also fail, but with friendlier messages.
    if (!hasEditableSteps) {
      const result: RecipeValidateResponse = {
        valid: false,
        issues: [
          { path: "steps", message: "Add at least one step before the required Declaration and Submission Confirmation steps." },
        ],
      };
      setValidateResult(result);
      setLastSaveStatus("error");
      return;
    }
    const emptyStep = draft.steps.find((s) => s.fields.length === 0);
    if (emptyStep) {
      const result: RecipeValidateResponse = {
        valid: false,
        issues: [
          { path: `steps[${emptyStep.stepId}].fields`, message: `Step "${emptyStep.title || emptyStep.stepId}" has no fields.` },
        ],
      };
      setValidateResult(result);
      setLastSaveStatus("error");
      return;
    }

    const recipe = serializeRecipeDraft(draft, { version });
    const raw = (await validateRecipe({ data: { recipe } })) as ValidationResult;
    const result: RecipeValidateResponse = {
      valid: raw.ok,
      issues: raw.ok ? [] : raw.issues,
    };
    setValidateResult(result);
    setLastSaveStatus(raw.ok ? "success" : "error");
  } catch (e) {
    const result: RecipeValidateResponse = {
      valid: false,
      issues: [
        { path: "", message: e instanceof Error ? e.message : "Validation request failed" },
      ],
    };
    setValidateResult(result);
    setLastSaveStatus("error");
  } finally {
    setIsValidating(false);
  }
};
```

- [ ] **Step 3: Type-check**

```bash
cd /home/ish/Work/GovTech/Applications/modular-forms-monorepo/apps/form_builder && npx tsc --noEmit 2>&1 | head -20
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add apps/form_builder/app/routes/builder/index.tsx
git commit -m "fix(builder): reject empty drafts (no steps, no fields) before submit"
```

---

## Task 10: Override highlighting

Mark fields that have overrides with a small visual indicator: a colored dot in the step's field-row list, and (when editing) a left-border accent on inputs whose value differs from the registry default.

**Files:**
- Modify: `apps/form_builder/app/routes/builder/-step-editor.tsx`
- Modify: `apps/form_builder/app/routes/builder/-field-edit-panel.tsx`
- Modify: `apps/form_builder/app/styles/builder.module.css`

- [ ] **Step 1: Add the CSS classes**

In `builder.module.css`, append:

```css
/* ── Override indicators ──────────────────────────── */

.overrideDot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-accent, #1565c0);
  margin-right: 6px;
  vertical-align: middle;
}

.overrideField input,
.overrideField textarea,
.overrideField select {
  border-left: 3px solid var(--color-accent, #1565c0);
  padding-left: 8px;
}
```

- [ ] **Step 2: Add the dot in `StepEditor` field rows**

In `-step-editor.tsx`, inside the `step.fields.map((field, idx) => { ... })` block, compute whether the field has non-empty overrides:

```typescript
const hasOverrides =
  Object.keys(field.overrides ?? {}).length > 0 ||
  (field.kind === "block" && Object.keys(field.childOverrides ?? {}).length > 0);
```

Then in the JSX for the row, prepend a dot:

```tsx
<span style={{ flex: 1 }}>
  {hasOverrides && <span className={styles.overrideDot} title="Has overrides" />}
  {displayName}
</span>
```

- [ ] **Step 3: Highlight overridden inputs in `FieldEditPanel`'s `OverrideForm`**

In `-field-edit-panel.tsx`, the `OverrideForm` component renders `<input>` blocks inside `<div className={styles.formGroup}>`. Replace each `<div className={styles.formGroup}>` with a conditional wrapper class that includes `styles.overrideField` when the corresponding override key is set:

```typescript
function fg(isOverridden: boolean) {
  return `${styles.formGroup} ${isOverridden ? styles.overrideField : ""}`;
}
```

Then update each form group, e.g.:
```tsx
<div className={fg(overrides.fieldId !== undefined && overrides.fieldId !== "")}>
  <label>Field ID Override</label>
  <input ... />
</div>

<div className={fg(overrides.label !== undefined && overrides.label !== "")}>
  <label>Label</label>
  <input ... />
</div>

<div className={fg(overrides.hint !== undefined && overrides.hint !== "")}>
  <label>Hint</label>
  <input ... />
</div>

<div className={fg(overrides.isDisabled === true)}>
  <label>...</label>
</div>

<div className={fg(overrides.isHidden === true)}>
  <label>...</label>
</div>

<div className={fg(overrides.validations?.required !== undefined)}>
  <label>...</label>
</div>
```

Don't bother extending this to `ValidationRulesEditor`/`BehavioursEditor` — those have their own visual state.

- [ ] **Step 4: Type-check**

```bash
cd /home/ish/Work/GovTech/Applications/modular-forms-monorepo/apps/form_builder && npx tsc --noEmit 2>&1 | head -10
```
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add apps/form_builder/app/routes/builder/-step-editor.tsx \
        apps/form_builder/app/routes/builder/-field-edit-panel.tsx \
        apps/form_builder/app/styles/builder.module.css
git commit -m "feat(builder): highlight fields and form rows that have overrides"
```

---

## Task 11: Style `<select>` fields and align checkbox rows

Closes issues #9 and #10 in one styling pass.

**Files:**
- Modify: `apps/form_builder/app/styles/builder.module.css`
- Modify: `apps/form_builder/app/routes/builder/-field-edit-panel.tsx` (only to add a `styles.checkRow` class on the three checkbox rows)

- [ ] **Step 1: Add CSS rules**

In `builder.module.css`, append:

```css
/* ── Select fields ────────────────────────────────── */

.formGroup select {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--color-border, #d4d4d4);
  border-radius: 4px;
  background: var(--color-surface, #fff);
  font-size: 0.9rem;
  appearance: auto;
}

.formGroup select:focus {
  outline: 2px solid var(--color-accent, #1565c0);
  outline-offset: -1px;
}

/* ── Checkbox rows ────────────────────────────────── */

.checkRow {
  display: flex;
  align-items: center;
  gap: 8px;
}

.checkRow label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
}

.checkRow input[type="checkbox"] {
  margin: 0;
  vertical-align: middle;
}
```

- [ ] **Step 2: Apply `checkRow` to the Disabled, Hidden, Required form groups**

In `-field-edit-panel.tsx`'s `OverrideForm`, for each of the three checkbox form groups (Disabled, Hidden, Required), add `styles.checkRow` to its `className`. Concretely each becomes:

```tsx
<div className={`${fg(overrides.isDisabled === true)} ${styles.checkRow}`}>
  <label>
    <input
      type="checkbox"
      checked={overrides.isDisabled ?? false}
      onChange={(e) => patch({ isDisabled: e.target.checked || undefined })}
    />
    Disabled
  </label>
</div>
```

Do the same for the Hidden and Required rows. (If Task 10 has not added `fg(...)` yet — e.g., tasks executed out of order — drop the `fg(...)` wrapper and use `styles.formGroup` alone.)

- [ ] **Step 3: Type-check**

```bash
cd /home/ish/Work/GovTech/Applications/modular-forms-monorepo/apps/form_builder && npx tsc --noEmit 2>&1 | head -10
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add apps/form_builder/app/styles/builder.module.css apps/form_builder/app/routes/builder/-field-edit-panel.tsx
git commit -m "style(builder): select field styling; align Disabled/Hidden/Required checkboxes"
```

---

## Task 12: Manual smoke test + clear `docs/issues.md`

- [ ] **Step 1: Start the dev server**

```bash
cd /home/ish/Work/GovTech/Applications/modular-forms-monorepo/apps/form_builder && pnpm dev
```

- [ ] **Step 2: Walk the test matrix in a browser**

| Scenario | Expected |
|---|---|
| Load builder fresh | Step list shows two locked tail steps: Declaration, Submission Confirmation. Both have no reorder/remove buttons. |
| Click "Add Step" | A new editable step appears **above** the required tail. |
| Type into the Title field, then Tab away | Step ID auto-fills with kebab-cased version of the title. |
| Type something into Step ID manually | Auto-derive stops; manual value sticks. |
| Try to drag/move a required step | Buttons are absent; no action possible. |
| Click "Validate" with only the required steps (no editable step) | Validation panel shows "Add at least one step…" |
| Click "Validate" with an editable step but no fields in it | Validation panel shows "Step has no fields." |
| Click an editable step's Edit → field row | Field edit modal opens (centered overlay, dimmed backdrop). |
| Open FieldPicker (the "Add field" section) | Inline palette with **four** tabs: Primitives, Components, Blocks, Custom. |
| Components tab shows registry items | E.g. "First name", "Email address". |
| Add a Component, override its label, save | Step's field row shows a dot indicator. |
| Open the edit modal for the overridden field | Label input has a colored left-border accent. |
| Submit a valid recipe | Success; version bumps. |
| Try Validate on a primitive field with no `htmlType` mismatch | No "Invalid discriminated union" error. |
| Select field in editor | Has visible border and padding. |
| Disabled / Hidden / Required checkboxes | Render on a single horizontal line each, checkbox vertically centered with label. |

- [ ] **Step 3: Truncate `docs/issues.md`**

```bash
: > /home/ish/Work/GovTech/Applications/modular-forms-monorepo/apps/form_builder/docs/issues.md
```

- [ ] **Step 4: Final commit**

```bash
git add apps/form_builder/docs/issues.md
git commit -m "docs(builder): clear resolved batch-2 issues"
```

---
