# 0033 — Per-form DB config never enters the recipe

**Date:** 2026-06-03
**Status:** Accepted — extends [ADR 0032](0032-recipient-resolution-degrades-on-miss-not-on-infra-error.md)

## Context

Issue #607 introduced per-form, per-environment configuration that lives in the
database (`form_config`, referencing the `mda_contact` directory) rather than in
the committed recipe. [ADR 0032](0032-recipient-resolution-degrades-on-miss-not-on-infra-error.md)
established the runtime side of this: the recipe carries only a reserved
`config.` token and the address is resolved from the DB.

The form builder, however, must let an author *choose* a contact and persist
that choice. The choice (`mdaContactId`) is per-form config — it belongs in
`form_config`, not in the recipe. But the builder's working state
(`RecipeDraft`) is the natural place to hold the selection while editing, and
`RecipeDraft` is also what gets serialized into the committed recipe. That
adjacency is the hazard: if `mdaContactId` (or any future DB-only field) leaked
into `serializeRecipeDraft`'s output, a private/per-environment id would land in
the version-controlled recipe — defeating the whole point of #607 and #607's
sandbox/production separation.

## Decision

Per-form configuration stored in the DB must **never** be serialized into the
committed recipe / `ServiceContractRecipe`.

- It may live on `RecipeDraft` for editing convenience, but `serializeRecipeDraft`
  builds its output field-by-field and **must not** emit it.
- It travels to the builder API as a **sibling** of `recipe` in the save request
  body (`{ recipe, mdaContactId }`), never nested inside `recipe`.
- It is read back via a **dedicated config endpoint**
  (`GET /builder/forms/:formId/config`), not by reading it out of the recipe.
- The recipe carries only the stable reserved token (e.g. `config.mdaEmail`) —
  never a resolved id or address.

## Consequences

- **The recipe stays environment-agnostic and free of private data.** A
  committed recipe is identical across environments; the per-environment binding
  lives entirely in the DB.
- **`serializeRecipeDraft` is the chokepoint.** Its tests assert the field is
  absent from the output for both a set and a null `mdaContactId`. Any new
  DB-only per-form field must add the same assertion rather than relying on the
  serializer "happening" to omit it.
- **Future per-form config follows this shape.** #716 (moving the payment
  processor override into `form_config`) and any later per-form setting must use
  the same sibling-save + dedicated-read pattern, not a new recipe field.
- **Save and config are two writes, reconciled server-side.** The builder API
  upserts `form_config` in the same transaction as the recipe write (see the
  Session 3 summary), so the two stay consistent despite being separate fields
  on the wire.
