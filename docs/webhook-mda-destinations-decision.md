# Webhook destinations — approach & decision record

**Status:** accepted · **Issue:** [#1920](https://github.com/govtech-bb/gov-bb/issues/1920)
· **Diagram:** `docs/mda-webhook-destinations-workflow.svg`
· **Implementation plan:** tracked internally (not version-controlled)

A single reference for: what we're building, **why we are not using AWS Secrets
Manager**, and — if that decision were reversed — the concrete overhead we would
have to add. Self-contained; no other document required to follow it.

---

## 1. Problem

Some government forms sync each submission to an external **case-management
system (CMS)**. Every such form needs a **destination**: a URL and a secret
(sent as an `X-API-Key`). Two things must be true:

1. The right form reaches the right CMS with the right secret.
2. A misconfiguration is **loud** (retried, dead-lettered, visible) — never a
   silent failure to sync.

The earlier design gave **every form its own pair of environment variables**
(`WEBHOOK_URL_<FORM>` / `WEBHOOK_SECRET_<FORM>`). That does not scale: dozens of
variables, and **every change requires a redeploy**.

---

## 2. Chosen approach — per-MDA destinations, stored in the DB (encrypted)

### 2.1 Group forms by MDA
Route by **MDA** (ministry/department), not per form. All Youth-Opportunity
forms deliver to one CMS; all Ministry-of-Education forms to another. A form's
CMS destination is **the same MDA** as its notification-email contact
(confirmed one-to-one).

This reuses a link that **already exists** in the database. Today a form finds
its private notification email through:

```
formId ──unique──▶ form_config ──mdaContactId (FK)──▶ mda_contact
                    (per form, per env)                (shared MDA directory)
```

`mda_contact` is a shared directory row — **many forms point at one MDA**. That
is exactly "group forms per MDA," already modelled. We add the CMS destination
to that same row.

### 2.2 Store the destination in the database, secret encrypted
`mda_contact` gains two fields:

- `webhook_url` — the MDA's CMS endpoint (not secret).
- `webhook_secret_encrypted` — the secret, **encrypted at rest** with
  **AES-256-GCM** using a single application master key (`MDA_SECRET_KEY`,
  provisioned the way secrets already are: Secrets Manager → one env var).

One master key replaces every `WEBHOOK_SECRET_*` variable.

### 2.3 Resolve at dispatch
A mapped webhook resolves its destination by `formId`, mirroring the existing
email lookup:

```
resolveWebhookDestination(formId)
  → form_config (formId → mdaContactId)
  → mda_contact (webhook_url, webhook_secret_encrypted)
  → SecretCrypto.decrypt(secret, MDA_SECRET_KEY)
  → { url, secret }
  → buildMappedCasePayload → assertSafeUrl(url) → POST (X-API-Key: secret) → CMS
```

**Fail-loud:** a resolve miss or misconfig throws `WebhookConfigError`; a non-2xx
/ timeout / network error throws `WebhookDeliveryError`. Both route the entry to
**SQS retry → DLQ** (visible, redrivable) — never a silent no-sync.

The **DB read is uncached and always fresh** — `FormConfigService` deliberately
does *not* cache `mda_contact` (comment in code: "an MDA address can be
rotated"). A change is live on the very next submission.

### 2.4 Provisioning (who sets/rotates a destination)
For now, **engineers/ops** via a guarded command — no UI:

```bash
aws secretsmanager get-secret-value --secret-id youth/cms-key \
  --query SecretString --output text \
  | pnpm tsx scripts/mda-set-webhook.ts <mda-id> https://cms.example/api
```

The plaintext secret is **piped in via STDIN** (never on the command line, never
in shell history, never in git), encrypted, and written as ciphertext. A DB
write takes effect immediately — **no redeploy**. A self-service **admin UI
(with RBAC + change audit) is a deferred future phase** on the same storage path.

### 2.5 Why this shape
- **No env-var sprawl** — one master key vs. dozens of secret variables.
- **No redeploy to change/rotate** — a destination is data; the read is uncached.
- **No new runtime cloud dependency** — the app already reads env at boot only.
- **Single source of truth** — URL + secret + email all on one `mda_contact` row.
- **Consistent with existing patterns** — same DB-backed, per-environment,
  `formId`-resolved config already used for MDA email and DB processors (#716).

### 2.6 Delivery (three sessions)
- **A** — DB columns + `SecretCrypto` (AES-256-GCM) + `resolveWebhookDestination`.
- **B** — wire dispatch, migrate every CMS recipe off env vars, update the recipe
  lint, delete the legacy hardcoded youth-opportunity path (ships together).
- **C** — the provisioning command, deploy-time startup audit (`/health` flags an
  MDA with no destination), and docs/runbooks.

> ⚠️ **Before cutover:** confirm the MDA groupings and ensure every mapped form
> has a `form_config` row pointing at the correct MDA **in every environment** —
> fail-loud will DLQ a form whose MDA has no destination.

---

## 3. Why not AWS Secrets Manager

Storing each MDA's secret in AWS Secrets Manager (with the DB holding only a
reference/ARN) is a reasonable-sounding alternative. **In isolation Secrets
Manager is the better secret store** — managed KMS encryption, built-in
rotation, versioning, and CloudTrail access audit, none of which we then own.

It is **not** chosen because, for *this* use case, it works against the
requirements and adds surface the application does not currently have.

### 3.1 It undercuts the core requirement: instant, no-redeploy rotation
- The DB read is **uncached and instantly fresh** (see §2.3).
- Secrets Manager **cannot be read on every submission** — per-call cost plus
  account-level `GetSecretValue` rate limits force an in-memory **TTL cache**.
- A cache makes rotation **eventually-consistent**: a rotated secret is stale
  until the TTL expires or the task restarts. Restoring *instant* rotation means
  building cache invalidation — **more work than the crypto it would save.**

### 3.2 It doesn't actually replace the database
- The form → MDA **grouping still lives in the DB** (`form_config → mda_contact`).
  Secrets Manager can't hold it. So SM is **added alongside** the DB, not instead
  of it.
- That means **two sources of truth per MDA** (URL/contact in DB, secret in SM)
  that must stay in sync → **split-brain risk** if a row references a deleted,
  renamed, or rotated secret.
- The **URL is not secret**, so it either splits from the secret (two stores) or
  is pushed into SM unnecessarily.

### 3.3 It adds a runtime AWS surface the app doesn't have today
- The API makes **zero runtime AWS calls** now — secrets are baked into env at
  deploy. SM introduces an AWS SDK dependency, task **IAM** policy, a network
  path to the SM endpoint, and a **new failure mode in the dispatch path**
  (SM throttling/outage/latency) — cushioned but not removed by SQS retry.

### 3.4 Operational & governance friction
- **Local + CI** use no AWS; SM needs LocalStack or SDK mocking added to the
  Vitest suite, plus per-environment secret naming and per-environment IAM.
- The future "non-engineers edit destinations" implies **AWS console access** for
  them (or a service with `PutSecretValue`/`CreateSecret` — a broader blast
  radius than a DB write). Undesirable governance.

### 3.5 It doesn't win on the sprawl problem
- One SM secret per MDA == one encrypted DB row per MDA. Sprawl is solved either
  way — **not a differentiator.**

### 3.6 Summary trade-off

| | **DB + AES-GCM (chosen)** | **AWS Secrets Manager** |
|---|---|---|
| Instant, no-redeploy rotation | ✅ uncached read | ❌ eventual (cache TTL) |
| Sources of truth per MDA | ✅ one (DB row) | ❌ two (DB + SM) |
| Runtime AWS dependency | ✅ none | ❌ new (SDK + IAM + network) |
| Encryption code we own | AES-256-GCM helper | ✅ managed (KMS) |
| Automatic rotation | runbook we write | ✅ built-in |
| Access audit | we add logging | ✅ CloudTrail |
| Local / CI | ✅ simple (Postgres) | ❌ needs mocking |
| Env-var sprawl | ✅ solved | ✅ solved |

**Net:** SM saves us one AES-256-GCM helper and a rotation runbook, but costs
caching logic, IAM surface, split state, a runtime dependency, and CI mocking —
for managed rotation/audit we do not strictly require yet.

---

## 4. If we *did* go with Secrets Manager — the overhead to add

For completeness, the concrete work and ongoing cost a Secrets Manager approach
would introduce over the chosen DB approach:

**Build / code**
1. **AWS SDK integration** — add `@aws-sdk/client-secrets-manager`, a client, and
   a resolver that fetches a secret by name/ARN.
2. **Caching layer** — in-memory cache with TTL to stay under `GetSecretValue`
   rate limits and control cost; **plus cache invalidation** if instant rotation
   is still required.
3. **Reference storage** — a `webhook_secret_ref` (ARN/name) column on
   `mda_contact` anyway (the grouping stays in the DB), and a decision on where
   the non-secret `webhook_url` lives.
4. **Sync / integrity handling** — detect and surface a dangling reference
   (row points at a missing/rotated secret) so it fails loud rather than confusing.
5. **Error/retry handling** for SM being unreachable/throttled in the dispatch
   path (on top of the existing SQS retry).

**Infrastructure / IAM**
6. **Task IAM policy** granting `secretsmanager:GetSecretValue` (read) — and for
   any admin/write path, `PutSecretValue` / `CreateSecret` (broader blast radius).
7. **Network path** to the Secrets Manager endpoint (VPC interface endpoint or
   NAT egress) from the API's runtime environment.
8. **Per-environment secret naming convention** and separate IAM per env
   (sandbox / staging / prod).
9. **KMS key** governance for the secrets (default or CMK), and rotation policy.

**Testing / local dev**
10. **LocalStack or SDK mocking** wired into the Vitest suite and local dev, since
    nothing touches AWS at test time today.

**Operations**
11. **Cost tracking** — ~$0.40/secret/month + per-call charges; monitor call
    volume against rate limits.
12. **Console/governance controls** for who can view/edit secrets in the AWS
    console per environment.

By contrast, the chosen DB approach adds: **one AES-256-GCM helper (+ tests), two
DB columns (one migration), one resolver method, one `MDA_SECRET_KEY` env var,
and a master-key rotation runbook.**

---

## 5. When to revisit

Reconsider Secrets Manager (or, better, **KMS envelope encryption** — a managed
key with the secret still in our DB, avoiding a second source of truth) if:

- compliance later **mandates** managed rotation or CloudTrail-level access audit
  on these secrets, or
- the platform adopts **runtime AWS access** for other reasons, making the new
  dependency free at the margin.

KMS envelope encryption is already listed as a deferred option in the
implementation plan and is the natural middle ground.
