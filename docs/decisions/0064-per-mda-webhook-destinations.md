# 0064 — Per-MDA webhook destinations in one Secrets Manager JSON

**Date:** 2026-07-22
**Status:** Accepted
**Issues:** #1920, #2020 (supersedes the per-form env approach of #1970 and the
DB + AES-256-GCM approach that briefly replaced it)

## Context

Some forms sync each submission to an external case-management system (CMS).
Every such form needs a **destination** — a URL and an `X-API-Key` secret — and a
misconfiguration must **fail loud** (retry → DLQ), never silently not-sync.

The real cardinality is **per-MDA, not per-form**: a webhook destination is one
CMS per Ministry/Department/Agency, and many forms deliver to the same MDA. Two
earlier approaches were tried and set aside:

- **Per-form env pairs** (`WEBHOOK_URL_<FORM>` / `WEBHOOK_SECRET_<FORM>`, #1970) —
  dozens of vars, ~34 of them duplicate values, plus a token-pairing lint needed
  only because two independent vars could be cross-wired. It also shipped the
  recipe half and the feature/lint half in separate PRs, which broke the trunk
  and was reverted (#2017–#2019).
- **DB column + app-owned AES-256-GCM** — stored `webhook_url` +
  `webhook_secret_encrypted` on `mda_contact`. Its one real edge was instant,
  no-redeploy rotation, but it made us own encryption code and a master-key
  rotation runbook and kept secret material in an application table.

A form's CMS destination is the **same MDA** as its notification-email contact
(confirmed one-to-one), so the grouping already exists in the DB:
`form_config.mdaContactId → mda_contact`.

## Decision

Store **all** per-MDA destinations in a **single AWS Secrets Manager secret** — a
JSON object keyed by ministry — delivered to the API as one env var
(`MDA_WEBHOOK_DESTINATIONS`) via the ECS task-def `secrets` block, i.e. injected
into `process.env` at **container start** (the same mechanism every other API
secret already uses; **no runtime AWS call**).

```json
{ "youth": { "url": "https://…", "secret": "…" }, "education": { "url": "…", "secret": "…" } }
```

- **Grouping stays in the DB.** A new nullable `mda_contact.ministry_key` ties an
  MDA to its destination. Resolution:
  `formId → form_config → mda_contact.ministry_key → MDA_WEBHOOK_DESTINATIONS[key] → { url, secret }`.
- **Recipes carry only a `mapping`** for a case-management webhook — no `url`,
  `endpoint`, or `auth`. The destination is never in git.
- **Fail loud.** A resolve miss (unmapped MDA, or a ministry key with no JSON
  entry) throws `WebhookConfigError` → SQS retry → DLQ. A non-2xx/timeout is a
  transient delivery failure, also DLQ'd. The SSRF guard still validates the
  resolved URL.
- **Guardrails.** A CI recipe lint (`scripts/webhook-recipe-guards.ts`, via
  `pnpm validate-recipes`) enforces the mapping-only convention and validates
  applicant paths; a boot-time audit logs, and `GET /monitoring/webhook-destinations`
  surfaces, any ministry a form points at that has no JSON entry.

## Consequences

- **No env-var sprawl** — one JSON secret + one env var replace dozens of pairs;
  the token-pairing lint is gone.
- **Managed encryption/audit** — KMS at rest, versioning, CloudTrail — none of
  which we own or maintain; no application crypto or master-key runbook.
- **Rotation requires a redeploy** — task-def secrets freeze at container start.
  Accepted: destinations change rarely and the deploy fan-out is routine. If
  zero-deploy rotation is later required, read the same JSON through the
  `aws-secrets` runtime-fetch pattern (TTL cache) — a localized change.
- **Two systems cooperate** — the DB ministry key must line up with a JSON entry.
  The boot audit + monitoring endpoint exist to catch a gap at deploy.
- **Cutover is provision-first** — seed each mapped form's `form_config`
  ministry key and populate `MDA_WEBHOOK_DESTINATIONS` per environment *before*
  the recipes ship, or fail-loud will DLQ those submissions.

## Alternatives rejected

- **Per-form env pairs** — sprawl; needs a redeploy per new form; cross-wiring risk.
- **DB column + AES-256-GCM** — we'd own crypto + a master-key rotation runbook,
  and keep credentials in an app table; its only edge (instant rotation) didn't
  justify that.
- **Runtime AWS Secrets Manager** (DB holds only a reference) — a new runtime AWS
  dependency (SDK + IAM + network), a TTL cache that makes rotation
  eventually-consistent, and two sources of truth per MDA. Rejected.

## References

- Operations runbook: [`docs/webhook-destinations.md`](../webhook-destinations.md)
- Flow diagram: `docs/mda-webhook-destinations-workflow.svg`
- Resolver: `apps/api/src/forms/webhook-destinations/`
- Processor: `apps/api/src/forms/submissions/processors/webhook.processor.ts`
