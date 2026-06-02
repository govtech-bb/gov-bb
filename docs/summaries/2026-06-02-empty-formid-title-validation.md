# Reject empty / malformed Form ID and empty Title on validate (#573)

## Context

A form validated as "✓ Valid" — and Deploy stayed enabled — with an empty
**Form ID** and empty **Title**. Root cause: both contract schemas declared
`formId: z.string()` / `title: z.string()`, which accept `""`, and `formId` had
no format check at all. On the frontend the toolbar checked `formId` _format_
but short-circuited on empty input, and **Title had no validation**. Plan:
`docs/plans/form-builder-empty-formid-title-validation.md`.

## What we did

- **One shared pattern.** New `packages/form-types/src/id-pattern.ts` exports
  `KEBAB_ID_PATTERN` + `KEBAB_ID_ERROR`, exported from the package barrel. See
  [ADR 0028](../decisions/0028-form-id-is-canonical-kebab-case.md).
- **Schema (root cause).** `formId` is now `.min(1)` + `.regex(KEBAB_ID_PATTERN)`
  and `title` is `.min(1)`, in **both** `serviceContractRecipeSchema` and
  `serviceContractSchema`.
- **Friendly pre-flight.** `runValidation` (`apps/form_builder/app/routes/builder/index.tsx`)
  now reports "Form ID is required" / the kebab hint / "Title is required" —
  both reported together — instead of Zod's raw message.
- **Toolbar + id-validation.** `-id-validation.ts` re-exports the shared
  pattern/error (keeping its local `kebabize`); `-toolbar.tsx` dropped its looser
  local `FORM_ID_PATTERN`, uses the shared one, and now always propagates the
  typed value while surfacing the error separately.
- **Fixture rename.** `apps/forms/contracts/master-contract.json` used
  `formId: "masterFormV1"` (camelCase) — which the stricter schema correctly
  rejects — renamed to `master-form-v1` plus the matching e2e mock.
- Tests at every layer (schema both-ways, `validateFormContract`, the
  `runValidation` pre-flight via the Validate button, and a new `-toolbar.spec.tsx`).

## Why we did it that way

- **Pre-flight runs _after_ the existing step/collision checks, not first.** The
  route's `INVALID_DRAFT` test fixture has empty `formId`/`title` _and_ no
  editable step, and the existing test asserts the "add at least one step" error
  surfaces. Putting the identity check first would have changed that message and
  broken the test. Placing it after the step/collision pre-flights means it fires
  exactly on the issue's repro (a _valid_ step with empty id/title) while leaving
  the empty-form path unchanged.
- **Always propagate the toolbar value.** The old toolbar called
  `onFormIdChange` only on the _valid_ branch, so for a controlled input bound to
  the draft, invalid keystrokes were silently dropped — and with the stricter
  pattern that would have made it impossible to type a hyphen mid-id. The new
  code propagates every keystroke and shows the error independently, matching the
  established field-edit-panel convention.
- **Kept both schemas strict despite the read-path risk — after an audit.** A
  code review flagged that `serviceContractSchema.parse(...)` also runs when
  citizens load an _already-published_ form (`apps/forms`, `apps/chat`), so
  tightening its `formId` format could reject live data published under the old
  looser rule (which allowed leading digits and trailing/double hyphens). Rather
  than relax the deployed schema (the plan's "tighten both" was deliberate), we
  audited every form definition on disk — 58 forms, 72 version files — and
  confirmed **all** already satisfy the strict pattern. Decision made with the
  user: keep both strict; existing _drafts_ will surface any error when opened in
  the builder. No published form needed fixing.
- **Pre-flight trims, schema doesn't (left as-is).** The pre-flight rejects a
  whitespace-only title (`.trim()`), the schema's `.min(1)` would accept `"   "`.
  Harmless — the pre-flight runs first and the builder is the only producer of
  contracts — so we kept the schema a pure non-empty validator rather than add a
  trimming transform that would mutate stored titles.

## What we almost got wrong

Tightening `serviceContractSchema` (the deployed-contract variant) looked like a
free "for consistency" change, but it sits on the citizen-facing read path for
published forms. The on-disk audit is what made keeping it strict safe; without
it we'd have risked breaking form loads for any form with a leading-digit or
trailing-hyphen id. The audit being clean is recorded so the strictness isn't
later "fixed" by someone who hits the read-path throw without that context.
