# MDA Contact Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional MDA contact details to the service contract schema, thread it through the type hierarchy, and render a contact panel on the submission-confirmation screen.

**Architecture:** `contactDetailsSchema` is defined in `form-types` and validated at parse time. It flows as an optional top-level field on `ServiceContract` → `ClientServiceContract` → `FormMeta` → `SubmissionConfirmationProps`. The `SubmissionConfirmation` component renders it conditionally, so contracts without `contactDetails` are unaffected.

**Tech Stack:** TypeScript, Zod v4, React, CSS Modules (govtechbb design system), Nx monorepo (`npx nx run form-types:test` to run package tests)

---

## File Map

| File | Change |
|------|--------|
| `packages/form-types/src/service-contract.type.ts` | Add `contactDetailsSchema` + `ContactDetails` type; add optional field to both contract schemas |
| `packages/form-types/src/index.ts` | Export `contactDetailsSchema` and `ContactDetails` |
| `packages/form-types/src/service-contract.type.spec.ts` | New — Zod schema tests for `contactDetailsSchema` |
| `apps/forms/src/types/field-mapper.type.ts` | Add `contactDetails?: ContactDetails` to `ClientServiceContract` |
| `apps/forms/src/types/renderer.type.ts` | Add `contactDetails?: ContactDetails` to `FormMeta` |
| `apps/forms/src/types/props.type.ts` | Add `contactDetails?: ContactDetails` to `SubmissionConfirmationProps` |
| `apps/forms/src/lib/form-builder/build-form.ts` | Pass `contactDetails` into returned `FormMeta` |
| `apps/forms/src/components/form-renderer.tsx` | Pass `contactDetails` prop to `SubmissionConfirmation` |
| `apps/forms/src/components/submission-confirmation.tsx` | Render contact panel when `contactDetails` is present |
| `apps/forms/src/styles/govtechbb.module.css` | Add `.contactDetails`, `.contactDetailsBody`, `.contactLabel` |
| `apps/forms/contracts/master-contract.json` | Move `contactDetails` from `submission-confirmation` step to top level |
| `apps/forms/contracts/example-service-contract.json` | Add `contactDetails` at top level (Barbados Post Office sample data) |

---

### Task 1: Add `contactDetailsSchema` to `form-types` with tests

**Files:**
- Create: `packages/form-types/src/service-contract.type.spec.ts`
- Modify: `packages/form-types/src/service-contract.type.ts`
- Modify: `packages/form-types/src/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/form-types/src/service-contract.type.spec.ts`:

```ts
import { contactDetailsSchema, serviceContractSchema } from "./service-contract.type";

describe("contactDetailsSchema", () => {
  const validFull = {
    title: "Registration Department",
    telephoneNumber: "(246) 535-8300",
    email: "registrationdept@barbados.gov.bb",
    address: {
      line1: "Supreme Court Complex",
      line2: "Whitepark Road",
      city: "St. Michael",
      country: "Barbados",
    },
  };

  it("accepts a full valid contact details object", () => {
    expect(contactDetailsSchema.safeParse(validFull).success).toBe(true);
  });

  it("accepts contact details without address", () => {
    const { address: _a, ...noAddress } = validFull;
    expect(contactDetailsSchema.safeParse(noAddress).success).toBe(true);
  });

  it("accepts contact details with address missing optional fields", () => {
    const partial = {
      ...validFull,
      address: { line1: "Cheapside", city: "Bridgetown" },
    };
    expect(contactDetailsSchema.safeParse(partial).success).toBe(true);
  });

  it("rejects missing title", () => {
    const { title: _t, ...noTitle } = validFull;
    expect(contactDetailsSchema.safeParse(noTitle).success).toBe(false);
  });

  it("rejects missing telephoneNumber", () => {
    const { telephoneNumber: _p, ...noPhone } = validFull;
    expect(contactDetailsSchema.safeParse(noPhone).success).toBe(false);
  });

  it("rejects missing email", () => {
    const { email: _e, ...noEmail } = validFull;
    expect(contactDetailsSchema.safeParse(noEmail).success).toBe(false);
  });

  it("rejects invalid email format", () => {
    expect(
      contactDetailsSchema.safeParse({ ...validFull, email: "not-an-email" }).success
    ).toBe(false);
  });
});

describe("serviceContractSchema with contactDetails", () => {
  const baseContract = {
    formId: "test-form",
    title: "Test Form",
    version: "1.0.0",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    steps: [],
  };

  it("accepts a contract without contactDetails", () => {
    expect(serviceContractSchema.safeParse(baseContract).success).toBe(true);
  });

  it("accepts a contract with valid contactDetails", () => {
    const withContact = {
      ...baseContract,
      contactDetails: {
        title: "Post Office",
        telephoneNumber: "(246) 535-0200",
        email: "customerservice@post.gov.bb",
      },
    };
    expect(serviceContractSchema.safeParse(withContact).success).toBe(true);
  });

  it("rejects a contract with invalid contactDetails", () => {
    const withBadContact = {
      ...baseContract,
      contactDetails: { title: "Post Office" }, // missing telephoneNumber and email
    };
    expect(serviceContractSchema.safeParse(withBadContact).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests — expect them to fail**

```bash
npx nx run form-types:test
```

Expected: Tests fail with errors like `contactDetailsSchema is not exported` or `contactDetailsSchema is not a function`.

- [ ] **Step 3: Add `contactDetailsSchema` to `service-contract.type.ts`**

Replace the entire file content with:

```ts
import { z } from "zod";
import { formStepSchema, recipeFormStepSchema } from "./form-step.type";
import { processorSchema } from "./processor.type";

