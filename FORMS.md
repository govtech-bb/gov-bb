# FORMS.md — Conventions for Updating Form Recipes

How to bring an existing form recipe into line with the conventions the
platform's well-formed forms already follow (temp-teacher, term-leave,
homeschooling, BSEE choice). Use this when **normalizing or updating** a recipe
— most older recipes were machine-converted from paper forms and use raw
`components/generic-*` fields with paper-form labels.

This is a **style/convention** guide. For the recipe JSON schema mechanics
(steps, elements, behaviours, validations) see
[FORM-CREATION-GUIDE.md](FORM-CREATION-GUIDE.md); for how recipes ship and are
served see [docs/form-recipes.md](docs/form-recipes.md).

> Recipes live at
> `apps/api/src/forms/form-definitions/recipes/{formId}/{version}.json`.
> Edit the file, bump nothing for an in-place fix or add a new `{version}.json`
> for a published change, then **restart the API** (no hot reload).

---

## The source of truth is the registry

Every `ref: "components/<key>"` resolves to a component defined in
[`packages/registry/src/components/`](packages/registry/src/components/). The
ref key is `components/` + that component's `fieldId`. Each registry component
already carries the **correct input type, default label (sentence case),
options, mask, and base validations**. Your job when updating a form is to
**reference the right component and let it do the work** — not to re-implement a
field as `components/generic-text` with hand-written labels and validations.

### Cardinal rule

> **Prefer a named registry component over `components/generic-*`.**
> Reach for `generic-text` / `generic-number` / `generic-radio` only when no
> named component fits (free-text questions specific to the form).

A named component gives you, for free: the right widget (a `<select>`, a radio
group, a 3-part date), input masking and format validation (NID, phone, email),
and a sensible sentence-case label. Re-using `generic-text` throws all of that
away — which is exactly what the bad forms do.

---

## Field → component map

When you see a field that means one of these things, use the named component.

| The field is…                         | Use this ref                          | Renders as        |
| -------------------------------------- | ------------------------------------- | ----------------- |
| First / given name                     | `components/first-name`               | text              |
| Middle name(s)                         | `components/middle-name`              | text              |
| Last / family / surname                | `components/last-name`                | text              |
| Title / salutation (Mr/Mrs/Miss)       | `components/title`                    | select (w/ opts)  |
| Sex / gender                           | `components/sex`                      | **radio** (M/F)   |
| Marital status                         | `components/marital-status`           | select (w/ opts)  |
| Date of birth — **and any date**       | `components/date-of-birth`            | 3-part day/mo/yr  |
| National / ID number                   | `components/national-id-number`       | text, masked      |
| National Insurance (NIS) number        | `components/national-insurance-number`| text              |
| Passport number                        | `components/passport-number`          | text              |
| TAMIS number                           | `components/tamis-number`             | text              |
| Email address                          | `components/email`                    | email (validated) |
| Phone (generic)                        | `components/telephone`                | tel (validated)   |
| Phone — mobile / home / work / fax     | `components/{mobile,home,work}-telephone`, `components/fax-number` | tel |
| Street address                         | `components/address`                  | text              |
| Parish (Barbados)                      | `components/parish`                   | select (w/ opts)  |
| Country                                | `components/country`                  | select (w/ opts)  |
| Nationality / citizenship              | `components/nationality`              | select (w/ opts)  |
| Town / city                            | `components/town`                     | text              |
| Postcode                               | `components/postcode`                 | text              |
| Primary school                         | `components/primary-school`           | select (w/ opts)  |
| Secondary school                       | `components/secondary-school`         | select (w/ opts)  |
| Relationship to applicant             | `components/relationship`             | select (w/ opts)  |
| Bank / account name / number / type    | `components/{bank,account-name,account-number,account-type}` | text/select |
| Declaration / "I confirm" checkbox     | `components/confirmation`             | single checkbox   |
| File upload                            | `components/upload-document`          | file              |
| Important notices / expandable info    | `components/show-hide`                | disclosure        |
| Long free text                         | `components/generic-textarea` (or `components/additional-details`) | textarea |
| Yes/No or custom choice                | `components/generic-radio` (+ options)| radio             |
| Custom number                          | `components/generic-number`           | number            |
| Custom free text (no named fit)        | `components/generic-text`             | text              |

