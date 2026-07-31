# Temporary restaurant licence — full-fidelity design (#2065 + #2067)

**Date:** 2026-07-27
**Issues:** [#2065](https://github.com/govtech-bb/gov-bb/issues/2065) (accordion food selector + higher-risk tagging), [#2067](https://github.com/govtech-bb/gov-bb/issues/2067) (14-day lead-time validation + time-of-day input)
**Follow-up to:** #2063 / PR #2071 (Phase 1 MVP)
**Scope:** one feature branch, one PR against `main`, resolving both issues.

## Goal

Restore full prototype fidelity to the citizen-facing **Temporary restaurant licence**
form ([`apply-for-temporary-restaurant-licence.json`](../../../apps/api/src/forms/form-definitions/recipes/apply-for-temporary-restaurant-licence.json)),
which Phase 1 shipped in simplified form. Four contained platform additions plus the
recipe edits that use them. Recipe version bumps `1.1.0 → 1.2.0`; `meta.visibility`
stays `draft`.

## Background — how the platform fits together

- **Recipes** are JSON. Each step element is a thin `{ ref, overrides }` pointer, never
  a full field. At API boot the recipe is zod-validated
  (`serviceContractRecipeSchema`), then `RegistryService.hydrateForm` resolves each
  `ref` against the builtin registry (`packages/registry`) and shallow-merges
  `overrides`. **There is no inline-primitive branch** — every new field type a recipe
  uses must exist as a builtin registry component.
- **Field types** are a discriminated union (`primitiveSchema`) keyed on `htmlType` in
  `packages/form-types/src/primitive.type.ts`. An override may set only the 13 keys
  `fieldOverridesSchema` picks; unknown keys are silently stripped.
- **Two shared validation engines**, both run client- (`apps/forms`), server-
  (`apps/api`), and chat-side: `@govtech-bb/form-validation` (field rules) and
  `@govtech-bb/form-conditions` (visibility/optionality). Both delegate the `transform`
  keyword to a shared primitive in `@govtech-bb/expressions`.
- **Date fields** bypass the generic rule loop (`validate-field.ts`) and go through
  `validateDateField`. But `runConfiguredRules` (`validate-date.ts:255`) re-runs the
  full `RULE_REGISTRY` for date fields, so number rules (`min`/`max`/`gt`/`lt`) **do**
  apply to date fields — this is how `yearsSince` age gating works today
  (`jobstart-plus`, `summer-camp` recipes).
- **Submission → reviewers** happens off a `submission.created` event dispatched
  per-processor. Email body is built by `EmailBodyBuilder.build()` (has the resolved
  contract + values in scope); the webhook body by `buildMappedCasePayload()` (does
  **not** fetch the contract today). There is no shared payload-building step and no
  existing "derived value in payload" mechanism.

---

## Part A — `daysUntil` transform + 14-day lead time (#2067)

The prototype requires the event **start date to be at least 14 days in the future**.
`daysSince` (past-facing) already exists as a `transform`; we add its future-facing
counterpart `daysUntil`.

### Changes

1. **`packages/expressions`** — new `durationUntil(date, unit)` primitive
   (`operations/duration-until.ts`, exported from `index.ts`). Mirror of
   `durationSince` but future-facing.

   **Calendar-day semantics (important):** a naive `floor(date.diff(now))` rejects a
   date that is genuinely 14 calendar days ahead whenever the form is filled after
   00:00 (a mid-day `now` makes the diff 13.x → floor 13). `durationUntil` therefore
   measures **whole calendar days from the start of the current day** (Barbados zone,
   `DEFAULT_ZONE`) to the (date-only) value:
   `floor(dateStartOfDay.diff(nowStartOfDay, unit))`. So a date exactly 14 days ahead
   yields 14 at any time of day. Invalid/empty input → `NaN` (fails every bound), matching
   `durationSince`.

2. **`packages/form-types/src/behavior.type.ts`** — add `"daysUntil"` to
   `durationTransformSchema`.

3. **`packages/form-validation/src/rules/number.ts`** — `comparand` currently maps every
   transform through `durationSince`. Route `daysUntil` → `durationUntil` (keep
   `yearsSince`/`monthsSince`/`daysSince` on `durationSince`). Keep the `TRANSFORM_UNIT`
   map for the unit; select the direction by transform name.

4. **`packages/form-conditions/src/internals.ts`** — same direction-aware routing, so a
   `daysUntil` transform behaves identically in conditional behaviours (parity per the
   issue: "add it to both validators").

5. **Recipe** — `event-from` (start date) gains:
   ```json
   "min": {
     "value": 14,
     "transform": "daysUntil",
     "error": "You must apply at least 14 days before the event start date"
   }
   ```
   The existing `futureOrToday` on `event-from` is now redundant (14 days ahead implies
   future) and is removed to avoid double messaging. `event-to`'s `onOrAfter` is
   unchanged.

6. **Builder + AI docs (consistency)** — add `"daysUntil"` to `TRANSFORM_OPTIONS` in
   `apps/form_builder/app/routes/builder/-validation-rules-editor.tsx` and
   `-behaviours-editor.tsx`, and document it in
   `apps/form_builder_api/src/ai/system-prompt.ts`.

### Tests
- `packages/expressions` — `durationUntil`: exactly-14-days-ahead → 14 at 00:00 **and**
  mid-day; 13-days-ahead → 13; past date → negative; invalid/empty → `NaN`.
- `packages/form-validation/src/rules/number.spec.ts` — `min: 14, transform: daysUntil`
  passes/fails around the boundary on a date value.
- `packages/form-conditions` — `daysUntil` behaviour parity.

---

## Part B — native `time` field (#2067)

Daily start/end times are captured as free text today. Replace with a real time control.

### Changes

1. **`packages/form-types/src/primitive.type.ts`** — add `"time"` to `htmlTypesSchema`;
   add `timePrimitiveSchema = basePrimitiveSchema.extend({ htmlType: z.literal("time") })`;
   add to the `primitiveSchema` union; export schema + type from `index.ts`.

2. **`packages/registry`** — new component
   `packages/registry/src/components/generic-time.ts` (`GenericTime`, `fieldId:
   "generic-time"`, `htmlType: "time"`); register in `components/index.ts` (export,
   `PRIMITIVES`, `ALL`, bump `_componentCount`).

3. **`apps/forms`** — route `"time"` through the existing text renderer group in
   `field-renderer/index.tsx`. `render-context.ts` already sets the DOM `type` from
   `htmlType`, so this yields a native `<input type="time">` (browser-enforced valid
   time). A small `govtech.css` touch may be needed so the native control matches the
   govbb input styling.

4. **`packages/form-validation`** — treat `"time"` as a scalar in `validate-field.ts`
   (default empty `""`; no new rule). `required` is the only rule used.

5. **`packages/form-builder/src/behaviors/validation-builder.ts`** —
   `VALIDATION_RULE_DESCRIPTORS` is `Record<HtmlTypes, …>`, so a `time:` key is
   **required** for the type to compile (allowed rules: `required`).

6. **Recipe** — `event-start-time` and `event-end-time` switch from
   `components/generic-text` → `components/generic-time` (keep labels, hints, `required`;
   drop the free-text `ui.width` hint if not applicable).

Stored value is `"HH:mm"` (24h). Email/webhook render it as-is; optional 12h display
formatting is out of scope.

### Tests
- New renderer spec: `time` renders `<input type="time">` and commits its value.
- Registry count/spec updates (see Part E).

---

## Part C — `checkbox-accordion` nested field (#2065)

The prototype's food selector is ~9 **collapsible categories**; expanding one reveals
its item checkboxes, and meat/seafood/dairy/eggs carry a **"Higher-risk" badge**. The
MVP flattened this to 9 always-visible checkbox groups with risk noted in label text.
Per the decision on #2065, we build a **new nested field type** (not an extension of
`insetFieldsByOption`, which stays untouched).

