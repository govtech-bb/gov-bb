# Form Creation Guide — Physical Form to SQL Recipe

## Purpose

This file is the complete reference for an AI assistant to convert physical/paper government forms (PDFs, scanned images, or text descriptions) into valid service contract recipe SQL that can be inserted into the modular forms platform database.

**Workflow:** Given a PDF or description of a form → produce a valid `INSERT INTO form_definitions` SQL statement containing the recipe JSON.

---

## Database Target

- **Table:** `form_definitions`
- **Columns:**
  - `id` — uuid (primary key)
  - `form_id` — varchar (kebab-case slug, unique identifier for the form)
  - `version` — varchar (semver string, e.g. "1.0.0")
  - `schema` — jsonb (the full recipe JSON)
  - `published_at` — timestamp (nullable, set to NOW() to publish immediately)
  - `created_at` — timestamp
  - `updated_at` — timestamp

---

## Complete Recipe JSON Schema

```json
{
  "formId": "kebab-case-form-slug",
  "title": "Human Readable Form Title",
  "description": "Optional description of what this form is for",
  "version": "1.0.0",
  "createdAt": "2026-01-01T00:00:00Z",
  "updatedAt": "2026-01-01T00:00:00Z",
  "steps": [
    { "...step objects..." }
  ],
  "processors": []
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| formId | string | YES | kebab-case, must match the `form_id` column value |
| title | string | YES | Human-readable title shown to users |
| description | string | no | Optional description |
| version | string | YES | Semver (always "1.0.0" for new forms) |
| createdAt | string | YES | ISO 8601 datetime |
| updatedAt | string | YES | ISO 8601 datetime |
| steps | array | YES | Array of step objects (minimum 1) |
| processors | array | YES | Always empty array `[]` for now |

---

## Step Schema

```json
{
  "stepId": "kebab-case-step-id",
  "title": "Step Title",
  "description": "Optional step description",
  "behaviours": [],
  "elements": [
    { "...element objects..." }
  ]
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| stepId | string | YES | kebab-case, unique within the form |
| title | string | YES | Shown as the step heading |
| description | string | no | Optional helper text below heading |
| behaviours | array | no | Step-level behaviours (repeatable, stepConditionalOn) |
| elements | array | YES | Array of element objects (minimum 1) |

---

## Element Schema

Each element references a registry component and applies overrides:

```json
{
  "ref": "components/component-key",
  "overrides": {
    "fieldId": "unique-field-id-within-form",
    "label": "Display label",
    "hint": "Helper text shown below the label",
    "placeholder": "Placeholder text inside the input",
    "validations": {
      "required": { "value": true, "error": "This field is required" }
    },
    "options": [
      { "label": "Display Text", "value": "kebab-case-value" }
    ],
    "ui": { "width": "short" },
    "isHidden": false,
    "isDisabled": false,
    "behaviours": []
  }
}
```

| Override Field | Type | Notes |
|---------------|------|-------|
| fieldId | string | **CRITICAL** — must be unique across the entire form |
| label | string | Display label for the field |
| hint | string | Helper text shown below the label |
| placeholder | string | Placeholder inside the input |
| validations | object | Validation rules (see Validation Schema section) |
| options | array | For select/radio components — array of {label, value} |
| ui | object | Layout hints: `{"width": "short\|medium\|long"}` |
| isHidden | boolean | Hide the field (default false). **NEVER combine with `required` validation — see warning below** |
| isDisabled | boolean | Disable the field (default false) |
| behaviours | array | Conditional logic (fieldConditionalOn) |
| defaultValue | string | Pre-filled value |
| multiple | boolean | For file/select multi-select |

> **WARNING: Hidden fields MUST NOT have `required` validation.** If a field has `"isHidden": true` and also `"validations": {"required": {"value": true, ...}}`, the form becomes impossible to submit — the user cannot see or fill in the field, but validation blocks submission. If a hidden field needs a value, use `defaultValue` instead.

---

## Complete Component Reference

### Text Input Components

| Ref Key | HTML Type | When to Use |
|---------|-----------|-------------|
| `components/first-name` | text | Person's first/given name |
| `components/last-name` | text | Person's last/family name |
| `components/middle-name` | text | Middle name(s) |
| `components/name` | text | **Generic text field** — use for any free-text input (premises name, school name, relationship description, business name, etc.) |
| `components/address` | text | Single address line (use twice with different fieldIds for line 1 + line 2) |
| `components/town` | text | Town/city name |
| `components/postcode` | text | Postcode/zip (default width: short) |
| `components/national-id-number` | text | National ID number |
| `components/national-insurance-number` | text | NIS number |
| `components/passport-number` | text | Passport number |
| `components/tamis-number` | text | TAMIS number |
| `components/account-name` | text | Bank account holder name |
| `components/account-number` | text | Bank account number |
| `components/relationship` | text | Relationship description |

### Contact Components

| Ref Key | HTML Type | When to Use |
|---------|-----------|-------------|
| `components/email` | email | Email address |
| `components/telephone` | tel | Generic phone number |
| `components/contact-number` | tel | Contact number |
| `components/mobile-telephone` | tel | Mobile phone specifically |
| `components/home-telephone` | tel | Home phone specifically |
| `components/work-telephone` | tel | Work phone specifically |
| `components/fax-number` | tel | Fax number |

### Select/Dropdown Components

| Ref Key | HTML Type | Options Status | When to Use |
|---------|-----------|----------------|-------------|
| `components/title` | select | HAS options (Mr/Ms/Mrs) | Person's title/salutation |
| `components/parish` | select | **EMPTY — MUST override** | Barbados parish dropdown |
| `components/nationality` | select | **EMPTY — MUST override** | Nationality dropdown |
| `components/country` | select | **EMPTY — MUST override** | Country dropdown |
| `components/account-type` | select | HAS options | Bank account type |
| `components/bank` | select | HAS options | Bank name |

### Radio/Choice Components

| Ref Key | HTML Type | Options Status | When to Use |
|---------|-----------|----------------|-------------|
| `components/sex` | radio | HAS options (Male/Female) | Biological sex |
| `components/generic/radio` | radio | **EMPTY — MUST override** | Any yes/no or multiple choice question (custom DB component) |

### Date Components

| Ref Key | HTML Type | When to Use |
|---------|-----------|-------------|
| `components/date-of-birth` | date | Any date field — override fieldId + label for non-DOB dates |

### Other Components

| Ref Key | HTML Type | When to Use |
|---------|-----------|-------------|
| `components/confirmation` | checkbox | Declaration/confirmation checkbox |
| `components/upload-document` | file | File upload |
| `components/additional-details` | textarea | Any multi-line text input |
| `components/generic/number` | number | Any numeric input (custom DB component) |

---

## CRITICAL RULES (Violations Cause 500 Errors)

### Rule 1: EVERY element MUST have a unique `fieldId` override

Never rely on the component's default fieldId. Every single element in the form must have an explicit `fieldId` in its overrides, and that fieldId must be unique across the entire form.

```json
// WRONG — two address fields with no fieldId override = 500 error
{"ref": "components/address", "overrides": {"label": "Address Line 1"}},
{"ref": "components/address", "overrides": {"label": "Address Line 2"}}

// CORRECT
{"ref": "components/address", "overrides": {"fieldId": "address-line-1", "label": "Address Line 1"}},
{"ref": "components/address", "overrides": {"fieldId": "address-line-2", "label": "Address Line 2"}}
```

### Rule 2: Exact component ref keys — no guessing

These are the CORRECT ref keys. Common mistakes in parentheses:

- `components/national-id-number` ✅ (NOT ~~`components/national-id`~~ ❌)
- `components/postcode` ✅ (NOT ~~`components/post-code`~~ ❌)
- `components/upload-document` ✅ (NOT ~~`components/file-upload`~~ ❌)
- `components/additional-details` ✅ (NOT ~~`components/textarea`~~ ❌)
- `components/date-of-birth` ✅ (NOT ~~`components/dob`~~ ❌)
- `components/generic/radio` ✅ (NOT ~~`components/radio`~~ ❌)
- `components/generic/number` ✅ (NOT ~~`components/number`~~ ❌)

### Rule 3: Select components with EMPTY options MUST have options provided

These components have `options: []` in the registry. If you don't override with options, the dropdown renders empty:

- `components/parish` — MUST provide Barbados parish list
- `components/nationality` — MUST provide nationality/country list
- `components/country` — MUST provide country list
- `components/generic/radio` — MUST provide options for every use

### Rule 4: `components/relationship` is a SELECT, not free text

If you need a free-text relationship field (e.g. "Describe your relationship to the applicant"), use `components/name` with a label override. Using `components/relationship` without providing options causes a 500 error.

### Rule 5: Barbados Parish Options — Always use this exact list

```json
"options": [
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

### Rule 6: Use `components/date-of-birth` for ALL date fields

Override `fieldId` and `label` to repurpose it for any date:

```json
{"ref": "components/date-of-birth", "overrides": {"fieldId": "declaration-date", "label": "Date of Declaration"}}
{"ref": "components/date-of-birth", "overrides": {"fieldId": "start-date", "label": "Start Date"}}
{"ref": "components/date-of-birth", "overrides": {"fieldId": "expiry-date", "label": "Expiry Date"}}
```

### Rule 7: `processors` must always be an empty array

```json
"processors": []
```

---

## Validation Schema

Validations are an object where each key is a validation type:

```json
"validations": {
  "required": { "value": true, "error": "This field is required" },
  "minLength": { "value": 2, "error": "Must be at least 2 characters" },
  "maxLength": { "value": 100, "error": "Must be 100 characters or fewer" },
  "email": { "value": true, "error": "Enter a valid email address" },
  "pastOrToday": { "value": true, "error": "Date must be today or in the past" },
  "futureOrToday": { "value": true, "error": "Date must be today or in the future" },
  "pattern": { "value": "^[A-Z0-9]+$", "error": "Only uppercase letters and numbers allowed" }
}
```

### Available Validation Types

| Validation | Value Type | Use For |
|-----------|-----------|---------|
| required | boolean (true) | Any mandatory field |
| minLength | number | Minimum character count |
| maxLength | number | Maximum character count |
| email | boolean (true) | Email format validation |
| pastOrToday | boolean (true) | Date must not be in the future |
| futureOrToday | boolean (true) | Date must not be in the past |
| pattern | string (regex) | Custom regex validation |

### Standard Validation Patterns

```json
// Required text field
"validations": {"required": {"value": true, "error": "First name is required"}}

// Required email
"validations": {"required": {"value": true, "error": "Email is required"}, "email": {"value": true, "error": "Enter a valid email address"}}

// Date of birth (must be in the past)
"validations": {"required": {"value": true, "error": "Date of birth is required"}, "pastOrToday": {"value": true, "error": "Date of birth must be today or earlier"}}

// National ID (min length)
"validations": {"required": {"value": true, "error": "National ID is required"}, "minLength": {"value": 6, "error": "National ID must be at least 6 characters"}}

// Optional field (no validations needed)
"validations": {}
```

---

## Conditional Fields (fieldConditionalOn)

Show/hide a field based on another field's value. Add `behaviours` to the element's overrides:

```json
{
  "ref": "components/passport-number",
  "overrides": {
    "fieldId": "applicant-passport-number",
    "label": "Passport Number",
    "behaviours": [
      {
        "type": "fieldConditionalOn",
        "targetFieldId": "use-passport-instead",
        "operator": "equal",
        "value": "yes"
      }
    ],
    "validations": {
      "required": {"value": true, "error": "Passport number is required"}
    }
  }
}
```

### Behaviour Schema

```json
{
  "type": "fieldConditionalOn",
  "targetFieldId": "the-fieldId-to-watch",
  "operator": "equal",
  "value": "the-value-that-shows-this-field"
}
```

### Available Operators

| Operator | Behaviour |
|----------|-----------|
| `"equal"` | Show field when target equals value |
| `"notEqual"` | Show field when target does NOT equal value |
| `"in"` | Show field when target value is in an array of values |
| `"exists"` | Show field when target has any value (not empty) |

### Important Notes

- `targetFieldId` must match the `fieldId` of the field being watched (not the ref key)
- The watched field must exist in the same step or a previous step
- `operator` is REQUIRED — omitting it causes a parse error
- Use `targetFieldId` (not `field` or `fieldId`)

---

## Conditional Steps (stepConditionalOn)

Show/hide an entire step based on a field value in a previous step. Add `behaviours` to the step object:

```json
{
  "stepId": "goods-details",
  "title": "Tell us about the goods",
  "behaviours": [
    {
      "type": "stepConditionalOn",
      "targetFieldId": "goods-or-services",
      "targetStepId": "type-selection",
      "operator": "equal",
      "value": "goods"
    }
  ],
  "elements": [...]
}
```

### Step Conditional Schema

```json
{
  "type": "stepConditionalOn",
  "targetFieldId": "the-fieldId-to-watch",
  "targetStepId": "the-stepId-where-that-field-lives",
  "operator": "equal",
  "value": "the-value-that-shows-this-step"
}
```

- `targetFieldId` — the fieldId of the field whose value determines visibility
- `targetStepId` — the stepId of the step containing that field
- `operator` — same operators as fieldConditionalOn (equal, notEqual, in, exists)
- `value` — the value that makes this step visible

The step is completely hidden from navigation when the condition is not met.

---

## Repeatable Steps

Allow users to add multiple entries (e.g. "Add another qualification"). Add `behaviours` to the step:

```json
{
  "stepId": "qualifications",
  "title": "Qualifications",
  "behaviours": [
    { "type": "repeatable", "min": 1, "max": 5 }
  ],
  "elements": [...]
}
```

- `min` — minimum number of entries required (usually 1)
- `max` — maximum number of entries allowed
- The renderer automatically adds "Add another? Yes/No" at the bottom of the step
- Selecting "Yes" + Continue duplicates the step

---

## Passport Number Alternative Pattern

When a form has "Use passport number instead" or the National ID is optional with passport as fallback:

```json
{
  "ref": "components/national-id-number",
  "overrides": {
    "fieldId": "applicant-national-id",
    "label": "National ID Number",
    "validations": {
      "minLength": {"value": 6, "error": "National ID must be at least 6 characters"}
    }
  }
},
{
  "ref": "components/generic/radio",
  "overrides": {
    "fieldId": "use-passport-instead",
    "label": "Do you not have a National ID number?",
    "hint": "If you do not have a National ID, you can use your passport number instead.",
    "options": [
      {"label": "Yes, use passport instead", "value": "yes"},
      {"label": "No, I provided my National ID above", "value": "no"}
    ]
  }
},
{
  "ref": "components/passport-number",
  "overrides": {
    "fieldId": "applicant-passport-number",
    "label": "Passport Number",
    "behaviours": [
      {
        "type": "fieldConditionalOn",
        "targetFieldId": "use-passport-instead",
        "operator": "equal",
        "value": "yes"
      }
    ],
    "validations": {
      "required": {"value": true, "error": "Passport number is required"},
      "minLength": {"value": 6, "error": "Passport number must be at least 6 characters"}
    }
  }
}
```

---

## Common Form Patterns

### Pattern: Applicant Details Step

Most government forms start with personal information:

```json
{
  "stepId": "applicant-details",
  "title": "Your details",
  "elements": [
    {"ref": "components/title", "overrides": {"fieldId": "applicant-title", "label": "Title", "validations": {"required": {"value": true, "error": "Title is required"}}}},
    {"ref": "components/first-name", "overrides": {"fieldId": "applicant-first-name", "label": "First Name", "validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "Must be at least 2 characters"}}}},
    {"ref": "components/middle-name", "overrides": {"fieldId": "applicant-middle-name", "label": "Middle Name"}},
    {"ref": "components/last-name", "overrides": {"fieldId": "applicant-last-name", "label": "Last Name", "validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Must be at least 2 characters"}}}},
    {"ref": "components/date-of-birth", "overrides": {"fieldId": "applicant-date-of-birth", "label": "Date of Birth", "validations": {"required": {"value": true, "error": "Date of birth is required"}, "pastOrToday": {"value": true, "error": "Date of birth must be today or earlier"}}}},
    {"ref": "components/sex", "overrides": {"fieldId": "applicant-sex", "label": "Sex", "validations": {"required": {"value": true, "error": "Sex is required"}}}},
    {"ref": "components/national-id-number", "overrides": {"fieldId": "applicant-national-id", "label": "National ID Number", "validations": {"minLength": {"value": 6, "error": "National ID must be at least 6 characters"}}}},
    {"ref": "components/generic/radio", "overrides": {"fieldId": "use-passport-instead", "label": "Do you not have a National ID number?", "hint": "If you do not have a National ID, you can use your passport number instead.", "options": [{"label": "Yes, use passport instead", "value": "yes"}, {"label": "No, I provided my National ID above", "value": "no"}]}},
    {"ref": "components/passport-number", "overrides": {"fieldId": "applicant-passport-number", "label": "Passport Number", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "use-passport-instead", "operator": "equal", "value": "yes"}], "validations": {"required": {"value": true, "error": "Passport number is required"}, "minLength": {"value": 6, "error": "Passport number must be at least 6 characters"}}}},
    {"ref": "components/email", "overrides": {"fieldId": "applicant-email", "label": "Email Address", "validations": {"required": {"value": true, "error": "Email is required"}, "email": {"value": true, "error": "Enter a valid email address"}}}},
    {"ref": "components/telephone", "overrides": {"fieldId": "applicant-telephone", "label": "Telephone Number", "validations": {"required": {"value": true, "error": "Telephone number is required"}}}}
  ]
}
```

### Pattern: Contact/Address Details Step

```json
{
  "stepId": "contact-details",
  "title": "Contact details",
  "elements": [
    {"ref": "components/address", "overrides": {"fieldId": "address-line-1", "label": "Address Line 1", "validations": {"required": {"value": true, "error": "Address is required"}}}},
    {"ref": "components/address", "overrides": {"fieldId": "address-line-2", "label": "Address Line 2"}},
    {"ref": "components/parish", "overrides": {"fieldId": "applicant-parish", "label": "Parish", "validations": {"required": {"value": true, "error": "Parish is required"}}, "options": [{"label": "Christ Church", "value": "christ-church"}, {"label": "St. Andrew", "value": "st-andrew"}, {"label": "St. George", "value": "st-george"}, {"label": "St. James", "value": "st-james"}, {"label": "St. John", "value": "st-john"}, {"label": "St. Joseph", "value": "st-joseph"}, {"label": "St. Lucy", "value": "st-lucy"}, {"label": "St. Michael", "value": "st-michael"}, {"label": "St. Peter", "value": "st-peter"}, {"label": "St. Philip", "value": "st-philip"}, {"label": "St. Thomas", "value": "st-thomas"}]}},
    {"ref": "components/postcode", "overrides": {"fieldId": "applicant-postcode", "label": "Postcode", "ui": {"width": "short"}}},
    {"ref": "components/email", "overrides": {"fieldId": "contact-email", "label": "Email Address", "validations": {"required": {"value": true, "error": "Email is required"}, "email": {"value": true, "error": "Enter a valid email address"}}}},
    {"ref": "components/telephone", "overrides": {"fieldId": "contact-telephone", "label": "Telephone Number", "validations": {"required": {"value": true, "error": "Telephone number is required"}}}}
  ]
}
```

### Pattern: Emergency Contact Step

```json
{
  "stepId": "emergency-contact",
  "title": "Emergency contact",
  "elements": [
    {"ref": "components/first-name", "overrides": {"fieldId": "emergency-first-name", "label": "First Name", "validations": {"required": {"value": true, "error": "First name is required"}}}},
    {"ref": "components/last-name", "overrides": {"fieldId": "emergency-last-name", "label": "Last Name", "validations": {"required": {"value": true, "error": "Last name is required"}}}},
    {"ref": "components/name", "overrides": {"fieldId": "emergency-relationship", "label": "Relationship to you", "validations": {"required": {"value": true, "error": "Relationship is required"}}}},
    {"ref": "components/address", "overrides": {"fieldId": "emergency-address-line-1", "label": "Address Line 1", "validations": {"required": {"value": true, "error": "Address is required"}}}},
    {"ref": "components/address", "overrides": {"fieldId": "emergency-address-line-2", "label": "Address Line 2"}},
    {"ref": "components/parish", "overrides": {"fieldId": "emergency-parish", "label": "Parish", "options": [{"label": "Christ Church", "value": "christ-church"}, {"label": "St. Andrew", "value": "st-andrew"}, {"label": "St. George", "value": "st-george"}, {"label": "St. James", "value": "st-james"}, {"label": "St. John", "value": "st-john"}, {"label": "St. Joseph", "value": "st-joseph"}, {"label": "St. Lucy", "value": "st-lucy"}, {"label": "St. Michael", "value": "st-michael"}, {"label": "St. Peter", "value": "st-peter"}, {"label": "St. Philip", "value": "st-philip"}, {"label": "St. Thomas", "value": "st-thomas"}]}},
    {"ref": "components/email", "overrides": {"fieldId": "emergency-email", "label": "Email Address", "validations": {"email": {"value": true, "error": "Enter a valid email address"}}}},
    {"ref": "components/telephone", "overrides": {"fieldId": "emergency-telephone", "label": "Telephone Number", "validations": {"required": {"value": true, "error": "Telephone number is required"}}}}
  ]
}
```

### Pattern: Declaration Step

```json
{
  "stepId": "declaration",
  "title": "Declaration",
  "elements": [
    {"ref": "components/confirmation", "overrides": {"fieldId": "declaration-confirmed", "label": "Declaration", "options": [{"label": "I confirm that my information is correct and I am happy for it to be verified. I understand that false details may lead to my application being rejected, and that the Government of Barbados will keep my information confidential.", "value": "confirmed"}], "validations": {"required": {"value": true, "error": "You must confirm the declaration to continue"}}}}
  ]
}
```

**Important:** The `label` field becomes the heading above the checkbox. The `options[0].label` is the text shown NEXT TO the checkbox. Put the full declaration statement in `options[0].label`, not in `label`. The renderer will auto-display the applicant name and date above the checkbox.

### Pattern: Submission Confirmation Step (REQUIRED)

Every form MUST include this as the **last step** in the `steps` array. The frontend navigates here after submission and renders a dedicated confirmation component. Without it, the user sees no feedback after submitting.

```json
{
  "stepId": "submission-confirmation",
  "title": "Application submitted",
  "elements": [],
  "nextSteps": [
    {
      "title": "What happens next",
      "content": "We have received your submission. You will receive a confirmation email at the address you provided."
    }
  ]
}
```

**Rules:**
- `stepId` MUST be exactly `"submission-confirmation"` — the renderer checks this literal string
- `elements` MUST be an empty array `[]` — the renderer uses a dedicated component, not field rendering
- `nextSteps` is optional but recommended — array of `{title, content?, items?}` shown after the success message
- This step goes AFTER the declaration step (it is always the last step)
- For payment forms, the renderer automatically shows payment status — no extra config needed here

### Pattern: Referee Step

```json
{
  "stepId": "referee-details",
  "title": "Referee details",
  "elements": [
    {"ref": "components/first-name", "overrides": {"fieldId": "referee-first-name", "label": "Referee First Name", "validations": {"required": {"value": true, "error": "First name is required"}}}},
    {"ref": "components/last-name", "overrides": {"fieldId": "referee-last-name", "label": "Referee Last Name", "validations": {"required": {"value": true, "error": "Last name is required"}}}},
    {"ref": "components/name", "overrides": {"fieldId": "referee-relationship", "label": "Relationship to you", "validations": {"required": {"value": true, "error": "Relationship is required"}}}},
    {"ref": "components/email", "overrides": {"fieldId": "referee-email", "label": "Referee Email", "validations": {"required": {"value": true, "error": "Email is required"}, "email": {"value": true, "error": "Enter a valid email address"}}}},
    {"ref": "components/telephone", "overrides": {"fieldId": "referee-telephone", "label": "Referee Telephone", "validations": {"required": {"value": true, "error": "Telephone number is required"}}}}
  ]
}
```

### Pattern: Document Upload Step

```json
{
  "stepId": "supporting-documents",
  "title": "Supporting documents",
  "elements": [
    {"ref": "components/upload-document", "overrides": {"fieldId": "id-document-upload", "label": "Upload a copy of your National ID or Passport", "hint": "Accepted formats: PDF, JPG, PNG. Maximum file size: 5MB.", "validations": {"required": {"value": true, "error": "Please upload your ID document"}}}},
    {"ref": "components/upload-document", "overrides": {"fieldId": "proof-of-address-upload", "label": "Upload proof of address", "hint": "A utility bill or bank statement dated within the last 3 months."}}
  ]
}
```

---

## SQL INSERT Template

```sql
INSERT INTO form_definitions (id, form_id, version, schema, published_at, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'your-form-slug-here',
  '1.0.0',
  '{
    "formId": "your-form-slug-here",
    "title": "Your Form Title",
    "description": "Description of the form",
    "version": "1.0.0",
    "createdAt": "2026-01-01T00:00:00Z",
    "updatedAt": "2026-01-01T00:00:00Z",
    "steps": [
      ...steps here...
    ],
    "processors": []
  }',
  NOW(),
  NOW(),
  NOW()
);
```

### Important SQL Notes

- The `schema` column is JSONB — the JSON string must be valid JSON
- Use `gen_random_uuid()` for the `id` column (PostgreSQL built-in)
- `form_id` must match the `formId` inside the JSON schema
- Set `published_at` to `NOW()` to publish immediately, or `NULL` to save as draft
- Escape single quotes inside JSON by doubling them (`''`) in PostgreSQL string literals
- Alternatively, use dollar-quoting to avoid escaping: `$${ ... }$$` instead of `'{ ... }'`

### Dollar-Quoting Example (Recommended)

```sql
INSERT INTO form_definitions (id, form_id, version, schema, published_at, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'your-form-slug-here',
  '1.0.0',
  $recipe${
    "formId": "your-form-slug-here",
    "title": "Your Form Title",
    "description": "Description of the form",
    "version": "1.0.0",
    "createdAt": "2026-01-01T00:00:00Z",
    "updatedAt": "2026-01-01T00:00:00Z",
    "steps": [],
    "processors": []
  }$recipe$,
  NOW(),
  NOW(),
  NOW()
);
```

---

## Field Mapping Guide — Physical Form to Component

When reading a physical form (PDF/image/description), map each field to a component:

| Physical Form Element | Component to Use | Notes |
|----------------------|------------------|-------|
| Text box (short, single line) | `components/name` | Override label to match the field |
| Text box labelled "First Name" | `components/first-name` | Use specific component when available |
| Text box labelled "Last Name" / "Surname" | `components/last-name` | |
| Text box labelled "Middle Name" | `components/middle-name` | |
| Email field | `components/email` | |
| Phone/telephone field | `components/telephone` | |
| Address lines | `components/address` (×2) | Use different fieldIds for line 1 + 2 |
| Postcode/ZIP | `components/postcode` | |
| Parish dropdown | `components/parish` | MUST provide options |
| Country dropdown | `components/country` | MUST provide options |
| Nationality dropdown | `components/nationality` | MUST provide options |
| Date field (any) | `components/date-of-birth` | Override fieldId + label |
| National ID / ID Number | `components/national-id-number` | |
| NIS Number | `components/national-insurance-number` | |
| Passport Number | `components/passport-number` | |
| Radio buttons (2-5 options) | `components/generic/radio` | MUST provide options |
| Yes/No question | `components/generic/radio` | Options: yes/no |
| Dropdown (few options) | `components/generic/radio` | Radio is preferred for ≤5 options |
| Checkbox (single, declaration) | `components/confirmation` | |
| Large text area / comments | `components/additional-details` | |
| File upload / attach document | `components/upload-document` | |
| Number input (age, quantity) | `components/generic/number` | |
| Male/Female selection | `components/sex` | Has built-in options |
| Mr/Mrs/Ms selection | `components/title` | Has built-in options |

---

## Naming Conventions

### formId (also used as `form_id` column)
- kebab-case
- Descriptive verb-noun pattern
- Examples: `apply-for-conductor-licence`, `request-fire-inspection`, `register-birth`

### stepId
- kebab-case
- Short, descriptive
- Examples: `applicant-details`, `contact-details`, `declaration`, `supporting-documents`

### fieldId
- kebab-case
- Prefixed by context when the same component is reused across steps
- Pattern: `{context}-{field-name}`
- Examples:
  - `applicant-first-name`, `emergency-first-name`, `referee-first-name`
  - `applicant-email`, `contact-email`, `emergency-email`
  - `address-line-1`, `emergency-address-line-1`
  - `applicant-parish`, `emergency-parish`

### Option values
- kebab-case
- Examples: `christ-church`, `yes`, `no`, `male`, `female`

---

## Complete Worked Example

Converting a fictional "Apply for Market Stall Licence" form:

**Physical form fields:**
- Applicant name, DOB, National ID
- Business name
- Type of goods (food / crafts / clothing)
- Preferred market location (Cheapside / Fairchild Street / Eagle Hall)
- Declaration checkbox

**Resulting SQL:**

```sql
INSERT INTO form_definitions (id, form_id, version, schema, published_at, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'apply-for-market-stall-licence',
  '1.0.0',
  $recipe${
    "formId": "apply-for-market-stall-licence",
    "title": "Apply for a Market Stall Licence",
    "description": "Application for a licence to operate a stall at a public market in Barbados.",
    "version": "1.0.0",
    "createdAt": "2026-01-01T00:00:00Z",
    "updatedAt": "2026-01-01T00:00:00Z",
    "steps": [
      {
        "stepId": "applicant-details",
        "title": "Your details",
        "elements": [
          {"ref": "components/first-name", "overrides": {"fieldId": "applicant-first-name", "label": "First Name", "validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "Must be at least 2 characters"}}}},
          {"ref": "components/last-name", "overrides": {"fieldId": "applicant-last-name", "label": "Last Name", "validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Must be at least 2 characters"}}}},
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "applicant-date-of-birth", "label": "Date of Birth", "validations": {"required": {"value": true, "error": "Date of birth is required"}, "pastOrToday": {"value": true, "error": "Date of birth must be today or earlier"}}}},
          {"ref": "components/national-id-number", "overrides": {"fieldId": "applicant-national-id", "label": "National ID Number", "validations": {"required": {"value": true, "error": "National ID is required"}, "minLength": {"value": 6, "error": "National ID must be at least 6 characters"}}}}
        ]
      },
      {
        "stepId": "business-details",
        "title": "Business details",
        "elements": [
          {"ref": "components/name", "overrides": {"fieldId": "business-name", "label": "Business Name", "hint": "The name you trade under", "validations": {"required": {"value": true, "error": "Business name is required"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "type-of-goods", "label": "What type of goods will you sell?", "options": [{"label": "Food and beverages", "value": "food"}, {"label": "Crafts and handmade items", "value": "crafts"}, {"label": "Clothing and accessories", "value": "clothing"}], "validations": {"required": {"value": true, "error": "Please select the type of goods"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "preferred-market", "label": "Preferred market location", "options": [{"label": "Cheapside Market", "value": "cheapside"}, {"label": "Fairchild Street Market", "value": "fairchild-street"}, {"label": "Eagle Hall Market", "value": "eagle-hall"}], "validations": {"required": {"value": true, "error": "Please select a market location"}}}}
        ]
      },
      {
        "stepId": "declaration",
        "title": "Declaration",
        "elements": [
          {"ref": "components/confirmation", "overrides": {"fieldId": "declaration-confirm", "label": "Declaration", "options": [{"label": "I declare that the information provided in this application is true and correct to the best of my knowledge.", "value": "confirmed"}], "validations": {"required": {"value": true, "error": "You must confirm the declaration to proceed"}}}}
        ]
      },
      {
        "stepId": "submission-confirmation",
        "title": "Application submitted",
        "elements": [],
        "nextSteps": [{"title": "What happens next", "content": "We have received your application. You will receive a confirmation email at the address you provided."}]
      }
    ],
    "processors": []
  }$recipe$,
  NOW(),
  NOW(),
  NOW()
);
```

---

## UX & Data Guardrails

### Radio vs Select (Dropdown)
- Use `components/generic/radio` ONLY for exactly 2 options (Yes/No, Male/Female)
- Use `components/parish` pattern (select with options override) for 3 or more options
- Never use radio for gender (3+ options), employment status, qualifications, or any list with more than 2 items

### Age Fields
- Always use `components/generic/number` for age — a simple number input
- Never list ages as radio options or dropdown items

### Step Size
- Keep steps to 8-10 fields maximum
- If a step has more than 10 fields, split it into two steps with clear groupings
- Long steps are overwhelming on mobile devices

### Email Processor Configuration
- `recipientField` must use `"stepId.fieldId"` format
- Both the stepId AND fieldId must exactly match what's in the recipe
- Example: step `"stepId": "contact-details"` + element `"fieldId": "applicant-email"` → `"recipientField": "contact-details.applicant-email"`
- Every form must include an email processor (no empty `processors: []`)

#### Reserved `contactDetails.` prefix (MDA notification email)
- A `recipientField` beginning with `contactDetails.` is **reserved**: it
  resolves against the form's service-contract `contactDetails` object, **not**
  against submitted answer values.
- Use `"recipientField": "contactDetails.email"` to send a notification to the
  responsible MDA contact (the address set in the form's `contactDetails`).
  This is the recipient source for the "MDA Email" processor.
- Because the prefix is reserved, **`contactDetails` cannot be used as a step
  id** — such a step would be shadowed by contract resolution. Name the contact
  step something else (e.g. `contact-details`).
- If the contract has no `contactDetails`, or the requested key is absent, that
  email is skipped with a warning; other email processors (e.g. the applicant
  confirmation) still send.

#### Optional per-instance `label`
- An email config may carry an optional `label` (e.g. `"Applicant Email"`,
  `"MDA Email"`) to distinguish multiple email processors on the same form. It
  is metadata only — ignored for delivery.

### Contact Information Requirement
- Every form must have at least one step with an email field AND a telephone field
- The email field is required for the email processor
- The telephone field is required for MDA follow-up

### Never Include `addAnother` in Recipes
- The `addAnother` field is automatically injected by the frontend renderer on repeatable steps
- Do NOT include it in recipe elements — the backend rejects it as an unknown field

---

## Pre-Submission Checklist

Before finalizing the SQL, verify:

- [ ] Every element has a unique `fieldId` override
- [ ] No two elements share the same `fieldId` across the entire form
- [ ] `formId` in JSON matches `form_id` in the SQL column
- [ ] All `components/parish` uses have the full 11-parish options list
- [ ] All `components/generic/radio` uses have exactly 2 options only
- [ ] For 3+ options, use select dropdown pattern (not radio)
- [ ] All `components/nationality` and `components/country` uses have options provided
- [ ] Component ref keys are exact (no typos like `national-id` instead of `national-id-number`)
- [ ] Email processor has `recipientField` matching an actual `stepId.fieldId` in the recipe
- [ ] JSON is valid (no trailing commas, proper quoting)
- [ ] Conditional `behaviours` use `targetFieldId` and include `operator`
- [ ] Step conditionals include both `targetFieldId` and `targetStepId`
- [ ] Date fields use `components/date-of-birth` with appropriate fieldId + label overrides
- [ ] Age fields use `components/generic/number` (not radio or select)
- [ ] Free-text relationship fields use `components/name`, not `components/relationship`
- [ ] The last step is `{"stepId": "submission-confirmation", "title": "Application submitted", "elements": [], "nextSteps": [...]}`
- [ ] No hidden fields have `required` validation (`isHidden: true` + `required: true` blocks submission)
- [ ] No step has more than 10 fields
- [ ] The SQL uses dollar-quoting (`$recipe$...$recipe$`) to avoid quote escaping issues

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| 500 error on form load | Duplicate fieldId | Ensure every element has a unique fieldId |
| 500 error on form load | Invalid component ref | Check ref key against the component reference table |
| Empty dropdown | Select component with no options override | Add options array to the overrides |
| Field not showing/hiding | Missing operator in behaviour | Add `"operator": "equal"` (or appropriate operator) |
| Field not showing/hiding | Wrong targetFieldId | Must match the exact fieldId of the watched field |
| Step not showing/hiding | Missing targetStepId | Step conditionals require both targetFieldId AND targetStepId |
| Parse error on save | Invalid JSON | Validate JSON (check for trailing commas, unescaped quotes) |
| SQL error | Unescaped single quotes in JSON | Use dollar-quoting (`$recipe$...$recipe$`) |