> The named **select / radio** components (`title`, `sex`, `marital-status`,
> `parish`, `country`, `nationality`, `primary-school`, `secondary-school`,
> `relationship`) **already ship with their options.** Reference them and
> override only `fieldId`/`label` — **do not re-declare `options`.** Only
> `generic-radio` / `generic-select` / `generic-checkbox` require you to supply
> `options`.

### Select values are slugs, not labels

A `<select>` stores the option **value** (a kebab-case slug), e.g. parish
`saint-michael`, country `barbados`, school `harrison-college`. Migrated data
and tests must use the slug, not the display label.

---

## Label & copy conventions

1. **Sentence case, not Title Case, not SHOUTING.**
   `First name` ✅ · `First Name` ❌ · `SUBJECT(S)` ❌ → `Subject(s)` ✅
   Match the registry default label where one exists ("National ID number",
   "Date of birth", "Email address", "Telephone number", "Marital status").
2. **Descriptive and user-friendly**, written *to the citizen*.
   `Telephone No` ❌ → `Telephone number` ✅ · `DOB` ❌ → `Date of birth` ✅
3. **Don't override the label at all** unless the form needs wording different
   from the component default — the defaults are already correct.
4. **Error messages** follow the field's sentence-case label:
   `"School is required"`, not `"SUBJECT(S) is required"`.

---

## Standard composite patterns

These groupings recur across the good forms — copy them.

**Personal/applicant identity:** `title?` → `first-name` → `middle-name?` →
`last-name` → `sex` → `date-of-birth` → `national-id-number`.

**Address block:** `address` is **immediately followed by `parish`** (and
`country` when the form collects non-Barbados addresses). A street address
without a parish is incomplete — always pair them.

**Contact block:** `email` + `telephone` (or a specific
mobile/home/work-telephone). Never collect a phone or email as `generic-text` —
you lose format validation.

**Any date** uses `components/date-of-birth` (the 3-part day/month/year widget),
overriding `fieldId` + `label`. **Never model a date as three separate
`generic-number` fields** (`dob-day` / `dob-month` / `dob-year`) — that is the
single most common anti-pattern in old recipes. `date-of-birth` already
validates the date is in the past; for forward-looking dates override the
validation accordingly.

**Declaration step** (last data step before submission): a single
`components/confirmation` element. It ships with one option
`{ label: "I confirm", value: "confirmed" }` and `required`. Override the label
with the form's declaration wording; keep the single `confirmed` option.

```json
{
  "ref": "components/confirmation",
  "overrides": {
    "fieldId": "declaration-confirmed",
    "label": "I confirm that my information is correct and may be verified.",
    "options": [{ "label": "<declaration wording>", "value": "confirmed" }]
  }
}
```

> A required checkbox with `options: []` is **unsatisfiable** — it renders a
> legend but no checkable input, so the step can never be completed. Always give
> a confirmation/checkbox at least one option.

### Form skeleton

```
1..n  data steps (identity, details, uploads, …)
      → check-your-answers      ← auto-injected by the renderer; do NOT author it
      declaration               ← single components/confirmation checkbox
      submission-confirmation   ← explicit terminal step, elements: []
```

Drop paper-form artifacts that don't belong online: handwritten
**"Signature of …"** text fields, **"Date of declaration"** inputs the citizen
fills by hand (the submission is timestamped), and **"For official use"**
sections. Do not leave an **empty `declaration` step** (`elements: []`) — that's
a broken stub; it must hold the confirmation checkbox.

---

## Validation conventions