// ISO 8601 datetime — accepts optional milliseconds and timezone offset/Z
// e.g. "2026-01-01T00:00:00", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00+05:30"
export const dateTimeFormatSchema = z.string().datetime({ offset: true });
export type DateTimeFormat = z.infer<typeof dateTimeFormatSchema>;

export const contactDetailsSchema = z.object({
  title: z.string(),
  telephoneNumber: z.string(),
  email: z.string().email(),
  address: z
    .object({
      line1: z.string(),
      line2: z.string().optional(),
      city: z.string(),
      country: z.string().optional(),
    })
    .optional(),
});
export type ContactDetails = z.infer<typeof contactDetailsSchema>;

export const serviceContractSchema = z.object({
  formId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  contactDetails: contactDetailsSchema.optional(),
  steps: z.array(formStepSchema),
  processors: z.array(processorSchema).optional(),
  createdAt: dateTimeFormatSchema,
  updatedAt: dateTimeFormatSchema,
  version: z.string(),
});
export type ServiceContract = z.infer<typeof serviceContractSchema>;

export const serviceContractRecipeSchema = z.object({
  formId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  contactDetails: contactDetailsSchema.optional(),
  steps: z.array(recipeFormStepSchema),
  processors: z.array(processorSchema).optional(),
  createdAt: dateTimeFormatSchema,
  updatedAt: dateTimeFormatSchema,
  version: z.string(),
});
export type ServiceContractRecipe = z.infer<typeof serviceContractRecipeSchema>;
```

- [ ] **Step 4: Export from the index barrel**

In `packages/form-types/src/index.ts`, replace the existing service-contract export block (lines 102–112) with:

```ts
export {
  dateTimeFormatSchema,
  serviceContractSchema,
  serviceContractRecipeSchema,
  contactDetailsSchema,
} from "./service-contract.type";

