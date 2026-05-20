# MDA Contact Details — Design Spec

**Date:** 2026-05-19
**Branch:** frontend/ui-fixes
**Author:** Tarika Birch

## Overview

Add support for Ministries, Departments, and Agencies (MDA) contact details within the service contract system. Contact details are defined at the top level of the service contract (alongside `title` and `description`) and displayed on the submission-confirmation screen.

## Requirements

- Service contract format is updated to include standard MDA contact details fields.
- Example service contract is updated with realistic sample MDA contact details.
- Parser (Zod schema) successfully validates and extracts MDA contact details.
- New UI elements for displaying MDA details adhere to the Alpha Gov Design System.
- Forms without `contactDetails` continue to render correctly (`contactDetails` is optional).

## Schema

A new `contactDetailsSchema` is added to `packages/form-types/src/service-contract.type.ts`:

```ts
export const contactDetailsSchema = z.object({
  title: z.string(),                  // required — MDA name, e.g. "Registration Department"
  telephoneNumber: z.string(),        // required
  email: z.string().email(),          // required
  address: z.object({
    line1: z.string(),
    line2: z.string().optional(),
    city: z.string(),
    country: z.string().optional(),
  }).optional(),                      // optional — not all MDAs need a physical address displayed
});
export type ContactDetails = z.infer<typeof contactDetailsSchema>;
```

Both `serviceContractSchema` and `serviceContractRecipeSchema` gain:

```ts
contactDetails: contactDetailsSchema.optional(),
```

## Type Changes

| File | Change |
|------|--------|
| `packages/form-types/src/service-contract.type.ts` | Add `contactDetailsSchema` and `ContactDetails` type |
| `apps/web/src/types/field-mapper.type.ts` — `ClientServiceContract` | Add `contactDetails?: ContactDetails` |
| `apps/web/src/types/renderer.type.ts` — `FormMeta` | Add `contactDetails?: ContactDetails` |
| `apps/web/src/types/props.type.ts` — `SubmissionConfirmationProps` | Add `contactDetails?: ContactDetails` |

## Data Flow

```
serviceContractSchema (Zod parse)
  → ServiceContract.contactDetails
    → mapContractToLocale (spread — no code change needed)
      → ClientServiceContract.contactDetails
        → buildForm (explicit assignment)
          → FormMeta.contactDetails
            → FormRenderer (prop pass-through)
              → SubmissionConfirmation.contactDetails
```

`mapContractToLocale` spreads `...contract`, so `contactDetails` passes through automatically.

`buildForm` (`apps/web/src/lib/form-builder/build-form.ts`) adds:
```ts
contactDetails: contract.contactDetails,
```

`FormRenderer` (`apps/web/src/components/form-renderer.tsx`) passes it to `SubmissionConfirmation`:
```tsx
<SubmissionConfirmation
  ...
  contactDetails={formMeta.contactDetails}
/>
```

## UI Component

`SubmissionConfirmation` renders a contact panel below `nextSteps` and above the feedback block, only when `contactDetails` is present. Pattern follows Alpha Gov Design System:

```tsx
{contactDetails && (
  <div className={designSystem.contactDetails}>
    <p>If you need help with your application, contact:</p>
    <h3>{contactDetails.title}</h3>
    <div className={designSystem.contactDetailsBody}>
      {contactDetails.address && (
        <>
          <p>{contactDetails.address.line1}</p>
          {contactDetails.address.line2 && <p>{contactDetails.address.line2}</p>}
          <p>{contactDetails.address.city}</p>
          {contactDetails.address.country && <p>{contactDetails.address.country}</p>}
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
```

## CSS

Three classes added to `apps/web/src/styles/govtechbb.module.css`:

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

## Contract File Updates

### master-contract.json

Remove `contactDetails` from the `submission-confirmation` step body and add it at the top level of the JSON object. Existing field values are preserved exactly:

```json
{
  "formId": "masterFormV1",
  "title": "Master Service Contract - Documentation & Testing",
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
  ...
}
```

### example-service-contract.json

Add a realistic MDA contact block at the top level, representing the Barbados Post Office:

```json
"contactDetails": {
  "title": "Barbados Post Office",
  "telephoneNumber": "(246) 535-0200",
  "email": "customerservice@post.gov.bb",
  "address": {
    "line1": "Cheapside",
    "city": "Bridgetown",
    "country": "Barbados"
  }
}
```

## Out of Scope

- Per-step contact detail overrides.
- Displaying contact details on any page other than `submission-confirmation`.
- Adding contact details to the `basic` design system CSS (only `govtechbb` is in scope).
