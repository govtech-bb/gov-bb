# Webhook destinations — approach & decision record

**Status:** accepted · **Issue:** [#1920](https://github.com/govtech-bb/gov-bb/issues/1920)
· **Diagram:** `docs/mda-webhook-destinations-workflow.svg`
· **Implementation plan:** tracked internally (not version-controlled)

A single reference for: what we're building now (the **interim** single-config
approach), the **future** database approach, and **why we are not using AWS
Secrets Manager at runtime**. Self-contained; no other document required.

---

## 1. Problem

Some government forms sync each submission to an external **case-management
system (CMS)**. Every such form needs a **destination**: a URL and a secret
(sent as an `X-API-Key`). Two things must be true:

1. The right form reaches the right CMS with the right secret.
2. A misconfiguration is **loud** (retried, dead-lettered, visible) — never a
   silent failure to sync.

The first design gave **every form its own pair of environment variables**
(`WEBHOOK_URL_<FORM>` / `WEBHOOK_SECRET_<FORM>`). That does not scale: dozens of
variables. There are currently only **two MDAs**, so a full database-backed
solution is more than we need today.

---

## 2. Chosen approach (interim) — one JSON env var, keyed per MDA

Group forms by **MDA** (ministry/department) and hold **all** MDA destinations
in a **single** environment variable containing JSON, loaded from AWS Secrets
Manager **at deploy time** — exactly how the app already receives its secrets
(no new runtime dependency).

### 2.1 Group forms by MDA, declared in the recipe
Route by MDA, not per form: all Youth-Opportunity forms → one CMS; all
Ministry-of-Education forms → another. The **recipe declares which MDA** a form
belongs to (grouping lives "on the forms end"):

```jsonc
// a form's webhook processor
{
  "type": "webhook",
  "config": {
    "mdaKey": "youth-opportunity",     // ← which MDA destination to use
    "mapping": { "programmeCode": "…", "codeService": "…", "applicant": { … } }
  }
}
```

### 2.2 One env var holds every destination
A single variable — `WEBHOOK_MDA_CONFIG` — carries a JSON object keyed by
`mdaKey`, injected from Secrets Manager into env at deploy:

```jsonc
// WEBHOOK_MDA_CONFIG
{
  "youth-opportunity":     { "url": "https://cms-a/api", "secret": "…" },
  "ministry-of-education": { "url": "https://cms-b/api", "secret": "…" }
}
```

One variable replaces every `WEBHOOK_URL_*` / `WEBHOOK_SECRET_*` pair.

### 2.3 Resolve at dispatch
The JSON is parsed and validated **once at boot** into an in-memory map. A mapped
webhook resolves its destination by the recipe's `mdaKey`:

```
boot:      Secrets Manager → env (WEBHOOK_MDA_CONFIG) → parse + validate → map{ mdaKey → {url, secret} }
dispatch:  recipe.mdaKey → map lookup → { url, secret }
           → buildMappedCasePayload → assertSafeUrl(url) → POST (X-API-Key: secret) → CMS
```

### 2.4 Fail-loud + boot validation (blast-radius control)
Because one bad blob could affect every MDA at once, failures are contained at
two layers:

- **Boot (soft):** parse + validate `WEBHOOK_MDA_CONFIG` with a typed parser
  (reusing the `parseFormConfigBlob` pattern). A malformed blob or a missing
  field is **surfaced on `/health`** and logged — but does **not hard-fail prod
  boot** (one bad var must not down the whole API). It may fail boot in non-prod.
- **Dispatch (hard, per-MDA):** an unknown `mdaKey`, or a blank `url`/`secret`,
  throws `WebhookConfigError` → the entry routes to **SQS retry → DLQ** (visible,
  redrivable). A non-2xx / timeout / network error throws
  `WebhookDeliveryError`. Never a silent no-sync. `assertSafeUrl` still guards
  the URL (SSRF).

### 2.5 Trade-off we are accepting (interim)
The JSON is baked into env at deploy, so **changing any destination requires a
redeploy** — there is **no rotate-without-redeploy** and no runtime/admin edit.
This is the property the future database approach adds; we are deliberately
deferring it while there are only two MDAs.

### 2.6 Why this shape
- **Kills env-var sprawl** — one variable instead of N pairs.
- **No new dependency** — uses the existing Secrets-Manager-at-deploy → env path;
  no runtime AWS calls, no DB columns, no encryption code, no seed tooling.
- **Self-contained grouping** — the recipe names the MDA; no DB lookup needed to
  dispatch, so the interim ships without touching the database.
- **Right-sized** — proportional to two MDAs; the DB approach is ready when the
  count or the rotation requirement grows.

**Known temporary seam:** webhook grouping (recipe `mdaKey`) and MDA-email
grouping (DB `form_config → mda_contact`) are **two mechanisms** during the
interim. The future DB phase reunifies them (§3).