export type {
  ServiceContract,
  ServiceContractRecipe,
  DateTimeFormat,
  ContactDetails,
} from "./service-contract.type";
```

- [ ] **Step 5: Run the tests — expect them to pass**

```bash
npx nx run form-types:test
```

Expected: All tests in `service-contract.type.spec.ts` pass. The pre-existing `processor.type.spec.ts` tests also pass.

- [ ] **Step 6: Commit**

```bash
git add packages/form-types/src/service-contract.type.ts packages/form-types/src/service-contract.type.spec.ts packages/form-types/src/index.ts
git commit -m "feat(form-types): add contactDetailsSchema and export ContactDetails type"
```

---

### Task 2: Add `contactDetails` to web app TypeScript types

**Files:**
- Modify: `apps/forms/src/types/field-mapper.type.ts`
- Modify: `apps/forms/src/types/renderer.type.ts`
- Modify: `apps/forms/src/types/props.type.ts`

These are pure type changes. TypeScript compilation is the verification step.

- [ ] **Step 1: Update `ClientServiceContract` in `field-mapper.type.ts`**

The import at the top already pulls from `@govtech-bb/form-types`. Add `ContactDetails` to that import and add the field to `ClientServiceContract`.

Replace the import line:
```ts
import {
  Behaviour,
  DateTimeFormat,
  fieldValueSchema,
  HtmlTypes,
  Option,
  PrimitiveUI,
  ValidationRule,
} from "@govtech-bb/form-types";
```

With:
```ts
import {
  Behaviour,
  ContactDetails,
  DateTimeFormat,
  fieldValueSchema,
  HtmlTypes,
  Option,
  PrimitiveUI,
  ValidationRule,
} from "@govtech-bb/form-types";
```

Then add `contactDetails?: ContactDetails;` to `ClientServiceContract`, after `description`:

```ts
export interface ClientServiceContract {
  formId: string;
  title: string;
  description?: string;
  contactDetails?: ContactDetails;
  steps: ClientFormStep[];
  createdAt: DateTimeFormat;
  updatedAt: DateTimeFormat;
  version: string;
}
```

- [ ] **Step 2: Update `FormMeta` in `renderer.type.ts`**

Replace the import line at the top of the file:
```ts
import z from "zod";
import { ClientFormStep } from "./field-mapper.type";
import { FieldValidationProperties } from "./validation.type";
import { RepeatableStepSettings } from "./behavior-helper.type";
```

With:
```ts
import z from "zod";
import { ContactDetails } from "@govtech-bb/form-types";
import { ClientFormStep } from "./field-mapper.type";
import { FieldValidationProperties } from "./validation.type";
import { RepeatableStepSettings } from "./behavior-helper.type";
```

Add `contactDetails?: ContactDetails;` to `FormMeta`, after `formDescription`:

```ts
export interface FormMeta {
  formId: string;
  version: string;
  formTitle: string;
  formDescription?: string;
  contactDetails?: ContactDetails;
  schema: z.ZodObject<Record<string, z.ZodType<unknown>>>;
  steps: ClientFormStep[];
  defaultValues: Record<string, unknown>;
  validationProperties: Record<string, FieldValidationProperties>;
  stepConditionalTargets: Record<stepId, fieldId>;
  repeatSettings: RepeatableStepSettings;
  idempotencyKey: string;
}
```

- [ ] **Step 3: Update `SubmissionConfirmationProps` in `props.type.ts`**

Add `ContactDetails` to the existing `@govtech-bb/form-types` import. The current import block in `props.type.ts` imports from `./field-mapper.type` and `./renderer.type`. Add a new import:

```ts
import { ContactDetails } from "@govtech-bb/form-types";
```

Add `contactDetails?: ContactDetails;` to `SubmissionConfirmationProps`:

```ts
export interface SubmissionConfirmationProps {
  serviceTitle: string;
  stepTitle: string;
  nextSteps?: { title: string; content?: string; items?: string[] }[];
  contactDetails?: ContactDetails;
  onTryAgain?: () => void;
  submissionState?: SubmissionState;
}
```

- [ ] **Step 4: Verify TypeScript compiles cleanly**

```bash
npx nx run forms:typecheck
```

If `typecheck` target doesn't exist, use the build instead:

```bash
npx nx run forms:build
```

Expected: No TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add apps/forms/src/types/field-mapper.type.ts apps/forms/src/types/renderer.type.ts apps/forms/src/types/props.type.ts
git commit -m "feat(web): add contactDetails to ClientServiceContract, FormMeta, and SubmissionConfirmationProps"
```

---

### Task 3: Thread `contactDetails` through `buildForm` and `FormRenderer`

**Files:**
- Modify: `apps/forms/src/lib/form-builder/build-form.ts`
- Modify: `apps/forms/src/components/form-renderer.tsx`

Note: `mapContractToLocale` in `field-mapper.ts` already spreads `...contract`, so `contactDetails` passes from `ServiceContract` to `ClientServiceContract` automatically — no change needed there.

