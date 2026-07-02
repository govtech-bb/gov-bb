# SSRF guard on the webhook processor URL (#287)

## Context

`WebhookProcessor.process` read `cfg["url"]` straight from the stored recipe and
called `fetch(url, ...)` with no destination checks; the recipe schema validated
the url with only `z.string().url()` (syntactic, no scheme/host rules). A recipe
with `"url": "http://169.254.169.254/latest/meta-data/iam/security-credentials/<role>"`
would make the API fetch its own task-role credentials and forward them — classic
SSRF. Pre-existing on `sandbox`; surfaced by a May 2026 backend audit. Worked
from `docs/plans/287-webhook-ssrf-guard.md`.

## What we did

- Added `apps/.../processors/url-safety.ts`:
  - `assertSafeUrl(url)` — require `https:`; for an IP literal check it directly,
    otherwise resolve the host (`dns.lookup({ all: true })`) and reject if **any**
    resolved address is internal. Throws `UnsafeUrlError`.
  - `isInternalIp(ip)` — blocks IPv4 `0/8, 10/8, 127/8, 169.254/16, 172.16/12,
    192.168/16, 100.64/10` and IPv6 `::, ::1, fc00::/7, fe80::/10`, plus
    IPv4-mapped `::ffff:a.b.c.d` (so `::ffff:169.254.169.254` is caught).
- Wired `await assertSafeUrl(url)` into `WebhookProcessor.process` immediately
  after the url is read and before `fetch` — a violation throws, so the entry
  fails loudly rather than driving an internal request.
- Tests: a standalone `url-safety.spec.ts` (DNS mocked) covering the literal,
  resolved, mixed, https, and unresolvable cases; webhook processor tests for the
  metadata-IP / non-https / private-resolving-host reject paths (each asserts
  `fetch` is never called); existing webhook tests kept green by mocking DNS to a
  public IP.

## Why we did it that way (decisions taken in planning)

- **Denylist + DNS resolution** over an allowlist — chosen for flexibility (any
  public partner host) while still blocking internal targets. (Allowlist is
  stronger but blocks ad-hoc webhooks and needs upkeep.)
- **No connection pinning** — resolve-and-validate then `fetch(url)` normally; no
  new dependency. Accepted residual: a fast-flipping DNS-rebinding attacker could
  still bypass it (our lookup vs fetch's own lookup). Documented in the guard's
  doc comment; closing it fully needs a pinned `undici` dispatcher.
- **Hand-rolled IP checks** with `node:net` — no IP-range library was present and
  the range set is small and well-defined; covered by tests.
- **Webhook only** — `opencrvs.processor.ts` has the identical
  `fetch(cfg["endpoint"])` pattern and is the obvious next adopter, but is out of
  scope for #287. Flagged as a follow-up.
- **Runtime guard, not schema** — schema-level `https`/host enforcement and the
  anonymous-publish gap are separate companion issues; the runtime check is the
  defense-in-depth #287 asks for.

## Verification

- `url-safety.spec.ts` + `webhook.processor.spec.ts`: 49 passed (incl. the exact
  audit attack rejected with zero `fetch`).
- `api:build` compiles clean.

## Follow-ups

- Apply the same guard to `opencrvs.processor.ts` (same SSRF pattern).
- Optional: pin the connection to the validated IP (undici dispatcher) to close
  the DNS-rebinding residual, if the threat model warrants it.
