# Plan: Redact PII before it reaches application logs

Issue: [#1640](https://github.com/govtech-bb/gov-bb/issues/1640) — *Personal data
(e.g. recipient email) is written to application logs in plain text*

## Goal

Stop the citizen's email address (and any future PII) from being written verbatim
to application logs. The one confirmed leak — the email processor logging the
recipient address — is masked via a small reusable helper available to any
future PII log site.

## Approach

Add a `redactPii(value)` helper that masks known-PII values before they reach a
log line. Callers pass a value they *know* is PII (the recipient email here).

**Masking rule:**

- An **email** is reduced to its first character + domain
  (`jane@gmail.com` → `j***@gmail.com`). The masked middle is a fixed `***` so
  the local-part length doesn't leak. This lets support eyeball an address
  during debugging without recording it in full.
- **Anything else** — a name, a phone number, or a malformed/empty address that
  can't be partially masked safely — is fully redacted to `[hidden]`.

**Why this design (explicit-wrap, "A"):** the caller, not a regex, decides
what's sensitive, so it covers every PII type. A pattern-detecting alternative
("B") was rejected: regex PII-detection is leaky, and names cannot be
pattern-detected at all. Partial masking (`j***@gmail.com`) was chosen over a
fully-opaque placeholder for emails so support retains a recognisable handle;
non-email PII still falls back to fully opaque since it has no safe partial form.

**Scope decision:** the audit found exactly one real leak. The other submission
processors already follow "log IDs, never the body":

- `webhook.processor.ts` — logs only non-PII routing metadata via `sanitizeForLog`.
- `opencrvs.processor.ts` — logs only `submissionId` + endpoint.
- `payment.processor.ts` — logs only `payment.id`; its error strings reference
  the *config path* (`"customerEmailPath"`), never the value.
- `submission-processor.listener.ts` — logs `submissionId`/type/index + `err`;
  processor errors are built from IDs/config paths, not answer values.

So **no broader defensive mechanism** is applied across processors (per the
request) — only the confirmed line is changed.

## Scope

- Add `redactPii()` to the existing log-safety module
  (`log-sanitize.ts`) — keeps it beside `sanitizeForLog` rather than spawning a
  new file/abstraction.
- Replace `${recipient}` in the email processor's success log with
  `redactPii(recipient)`.
- Unit-test the helper; assert the email line no longer logs the address.

## Files

- **Modify** `apps/api/src/forms/submissions/processors/log-sanitize.ts`
  — add `redactPii()`.
- **Modify** `apps/api/src/forms/submissions/processors/email.processor.ts:212`
  — `Confirmation sent to ${redactPii(recipient)} ...`.
- **Modify** `apps/api/src/forms/submissions/processors/log-sanitize.spec.ts`
  — tests for `redactPii` (string, null/undefined → `[hidden]`).
- **Modify** `apps/api/src/forms/submissions/processors/email.processor.spec.ts`
  — assert the success log contains `[hidden]` and not the recipient address.

## Verify

- `pnpm exec nx run api:test` — log-sanitize + email processor specs pass.
- `pnpm exec nx run-many -t build --exclude=landing` — compiles clean.
- Manual read of the changed log line: no submitter-supplied value remains.

## Open questions

- None outstanding. (Where logs are retained / CloudWatch lifetime — raised in
  the issue — affects *urgency* but not this change; out of scope here.)
