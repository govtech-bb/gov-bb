# Security Hardening Plan

**Status:** Draft
**Date:** 2026-05-20
**Owner:** TBD

## Goal

Harden the modular-forms platform against the realistic threats a public anonymous-submission gov service faces: abusive request volume, automated form spam, malicious file uploads, header-based browser attacks, and accidental secret exposure. Deliver defense in depth across application code and AWS edge infrastructure.

## Non-goals

- **Authentication.** No JWT/SSO/staff auth in this round. The Swagger Bearer scaffolding in `apps/api/src/main.ts` stays as scaffolding. Tracked separately.
- **CSRF.** API is currently same-origin via CORS allow-list with no cookie-based auth, so no CSRF tokens needed. Revisit if/when session auth lands.
- **Penetration test.** Internal hardening only — external pen test is a separate engagement.

## Approach

Two-track delivery. Both tracks are required to meet the acceptance criteria.

- **Track A — In-repo code.** Ships in one or more PRs against this monorepo. Code-reviewable, testable, deployable through the existing Amplify + Fargate pipelines.
- **Track B — AWS-edge runbook.** Markdown doc under `docs/runbooks/aws-security.md` enumerating exactly which AWS controls to enable, in which account, with which IAM scope. We have no IaC in the repo today; adopting Terraform/CDK is out of scope for this plan but flagged as a follow-up.

**Alternatives considered:**

- *AWS-edge only.* Rejected — app needs CSP headers, body limits, MIME validation, and Turnstile verification regardless of what edge does. WAF can't see decrypted application logic.
- *Code-only.* Rejected — DDoS at L3/L4 has to be absorbed at the edge; the Fargate task can't survive a volumetric attack. AWS Shield Standard + WAF rate-based rules are doing real work here.
- *Adopt IaC in this plan.* Rejected as scope creep. Captured as a follow-up so the runbook doesn't stay manual forever.

## Scope — Track A (in-repo code)

### A1. Tightened rate limiting

Replace the single global throttler bucket (10 req/min) with per-route policy aligned to traffic shape.

- Apply `@SkipThrottle()` to `/health`.
- Keep a generous default for read-only routes (form definitions: ~120/min/IP — these are cacheable and high-frequency during form load).
- Tighter bucket for draft writes (~30/min/IP).
- Strictest bucket for submission create (~10/min/IP, with a per-IP burst cap of 3 in 10s).
- Use `ThrottlerStorageRedisService` only if Redis is already provisioned; otherwise stay on in-memory and document that horizontal scaling requires shared storage.

### A2. Security headers (`helmet`)

Add `helmet` to the NestJS bootstrap. Verify it doesn't conflict with Swagger UI at `/api-docs` (it doesn't, by default, but check after install).

### A3. Client-side CSP and security headers (web)

- Add a strict `Content-Security-Policy` via Vite's HTML transform or a `_headers` file consumed by Amplify.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` (or `frame-ancestors 'none'` in CSP).
- Allow-list Turnstile's script + frame origins in CSP.

### A4. Body and file size limits

- Set the global JSON body limit to 256 KB (submissions are small — files travel via S3 presign, not JSON).
- Reject any request larger than the limit at the framework layer, not at the handler.
- File size + MIME allow-list already enforced in `submission-pipeline.integration.spec.ts` validation logic — extend with: max-files-per-field, max-total-upload-bytes per submission.

### A5. Presigned S3 uploads

Files don't currently persist server-side (see [session-storage.ts:3](apps/web/src/lib/session-storage.ts:3) — File/Blob stripped before save). Introduce the upload pipeline.

- New endpoint `POST /uploads/presign` — accepts `{ formId, fieldName, filename, contentType, sizeBytes }`, validates against the form definition's `fileTypes` and `itemMaxSize`, returns a presigned `PUT` URL scoped to a single `uploads/{submissionDraftId}/{uuid}/{filename}` key with a 15-minute expiry.
- Web `file-upload.tsx` swaps the in-memory File for a direct `PUT` to S3, then stores the returned S3 key in form state.
- Submission payload references files by S3 key, not by base64 or multipart.
- Server validates that referenced keys are: under the expected prefix, owned by the right draft, and within the size budget (use `HeadObject` to verify size matches the presign claim).

