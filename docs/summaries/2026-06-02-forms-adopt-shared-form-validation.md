# Make `apps/forms` validate through `@govtech-bb/form-validation` (#433)

## Context

Field validation in `apps/forms` existed twice. The shared
`@govtech-bb/form-validation` package (used live by `apps/api`) was wired into a
per-field zod `fieldSchema` — but that was **dead code**: `useForm` had no
validator adapter and nothing read `formMeta.schema`. The path that actually ran
was the app-local one: `buildFieldValidationProperties` attaching
`onChange`/`onBlur` handlers that called 22 `check*` functions in
`validation-methods.ts`. The two implementations had already drifted (the
`fileTypes` dotted-vs-dotless fix landed only in the local copy). Plan:
`docs/plans/433-forms-adopt-shared-form-validation.md`.

## What we did

- Rewrote `validation-builder.ts` `onChange` to call the shared `validate()`
  instead of the local `check*` functions, keeping the `onChange`/`onBlur`
  wiring, listen-to behaviour, `onBlur` date-overflow normalization, and
  `show-hide` pass-through intact (explicit user requirement).
- Deleted the 22 `check*` functions; kept the non-rule helpers still used
  elsewhere (`valueIsEmpty`, `dateValueToDate`, `isDateComplete`,
  `evaluateCondition`, `RequiredState`).
- Removed the dead `fieldSchema` / `FormMeta.schema` / `FormValidation.schema`
  plumbing across `build-form.ts`, `renderer.type.ts`, `validation.type.ts`,
  `types/index.ts`.
- Added `@govtech-bb/form-validation` as a declared `workspace:*` dependency.
- Recorded the single-source-of-truth principle in
  [ADR 0029](../decisions/0029-field-validation-rules-live-only-in-form-validation-package.md).
- An audit of the shared runners vs the old client logic found bugs; fixed three
  in the shared package and filed #633 for the residual divergences.

## Why we did it that way

- **Boundary adapters, not re-implemented rules.** The client keys form state by
  the composite `stepId_fieldId` (`field.id`); the shared validator keys by bare
  `fieldId` and resolves cross-field refs via `referenceFieldId`. So `onChange`
  splits the composite keys back apart (same last-separator convention as the
  existing `getStepIdFromFieldName`) to build the `stepValues` + `allValues`
  trees, sets `primitive.fieldId = field.fieldId` (was `field.name` in the dead
  code — a reason references never resolved), converts `FileList` →
  `{name,size,type}[]`, and reads errors back by `field.fieldId`. This is also a
  **bug fix**: cross-field rules (`gt`/`lt`, `strictEquality`, date comparisons)
  now resolve on the client, which they silently never did.

- **Preserve local emptiness semantics at the boundary, decided with the user.**
  The user asked to preserve existing wording/behaviour. The shared validator's
  required/empty-skip uses `EMPTY_BY_TYPE`; the app's `valueIsEmpty` treats more
  things as empty (boolean-`false` checkbox per ADR 0006, incomplete date, blank
  number). `adaptCurrentValue` collapses those to the shared empty shape so
  required fires on exactly the same values as before. An unrecognised value
  shape still short-circuits to "no error" (the old `unknownState`). A
  `formatErrors` shim reproduces the old de-dup + strip-field-name-from-later-
  errors formatting; configured `error` strings pass through verbatim.

- **Removed the dead schema, didn't neutralise it.** Leaving `fieldSchema` in
  place invited a future reader to mistake it for live validation. Chosen with
  the user: full removal.

- **Lowered the `functions` coverage gate 90 → 89.** Deleting 22 fully-covered
  pure functions (whose logic and coverage now live in `form-validation`) shrank
  the function pool and dropped the global ratio ~0.5%. Branches recovered with
  real tests; functions adjusted to actuals, consistent with ADR 0001. Chosen
  with the user over padding the PR with unrelated API tests.

## Bugs found by the audit (fixed in the shared package, per ADR 0029)

- **Array values were comma-joined before string rules** — `["ab","cd"]` against
  `maxLength: 3` became `"ab,cd"` (len 5) and failed. Fixed `string.ts` to
  validate each non-empty element (matching the old client loop).
- **`equal`/`notEqual` coerced both sides through `Number()`** — every
  text-to-text comparison became `NaN === NaN` and silently failed. Fixed to
  numeric-when-both-numeric, else case-insensitive string compare.
- **`fileTypes` only matched dotted extensions / a populated `file.type`** —
  dotless allowlists (`["pdf"]`) and MIME allowlists with an empty `file.type`
  were wrongly rejected. Restored the old normalise-to-bare-extension + verbatim-
  MIME matching. This was the highest-impact regression (recipes author both
  dotted extensions and MIME types, and browsers sometimes leave `file.type`
  empty).

## Open questions (#633)

- **Date literal-threshold format.** `after`/`before`/`onOrAfter`/`onOrBefore`
  accept a literal date `value`; the old client parsed `DD/MM/YYYY`, the shared
  `parseDate` uses `new Date(str)` (ISO / US `MM/DD`). The common
  `referenceFieldId` case is fine. Needs confirmation of the builder's stored
  format before fixing.
- Minor edge divergences: `parseFloat` vs `Number` for numeric strings;
  `equal`/`notEqual` outcome flip on operand `0`.

## What we almost got wrong

The migration looked like a pure swap, but the shared package carried real
behaviour gaps the dead client `fieldSchema` had masked (it never ran). Auditing
the deleted `check*` logic against the runners — rather than trusting "it's the
same package the server uses" — is what surfaced the `fileTypes` regression and
the array/text-equality bugs before they shipped to the live form.
