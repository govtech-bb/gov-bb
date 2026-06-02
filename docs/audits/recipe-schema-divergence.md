# Recipe ↔ Upstream Schema Divergence Audit (issue #404)

Field-by-field audit of every form recipe in
`apps/api/src/forms/form-definitions/recipes` that has a canonical upstream
schema in `frontend-alpha/src/schema`. Each divergence is classified:

- ✅ **Fixed** — corrected in this PR.
- 📝 **Intentional** — recipe-format/platform limitation or a deliberate
  product change; left as-is.
- ❓ **Needs decision** — a real divergence that needs a product/owner call;
  left as-is and listed here so it isn't lost.

## Scope

**In scope (10 recipe ↔ upstream pairs):** apply-for-conductor-licence,
exit-survey, get-birth-certificate, jobstart-plus-programme,
primary-school-textbook-grant, project-protege-mentor, reserve-society-name,
sell-goods-services-beach-park, request-fire-inspection (↔
`request-a-fire-service-inspection.ts`), community-sports-training (↔
`sports-training-programme-form-schema.ts`).

**Out of scope:** upstream schemas with no recipe (`get-death-certificate`,
`get-marriage-certificate`, the three `post-office-redirection-*`) and recipes
with no upstream (`passport-renewal`, `national-id-application`, the
`youth-opportunity-*` family, etc.).

## How recipes resolve (context for the fixes)

A recipe element is `{ "ref": "components/<x>", "overrides": {...} }`. At
resolution (`packages/form-builder/src/resolution.ts`) the override is merged
onto the base component primitive in `packages/registry/src/components/<x>.ts`:

- Top-level keys: shallow merge, override wins.
- `validations`: shallow **per-rule-key** merge — base rule keys not named in
  the override **survive**, and there is no way to delete a base rule.

Two recurring bug classes follow from this:

1. **Required-inheritance trap.** Many base components default to
   `required: true` (`address`, `name`, `first-name`, `email`, etc.). A field
   that is optional upstream but reuses such a base, without overriding
   `required`, silently becomes mandatory. Fix: add
   `validations.required = { value: false }`.
2. **`components/name` letters-only pattern.** The `name` base carries
   `required: true`, `minLength: 2`, and a **letters/spaces/hyphens/apostrophes
   only** pattern (no digits, no periods). Reusing it for a field that
   legitimately holds digits or periods (years, codes, durations, free-text
   descriptions, "St." court names) makes valid input unsubmittable. Fix:
   repoint the field to `components/generic-text` (required-by-default, no
   pattern) and re-add `minLength`/`pattern` only where upstream wants it.

A cross-cutting 📝 item, true for **every** form below, is omitted from the
per-form tables to avoid noise: upstream `bodyContent` (markdown confirmation
copy), `enableFeedback`, `conditionalTitle`, input `mask`, textarea `rows`,
`numberConfig`, and the platform-generated `check-your-answers` review step are
not representable in the recipe format. These are intentional limitations
(see `FORM-MIGRATION-NOTES.md`).

---

## get-birth-certificate

| Field | Divergence | Status | Action |
|---|---|---|---|
| Address Line 2 (`applicant-address-2`) | `components/address` → inherited `required: true`; upstream `required: false` | ✅ Fixed | Added `validations.required = { value: false }` (1.0.0 + 1.1.0) |
| Mother other names (`mother-other-names`) | `components/name` → inherited `required: true`; upstream `parents.mother.middleName` is `required: false` | ✅ Fixed | Added `validations.required = { value: false }` (1.0.0 + 1.1.0) |
| `parents` step | Upstream has two conditional steps `parents-self` (`applyingForYourself = yes`) and `parents-other` (`= no`); recipe collapses to one unconditional step | ❓ Needs decision | Recipe still collects parent names unconditionally; not citizen-blocking. Decide whether to restore the two conditional steps. |
| `mother-maiden-name` | Present in recipe, no upstream equivalent | ❓ Needs decision | Likely a deliberate addition; confirm. |
| `declaration-date` | `pastOrToday` upstream vs inherited `past` (hidden field) | 📝 Intentional | Merge can't delete the inherited `past` rule; field is hidden, ~zero impact. |
| Residual `minLength: 5` on optional Address Line 2 | Inherited from `address` base | 📝 Intentional | Only fires if the user types 1–4 chars; empty (the blocking case) submits fine. Removing it cleanly needs a merge-semantic change. |

