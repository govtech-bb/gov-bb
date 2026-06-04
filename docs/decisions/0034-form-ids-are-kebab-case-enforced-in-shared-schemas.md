# 0034 — Form ids are kebab-case, enforced in the shared schemas

**Date:** 2026-06-04
**Status:** Accepted

## Context

The citizen-facing form runtime keys client form state by a composite id,
`` `${stepId}_${fieldId}` ``, and splits it back apart with
`splitCompositeId`, whose split uses `lastIndexOf("_")` under the documented
assumption that *ids never contain the separator*. Issue #741 showed what
happens when the assumption is violated: a `fieldConditionalOn` behaviour
targeting the snake_case field `previously_in_school` split incorrectly, the
condition resolved to `undefined`, and the dependent field stayed hidden
forever — a silent, data-dependent failure that the JSON's appearance and the
then-current validation both passed.

The repo already had `KEBAB_ID_PATTERN` (`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`) and
used it for `formId` and the builder's live id inputs, but the shared zod
schemas accepted any string for every other id position. 21 checked-in recipe
files carried non-conforming ids (snake_case in five, camelCase in sixteen,
one literal `#`).

An alternative was considered: keep the base schemas lax and apply a strict
kebab check only at the form_builder_api boundary. Rejected — a
boundary-only check leaves the runtime loader, CI validation, and any future
consumer trusting data the schema never guaranteed, and the #741 class of bug
lives exactly in that gap.

## Decision

Every form identifier is kebab-case, and the rule lives in the shared schemas
— one definition, inherited by every consumer.

- `kebabIdSchema` (`packages/form-types/src/id-pattern.ts`) is the single
  zod schema for id positions: `KEBAB_ID_PATTERN` with `KEBAB_ID_ERROR`.
- It applies to **every** position an id can enter: `stepId`, `fieldId`
  (primitives and recipe overrides), behaviour targets
  (`targetFieldId`/`targetStepId` on all conditional behaviours),
  `sharedFields.fieldIds`, block-override record **keys**, and
  validation-rule references (`targetFieldId`, `referenceFieldId`,
  `targetStepId`).
- **Any new id position added to the schemas must use `kebabIdSchema`**, not
  `z.string()`. A lax id field is a regression of this decision.
- **Data migration precedes schema tightening.** The runtime recipe loader
  and CI's `validate-recipes` zod-parse every checked-in recipe version, so a
  schema made stricter than the data breaks startup and CI. Migrate the data
  first (or in the same change, ordered before the tightening).

## Consequences

- The `splitCompositeId` assumption is now an enforced invariant rather than
  a comment — ids cannot contain `_` (or anything else outside the pattern),
  so the composite key round-trips by construction.
- The API recipe loader, CI recipe validation, and form_builder_api's
  `/validate` endpoint all reject non-kebab ids from the one shared
  definition; their error copy and paths agree.
- Renaming ids in published recipe versions rekeys those fields: in-flight
  citizen drafts keyed on old composite ids do not carry over, and
  deployed-environment DB copies (`form_versions`) may still hold old ids —
  tracked in #760.
- The form_builder_api **write** endpoints (create/update/rekey) do not yet
  funnel through the schema validation, so they can still persist
  non-conforming recipes — a known gap tracked in #759, pending a
  draft-vs-publish semantics decision.