- [ ] **Step 1: Update `buildForm` to include `contactDetails` in `FormMeta`**

In `apps/forms/src/lib/form-builder/build-form.ts`, find the return statement (currently around line 48). Add `contactDetails: contract.contactDetails,` after `formDescription`:

```ts
return {
  formId: contract.formId,
  version: contract.version,
  formTitle: contract.title,
  formDescription: contract.description,
  contactDetails: contract.contactDetails,
  schema,
  steps,
  defaultValues: defaults,
  validationProperties: properties,
  stepConditionalTargets,
  repeatSettings,
  idempotencyKey,
};
```

- [ ] **Step 2: Update `FormRenderer` to pass `contactDetails` to `SubmissionConfirmation`**

In `apps/forms/src/components/form-renderer.tsx`, find the `SubmissionConfirmation` JSX block (currently around line 231). Add the `contactDetails` prop:

```tsx
{isSubmissionConfirmation && (
  <SubmissionConfirmation
    key={"submission-confirmation"}
    serviceTitle={formMeta.formTitle}
    stepTitle={currentStep.title}
    nextSteps={currentStep.nextSteps}
    contactDetails={formMeta.contactDetails}
    onTryAgain={() => navigateToStep("check-your-answers")}
    submissionState={submissionState}
  />
)}
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
npx nx run forms:typecheck
```

Or if `typecheck` is not a target:

```bash
npx nx run forms:build
```

