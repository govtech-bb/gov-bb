# Webhook destinations — approach & decision record

**Status:** accepted · **Issue:** [#1920](https://github.com/govtech-bb/gov-bb/issues/1920)
· **Diagram:** `docs/mda-webhook-destinations-workflow.svg`
· **Implementation plan:** tracked internally (not version-controlled)

A single reference for: what we're building, **why the destinations live in AWS
Secrets Manager as one JSON object keyed by ministry**, and the trade-offs that
choice accepts. Self-contained; no other document required to follow it.

> **Supersedes** the earlier accepted approach (per-MDA destinations stored in
> the database with an application-owned AES-256-GCM secret column). We changed
> our minds: the destinations now live in **AWS Secrets Manager**, delivered to
> the API as one JSON secret via the ECS task definition. §6 records what changed
> and why.

---

## 1. Problem

Some government forms sync each submission to an external **case-management
system (CMS)**. Every such form needs a **destination**: a URL and a secret
(sent as an `X-API-Key`). Two things must be true:

1. The right form reaches the right CMS with the right secret.
2. A misconfiguration is **loud** (retried, dead-lettered, visible) — never a
   silent failure to sync.

The original design gave **every form its own pair of environment variables**
(`WEBHOOK_URL_<FORM>` / `WEBHOOK_SECRET_<FORM>`). That does not scale: dozens of
variables, ~34 of them duplicate values, and a token-pairing lint needed only
because two independent vars could be cross-wired.

---

## 2. Chosen approach — per-MDA destinations in AWS Secrets Manager (one JSON object)

### 2.1 Group forms by MDA
Route by **MDA (ministry/department), not per form**. All Youth-Opportunity
forms deliver to one CMS; all Ministry-of-Education forms to another. A form's
CMS destination is **the same MDA** as its notification-email contact
(confirmed one-to-one).

Resolution reuses the link that **already exists** in the database. Today a form
finds its private notification email through:

```
formId ──unique──▶ form_config ──mdaContactId (FK)──▶ mda_contact
                    (per form, per env)                (shared MDA directory)
```

`mda_contact` is a shared directory row — **many forms point at one MDA**. That
row already identifies the ministry a form belongs to, so it yields the
**ministry key** used to look up the destination. No new form→MDA mapping is
introduced; the recipe's `webhook` block carries no destination env refs.

### 2.2 Store the destinations in one JSON secret
A **single** AWS Secrets Manager secret holds every MDA's destination as a JSON
object keyed by ministry:

```json
{
  "youth":     { "url": "https://cms.youth.gov.bb/api/intake",     "secret": "…" },
  "education": { "url": "https://cms.education.gov.bb/api/intake", "secret": "…" }
}
```

- Each top-level key is a **ministry key** (matching the key derived from
  `mda_contact`, §2.1).
- `<ministry>.url` — the MDA's CMS endpoint (not secret).
- `<ministry>.secret` — the MDA's `X-API-Key`, held in the managed store.

The secret is delivered to the API through the **ECS task definition's `secrets`
block** — one env var (`MDA_WEBHOOK_DESTINATIONS`) → the secret's ARN — fetched
by the ECS agent and injected as a masked env var at **container start**, the
same mechanism every other API runtime secret already uses. The API makes **no
runtime AWS call**: the JSON is read from `process.env` once at boot, parsed, and
validated.

One JSON secret replaces every `WEBHOOK_URL_*` / `WEBHOOK_SECRET_*` variable.

### 2.3 Resolve at dispatch
A mapped webhook resolves its destination by `formId`, mirroring the existing
email lookup, then indexes the parsed JSON by the ministry key:

```
resolveWebhookDestination(formId)
  → form_config (formId → mdaContactId)
  → mda_contact (ministry key, e.g. "youth")
  → MDA_WEBHOOK_DESTINATIONS[ministry] → { url, secret }
  → buildMappedCasePayload → assertSafeUrl(url) → POST (X-API-Key: secret) → CMS
```

**Fail-loud:** a resolve miss (unknown form, unmapped MDA, or a ministry key
absent from the JSON) or any misconfig throws `WebhookConfigError`; a non-2xx /
timeout / network error throws `WebhookDeliveryError`. Both route the entry to
**SQS retry → DLQ** (visible, redrivable) — never a silent no-sync.

### 2.4 Provisioning & rotation (who sets/changes a destination)
For now, **engineers/ops** edit the JSON secret directly — no UI:

1. Update the `MDA_WEBHOOK_DESTINATIONS` secret in Secrets Manager (add/rotate a
   ministry's `url` / `secret`), per environment.
2. **Redeploy** (or force a new task) so the task picks up the new value.

Because task-def `secrets` are injected **at container start**, a change is
**not** live until a new task runs — rotating a destination **requires a
redeploy**. This is an accepted trade (§3); destinations change rarely. If
zero-deploy rotation is later required, the same JSON secret can be read through
the repo's existing `aws-secrets` runtime-fetch pattern (lazy client + TTL cache
+ self-heal) instead of the env var — a localized change on the same storage
path. A self-service **admin UI (RBAC + change audit) is a deferred future
phase.**

### 2.5 Why this shape
- **No env-var sprawl** — one JSON secret + one env var vs. dozens of pairs.
- **Managed secret store** — KMS encryption at rest, versioning, and
  CloudTrail access audit, none of which we own or maintain.
- **No crypto we own** — no application AES-GCM helper / master-key runbook.
- **No new runtime AWS surface** — injected at boot via the task-def `secrets`
  block (identical to every other API secret today); the dispatch path makes no
  AWS call, adds no IAM/network dependency, and gains no new runtime failure mode.
- **Single grouping source of truth** — form→MDA still resolves through the
  existing `form_config → mda_contact` link; only the destination *values* move
  to the managed store.
- **Consistent with existing patterns** — same task-def `secrets` provisioning
  the API already uses; same `formId`-resolved, per-environment config used for
  MDA email and DB processors (#716).

### 2.6 Delivery (three sessions)
- **A** — a stable **ministry key** on `mda_contact` (if one isn't already
  usable) + a **destinations loader** that parses and validates
  `MDA_WEBHOOK_DESTINATIONS` at boot + `resolveWebhookDestination(formId)`.
- **B** — wire dispatch, migrate every CMS recipe off per-form env vars (keep the
  `mapping` block, drop `endpoint`/`auth` env refs), **update the recipe lint** to
  accept mapping-only recipes, and delete the legacy hardcoded youth-opportunity
  path — **ships together**.
- **C** — the provisioning + rotation runbook (edit JSON secret → redeploy), a
  deploy-time **startup audit** (`/health` flags a mapped MDA with no entry in the
  JSON, and a malformed/absent secret), and docs.

> ⚠️ **Before cutover:** confirm the MDA groupings and ensure (a) every mapped
> form has a `form_config` row pointing at the correct MDA **in every
> environment**, and (b) every referenced ministry key is present in that
> environment's `MDA_WEBHOOK_DESTINATIONS` JSON — fail-loud will DLQ a form whose
> MDA has no destination.

---

## 3. Trade-offs this accepts

Secrets Manager as the store is the managed, audited option — the trade we take
is around **rotation latency** and the **single-blob** shape.

### 3.1 Rotation needs a redeploy
Task-def `secrets` freeze the value for the life of the task, so a rotated
`url`/`secret` is not live until a new task runs. The earlier DB approach gave
instant, no-redeploy rotation (an uncached DB read). We accept redeploy-to-rotate
because destinations change rarely and the deploy fan-out is routine; the
`aws-secrets` runtime-fetch fallback (§2.4) is the escape hatch if that changes.

### 3.2 One JSON blob for all ministries
All ministries live in a single secret, edited in one place. A malformed edit or
a missing key can affect resolution for every MDA, so the boot-time loader
**must** parse-and-validate the JSON and surface problems on `/health` (§2.6 C)
rather than failing a submission silently. Upside: rotation and review touch one
object, not N scattered vars.

### 3.3 Grouping still lives in the DB
The form→MDA link stays in `form_config → mda_contact`; Secrets Manager holds
only the destination *values*. This is deliberate — the grouping is relational
config that belongs in the DB, and the ministry key ties the two together. It
does mean two systems cooperate (DB key → JSON entry); the startup audit exists
to catch a key present in one but not the other.

---

## 4. Why not the database (superseded approach)

The previously accepted design stored `webhook_url` + `webhook_secret_encrypted`
on `mda_contact`, encrypted with an application-owned **AES-256-GCM** master key.
Its one real advantage was **instant, uncached rotation**. We set it aside
because it required us to **own encryption code and a master-key rotation
runbook**, and kept secret material in an application table (a DB read leaks
every downstream credential at once) rather than in a managed, KMS-encrypted,
CloudTrail-audited store. Secrets Manager gives us managed encryption, access
audit, and versioning for free, at the cost of redeploy-to-rotate (§3.1) — a
trade we now prefer.

---

## 5. When to revisit

- If **zero-deploy rotation** becomes a hard requirement, move the same JSON
  secret behind the `aws-secrets` runtime-fetch pattern (TTL cache + self-heal)
  — no schema or provisioning change (§2.4).
- If per-MDA **isolation** of secrets is later mandated (separate KMS keys /
  separate access policies per ministry), split the single JSON secret into one
  Secrets Manager secret per ministry, keyed the same way.

---

## 6. Change log

- **Superseded — DB + AES-256-GCM.** Per-MDA destinations were to be stored on
  `mda_contact` (`webhook_url`, `webhook_secret_encrypted`) with an
  application-owned AES-256-GCM master key (`MDA_SECRET_KEY`). Chosen for instant
  no-redeploy rotation; set aside to avoid owning crypto + a master-key runbook
  and to keep secret material in a managed, audited store.
- **Accepted — Secrets Manager JSON (this doc).** Per-MDA destinations in a single
  Secrets Manager secret, `{ "<ministry>": { "url", "secret" } }`, injected via
  the ECS task-def `secrets` block as one env var and resolved by the existing
  `form_config → mda_contact` ministry key. Managed encryption/audit; rotation
  needs a redeploy.