### 2.7 Delivery
- Add a typed `WEBHOOK_MDA_CONFIG` parser + boot load into an in-memory map;
  surface parse/validation issues on `/health`.
- Add `mdaKey` to the webhook mapping type; resolve destination from the map at
  dispatch (fail-loud).
- Migrate every CMS recipe to `mdaKey` and drop the per-form `WEBHOOK_URL_*` /
  `WEBHOOK_SECRET_*` pairs (including the already-shipped science-camp pair).
- Update the recipe lint: require `mdaKey` on a mapped webhook; drop the
  URL/secret token-pair rules.
- Delete the legacy hardcoded youth-opportunity dispatch path (ships together
  with the recipe changes — no double-dispatch, nothing orphaned).

> ⚠️ **Before cutover:** confirm the MDA groupings and set `WEBHOOK_MDA_CONFIG`
> (all keys populated) in **every** environment — fail-loud will DLQ a form whose
> `mdaKey` is absent from the config.

---

## 3. Future phase — database-backed destinations (deferred)

When MDAs grow, or when destinations must be **rotated/edited without a
redeploy**, move the destination into the database:

- Store `webhook_url` + an **AES-256-GCM-encrypted** `webhook_secret` on the
  existing `mda_contact` row; resolve via the `form_config → mda_contact` link a
  form already uses for its notification email (reunifying the two grouping
  mechanisms from §2.6).
- A DB read is uncached and instantly fresh, so a change is **live on the next
  submission — no redeploy**.
- Later still: a self-service **admin UI** (RBAC + change audit) on the same
  storage path, and optionally **KMS envelope encryption** for a managed key.

This is intentionally *not* built now — it is the documented next step.

---

## 4. Rejected: AWS Secrets Manager *at runtime*

Note the interim (§2) uses Secrets Manager **at deploy time** — the existing
path — which is fine. What is **rejected** is calling Secrets Manager **at
runtime** (per-dispatch `GetSecretValue`, DB holding only a reference). In
isolation Secrets Manager is the better secret store (managed KMS encryption,
built-in rotation, versioning, CloudTrail audit), but at runtime it works against
this use case:

- **Undercuts no-redeploy rotation.** Per-call cost + `GetSecretValue` rate
  limits force an in-memory TTL cache → rotation becomes **eventually
  consistent** (stale until TTL/restart). Restoring *instant* rotation means
  building cache invalidation — more work than it saves.
- **Doesn't replace the database.** Form → MDA grouping still needs a store;
  Secrets Manager is *added alongside* it → **two sources of truth per MDA**
  (URL/contact vs secret) and split-brain risk if a reference dangles.
- **New runtime AWS surface.** The API makes **zero runtime AWS calls** today.
  Runtime SM adds an SDK dependency, task IAM (`GetSecretValue`, plus
  `PutSecretValue`/`CreateSecret` for any admin path — broader blast radius), a
  network path to the SM endpoint, and a **new failure mode in the dispatch
  path** (throttling/outage/latency), cushioned but not removed by SQS retry.
- **Operational / governance friction.** Local + CI use no AWS → needs LocalStack
  or SDK mocking; "non-engineers edit destinations" via SM implies AWS console
  access for them.
- **No sprawl advantage.** One SM secret per MDA == one DB row/one config key per
  MDA — not a differentiator.

---

## 5. If we *did* adopt runtime Secrets Manager — the overhead

For completeness, the concrete work runtime SM would add over the chosen paths:

**Build / code**
1. AWS SDK integration (`@aws-sdk/client-secrets-manager`) + a by-name/ARN
   resolver.
2. In-memory **cache with TTL** to stay under rate limits — **plus cache
   invalidation** if instant rotation is still required.
3. A reference column (ARN/name) wherever the grouping lives, and a decision on
   where the non-secret URL sits.
4. Dangling-reference detection so a missing/rotated secret fails loud.
5. Retry/error handling for SM being unreachable/throttled in the dispatch path.

**Infrastructure / IAM**
6. Task IAM for `secretsmanager:GetSecretValue` (+ `PutSecretValue` /
   `CreateSecret` for a write/admin path).
7. Network path (VPC interface endpoint or NAT) to the SM endpoint.
8. Per-environment secret naming + separate IAM per env.
9. KMS key governance + rotation policy.

**Testing / local**
10. LocalStack or SDK mocking wired into the Vitest suite and local dev.

**Operations**
11. Cost/quota tracking (~$0.40/secret/month + per-call charges vs rate limits).
12. Console/governance controls per environment.

By contrast: the **interim** adds one typed parser + one env var + an `mdaKey`
lookup; the **future DB phase** adds one AES-256-GCM helper, two columns (one
migration), one resolver, and a rotation runbook.
