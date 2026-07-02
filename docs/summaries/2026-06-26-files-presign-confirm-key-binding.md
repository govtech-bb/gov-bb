# Bind presign↔confirm on /files endpoints

**Issue:** [#284](https://github.com/govtech-bb/gov-bb/issues/284) — area:backend,
security, severity:minor, subsystem:api.

## What changed

Closed the `TODO(security)` presign↔confirm binding gap. `buildKey` now embeds
`(formId, stepId, fieldId)` in the S3 key prefix
(`uploads/<formId>/<stepId>/<fieldId>/<yyyy>/<mm>/<uuid>-<name>`), and
`confirmUpload` parses that tuple back out and rejects a confirm whose field
differs from the key — so a caller can no longer presign a lenient field and
confirm under a stricter one to dodge its content-type/size policy. `fieldId`
gained a path-safe `@Matches` on both upload DTOs. Decision recorded in
[ADR 0061](../decisions/0061-anonymous-uploads-bind-via-self-describing-key-not-auth.md).

## Why it looks the way it does

**No auth guard — anonymous by design.** The issue title says "unauthenticated,"
but the maintainer's re-verification comment (and the downgrade to minor) is
decisive: these are public citizen uploads with no login, already recipe-gated +
content/size-checked + rate-limited + lifecycle-expired. Adding an auth guard
would break the public flow and isn't what closes the gap. So the fix binds
*without* identity.

**Self-describing key over a signed token.** The authorizing context is encoded
into the key itself and verified at confirm. A caller can only `HeadObject`-confirm
a key they actually presigned, so the embedded tuple is authoritative — no
secret, no token plumbing, stateless. A signed-token alternative was considered
and rejected as more moving parts for the same guarantee.

**Binding implemented as assert-equality, not a rewire.** Confirm parses the key
tuple and asserts it equals the client-supplied tuple, then resolves the field
policy from the (now provably matching) client tuple as before. The assertion
*is* the binding; this keeps `resolveFileField` untouched.

**Backward-compatible rollout.** A key presigned by old code and confirmed by new
code across a deploy would lack the tuple. The confirm `KEY_PATTERN` makes the
`stepId/fieldId` segments optional, and `parseKeyTuple` returns `null` for such
legacy keys → the binding check is skipped and behaviour falls back to the prior
client-supplied path. The window closes as short-lived presign URLs expire.

**Path-safety became load-bearing.** Embedding `fieldId` in a path makes it a
security surface — without a constraint, `../` could escape the prefix. `stepId`
was already a slug; `fieldId` now matches `/^[A-Za-z0-9_-]+$/` (covers the
camelCase recipe field ids like `policeCertificate`) on both DTOs.

**Consumers audited.** `email.processor` checks `startsWith("uploads/<formId>/")`
(still matches the longer key); filename extraction uses `.split("/").pop()` (last
segment). Both unaffected by the extra path segments.

## Tests

`files.service.spec` gains a binding block (matching tuple confirms; mismatched
tuple rejected with "Upload key does not match the confirmed field"; legacy
tuple-less key still confirms), and the presign key assertion checks the embedded
tuple. New `confirm-upload.dto.spec` covers the key pattern (new + legacy + a
traversal key rejected) and `fieldId` path-safety. Service+DTO specs pass (37);
full `api:test` 936 passed (only the pre-existing no-Postgres DB-migration smoke
tests fail); `api:build` clean.

## Follow-up

Submission-binding (tie an upload to a real submission/session id, to curb
anonymous storage abuse) is a separate, lower-priority issue — out of scope here.
