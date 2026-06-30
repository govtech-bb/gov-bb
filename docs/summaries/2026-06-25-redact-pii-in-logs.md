# Redact PII before it reaches application logs

**Issue:** [#1640](https://github.com/govtech-bb/gov-bb/issues/1640) — Personal
data (recipient email) written to application logs in plain text.

## What changed

`redactPii()` was added to `log-sanitize.ts` and applied to the one confirmed
leak: the email processor's "Confirmation sent to …" log line, which previously
wrote the citizen's recipient address verbatim. Emails now log as
`j***@example.com`; non-email values fall back to `[hidden]`.

## Why it looks the way it does

**Scope is one line, not a sweep.** An audit of every log call in the
submissions subsystem found the email processor was the only real PII leak. The
webhook, opencrvs, and payment processors and the dispatch listener already
follow "log IDs, never the body" (webhook even documents it). So no broader
defensive mechanism was applied — only the confirmed line changed.

**Explicit-wrap, not pattern detection.** `redactPii(value)` relies on the
caller knowing the value is PII, rather than scanning a string for things that
look like emails/phones. Regex PII-detection is leaky and — decisively — cannot
recognise a person's *name* at all, so it could not honour the "cover all PII"
requirement. The caller-decides design covers every PII type.

**Masking format changed mid-session.** The original implementation returned a
fully-opaque `[hidden]` for everything. The requirement was then revised to
partial email masking (`j***@gmail.com`) so support can recognise an address
during debugging. Partial masking is inherently email-shaped, so the helper now
masks emails (first char + fixed `***` + domain — fixed `***` so local-part
length doesn't leak) and still fully redacts anything that isn't a well-formed
email. The trade-off, accepted explicitly: the email **domain** stays visible
in logs — a smaller exposure than the full address.

The principle this establishes is recorded in
[ADR 0058](../decisions/0058-personal-data-is-masked-before-logging.md).

## Tests

`redactPii` unit tests (email masking, local-part length non-leak, non-email
fallback, malformed addresses, null/undefined) plus an email-processor spec
asserting the confirmation log shows `j***@example.com` and never the full
address. Both specs pass (60/60); `api:build` clean.