Expected: No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/forms/src/lib/form-builder/build-form.ts apps/forms/src/components/form-renderer.tsx
git commit -m "feat(web): thread contactDetails through buildForm and FormRenderer"
```

---

### Task 4: Render contact details in `SubmissionConfirmation` and add CSS

**Files:**
- Modify: `apps/forms/src/components/submission-confirmation.tsx`
- Modify: `apps/forms/src/styles/govtechbb.module.css`

- [ ] **Step 1: Update `SubmissionConfirmation` to accept and render `contactDetails`**

In `apps/forms/src/components/submission-confirmation.tsx`, add `contactDetails` to the destructured props in the function signature:

```tsx
export default function SubmissionConfirmation({
  serviceTitle,
  stepTitle,
  nextSteps,
  contactDetails,
  onTryAgain,
  submissionState,
}: SubmissionConfirmationProps) {
```

Then add the contact panel after the `nextSteps` block (currently ending around line 137) and before the `feedback` block. The full `SubmissionConfirmation` return block for the success/no-payment branch should look like this (the other branches — payment success and payment pending — do not change, add the same block to all three success paths at the same relative position):

```tsx
{nextSteps && nextSteps.length > 0 && (
  <div className={designSystem.nextSteps}>
    {nextSteps.map((section, index) => (
      <div key={index}>
        <h2>{section.title}</h2>
        {section.content && <p>{section.content}</p>}
        {section.items && section.items.length > 0 && (
          <ul>
            {section.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        )}
      </div>
    ))}
  </div>
)}

{contactDetails && (
  <div className={designSystem.contactDetails}>
    <p>If you need help with your application, contact:</p>
    <h3>{contactDetails.title}</h3>
    <div className={designSystem.contactDetailsBody}>
      {contactDetails.address && (
        <>
          <p>{contactDetails.address.line1}</p>
          {contactDetails.address.line2 && (
            <p>{contactDetails.address.line2}</p>
          )}
          <p>{contactDetails.address.city}</p>
          {contactDetails.address.country && (
            <p>{contactDetails.address.country}</p>
          )}
        </>
      )}
      <p>
        <span className={designSystem.contactLabel}>Telephone:</span>{" "}
        {contactDetails.telephoneNumber}
      </p>
      <p>
        <span className={designSystem.contactLabel}>Email:</span>{" "}
        {contactDetails.email}
      </p>
    </div>
  </div>
)}

<div className={designSystem.feedback}>
```

The `nextSteps` block and `feedback` block already sit **outside** all three payment branches, as siblings inside the top-level success fragment. Add the `contactDetails` block **once** in that same location — between `nextSteps` and `feedback`. Do not add it inside any of the payment branches.

- [ ] **Step 2: Add CSS classes to `govtechbb.module.css`**

In `apps/forms/src/styles/govtechbb.module.css`, add the following after the `.formRoot .nextSteps` block (currently around line 782):

```css
.formRoot .contactDetails {
  margin-top: var(--spacing-m);
}

.formRoot .contactDetailsBody {
  font-size: 1.25rem;
  line-height: 1.5;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.formRoot .contactLabel {
  font-weight: bold;
}
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
npx nx run forms:typecheck
```

Or if `typecheck` is not a target:

```bash
npx nx run forms:build
```

Expected: No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/forms/src/components/submission-confirmation.tsx apps/forms/src/styles/govtechbb.module.css
git commit -m "feat(web): render MDA contact details panel on submission confirmation"
```

---

### Task 5: Update contract JSON files

**Files:**
- Modify: `apps/forms/contracts/master-contract.json`
- Modify: `apps/forms/contracts/example-service-contract.json`

- [ ] **Step 1: Update `master-contract.json` — move `contactDetails` to top level**

Open `apps/forms/contracts/master-contract.json`.

Remove the entire `contactDetails` object from inside the `submission-confirmation` step. The `submission-confirmation` step should become:

```json
{
  "stepId": "submission-confirmation",
  "title": "Thank you for your application!",
  "elements": [],
  "nextSteps": [
    {
      "title": "What happens next",
      "content": "You will receive a confirmation email with:",
      "items": [
        "Your application reference number",
        "the cost of the certificate(s)",
        "the expected completion date"
      ]
    }
  ]
}
```

Add `contactDetails` at the top level of the JSON object, after `"version"`:

```json
{
  "formId": "masterFormV1",
  "title": "Master Service Contract - Documentation & Testing",
  "description": "Comprehensive service contract demonstrating all available features: all behaviours, validations, HTML types, and built-in components.",
  "createdAt": "2026-04-02T00:00:00Z",
  "updatedAt": "2026-04-02T00:00:00Z",
  "version": "1.0.0",
  "contactDetails": {
    "title": "Registration Department",
    "telephoneNumber": "(246) 535-8300",
    "email": "registrationdept@barbados.gov.bb",
    "address": {
      "line1": "Supreme Court Complex",
      "line2": "Whitepark Road",
      "city": "St. Michael",
      "country": "Barbados"
    }
  },
  "steps": [
    ...
  ]
}
```

- [ ] **Step 2: Update `example-service-contract.json` — add `contactDetails`**

Add `contactDetails` at the top level of `apps/forms/contracts/example-service-contract.json`, after `"version"`:

```json
{
  "formId": "post-office-redirection-business",
  "title": "Redirect my business mail",
  "description": "Tell the Post Office you would like to change the address that your business mail gets delivered to.",
  "version": "1.0.0",
  "createdAt": "2026-04-02T00:00:00Z",
  "updatedAt": "2026-04-02T00:00:00Z",
  "contactDetails": {
    "title": "Barbados Post Office",
    "telephoneNumber": "(246) 535-0200",
    "email": "customerservice@post.gov.bb",
    "address": {
      "line1": "Cheapside",
      "city": "Bridgetown",
      "country": "Barbados"
    }
  },
  "steps": [
    ...
  ]
}
```

- [ ] **Step 3: Verify both contracts parse against the schema**

Run the form-types tests (the `serviceContractSchema` tests use a minimal contract, but the real contracts are parsed at runtime via `serviceContractSchema.parse()` in `form-fetcher.ts`). Start the dev server and load both the `example` and `master` forms to confirm no parse errors:

```bash
npx nx run forms:serve
```

Navigate to:
- `http://localhost:4200/?formId=example` — advance to the submission-confirmation step and verify the Barbados Post Office contact panel appears.
- `http://localhost:4200/?formId=master` — advance to the submission-confirmation step and verify the Registration Department contact panel appears.

- [ ] **Step 4: Commit**

```bash
git add apps/forms/contracts/master-contract.json apps/forms/contracts/example-service-contract.json
git commit -m "feat(contracts): move contactDetails to top level; add sample MDA contact to example contract"
```
