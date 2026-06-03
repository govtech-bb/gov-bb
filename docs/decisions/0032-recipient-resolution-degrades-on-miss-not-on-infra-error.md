# 0032 — Config-resolved recipients degrade on a miss, not on an infra error

**Date:** 2026-06-03
**Status:** Accepted

## Context

Issue [#607](https://github.com/govtech-bb/gov-bb/issues/607) moves the email
notification recipient out of committed recipe JSON and into a per-environment
database, so production MDA addresses are not hardcoded in source and sandbox
never emails a real MDA. The email processor resolves a recipient by
classifying its `recipientField` (see `classifyRecipientField` in
`@govtech-bb/form-types`):

- `literal` — an address used verbatim,
- `contact` — `contactDetails.<key>` from the service contract,
- `config` — the reserved `config.` token, resolved from
  `form_config → mda_contact.mda_email`,
- `submitted` — a `stepId.fieldId` from answers.

The `config` kind is the new one. It must keep sandbox/test submissions away
from real MDA inboxes, which means falling back to a default test inbox
(`SES_DEFAULT_RECIPIENT`) when production has no configured recipient. But
"fall back to a default" and "swallow all errors" are different policies, and
conflating them is dangerous: a *transient DB outage* that silently routed a
**production** MDA notification to the shared test inbox would be a quiet
data-leak / lost-notification, not a safe default.

## Decision

A recipient resolved from per-environment config **degrades to the safe default
only on a resolved miss** — a successful lookup that finds nothing usable:

- no `form_config` row (sandbox, or a freshly-migrated recipe before its
  production row exists),
- a row referencing no contact (`mda_contact_id` null, or the contact deleted —
  the FK is `ON DELETE SET NULL`, see [Session 1]),
- a blank `mda_email`.

A genuine **infrastructure failure** (DB unreachable, query error) is **not** a
resolved miss: it propagates, so the send fails and retries on the normal SQS →
DLQ path rather than misrouting a production notification to the default inbox.

Concretely: `FormConfigService.resolveMdaEmail` returns `null` for the resolved
misses above and has no try/catch, so a query rejection bubbles up.
`EmailProcessor.resolveConfigRecipient` does `resolveMdaEmail(formId) ??
defaultRecipient` — the `??` covers the misses; the rejection is left to throw.

**Corollary (the broader principle):** sensitive production recipients resolve
from the database via a reserved token, never from committed recipe JSON. The
recipe carries only the stable `config.` sentinel; the address lives in
`mda_contact` and can be rotated without a code change or redeploy.

## Consequences

- **Sandbox is safe by construction.** With no rows, every `config.` recipient
  resolves to `SES_DEFAULT_RECIPIENT` (default `testing@govtech.bb`).
- **No silent misrouting.** A DB blip delays the MDA notification (retry/DLQ)
  instead of sending it to the test inbox. The trade-off is that a sustained DB
  outage dead-letters these sends — acceptable, since the alternative leaks.
- **"Never throws" is the wrong mental model.** Code comments, tests, and
  `FORM-CREATION-GUIDE.md` describe this as "degrades on a resolved miss," not
  "never throws." A test asserting the fallback must exercise the *null* path,
  not a rejection.
- **Future recipient kinds / resolution code must follow the same split.** If a
  new kind resolves from a mutable store, distinguish "looked up, found nothing"
  (→ safe default) from "couldn't look up" (→ propagate). Don't wrap the lookup
  in a catch-all that returns the default.
- **No caching of the lookup.** Unlike immutable published contracts,
  `form_config`/`mda_contact` are mutable (addresses rotate); a stale cache
  could deliver to an old address, so resolution reads the DB per send.
