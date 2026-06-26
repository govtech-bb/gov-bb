# 0058 — Personal data is masked before logging

## Context

Application logs are more widely accessible and longer retained than the
submissions database, so any personal data written to a log line is exposed to
a larger audience for longer than the data warrants. A security audit
(issue #1640) found the email processor logging a citizen's recipient address
verbatim. A `sanitizeForLog()` helper already existed, but it only defends
against log injection (strips control characters) and bounds length — it does
not redact personal data.

## Decision

Personal data (email, name, phone, or any value tied to a real person) must
never be written to application logs in the clear. Any PII value that goes into
a log line is routed through `redactPii()`
(`apps/api/src/forms/submissions/processors/log-sanitize.ts`) first:

- An **email** is masked to its first character plus its domain
  (`jane@gmail.com` → `j***@gmail.com`). The masked middle is a fixed `***`, so
  the local-part length does not leak. This leaves an operator a recognisable
  handle for support/debugging without recording the address in full.
- **Any other value** — a name, a phone number, or a malformed/empty address
  with no safe partial form — is fully redacted to `[hidden]`.

The caller decides what is PII; this is an explicit-wrap helper, not a
pattern detector (regex PII-detection is leaky and cannot recognise names at
all). For correlation, log the submission ID — which carries no personal data —
and look the real value up in the database when a case genuinely needs it.

## Consequences

- New log sites that include a personal value must wrap it in `redactPii()`.
  Reviewers should treat a raw PII value in a log line as a defect.
- Logs retain enough of an email (first char + domain) to aid support without
  exposing the full address; they retain nothing of other PII types.
- The masking deliberately keeps the email domain visible. This is an accepted,
  smaller exposure than the full address — chosen so operators can still
  recognise an address during debugging.
