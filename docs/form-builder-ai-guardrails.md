# Form Builder AI — Automatic Component Selection Guardrails

**Status:** Implemented (embedded in system prompt)
**Location:** `apps/form_builder/app/server/ai-builder/prompts/system-prompt.ts`
**Related Ticket:** trello-form-builder-ai-guardrails.md

---

## Purpose

These guardrail rules define how the AI selects components **deterministically** when generating a form recipe from a PDF. The AI generates the complete recipe in a single pass — no conversational back-and-forth. Users edit the output via the visual form editor.

**Design intent:** PDF in → recipe out (single-shot). Guardrails ensure consistency. Form editor handles iteration.

---

## CATEGORY 1: Component Selection Rules

### Option Count Rules

| Rule | Trigger | Action | Example |
|------|---------|--------|---------|
| Radio for Binary Choices | Exactly 2 mutually exclusive options | Use `components/generic/radio` with 2 options | "Are you a Barbados citizen? Yes/No" → radio |
| Select for Multiple Options | 3+ options (dropdown) | Use select component with options array | "Employment status" with 5 options → select dropdown |
| Checkbox for Declarations | Single confirmation/agreement | Use `components/confirmation` with 1 option | "I agree to the terms" → single checkbox |
| Checkbox for Multiple Selections | "Select all that apply" or multiple independent choices | Use multiple `components/confirmation` elements | "Which documents do you have?" → individual checkboxes |

### Label Pattern Rules

| Rule | Trigger (label contains) | Action | Example |
|------|--------------------------|--------|---------|
| Textarea for Open Text | "additional details", "comments", "description", "notes", "reason", "feedback", "information" | Use `components/additional-details` | "Please provide additional details" → textarea |
| Email for Email Fields | "email", "e-mail", "electronic mail" | Use `components/email` | "Email Address" → email input |
| Tel for Phone Numbers | "telephone", "phone", "mobile", "cell", "fax", "contact number" | Use appropriate tel component | "Mobile Number" → `components/mobile-telephone` |
| Date for Date Fields | "date of birth", "dob", "birth date", or "date" + temporal context | Use `components/date-of-birth` (override fieldId/label) | "Date of Declaration" → date component |
| File for Document Upload | "upload", "document", "file", "attach", "supporting document" | Use `components/upload-document` | "Upload your ID" → file input |
| Checkbox for Confirmations | "confirm", "agree", "declare", "consent", "accept terms" | Use `components/confirmation` | "I confirm this is correct" → checkbox |
| Number for Numeric Fields | "age", "quantity", "amount", "how many", "number of", "price", "cost", "total", "sum", "count" | Use `components/generic/number` | "Age" → number input |
| URL for Website Fields | "website", "url", "web address" | Use `components/name` with URL pattern validation | "Company Website" → text with URL validation |

### Field ID / Semantic Rules

| Rule | Trigger | Action | Example |
|------|---------|--------|---------|
| Parish Dropdown | Field ID or label contains "parish" (geographic) | Use `components/parish` with standard parish options | "Parish" → select with 11 Barbados parishes |
| Country Field | Field ID or label contains "country" or "nationality" | Use `components/country` or `components/nationality` with country list | "Country of Birth" → country dropdown |

---

## CATEGORY 2: Validation Defaults

| Rule | Trigger | Action |
|------|---------|--------|
| Email Validation | Field uses `components/email` | Auto-apply `email` format validation |
| Required (Explicit) | Field says "required", "must provide", "mandatory", or has asterisk (*) | Add `required` validation |
| Required (Inferred) | Paper form — common required fields: name, first name, last name, email, phone, address, date of birth | Infer `required` validation |
| Required (Section Header) | Section marked "required fields", "mandatory", "please complete all fields" | Mark all fields in section as required |
| Required (Structural) | Red asterisk, bold label, field outlined in red on paper form | Infer `required` validation |
| Required (Business Necessity) | Fields needed to process the form (ID numbers, account details) | Infer `required` validation |
| Date of Birth Validation | Field is a date of birth | Add `pastOrToday` validation |
| Phone Format | Field uses tel component | Optionally apply phone format validation |

---