## reserve-society-name

| Field | Divergence | Status | Action |
|---|---|---|---|
| Address Line 2 (`address-line-2`) | inherited `required: true`; upstream optional | ✅ Fixed | Added `validations.required = { value: false }` |
| Current society name (`current-society-name`) | `components/name` letters-only pattern rejects society names with digits/periods | ✅ Fixed | Repointed to `components/generic-text` (kept required override) |
| First choice (`society-name-1`) | same name-pattern trap | ✅ Fixed | `generic-text` (kept required + minLength) |
| Second/third choice (`society-name-2`, `-3`) | name-pattern trap **and** inherited `required: true` though upstream optional | ✅ Fixed | `generic-text` + `validations.required = { value: false }` |
| `proposed-names` / `activities` | upstream repeatable `fieldArray` (1–3) flattened to fixed fields | 📝 Intentional | `fieldArray` not representable. |
| `request-purpose` `hidden: true` | upstream hides driver field; recipe shows it | ❓ Needs decision | Add `isHidden: true` if parity wanted. |
| Telephone pattern | recipe inherits generic phone pattern vs upstream BB-specific | ❓ Needs decision | See "Cross-form" note. |

## request-fire-inspection (↔ request-a-fire-service-inspection)

| Field | Divergence | Status | Action |
|---|---|---|---|
| Name of premises (`name-of-premises`) | `components/name` letters-only pattern rejects "Hotel 24", "St. …" | ✅ Fixed | Repointed to `components/generic-text` (kept required override) |
| Address line 2 (`premises-address-line-2`) | inherited `required: true`; upstream optional | ✅ Fixed | Added `validations.required = { value: false }` |
| Address line 1 inherited `minLength: 5` | not in upstream | 📝 Intentional | Only fires when filled (line 1 is required anyway). |
| Purpose of certificate `hidden: true` | upstream hides it; recipe shows it | ❓ Needs decision | Confirm whether it should be hidden/pre-filled. |
| Telephone pattern | generic vs BB-specific | ❓ Needs decision | See "Cross-form" note. |

## sell-goods-services-beach-park

| Field | Divergence | Status | Action |
|---|---|---|---|
| Goods description/location, services description/location | `components/name` letters-only pattern; hints literally show digit examples ("20-minute jet ski rides") | ✅ Fixed | Repointed all four to `components/generic-text` (kept required + minLength) — 1.0.0 + 1.1.0 |
| Professional/personal referee relationship | name-pattern trap + unwanted inherited `minLength: 2` | ✅ Fixed | `generic-text` (kept required) — 1.0.0 + 1.1.0 |
| Testimonial relationship uses `components/parish` as a generic select | works via full option override | ❓ Needs decision | Cleaner as `generic-select`; low priority. |
| Nationality / country option lists | recipe uses custom lists | ❓ Needs decision | Recipe lists look intentional. |
| Telephone pattern, declaration `pastOrToday` | generic vs BB; inherited `past` | 📝 Intentional / ❓ | See cross-form + declaration-date notes. |

## community-sports-training (↔ sports-training-programme-form-schema)

