# Remove dead feature flags / config (DEAD-04, #1412)

## Context

Issue #1412 (DEAD-04) flagged two config values baked into bundles but read by
zero source: `SKIP_CONTINUE_VALIDATION` (forms) and `FORMS_URL` (chat). The plan
([docs/plans/1412-remove-dead-feature-flags.md]) decided to remove both rather
than wire them up.

## What we did

- Removed the `SKIP_CONTINUE_VALIDATION` define from `apps/forms/vite.config.ts`
  and the entries in `apps/forms/.env` (local, gitignored) and `.env.example`.
- Removed the `process.env.FORMS_URL` define from `apps/chat/vite.config.ts`.
- Corrected four stale `FORMS_URL` references in `apps/chat/SPEC.md`.
- Filed #1504 for ADR-0005 drift discovered along the way (see below).

## Why we did it that way

- **`SKIP_CONTINUE_VALIDATION` was a regression of [ADR 0005].** That ADR
  (2026-05-21) already removed this exact flag and established that forms browser
  code reads config via `import.meta.env`, never a `process.env` define block —
  it named `SKIP_CONTINUE_VALIDATION` as the dangerous example (a `.env.example`
  default that silently bypassed step validation). The flag later crept back into
  `vite.config.ts` and `.env.example` as truly-dead residue (no `src` reads it),
  which is what DEAD-04 caught. Removing it reinforces ADR 0005 rather than
  introducing anything new — so no new decision record was warranted.

- **`FORMS_URL` was never actually used, and the spec lied about it.** The plan
  verified zero reads; the spec claimed it was a *required, Zod-validated, baked*
  env var for handoff links. In reality `apps/chat/src/config/env.ts` never
  validated it, and handoff URLs are built from the retrieved RAG source's own
  URL (`<source url>/start`, `lib/forms/handoff.ts:22`) — never `FORMS_URL`. We
  corrected SPEC.md (lines 91, 193, 357, 372) so the docs match the code. This
  was outside the plan's literal scope but kept the change self-consistent —
  deleting the bundle entry while leaving the spec calling it "required" would be
  contradictory. Decision confirmed with the user mid-session.

- **Did NOT expand to fix the remaining ADR-0005 violation.** Removing the dead
  flag left `apps/forms/vite.config.ts` still carrying a `process.env` define
  block with two entries: `VITE_API_URL` (redundant — src already reads
  `import.meta.env.VITE_API_URL`) and `VITE_PAYMENT_ALLOWED_ORIGINS`
  (load-bearing — `lib/security/safe-payment-url.ts` reads it off `process.env`).
  Fully complying with ADR 0005 means converting that security module to
  `import.meta.env` and dropping the block — real work touching a
  security-relevant path and its tests, beyond #1412's scope. Filed as #1504
  instead of widening this PR.

## Open questions

None. The ADR-0005 cleanup is tracked in #1504.
