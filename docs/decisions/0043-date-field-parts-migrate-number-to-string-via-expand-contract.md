# 0043 — Date field parts migrate number→string via expand-contract

**Date:** 2026-06-08
**Status:** Accepted

## Context

Date fields render day/month/year as three text inputs, but the value layer
coerced each part to a JS **number** on every keystroke — so `"09"` collapsed
to `"9"` under the cursor, `"00"` became `0`, and the user's literal input
never survived to submission
([#815](https://github.com/govtech-bb/gov-bb/issues/815)). The fix is to store
parts as the digit-**string** the user typed, deriving numbers only at the
validation/formatting boundary.

That shape — `{ day, month, year }` — is a **payload that crosses the
forms-frontend ↔ API deploy boundary**: the citizen-facing forms app POSTs it
to `/submissions`, where `@govtech-bb/form-validation` validates it. The two
deploy separately (the per-PR preview frontend even runs against the *shared
sandbox API*). A naive single-PR flip from `number` to `string` is therefore
**mutually incompatible across the boundary**:

- A new frontend (strings) hitting an old API (whose `asPart` only accepted
  `number`) has its parts read as absent → "incomplete date" → **422**. This is
  precisely what the preview smoke caught.
- Symmetrically, an old/cached frontend (numbers) hitting a new strings-only
  API would also fail.

This is the hazard ADR 0040 already names: a wire field must not flip to an
incompatible shape while a producer of the old shape can still be in flight.

## Decision

The number→string migration is performed **expand-contract**, and the
`@govtech-bb/form-validation` boundary **tolerates both shapes** for the
duration:

1. **Expand (this change).** The validation boundary accepts a date part as
   **either a number or a digit-string**:
   - `dateValueInputSchema` parts are `z.union([z.number(), z.string()])`.
   - `asPart` / `isCompleteDateValue` treat a finite number *or* a non-empty
     string as a present part.
   - `formatDateValue` / `parseDate` `Number(...)`-coerce parts, guarding
     empty/NaN/zero explicitly (a string `"0"` is truthy, unlike numeric `0`,
     so it can't ride a falsy check).
   No producer changes; the frontend keeps emitting numbers. This deploys to
   sandbox first, so the API accepts string parts **before** any frontend
   sends them.
2. **Migrate (a later deploy).** Once the tolerant API is live, the forms
   frontend flips to emitting string parts (`parseDatePart` returns the
   digit-string; `DateValue` becomes string end-to-end internally). The
   already-deployed API accepts them.
3. **Contract (optional, later).** Once no producer emits numbers, the boundary
   may narrow back to string-only.

## Consequences

- **Deploy order never matters during the migration.** Old-frontend→new-API and
  new-frontend→old-API (post step 1) both validate.
- **The preview smoke stays green at each phase.** It exercises
  new-frontend→shared-sandbox-API; keeping the frontend numeric until the API
  is tolerant is what lets that pass — a single hard flip cannot.
- **No user-visible change in the expand phase.** Leading-zero preservation is
  delivered by the migrate phase, not this one.
- This is the date-shape instance of ADR 0040 (cross-deploy payload
  compatibility). A future "just change the type in one PR" request should be
  declined on the same grounds.
- **Tolerance tests must exercise both shapes** (numeric *and* string), not just
  the new one, so the expand phase can't silently drop numeric support while
  old frontends are still deployed.