### A6. Cloudflare Turnstile verification

- Front-end: add Turnstile widget to the final review/submit step. Token stored in form state.
- Submission create endpoint reads token from a header (`X-Turnstile-Token`) and calls Turnstile siteverify with the secret. Reject on failure.
- Local dev bypass via env flag (`TURNSTILE_VERIFY=false`), matching the existing `EZPAY_WEBHOOK_VERIFY_SIGNATURE` pattern.

### A7. Secrets via AWS Secrets Manager

- New `apps/api/src/config/secrets.provider.ts` that loads on boot from Secrets Manager when `SECRETS_BACKEND=aws`, falls back to env vars when `SECRETS_BACKEND=env` (local default).
- Migrate: `DB_PASSWORD`, `EZPAY_DEPARTMENT_API_KEYS`, `EZPAY_WEBHOOK_SECRET`, `TURNSTILE_SECRET_KEY`, `AWS_SES_*` (if any), and any new secrets introduced here.
- `apps/api/src/config/env.validation.ts` (or add it if missing) — Zod schema validating all required env at boot, fail fast with a clear error.

### A8. Gitleaks pre-commit

`.gitleaks.toml` exists but isn't enforced on commit. Add a `.husky/pre-commit` hook running `gitleaks protect --staged`. Document the bypass for false positives (`--no-verify` is a manual choice with reviewer accountability).

### A9. CORS audit

`apps/api/src/main.ts:23` already uses an allow-list. Add: explicit production hostname check in `env.validation.ts` — `CORS_ORIGIN` must not be `*` or contain `localhost` when `NODE_ENV=production`. Fail-closed.

## Scope — Track B (AWS-edge runbook)

A single new doc: `docs/runbooks/aws-security.md`. For each control: what it does, where to configure it, how to verify it's on, who owns it.

- **AWS WAF on the Amplify-fronting CloudFront distribution and on the API ALB:**
  - AWSManagedRulesCommonRuleSet (CRS, all paranoia level 1 rules)
  - AWSManagedRulesKnownBadInputsRuleSet
  - AWSManagedRulesAnonymousIpList
  - AWSManagedRulesAmazonIpReputationList
  - Rate-based rule: 2000 req/5min/IP, block action
- **AWS Shield Standard** — auto-on with CloudFront + ALB. Verify in the Shield console.
- **Secrets Manager** — secret naming convention `modular-forms/<env>/<key>`, KMS CMK with rotation, IAM policy granting `secretsmanager:GetSecretValue` to the Fargate task role only.
- **S3 uploads bucket** — name, region, block-public-access on, SSE-KMS, lifecycle: delete `uploads/` objects older than 24h that aren't referenced by a finalized submission (run a daily Lambda or use an S3 inventory + custom job; pick the lighter option after a spike).
- **GuardDuty Malware Protection for S3** — enabled on the uploads bucket. Quarantines infected objects, surfaces findings in Security Hub.
- **CloudWatch alarms** — 4xx spike, 5xx spike, WAF block-rate spike, Fargate task crash loop. Route to existing on-call channel (capture channel in runbook).
- **Per-environment Turnstile keys** — site key + secret key stored in Secrets Manager.

## Files (Track A only — Track B is one new markdown doc)

**New:**
- `apps/api/src/uploads/uploads.module.ts`, `uploads.controller.ts`, `uploads.service.ts`
- `apps/api/src/config/secrets.provider.ts`
- `apps/api/src/config/env.validation.ts`
- `apps/api/src/common/turnstile.guard.ts`
- `apps/web/src/lib/turnstile.ts`
- `.husky/pre-commit`
- `docs/runbooks/aws-security.md`