| Field | Divergence | Status | Action |
|---|---|---|---|
| Discipline of interest (`discipline-interest`) | name-pattern trap | ✅ Fixed | `generic-text` (kept required + minLength) |
| "Please specify" experience (`other-experience`) | name-pattern trap **and** missing `fieldConditionalOn` → always shown + required, blocking non-"other" users | ✅ Fixed | `generic-text` + `fieldConditionalOn level-of-experience = other` |
| Employment "Please give details" (`employment-other-details`) | name-pattern trap **and** missing conditional → always required | ✅ Fixed | `generic-text` + `fieldConditionalOn employment-status = other` |
| Institution/company name (`institution-name`) | inherited `required: true`, always shown → blocks unemployed applicants; name-pattern trap | ✅ Fixed | `generic-text` + `validations.required = { value: false }` |
| Organisation 1/2/3 (`organisation-1/2/3`) | inherited `required: true`, no gating → "No to organisations" still forces org 1; name-pattern trap | ✅ Fixed | `generic-text` + `fieldConditionalOn belongs-to-organisations = yes`; org 2/3 also `required: false` |
| Address line 2 (`contact-address-2`) | inherited `required: true`; upstream optional | ✅ Fixed | Added `validations.required = { value: false }` |
| Split of institution vs company; `hasSignificantPosition` per org; org `fieldArray` | upstream splits institution/company by status and repeats orgs with a significant-position radio | ❓ Needs decision | Recipe uses one combined field + three fixed org slots. Restore split / per-org radio if wanted. |
| Years of experience numeric pattern; telephone patterns; declaration date | see cross-form / declaration-date notes | 📝 / ❓ | — |

## jobstart-plus-programme

| Field | Divergence | Status | Action |
|---|---|---|---|
| Start/End year × 3 sections (`primary-`, `secondary-`, `post-sec-…-year-1`) | `components/name` letters-only pattern **rejects all 4-digit years** — fields unsubmittable | ✅ Fixed | Repointed all six to `components/generic-text` + `pattern ^[0-9]{4}$` (1.0.0 + 1.1.0; kept required where present) |
| Emergency relationship | upstream `select`; recipe free-text `components/name` | ❓ Needs decision | Use `components/relationship`/`generic-select` for the dropdown. |
| `currentlyWorkingHere` checkbox | present upstream, missing in recipe | ❓ Needs decision | Add a `generic-checkbox` if wanted. |
| Employment-history conditional step + `fieldArray` (maxItems 10) | collapsed to field-conditionals on one step, `repeatable max 5` | 📝 Intentional / ❓ | `fieldArray` collapse is a platform limitation; the maxItems 5-vs-10 and dropped per-item required rules are ❓. |
| `institutionName` required/minLength; `disabilityDetails` minLength; NIS pattern; marital status radio-vs-select; `hidden:true` eligibility fields | various validation/wording/type diffs | ❓ Needs decision | Not citizen-blocking; listed for completeness. |
| School/institution/employer/occupation on `components/name` | letters-only pattern rejects periods/digits in some names | ❓ Needs decision | Lower-frequency than the year fields; consider `generic-text` if reports surface. |

## primary-school-textbook-grant

| Field | Divergence | Status | Action |
|---|---|---|---|
| Which class (`child-class-number`) | name-pattern trap rejects "5", "1B" | ✅ Fixed | `generic-text` (kept required) — 1.0.0 + 1.1.0 |
| Branch code (`bank-branch-code`) | name-pattern trap rejects numeric codes | ✅ Fixed | `generic-text` (kept required) — 1.0.0 + 1.1.0 |
| Guardian-details conditional step (`isParentOrGuardian = no`, 6 fields) | absent in recipe; partly substituted by a single `relationship-description` field | ❓ Needs decision | Restore the conditional step + its fields, or confirm the substitution. |
| TAMIS number missing `pattern ^\d{10,15}$` | base `tamis-number` has no pattern; recipe only sets required | ❓ Needs decision | Add the pattern if server doesn't validate. |
| Name of institution as free-text vs upstream `select`; bank as select vs text; telephone pattern; declaration date | type/validation diffs | ❓ / 📝 | Listed for completeness. |

## project-protege-mentor