### Data model

New `htmlType: "checkbox-accordion"`. The field carries a `groups` array; the submitted
value is a **flat `string[]`** of selected item values across all groups.

```jsonc
{
  "htmlType": "checkbox-accordion",
  "fieldId": "food-served",
  "groups": [
    { "label": "Meat and poultry", "higherRisk": true,
      "options": [ { "label": "Chicken", "value": "chicken" }, … ] },
    { "label": "Cooked rice, pasta and starches",
      "options": [ { "label": "Rice", "value": "rice" }, … ] }
  ]
}
```

A flat value (rather than a nested object keyed by category) keeps the existing checkbox
value model, so array validation rules (`required`/`minItems`) and email/webhook
serialization work unchanged — the grouping is purely presentational. Item `value`s must
be unique across groups (they already are in this recipe).

### Changes

1. **`packages/form-types/src/primitive.type.ts`**
   - Add `"checkbox-accordion"` to `htmlTypesSchema`.
   - `groupSchema = z.object({ label: z.string(), higherRisk: z.boolean().optional(),
     options: z.array(optionSchema) })`.
   - `checkboxAccordionPrimitiveSchema = basePrimitiveSchema.extend({ htmlType:
     z.literal("checkbox-accordion"), groups: z.array(groupSchema) })`; add to the
     `primitiveSchema` union; export from `index.ts`.
   - Add `groups: z.array(groupSchema).optional()` to `basePrimitiveSchema` and
     `groups: true` to `fieldOverridesSchema.pick(...)` so `groups` is authorable per
     recipe via overrides (consistent with how `options`/`multiple`/`mask` already live
     on the base and pass through `applyFieldOverrides`).