## CATEGORY 3: Block Selection & Composition

### Available Blocks

| Block Ref | Elements | Use When |
|-----------|----------|----------|
| `blocks/personal-information` | title, first-name, middle-name, last-name, date-of-birth, sex, nationality, national-id-number | Form collects personal/biographical details |
| `blocks/contact-information` | email, telephone, mobile-telephone, home-telephone | Form collects contact details |
| `blocks/physical-address` | address, country, parish, town, postcode | Form collects a physical address |
| `blocks/emergency-contact-details` | first-name, last-name, home-telephone, telephone, email, address, country, parish, town, postcode | Form collects emergency contact info |
| `blocks/proving-your-identity` | national-id-number, passport-number, national-insurance-number, tamis-number | Form collects identity documents |
| `blocks/applicant-declaration` | confirmation | Form has a declaration checkbox |
| `blocks/supporting-documents` | upload-document | Form requires document uploads |
| `blocks/additional-information` | additional-details | Form has a free-text "anything else" section |

### Hiding Elements in Blocks

```json
{
  "ref": "blocks/personal-information",
  "overrides": {
    "middle-name": { "isHidden": true },
    "nationality": { "isHidden": true }
  }
}
```

### Auto-Apply Rules

| Rule | Trigger | Action |
|------|---------|--------|
| Auto-apply Personal Information | Fields include: title, first name, last name, DOB, sex, nationality, national ID (3+ match) | Use `blocks/personal-information` (hide unwanted) |
| Auto-apply Contact Information | Fields include: email, telephone, mobile, home phone (3+ match) | Use `blocks/contact-information` (hide unwanted) |
| Auto-apply Physical Address | Fields include: address, country, parish, town, postcode (3+ match) | Use `blocks/physical-address` (hide unwanted) |
| Auto-apply Emergency Contact | Fields include: emergency contact name, phone, email, address | Use `blocks/emergency-contact-details` (hide unwanted) |
| Auto-apply Identity Proof | Fields include: national ID, passport, NIS, TAMIS (2+ match) | Use `blocks/proving-your-identity` (hide unwanted) |

**Threshold:** Only use a block when 3+ of its elements are needed. For 1-2 fields, use individual components.

---

## CATEGORY 4: Layout Decisions

| Rule | Trigger | Action |
|------|---------|--------|
| Short Width for Postcodes | Field is a postcode/zip code | Set `"ui": {"width": "short"}` |
| Short Width for Codes/IDs | Field contains: code, number, ID, reference | Set `"ui": {"width": "short"}` |
| Long Width for Textareas | Using `components/additional-details` | Set `"ui": {"width": "long"}` |
| Multiple Files | Label contains: "upload multiple", "attach files", "upload several", "supporting documents" (plural) | Set `"multiple": true` on file component |

---

## CATEGORY 5: Standard Option Lists

### Barbados Parish Options (always use this exact list)

```json
[
  {"label": "Christ Church", "value": "christ-church"},
  {"label": "St. Andrew", "value": "st-andrew"},
  {"label": "St. George", "value": "st-george"},
  {"label": "St. James", "value": "st-james"},
  {"label": "St. John", "value": "st-john"},
  {"label": "St. Joseph", "value": "st-joseph"},
  {"label": "St. Lucy", "value": "st-lucy"},
  {"label": "St. Michael", "value": "st-michael"},
  {"label": "St. Peter", "value": "st-peter"},
  {"label": "St. Philip", "value": "st-philip"},
  {"label": "St. Thomas", "value": "st-thomas"}
]
```

### Standard Country Options

When using `components/country` or `components/nationality`, auto-populate with ISO 3166-1 standard country list. Include Caribbean nations at the top, followed by alphabetical world list.

---

## Implementation Notes

- All guardrails are embedded in the system prompt at `apps/form_builder/app/server/ai-builder/prompts/system-prompt.ts`
- The AI generates the complete recipe in ONE response — no questions asked
- If something is ambiguous, the AI makes the best decision based on guardrails and moves on
- Users refine the output via the visual form editor (not by chatting with the AI)
- Guardrails are versioned and updated over time as patterns emerge from real usage
