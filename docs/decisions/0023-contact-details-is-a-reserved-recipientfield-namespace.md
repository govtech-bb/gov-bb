# 0023 — `contactDetails.` is a reserved recipientField namespace

**Date:** 2026-06-01
**Status:** Accepted
**Related:** [#501](https://github.com/govtech-bb/gov-bb/issues/501). Builds on
the multiple-same-type-processor iteration guarantee from
[0006](0006-submission-processors-iterate-internally.md).

## Context

An email processor's `recipientField` historically named a submitted answer:
`"stepId.fieldId"`, resolved against `payload.values[stepId][fieldId]`. That
only reaches addresses the **applicant** typed.

Seeding a form with two email processors — an applicant confirmation and an MDA
notification (#501) — needs a second recipient source: the responsible agency's
address, which is **author-controlled** and lives on the service contract
(`contactDetails.email`), not in the submission. A recipientField of
`contactDetails.email` previously resolved to `payload.values["contactDetails"]`
→ `undefined` and silently skipped — the source was genuinely unreachable.

## Decision

An email processor's `recipientField` is resolved from one of two sources,
selected by **namespace prefix**:

- A field beginning with the reserved prefix `contactDetails.` resolves against
  the form's **service-contract `contactDetails`** object (e.g.
  `contactDetails.email`), fetched and cached by `EmailBodyBuilder`.
- Any other field keeps the existing `"stepId.fieldId"` resolution against
  **submitted answer values**.

Because the prefix is reserved, **`contactDetails` may not be used as a form
step id** — contract resolution would shadow it. Any future reserved source,
if added, follows the same prefix convention (a dotted namespace that is not a
real step id).

## Consequences

- **Two recipient sources, one field syntax.** Authors distinguish the MDA
  email from the applicant email purely by the `recipientField` value
  (`contactDetails.email` vs `stepId.fieldId`) plus an optional `label` — there
  is no email sub-type. New email-delivery features should branch on the
  namespace, not introduce a discriminator field.
- **`contactDetails` is a banned step id.** Documented in
  `FORM-CREATION-GUIDE.md`. A form authored with that step id would have its
  MDA resolution silently win over the step — the guide warns against it.
- **Per-entry log-and-skip stands (0006).** If the contract has no
  `contactDetails`, or the requested key is absent / non-string (e.g.
  `contactDetails.address`, an object), that entry warns and skips; sibling
  email entries still send. Resolution failure never aborts the batch.
- **No contract double-fetch.** Contract access for recipient resolution reuses
  `EmailBodyBuilder`'s existing per-`formId:version` cache via a dedicated
  accessor, rather than injecting `FormDefinitionsService` into the processor.
  Future contract-derived resolution should reuse that cache, not re-fetch.
- **Prefix, not exact match.** The reserved space is the whole `contactDetails.`
  prefix (not only `contactDetails.email`), so `contactDetails.telephoneNumber`
  etc. are forward-compatible without a schema change — though `email` is the
  only consumer today.