2. **`packages/registry`** — new component
   `packages/registry/src/components/generic-checkbox-accordion.ts`
   (`GenericCheckboxAccordion`, `fieldId: "generic-checkbox-accordion"`, empty `groups`,
   `validations.required`); register in `components/index.ts`.

3. **`apps/forms` renderer** — new
   `field-renderer/checkbox-accordion-field.tsx`, `case "checkbox-accordion"` in
   `field-renderer/index.tsx`:
   - Each group → a native `<details className="govbb-show-hide">` /
     `<summary>` (reuse the show-hide disclosure pattern), summary text = `group.label`
     plus a **`govbb-tag` "Higher-risk" badge** when `group.higherRisk`.
   - Inside each group, render item checkboxes reusing the array-`toggle` logic from
     `checkbox-field.tsx`. Selected values accumulate into the single flat `string[]`.
   - **Persist on collapse:** `<details>` open/closed is local UI state only; selections
     are never cleared. Categories start **collapsed**.
   - Badge styling: add a `.govbb-tag` class to `apps/forms/src/styles/govtech.css`
     (check `@govtech-bb/styles` for an existing class first).

4. **`packages/form-validation/src/validate-field.ts`** — treat `checkbox-accordion`
   like `checkbox`: empty value is `[]`, validated as an array. The field **requires ≥1
   item selected overall** (`required` with a clear error, e.g. "Select at least one food
   or drink item you will serve").

5. **`packages/form-builder/src/behaviors/validation-builder.ts`** — add a
   `checkbox-accordion:` key to `VALIDATION_RULE_DESCRIPTORS` (allowed rules:
   `required`, `minItems`, `maxItems`).

6. **Email/webhook label lookup** — the checkbox label path resolves selected values via
   `field.options`; the accordion has `groups`, not top-level `options`. Add a small
   flatten (`groups.flatMap(g => g.options)`) so `formatValue` /
   `resolveOptionLabels` can map accordion values to labels.

7. **Recipe** — replace the 9 `components/generic-checkbox` food elements
   (`food-meat` … `food-drinks`) in the `food-details` step with **one**
   `components/generic-checkbox-accordion` element (`fieldId: food-served`) whose
   `groups` reproduce the 9 categories, `higherRisk: true` on meat/seafood/dairy/eggs.
   The `food-source` "Where will you get the food from?" field is unchanged.

### Tests
- New renderer spec: groups collapse/expand; higher-risk badge renders when flagged;
  toggling items across groups accumulates one flat array; collapsing preserves
  selections.
- Registry count/spec updates (Part E).
- `serviceContractRecipeSchema` accepts the accordion element with `groups` in overrides
  (guarded by `recipe-invariants.spec`).

---

## Part D — derived higher-risk flag in reviewer payload (#2065)

Per the decision on #2065, surface a computed "higher-risk food selected" signal in the
payload sent to reviewers. **Strategy B (localized):** a shared pure helper, injected at
the two reviewer-facing sinks, with no changes to the `submission.created`
event / SQS / HMAC core path.

### Changes

1. **Shared helper** `deriveHigherRiskFood(contract, values): boolean` — locates the
   `checkbox-accordion` field(s) in the contract, and returns `true` when any selected
   value belongs to a group with `higherRisk: true`. Pure; unit-tested in isolation.
   (Location: a small util under `apps/api/src/forms`, or `packages/registry` if it needs
   to be shared more widely — decided at implementation time.)

2. **MDA/reviewer email** — in `EmailBodyBuilder.build()` (contract + values already in
   scope), push a derived line (e.g. a `{ label: "Higher-risk food", value: "Yes"/"No" }`
   field in a dedicated section) so it renders through the existing `sections` template
   with no template change. Targeted at the reviewer copy; appearing on the citizen copy
   is harmless if the builder cannot distinguish recipient — acceptable.

3. **Webhook/CMS** — give the webhook processor a `resolveContract` dependency
   (mirroring `email.processor.ts`), and add a `higher_risk_food: boolean` to the object
   returned by `buildMappedCasePayload()` (top level, alongside `programme_code` /
   `form_data`). The HMAC signature is computed over the final body, so this is covered
   automatically.

### Tests
- `deriveHigherRiskFood`: true when a higher-risk item selected, false otherwise, false
  when nothing selected.
- Email builder: derived line present/absent by selection.
- Webhook: `higher_risk_food` present and correct in the mapped payload.

---

## Part E — cross-cutting registry/schema bookkeeping

Adding two builtin generic components (`generic-time`, `generic-checkbox-accordion`):

- `packages/registry/src/components/index.ts` — export/import both; add to `PRIMITIVES`
  and `ALL`; bump the `_componentCount` type guard (**47 → 49**).
- `packages/registry/src/components/generic-primitives.spec.ts` — bump the expected
  primitive count (**10 → 12**) and add both `fieldId`s to `EXPECTED_GENERIC_FIELD_IDS`.
- `packages/registry/src/builtin-registry.spec.ts` — update any structural counts.
- `packages/form-types/src/index.ts` — export the new schemas/types.

## Verification (before commit / PR)

```bash
pnpm exec nx run-many -t build --exclude=landing   # all packages compile (landing built by CI)
pnpm exec nx run-many -t test                       # full suite (~30s)
```
Plus the touched-project tests: `expressions`, `form-types`, `form-validation`,
`form-conditions`, `registry`, `forms`, `api`, `form_builder`. Recipe validity is guarded
by `recipe-invariants.spec`.

## Out of scope (unchanged from Phase 1 / other sub-issues)

- Per-parish routing platform work (own PR, blocked on CMS routing codes).
- Map/zone routing, dependent landmark field, dynamic templated confirmation (other
  #2064–#2068 sub-issues).
- Builder **field-palette** authoring UI for the two new types (recipes are authored as
  JSON; only the `Record<HtmlTypes,…>` completeness and transform dropdowns are touched).
- 12-hour display formatting of the stored `HH:mm` time value.

## Acceptance criteria coverage

**#2067**
- [x] A start date fewer than 14 days away is rejected with a clear message → Part A.
- [x] Daily times entered as a proper time control and validated → Part B.

**#2065**
- [x] Food categories collapse/expand → Part C.
- [x] Higher-risk categories visibly badged → Part C.
- [x] Higher-risk selection reflected in the reviewer payload → Part D.
</content>
</invoke>