| Field | Divergence | Status | Action |
|---|---|---|---|
| Institution name (`institution-name`), company/org name (`employer-name`), other employment details (`other-employment-details`) | `components/name` letters-only pattern rejects org names with digits/periods ("3M", "St. George Polytechnic") | ✅ Fixed | Repointed to `components/generic-text` (kept conditional + required) |
| Referee relationships, mentee-in-mind name on `components/name` | inherited `minLength: 2` not in upstream (and generic error wording) | ❓ Needs decision | Person/relationship fields are letters-only by nature; minLength/wording only. |
| `components/postcode` ref | *Verified valid* — `REGISTRY_COMPONENTS` keys by `fieldId`, and `post-code.ts` has `fieldId: "postcode"` | 📝 Not a bug | No action (an audit pass had falsely flagged this). |
| Mentorship textareas `rows: 5`; declaration date | platform limitation / inherited `past` | 📝 Intentional | — |

## exit-survey

| Field | Divergence | Status | Action |
|---|---|---|---|
| All four data fields (`difficultyRating`, `clarityRating`, `technicalProblems` + description, `areasForImprovement`) | required/minLength/conditional rules | ✅ Match | No divergence — recipe matches upstream exactly. |
| Intro content step (`introduction`, no fields) | upstream has a leading content step; recipe folds it into the form-level title/description and drops the "Thank you for submitting your information." opening line | ❓ Needs decision | Restore a leading content step or the missing sentence if wanted. |
| Field `hidden: true` flags; thank-you `bodyContent` | display-only flags + rich confirmation copy | 📝 Intentional | Not representable. |

## apply-for-conductor-licence

Fixes applied to **1.3.0** (the latest/live version). 1.0.0 carries the same
divergences (and, additionally, `licence-number` lacks the digit-allowing
pattern override) but is superseded by 1.3.0.

| Field | Divergence | Status | Action |
|---|---|---|---|
| Type of licence (`endorsement-type`), endorsement duration (`endorsement-duration`), court name (`disqualification-court`), court reason (`disqualification-reason`), length of disqualification (`disqualification-length`) | `components/name` letters-only pattern rejects digits/periods ("6 months", "St. Michael …") | ✅ Fixed | Repointed all five to `components/generic-text` (kept conditional; required-by-default preserved) |
| Date of issue (`licence-date-of-issue`), date of endorsement (`endorsement-date`), date of disqualification (`disqualification-date`) | built on `components/date-of-birth` → no `required` default, so optional though upstream required them when shown | ✅ Fixed | Added `validations.required = { value: true }` |
| Licence number (`licence-number`) | uses `components/name` but **overrides** the pattern to `^[A-Za-z0-9 -]+$` | 📝 OK | Digit-allowing pattern already in place; not a bug in 1.3.0. |
| National-ID + passport-toggle + police-certificate flow; "Ms" vs "Miss" title option; endorsements `max 5` vs upstream 10 | recipe-added fields / option + repeatable diffs | ❓ Needs decision | Extra flows look like deliberate product additions; the title option and maxItems are small parity calls. |
| Endorsement/declaration date `pastOrToday` vs inherited `past`; telephone pattern | merge limitation / generic pattern | 📝 Intentional / ❓ | See declaration-date + cross-form notes. |

---

## Cross-form recurring items

- **Telephone patterns (❓).** Several upstream schemas enforce a
  Barbados-specific phone regex; the recipes inherit the registry's looser
  generic `telephone` pattern. Not citizen-blocking (the generic pattern is a
  superset). Decide whether to override per-field to the strict BB format.
- **Declaration dates (📝).** Documented as intentional per the issue
  discussion — these are hidden/auto-populated, and the merge can't delete the
  inherited `past` rule to match upstream `pastOrToday`.
- **Older recipe versions.** Where a form has multiple versions, fixes were
  applied to all versions present **except** `apply-for-conductor-licence`,
  whose 1.0.0 differs structurally from 1.3.0 and is superseded by it.

## Acceptance criteria status

- [x] `get-birth-certificate` Address Line 2 is optional, matching upstream.
- [x] Every in-scope recipe verified field-by-field; each divergence is either
  fixed (✅) or documented as intentional (📝) / needs-decision (❓) above.
