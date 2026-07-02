# 0061 — Anonymous uploads bind presign↔confirm via a self-describing key, not auth

## Context

The file-upload endpoints (`POST /files/presign-upload`, `POST /files/confirm-upload`)
are **anonymous by design**: public citizens upload supporting documents during a
form submission, with no login. A 2026 security audit (#284) initially read the
missing auth guard as critical, but re-verification found the endpoints are
recipe-gated (the field must resolve to a real published `htmlType: "file"`
field), content-type/size-checked, key-prefixed, rate-limited, and on a 7-day
lifecycle — anonymous, but not wide open. Severity was downgraded to minor.

The genuine residual was a `TODO(security)`: the `(formId, stepId, fieldId)` the
client sends at **confirm** was not bound to the S3 key issued at **presign**, so
a caller could presign under a lenient field and confirm under a stricter one to
dodge its content-type/size policy. The TODO assumed the fix would wait for real
auth (#11).

## Decision

These endpoints **stay anonymous** — do **not** add an auth guard. A guard would
break public citizen uploads, and identity is not what closes the gap.

Integrity is enforced by making the **object key self-describing**: `buildKey`
embeds the authorizing context in the prefix —
`uploads/<formId>/<stepId>/<fieldId>/<yyyy>/<mm>/<uuid>-<name>` — and
`confirmUpload` parses that tuple back out and **rejects** a request whose
`(formId, stepId, fieldId)` does not match the key. A caller can only confirm a
key they actually presigned (the object must exist), so the embedded tuple is
authoritative. This is preferred over a signed presign token (same guarantee,
more moving parts: HMAC, secret, token plumbing).

Any user-supplied value placed into a storage key **must be path-constrained**.
`stepId` is a slug; `fieldId` now carries a path-safe `@Matches(/^[A-Za-z0-9_-]+$/)`
on both DTOs so it cannot inject `/` or `..` into the key.

## Consequences

- Future work on file uploads must not "fix" this by adding an auth guard — that
  contradicts the anonymous-by-design contract. Bind via the key instead.
- New values embedded in an object key require a path-safe validator first.
- Key-parsing consumers must tolerate the prefix shape. Today's consumers are
  safe (`email.processor` matches `startsWith("uploads/<formId>/")`; filename
  extraction takes the last `/` segment). The confirm key validator accepts the
  optional tuple segments so keys presigned before the change still validate
  during rollout; legacy tuple-less keys fall back to the prior behaviour.
- Submission-binding (tying an upload to a real submission/session id, to curb
  anonymous storage abuse) remains an open, lower-priority follow-up — out of
  scope for #284.
