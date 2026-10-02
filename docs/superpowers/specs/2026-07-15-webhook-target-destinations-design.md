# Webhook destinations by `target` (per-MDA), not per-form

**Status:** design only — sequencing (revise #1970 now vs Session-2 follow-up) deferred.
**Relates to:** #1920. Builds on PR #1970 (fail-loud + per-form env pairs).

## Problem

PR #1970 resolves a form's outbound case-management webhook from a **matched
pair of per-form env vars**, named explicitly in the recipe:

```jsonc
"config": {
  "endpoint": { "env": "WEBHOOK_URL_SCIENCE_CAMP" },
  "auth": { "scheme": "apiKey", "header": "X-API-Key", "secretEnv": "WEBHOOK_SECRET_SCIENCE_CAMP" }
}
```

This does not match the real cardinality. A webhook destination is **one
case-management system per MDA** (Ministry/Department/Agency), and **one MDA has
exactly one URL** (confirmed during design). Many forms deliver to the same MDA.
Under the per-form convention the follow-up migration of the ~18
youth-opportunity forms — all of which target a *single* destination today
(the shared `WEBHOOK_URL`/`WEBHOOK_SECRET`) — would create **~36 env vars, most
pointing at the same value**. The PR doc concedes this ("point their distinct
vars at the same value"), which means the same secret is duplicated across N
vars and must be rotated in N places in lockstep.

Two structural costs follow:

1. **Recipe names two env vars that must stay in sync.** #1970 adds a CI lint
   whose whole job is to enforce that the URL token equals the secret token
   (blocking a cross-wired secret). That check exists only because the recipe
   can express the two independently.
2. **The credential's natural unit is wrong.** These are *outbound* API keys —
   the platform authenticating itself to a downstream MDA system (see
   "Not multi-tenant auth" below). The natural key for such a credential is the
   downstream system (the MDA), not the form.

## Model: `config.target`

A recipe declares a single destination token; the processor derives the env-var
pair by convention (no code-side registry):

```jsonc
{
  "type": "webhook",
  "config": {
    "target": "MINOFYOUTH",
    "mapping": {
      "programmeCode": "BYAC",          // per-form — identifies the programme in the payload
      "codeService": "BYAC",            // per-form — tracking-code prefix
      "applicant": { /* stepId.fieldId paths */ }
    }
  }
}
```

Resolution (reusing the pure helpers PR #1970 already ships in
`packages/form-types/src/webhook-env.ts`):

- URL  ← `webhookUrlEnv(target)`  → `WEBHOOK_URL_MINOFYOUTH`
- Secret ← `webhookSecretEnv(target)` → `WEBHOOK_SECRET_MINOFYOUTH`, sent as the
  `X-API-Key` header (the CM convention — fixed, not recipe-configurable).

`target` matches `^[A-Z0-9]+(?:_[A-Z0-9]+)*$` (the existing `TOKEN_PATTERN`).

`programmeCode` and `codeService` stay in `mapping` and remain **per-form** —
they are orthogonal to *where* the submission is delivered. Only the destination
collapses to per-MDA.

### Why this is the right primitive

- **One credential, one place.** The 18 youth-opportunity forms → `target:
  "MINOFYOUTH"` → **2 vars total**. Rotating the MDA's key touches one secret;
  every form follows.
- **The cross-wiring lint disappears.** One token derives both vars, so pairing
  one destination's URL with another's secret is structurally impossible — the
  #1970 token-match check is deleted, not ported.
- **The "mapper" is the naming convention**, not a maintained map. No registry
  to keep in sync (contrast the existing `FORM_ID_SERVICE_CODES`).

## Approach A (chosen): `target` replaces `endpoint`+`auth` for CM dispatch

`target` becomes the one canonical way to declare a case-management destination.
`endpoint.env` / `auth.secretEnv` are removed for CM forms.

**Escape hatch, kept only if a real user exists:** the literal-`url` + inline
`hmac`/`secret` path (with its SSRF guard) stays *only* if something other than
CM dispatch uses it. Pre-implementation check required (see Open Questions). If
nothing uses it, remove it too and drop the now-dead SSRF guard for this
processor.

Rejected alternatives:
- **B — `target` as shorthand coexisting with `endpoint`/`auth`.** Two ways to
  say one thing; retains the lint surface we're trying to delete. No.
- **C — `target` → code-side registry (env names + per-target auth scheme).**
  Flexibility (e.g. an hmac MDA) we don't need — every CM destination uses
  apiKey/`X-API-Key`. Reintroduces a map to maintain. YAGNI.

## Config schema changes (`packages/form-types/src/processor.type.ts`)

- Add `target: z.string().regex(TOKEN_PATTERN)` to the webhook config.
- Remove `endpoint` and the apiKey branch of `auth` from the CM path. Keep
  `mapping` (incl. `codeService`) unchanged.
- If the escape hatch survives: `target` and (`url` + `auth`) are mutually
  exclusive — model as a discriminated shape so a recipe can't set both.

## Processor changes (`webhook.processor.ts`)

`resolveUrl` becomes `resolveTarget(cfg)`:

- Read `target`; derive both env names via the helpers.
- URL unset/empty → `WebhookConfigError` (unchanged fail-loud contract).
- Secret unset/empty → `WebhookConfigError`.
- Set the `X-API-Key` header from the secret; no `applyAuth` env branch needed.
- These are operator-controlled env URLs, so they skip the SSRF guard exactly as
  the env path does today (`fromRecipe: false`).

Fail-loud taxonomy (`WebhookConfigError` / `WebhookDeliveryError`) is unchanged.

## Lint changes (`scripts/webhook-recipe-guards.ts`)

- **Delete** the URL-token-must-equal-secret-token check.
- **Add** `target` conformance to `TOKEN_PATTERN`.
- **Add** the `codeService`-is-a-known-service check (a gap in #1970 — its
  comment claims CI validates `codeService`, but no such check exists; fold the
  fix in here).
- Keep the applicant-path / `excludeSteps` step-existence checks unchanged.

## Boot audit changes (`recipe-file-loader.service.ts`)

`collectWebhookEnvNames` derives `[webhookUrlEnv(target), webhookSecretEnv(target)]`
from `target` instead of reading `endpoint.env` / `auth.secretEnv`. `/health` and
the startup WARN behaviour are otherwise unchanged.

## Secret provisioning (ops) — Secrets Manager, per MDA, per environment

These are **runtime** app secrets, not GitHub Actions secrets. GitHub secrets
live inside CI/CD runs and the running API never sees them. `WEBHOOK_SECRET_*`
must be in the live NestJS container's `process.env`. apps/api runs on **ECS
Fargate**, so the value comes from **AWS Secrets Manager**, referenced by the
task definition's `secrets` block (env-var name → secret ARN, optionally a JSON
key) and injected at container start.

**Rotation nuance:** task-def `secrets` injection freezes the value for the life
of the task — rotating a `WEBHOOK_SECRET_<TARGET>` needs a new deployment/task to
take effect. If zero-deploy rotation is wanted, consume via the repo's existing
`aws-secrets` runtime-fetch pattern (lazy `SecretsManagerClient`, cache,
delete-on-failure self-heal) reading by ARN/name instead of `process.env` — a
larger change that trades the env-var convention for a runtime lookup. Out of
scope here; noted because it affects the "one rotation point per target" benefit.

Provision **one pair per MDA, in every environment (sandbox/staging/prod)**,
before the recipe ships (provision-first — else submissions fail-loud to DLQ):

| MDA (target) | Vars | sandbox | staging | prod |
|---|---|:--:|:--:|:--:|
| `MINOFYOUTH` | `WEBHOOK_URL_MINOFYOUTH` / `WEBHOOK_SECRET_MINOFYOUTH` | ☐ | ☐ | ☐ |

### Not multi-tenant auth

This is **outbound per-integration credential management**, not multi-tenant
identity. Multi-tenant auth = many customers authenticating *into* one system.
Here one platform holds N credentials to authenticate *itself outward* to N
downstream MDA systems. Each `target` is one outbound key; the vault is keyed by
downstream system. (Any multi-tenancy lives on the receiving MDA side; the
platform is a client to each.)

## Migration

- **science-camp:** `endpoint.env`/`auth.secretEnv` → `target: "SCIENCE_CAMP"`
  (or fold into `MINOFEDU`/appropriate MDA once the MDA↔form map is confirmed).
- **youth-opportunity (~18 forms):** each recipe gets `target: "MINOFYOUTH"` +
  its per-form `programmeCode`/`codeService`/applicant paths, then the hardcoded
  `YouthOpportunityWebhookListener` + `FORM_ID_SERVICE_CODES` +
  `YouthOpportunityWebhookService` dispatch path is deleted (its programme→code
  map moves into each recipe's `codeService`). Ship recipes + deletion together.
- Retire the shared `WEBHOOK_URL` / `WEBHOOK_SECRET` once no path reads them.

## Open questions (resolve before implementation)

1. **Escape hatch users.** Does anything other than CM dispatch use the literal
   `url` + `hmac`/inline-`secret` path? If not, remove it (and the SSRF guard)
   under Approach A. Grep + confirm.
2. **MDA ↔ form map.** Confirm which MDA each currently-syncing form belongs to
   (is every youth-opportunity form really one `MINOFYOUTH` destination? does
   science-camp share it or stand alone?). This is the `target` value per recipe.
3. **codeService source of truth.** `codeService` values currently live in
   `FORM_ID_SERVICE_CODES`; confirm the full per-form list as those move into
   recipes.

## Alternatives considered — DB-backed destination registry

Instead of recipe (`target`) + Secrets Manager, keep a DB table mapping forms to
targets/destinations. Split by what the table would hold:

- **The mapping (form → target).** Not sensitive, but the recipe *already is* the
  mapping. A table adds a second source of truth to keep in sync and — the real
  loss — moves the mapping out of reach of the CI recipe-lint and the
  provision-first startup audit. You can lint a recipe at PR time; you can't lint
  a row inserted at runtime. Rejected: gives up the "loud and early" guardrails
  that are the point of the design.
- **The secret values in a plain table.** A security downgrade vs Secrets
  Manager. Blast radius: anything that can read the app DB (SQLi, an over-broad
  replica, a leaked DB credential) leaks *every* downstream MDA credential at
  once — today such a read gets submission data, not keys. Secrets also land in
  backups/snapshots/replicas and ORM/query logs unless deliberately prevented,
  and you'd re-implement encryption-at-rest, rotation, and audit that Secrets
  Manager already provides. Rejected.
- **Registry storing a *reference* (ARN/name), not the value.** The one
  defensible DB variant — table holds a pointer, Secrets Manager holds the
  secret (how an ECS task def already references a secret). Buys **runtime
  flexibility** (add/repoint a target without a recipe change + redeploy) at the
  cost of moving destination config **out of code review** (no PR review, no CI
  lint). Deferred, not adopted: for a government platform where auditability is a
  feature, the reviewed-in-git mapping is worth more than zero-deploy
  reconfiguration. Revisit only if that flexibility becomes a real requirement.

Why a DB registry is unnecessary here: apps/api on ECS Fargate already has a
managed, KMS-encrypted, IAM-scoped, CloudTrail-audited secret store
(Secrets Manager) wired into the runtime via the task-def `secrets` block. A DB
table would reinvent it — worse, *inside* the same DB an attacker would already
be reading.

## Non-goals

- No change to the fail-loud contract, the DLQ routing, or the deterministic
  application-code logic from #1970.
- No per-target auth-scheme flexibility (Approach C) — apiKey/`X-API-Key` only.
- No runtime secret-store abstraction change — reuse the existing `aws-secrets`
  pattern.