**Modified:**
- `apps/api/src/main.ts` — add `helmet`, refine bootstrap
- `apps/api/src/app.module.ts` — replace single throttler bucket with named buckets
- `apps/api/src/forms/submissions/submissions.controller.ts` — apply submission-specific throttle, attach Turnstile guard
- `apps/api/src/forms/form-drafts/form-drafts.controller.ts` — apply draft-write throttle
- `apps/api/src/forms/form-definitions/form-definitions.controller.ts` — apply read-throttle + `@SkipThrottle` on relevant endpoints
- `apps/api/src/forms/submissions/submissions.service.ts` — validate referenced S3 keys
- `apps/api/src/payments/payments.module.ts` — switch EzPay keys to secrets provider
- `apps/web/src/components/file-upload.tsx` — presign + direct PUT
- `apps/web/src/components/review.tsx` (or final-step component) — render Turnstile widget
- `apps/web/vite.config.ts` or `apps/web/index.html` or new `public/_headers` — CSP + security headers
- `apps/api/.env.example`, `apps/web/.env.example` — add `TURNSTILE_*`, `SECRETS_BACKEND`, `S3_UPLOADS_BUCKET`
- `README.md` — fix the stale "Next.js port 4200" line while we're here

## Verify

- **Unit tests** for: `secrets.provider` (env fallback path), `turnstile.guard` (mocked siteverify), `uploads.controller` (presign generation, MIME + size rejection, draft-ownership check).
- **Integration test** extending `submission-pipeline.integration.spec.ts` to cover: submission with valid S3-key file reference; submission with mismatched size; submission with missing Turnstile token.
- **Playwright e2e** for the new upload flow: select file → presign call → PUT to mocked S3 (msw or a local server) → submission references key → success.
- **Manual verification**:
  - `curl` an oversized body — confirm framework-level 413.
  - Hit submission endpoint without Turnstile token — confirm 403.
  - Inspect prod headers with `curl -I` — confirm CSP, HSTS, X-Content-Type-Options present.
  - Boot API with `SECRETS_BACKEND=aws` against a test secret — confirm load succeeds, mis-named secret fails closed.
- **Runbook walkthrough** with whoever has AWS console access — confirm every WAF rule and Secrets Manager entry exists in dev before promoting to prod.
- **Gitleaks** — make a test commit with a fake AWS key — confirm pre-commit blocks it.

## Open questions

1. **Redis available?** If yes, throttler can use shared storage and horizontal scaling works correctly. If no, the per-IP buckets are per-task, which softens limits under multi-task deployments. Need to confirm with whoever owns the Fargate setup.
2. **Existing AWS account structure.** Is there already a dev/staging/prod split with separate Secrets Manager namespaces? Affects the secret naming convention in the runbook.
3. **Turnstile account ownership.** Who creates the Cloudflare account and owns the site/secret keys? (Not a blocker — placeholder env vars work locally until provisioned.)
4. **Logging & retention for security events.** Out of scope here, but worth flagging — WAF logs need a destination (S3 + Athena, or CloudWatch Logs) before we can audit attempts post-incident.

## Sequencing

Recommended PR order:
1. **PR 1:** A1 (throttler tuning) + A2 (helmet) + A3 (CSP/headers) + A9 (CORS hardening) + A8 (gitleaks hook). Low-risk, no infra dependencies. Ship first.
2. **PR 2:** A7 (Secrets Manager). Requires Secrets Manager set up first (Track B step).
3. **PR 3:** A5 (presigned S3 uploads). Requires S3 bucket set up first (Track B step). Largest single change.
4. **PR 4:** A6 (Turnstile). Requires Turnstile account.
5. **PR 5:** A4 (body/file size limits enforcement tightening).
6. **Track B** doc lands alongside or just before PR 1, so the AWS-side prerequisites can be provisioned in parallel.

## Follow-ups (out of scope)

- Adopt IaC (Terraform or CDK) so the runbook becomes code.
- Staff authentication (JWT/SSO) — see Swagger Bearer scaffolding.
- External penetration test.
- WAF custom rules tuned from real attack telemetry post-launch.
