# Form Migration Notes — Old Platform → New Platform

## Date: 2026-05-07

## Summary

Successfully tested migrating 2 forms from the old platform (frontend-alpha) to the new platform (modular-forms-monorepo) by inserting service contract recipes directly into the sandbox database. No code deployment was needed.

## What's in the Sandbox DB (Test Data)

### Custom Components Added (`custom_components` table)
- `a0000000-0000-0000-0000-000000000001` — generic radio (`components/generic/radio`)
- `a0000000-0000-0000-0000-000000000002` — generic number (`components/generic/number`)

### Test Form Definitions Added (`form_definitions` table)
- `request-fire-inspection-test` v1.0.0
- `reserve-society-name-test` v1.0.0

### Rollback
Run `modular-forms-monorepo/test-migration-rollback.sql` to remove all test data.

---

## Known Limitations / Bugs

### 1. Duplicate fieldId Conflict (Critical)
**Problem:** You cannot use the same registry component twice in a single form. For example, using `components/additional-details` for two different textarea fields causes a 500 error because both resolve to `fieldId: "additional-details"`.

**Impact:** Forms with multiple textareas, multiple address fields, or multiple radio questions need separate components for each instance — OR the system needs to support `fieldId` overrides.

**Workaround:** Create separate custom components with unique fieldIds (e.g. `components/generic/textarea-1`, `components/generic/textarea-2`). This is ugly but works.

**Proper Fix:** Allow `fieldId` to be overridable in the recipe, so the same base component can be used multiple times with different IDs.

### 2. No Conditional Field Support in Recipes
**Problem:** The old platform supports `conditionalOn: { field: "someField", value: "yes" }` at both field and step level. The new platform has `behaviours` with `type: "fieldConditionalOn"` but this wasn't tested in the migration.

**Impact:** Forms with conditional fields (show/hide based on another field's value) need the `behaviours` array configured correctly. Not tested yet.

### 3. No fieldArray / Repeatable Fields in Recipes
**Problem:** The old platform has `fieldArray` (add/remove dynamic field groups) and `repeatable` steps. The new platform supports repeatable steps via `behaviours` but the recipe format for this wasn't tested.

**Impact:** Forms like "Reserve Society Name" (propose up to 3 names) and "Jobstart Plus" (add employment history) can't be fully migrated without testing the repeatable behaviour.

### 4. Missing Field Types / Features
- `showHide` (expandable/collapsible sections) — no equivalent on new platform
- `conditionalTitle` (step title changes based on answers) — no equivalent
- `mask` (input formatting like NID `850101-0001`) — no equivalent
- `bodyContent` (markdown on confirmation pages) — no equivalent
- `rows` (textarea height control) — no equivalent
- `numberConfig` (min/max/default for number inputs) — no equivalent
- `enableFeedback` (feedback widget on confirmation) — no equivalent

### 5. Address Fields Need Multiple Components
**Problem:** Old forms have `addressLine1` + `addressLine2` as separate fields. The registry only has one `components/address` with `fieldId: "address"`. Using it twice causes the duplicate fieldId issue.

**Workaround:** Use the `blocks/physical-address` block which includes address line 1, line 2, parish, and postcode as separate fields. Or create `components/generic/address-line-1` and `components/generic/address-line-2`.

---

## What Was Removed From Old Forms to Make Them Work

### Fire Service Inspection
| Feature | Status | Reason |
|---------|--------|--------|
| Type of premises (radio) | ✅ Kept | Used `components/generic/radio` with overrides |
| Name of premises (text) | ✅ Kept | Used `components/name` with label override |
| Address line 1 (text) | ✅ Kept | Used `components/address` with label override |
| Parish (select) | ✅ Kept | Used `components/parish` with options override |
| First name, Last name | ✅ Kept | Used builtin components |
| Email, Telephone | ✅ Kept | Used builtin components |
| Declaration checkbox | ✅ Kept | Used `components/confirmation` with label override |
| Address line 2 | ❌ Removed | Duplicate fieldId conflict with address line 1 |
| "Who is the certificate for?" step | ❌ Removed | Could be added (radio) but kept test simple |
| Date of declaration | ❌ Removed | No generic date component (only date-of-birth) |
| Confirmation page | ❌ Removed | No bodyContent/enableFeedback support |

### Reserve Society Name
| Feature | Status | Reason |
|---------|--------|--------|
| "What do you want to do?" (radio) | ✅ Kept | Used `components/generic/radio` with overrides |
| First name, Middle name, Last name | ✅ Kept | Used builtin components |
| Address line 1 | ✅ Kept | Used `components/address` |
| Parish (select) | ✅ Kept | Used `components/parish` with options |
| Email, Telephone | ✅ Kept | Used builtin components |
| Declaration checkbox | ✅ Kept | Used `components/confirmation` |
| Conditional field (current society name) | ❌ Removed | Conditional logic not tested |
| Proposed names (fieldArray) | ❌ Removed | fieldArray/repeatable not tested |
| Activities (fieldArray) | ❌ Removed | fieldArray/repeatable not tested |
| Address line 2, Postcode | ❌ Removed | Duplicate fieldId / not tested |
| Date of declaration | ❌ Removed | No generic date component |
| Confirmation page | ❌ Removed | No bodyContent support |

---

## Migration Readiness Assessment

### Can migrate now (no code changes):
- Forms that only use: text, email, tel, select (with options override), radio (via generic component), checkbox, date-of-birth
- Forms where each field type is used only once per form (no duplicate fieldIds)
- Forms without conditional logic, fieldArrays, or repeatable steps

### Needs code changes to migrate:
- Forms with multiple fields of the same type (needs fieldId override support)
- Forms with conditional show/hide logic (needs behaviour testing)
- Forms with repeatable/fieldArray sections (needs behaviour testing)
- Forms with showHide, masks, or bodyContent (needs new renderer features)

### Priority fixes for full migration support:
1. **Allow `fieldId` override in recipes** — unblocks duplicate field usage
2. **Add generic `date` component** — unblocks date of declaration fields
3. **Test conditional behaviours** — unblocks conditional fields
4. **Test repeatable behaviours** — unblocks fieldArray forms