- Mark genuinely required fields `required: { value: true, error: "<Label> is required" }`.
- **Don't bolt `minLength: 2` onto every field.** Named components that carry a
  format (`national-id-number` mask `999999-9999` / pattern `^\d{6}-\d{4}$`,
  `email` format, `telephone` pattern) validate shape correctly on their own —
  a blanket `minLength: 2` on an ID or phone is meaningless and was copy-pasted
  across the bad forms.
- Make optional fields optional (`required: { value: false }`) rather than
  forcing data the citizen may not have.

---

## Override hygiene (these cause broken or 500-ing forms)

- **Every element needs a unique `fieldId`** within the form (IDs are
  recipe-wide unique — see [decision 0010](docs/decisions/0010-form-data-fieldids-are-recipe-wide-unique.md)).
- **Use the real override keys.** Seen in bad recipes and all **wrong**:
  - `"disabled": true` → use `"isDisabled": true`
  - `"conditional": "resit"` → use a `behaviours` entry of type
    `fieldConditionalOn` with a `targetFieldId`, `operator`, and `value`
  - `"type": "info"` / `"type": "date"` on `generic-text` → not a thing; use
    `components/show-hide` for notices and `components/date-of-birth` for dates
- **Never combine `isHidden: true` with a `required` validation** — the form
  becomes impossible to submit. Use `defaultValue` for a hidden value.

---

## Worked example — `csec-private-candidate-registration`

This recipe is the canonical "needs updating" form. Representative fixes:

| Field            | Before (`1.2.0`)                                   | After                                                            |
| ---------------- | -------------------------------------------------- | --------------------------------------------------------------- |
| First/Last name  | `generic-text`, label `"First Name"`               | `components/first-name` / `components/last-name`, `"First name"` |
| Gender           | `generic-text`, label `"Gender"`, `minLength: 2`   | `components/sex` (radio), label `"Gender"`                       |
| Date of birth    | three `generic-number` fields `dob-day/month/year` | one `components/date-of-birth`                                   |
| ID Number        | `generic-text`, `"ID Number"`, `minLength: 2`      | `components/national-id-number`, `"National ID number"`         |
| Address          | `generic-text` (no parish)                         | `components/address` **followed by `components/parish`**         |
| Email            | `generic-text`, `"Email"`, `minLength: 2`          | `components/email`, `"Email address"`                           |
| Telephone No     | `generic-text`, `"Telephone No"`                   | `components/telephone`, `"Telephone number"`                    |
| `SUBJECT(S)` etc.| SHOUTING labels                                    | `"Subject(s)"`, `"Alternative"`, `"Resit"`                      |
| Subjects info    | `generic-text` `type:"info" disabled:true`         | `components/show-hide` (or step `description`)                  |
| `conditional`    | `"conditional": "resit"` (ignored)                 | `fieldConditionalOn` behaviour on `resit`                       |
| Declaration      | free-text `"Signature of Claimant"` + hand `Date`, then an **empty** `declaration` step | drop the signature/date; put one `components/confirmation` in the `declaration` step |

Compare against
[`barbados-secondary-entrance-exam-choice/1.1.0.json`](apps/api/src/forms/form-definitions/recipes/barbados-secondary-entrance-exam-choice/1.1.0.json),
which already follows every rule above.

---

## Before you publish

- [ ] Each field uses the most specific named component (generic-* only where nothing fits).
- [ ] All labels are sentence case, descriptive, citizen-facing.
- [ ] `address` is followed by `parish`; phone/email/ID/date use named components.
- [ ] Named selects/radios reference the component without re-declaring options.
- [ ] The `declaration` step holds a single `components/confirmation` (one `confirmed` option); no empty declaration step, no handwritten signature/date.
- [ ] Every element has a unique `fieldId`; no `disabled`/`conditional`/`type` hacks; no hidden+required.
- [ ] Build still compiles: `pnpm exec nx run-many -t build --exclude=landing`.
- [ ] If the form has a live smoke spec under `apps/forms/e2e/smoke/`, run it
      against a stack that serves the updated recipe
      (`SMOKE_BASE_URL=http://localhost:3000 pnpm --filter @govtech-bb/forms test:smoke <form>`);
      otherwise consider adding one.
