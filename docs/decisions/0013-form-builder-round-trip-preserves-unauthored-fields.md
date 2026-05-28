# 0013 — Form builder round-trip preserves unauthored fields

**Date:** 2026-05-27
**Status:** Accepted
**Related:** [#255](https://github.com/govtech-bb/gov-bb/issues/255), [ADR 0009](./0009-form-builder-instance-ids-are-editor-only.md)

## Context

The form builder edits a `ServiceContractRecipe` by deserializing it into a
`RecipeDraft` (editor state), letting the user change it, then serializing back
on Deploy. `deserializeRecipe` and `serializeRecipeDraft` are the single
chokepoints every load and deploy path goes through.

Both functions were written to carry only the fields the builder has UI for
(`formId`, `title`, `description`, `steps`). `processors` — a persisted recipe
field with no builder UI — was read by neither, so opening an existing form and
re-deploying produced recipe JSON with **no** `processors`. Any processors
authored elsewhere (hand-edited JSON, SQL backfill) were silently erased (#255).

This is a class of bug, not a one-off: `contactDetails` is also on
`serviceContractRecipeSchema`, also has no builder UI, and is also dropped on
round-trip (tracked separately). Any future persisted recipe field will hit the
same trap unless the round-trip is lossless by default.

## Decision

The form builder's serialize/deserialize round-trip is **lossless**: it carries
through every persisted recipe field unchanged — including fields it has no UI to
edit — rather than dropping them.

Concretely, `RecipeDraft` holds such fields opaquely (e.g.
`processors?: Processor[]`), `deserializeRecipe` reads them, and
`serializeRecipeDraft` writes them back. The presence/absence distinction is
preserved exactly with a `!== undefined` guard — an explicit `[]` is **not** the
same as an absent field — mirroring the existing optional-`description` handling.

Fields the builder doesn't author are carried opaquely: no transform, no
editor-only id, until a session deliberately adds authoring for them. (Processors
authoring is deferred; when it lands it will mirror `RecipeFieldDraft`'s
editor-only id pattern — see ADR 0009.)

## Consequences

- Adding a new persisted field to `serviceContractRecipeSchema` is not complete
  until the builder round-trip carries it. A field with no builder UI still must
  be threaded through `RecipeDraft` + `deserializeRecipe` + `serializeRecipeDraft`,
  or re-deploying from the builder wipes it.
- `contactDetails` violates this principle today (dropped on round-trip). It is a
  known gap tracked in [#267](https://github.com/govtech-bb/gov-bb/issues/267),
  to be closed the same way.
- Carrying a field opaquely is the minimum bar; it does **not** imply the builder
  validates or surfaces that field. Authoring UI and builder-side validation are
  separate, later concerns.
- The round-trip is the contract under test: each carried field gets serialization
  round-trip tests — absent, populated, and (where the absent/empty distinction
  matters) explicit-empty.
