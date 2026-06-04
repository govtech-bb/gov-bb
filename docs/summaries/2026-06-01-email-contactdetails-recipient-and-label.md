# Email processors: contactDetails recipient resolution + config label

## Context

Issue #501 wants new forms to ship with two seeded email processors — an
applicant confirmation and an MDA notification — sourcing recipients from
different places. This session is **Plan 2 of 2** (schema + runtime); the
form-builder UI/seeding is Plan 1, worked in parallel. Going in, the email
processor could only resolve a recipient from submitted answer values
(`stepId.fieldId`), so an MDA address living on the service contract
(`contactDetails.email`) was unreachable — it resolved to `undefined` and
skipped silently.

## What we did

- Added an optional `label` to both the author and resolved email config
  schemas (`packages/form-types/src/processor.type.ts`).
- Added `EmailBodyBuilder.resolveContactDetails()` — a public accessor that
  reads `contactDetails` off the cached service contract.
- Branched recipient resolution in `email.processor.ts` on a reserved
  `contactDetails.` prefix; refactored the old inline lookup into
  `resolveSubmittedRecipient` / `resolveContactRecipient`.
- Documented the reserved prefix in `FORM-CREATION-GUIDE.md` and recorded the
  convention in [ADR 0023](../decisions/0023-contact-details-is-a-reserved-recipientfield-namespace.md).
- Tests across all three layers, including the non-string-key edge
  (`contactDetails.address` is an object → skip).

## Why we did it that way

- **Prefix branch over a new email sub-type.** #501 explicitly decided the two
  roles are distinguished by `recipientField` + `label`, not a discriminator
  field. So the recipient *source* is inferred from the field's namespace, and
  `label` is pure metadata the runtime ignores for delivery. This keeps the
  discriminated union untouched and the serializer change-free (`config` is
  carried verbatim). The full rationale and the resulting "`contactDetails` is a
  banned step id" constraint live in ADR 0023.
- **Accessor on `EmailBodyBuilder`, not `FormDefinitionsService` in the
  processor.** The builder already fetches and caches the contract per
  `formId:version` for the email body. Injecting `FormDefinitionsService` into
  the processor would have double-fetched the same contract. Reusing the
  builder's cache was the cheaper, single-source path.
- **Prefix match, not exact `contactDetails.email`.** This was the plan's one
  open question. Chose the whole `contactDetails.` prefix for forward-compat
  (`telephoneNumber`, etc.) at no extra cost — `email` is the only consumer
  today, but a future key needs no code change. The `typeof value === "string"`
  guard means a non-string key like `address` safely falls through to the
  log-and-skip path rather than sending a stringified object.
- **Land `label` first.** It's the only thing Plan 1's TypeScript needs to
  compile a seeded `config.label`, so the ~2-line schema change went in ahead of
  the runtime work to unblock the parallel client effort.

## Open questions

None. The forward-compat prefix decision resolved the plan's only open question.
