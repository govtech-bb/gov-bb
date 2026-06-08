# Restrict payment-processor field pickers + flag payment edits as unsaved (#957, #958, #959)

## Context

Three related gaps in the form builder's payment-processor config surfaced in one
session, all on `payment-processor-field-filter-dirty-957-958` (targets `sandbox`):

- **[#957](https://github.com/govtech-bb/gov-bb/issues/957)** — the payment
  processor's **Customer email path** and **Customer name path** pickers offered
  *every* form field. Picking a non-email field for the email path (or a non-name
  field for the name path) yields a payment that sends garbage to EzPay. The email
  *processor* already restricts its recipient picker to email-like fields; payment
  had no such guard.
- **[#958](https://github.com/govtech-bb/gov-bb/issues/958)** — editing a payment
  processor never lit the "Unsaved changes" indicator, so an author could navigate
  away and silently lose the edit. Only payment was affected; email/webhook/etc.
  flagged correctly.
- **[#959](https://github.com/govtech-bb/gov-bb/issues/959)** — in a conditional
  (age-band) amount, a rule comparing "Age of field" let the author point at any
  field. Computing an age from, say, an email field produces `NaN` at runtime
  (`packages/expressions` age op). The condition-field picker should only offer
  date-of-birth fields.

## What we did

- **`apps/form_builder/app/routes/builder/-processor-config-form.tsx`** (#957) —
  added a `fieldMatches(field, keyword)` helper (matches **label OR id**,
  case-insensitive) and fed `emailFields` / `nameFields` into the two payment
  pickers instead of the full `fields` array.
- **`apps/form_builder/app/routes/builder/-apply-recipe.ts`** (#958) — `draftsEqual`
  gained an opt-in `{ comparePayments }`. When set, it also compares the in-memory
  payment processors (id-stripped) that `serializeRecipeDraft` strips out.
- **`apps/form_builder/app/routes/builder/index.tsx`** (#958) — the
  `hasUnsavedChanges` call site passes `{ comparePayments: true }`; the AI no-op
  guard call site does **not** (see below).
- **`apps/form_builder/app/routes/builder/-amount-editor.tsx`** (#959) — added
  `isDobField` (label/id contains `birth` or `dob`). When a rule's
  `subject.kind === "age"` the condition-field picker is filtered to DOB fields,
  and switching a rule *to* age clears a stale non-DOB path so the picker's
  `(current)` fallback can't keep an invalid selection alive.
- Tests: 6 new specs in `-processors-editor.spec.tsx` (#957 label/id/case +
  `(current)` preservation; #959 age-filter, field-passthrough, clear-on-switch,
  keep-DOB-on-switch) and 4 in `-apply-recipe.spec.ts` (#958 changed / identical /
  id-stripped under `comparePayments`, plus the AI-no-op-guard default path).

## Why we did it that way

- **Matched on label OR id, not the component `ref`.** `ResolvedFieldId` doesn't
  carry the registry `ref`, and the picker emits a `stepId.fieldId` path — so a
  substring match on the label/id is the only signal available at this layer. It's
  a heuristic: it narrows the list but can't *guarantee* correctness (e.g. the name
  filter also matches "Account name"). Acceptable for v1; the `(current)` fallback
  still preserves any previously-saved out-of-list path so nothing is dropped.
- **Made the payment comparison opt-in rather than always-on.** `draftsEqual` has
  two callers with opposite needs. The unsaved-changes guard compares two in-memory
  drafts that both retain payment config and **must** see a payment edit. The AI
  no-op guard compares the working draft against a *deserialized recipe*, which
  never carries payment processors — folding payments in there unconditionally
  would make any payment form read as "changed" on every echoed-back reply (bumping
  the patch version for nothing). A code review caught this regression in the
  first, always-on version; the opt-in flag keeps each caller correct, pinned by a
  dedicated test on the no-op path.
- **Cleared the stale path on switch-to-age (#959) rather than leaving it.** The
  DOB-only filter constrains *new* picks, but `ValuePathPicker`'s `(current)`
  fallback would otherwise re-render an already-selected non-DOB path, defeating
  the restriction and re-introducing the runtime `NaN`. Clearing it forces a valid
  re-pick.

## Open questions

- The name filter is a substring heuristic and can surface partial-name fields
  ("First name", "Account name"). If authors need a stronger guarantee, a
  follow-up could prefer a single canonical `full-name` field. Not pursued here.
