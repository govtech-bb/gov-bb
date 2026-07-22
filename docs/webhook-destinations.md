# Webhook destinations — operations runbook

How to provision, rotate, and diagnose the per-MDA case-management (CMS) webhook
destinations (#1920/#2020). For **why** it works this way, see the decision
record: [`docs/decisions/0064-per-mda-webhook-destinations.md`](decisions/0064-per-mda-webhook-destinations.md).

## Model in one paragraph

A form that syncs to a CMS carries a `webhook` processor with **only a `mapping`**
(no URL/secret) in its recipe. At dispatch the API resolves the destination by
walking `form_config → mda_contact.ministry_key`, then looking that ministry key
up in the **`MDA_WEBHOOK_DESTINATIONS`** JSON secret. A miss (unmapped MDA, or a
ministry key with no JSON entry) **fails loud** → SQS retry → DLQ. Nothing is
read from AWS at runtime — the JSON arrives in `process.env` at container start.

```
formId ─▶ form_config.mdaContactId ─▶ mda_contact.ministry_key ─▶ MDA_WEBHOOK_DESTINATIONS[key] = { url, secret }
```

## The secret

`MDA_WEBHOOK_DESTINATIONS` is one AWS Secrets Manager secret, delivered to the
API as an env var via the ECS task-def `secrets` block. Shape — a JSON object
keyed by ministry:

```json
{
  "youth":     { "url": "https://cms.youth.gov.bb/api/intake",     "secret": "…" },
  "education": { "url": "https://cms.education.gov.bb/api/intake", "secret": "…" }
}
```

- `url` — the MDA's CMS endpoint (must be **https** and externally resolvable;
  the dispatch SSRF guard rejects non-https / internal hosts).
- `secret` — sent as the `X-API-Key` header.
- Keys must match the `ministry_key` values seeded on `mda_contact`.

## Provisioning a new MDA (engineers/ops, per environment)

Provision **before** the recipe/deploy ships — fail-loud will DLQ a form whose
destination is missing.

1. **Seed the ministry key** on the MDA's `mda_contact` row (the same row that
   serves its notification email):
   ```sql
   UPDATE mda_contact SET ministry_key = 'youth' WHERE id = '<contact-id>';
   ```
   Ensure every mapped form points at that contact
   (`form_config.mda_contact_id`), in **each** environment.
2. **Add the destination** to `MDA_WEBHOOK_DESTINATIONS` in Secrets Manager for
   that environment — add a `"youth": { "url", "secret" }` entry.
3. **Deploy** (or force a new task) so the container picks up the new secret.
4. **Verify** — `GET /monitoring/webhook-destinations` (see below) reports `ok:
   true` with the ministry listed under `configuredMinistries`.

## Rotating a URL or secret

Task-def secrets freeze at container start, so **rotation requires a redeploy**:

1. Edit the `MDA_WEBHOOK_DESTINATIONS` secret (change that ministry's `url` /
   `secret`).
2. Redeploy / force a new task.
3. Confirm via the audit endpoint.

(If zero-deploy rotation is ever required, the same JSON can be read through the
`aws-secrets` runtime-fetch pattern — see decision doc §2.4/§5.)

## Diagnosing

### Deploy-time audit
At boot the API logs, and `GET /monitoring/webhook-destinations` returns:

```jsonc
{
  "issues": [],                 // JSON parse/validation problems (no secret values)
  "missingMinistries": [],      // ministry_key on an mda_contact but absent from the JSON
  "configuredMinistries": ["youth", "education"],
  "ok": true
}
```

`missingMinistries` non-empty ⇒ a provisioning gap: submissions to those MDAs'
forms will DLQ until the JSON entry is added. (Admin-token gated; carries no
secret values.)

### A form's submissions are dead-lettering
- Check the audit for a missing ministry.
- Confirm the form's `form_config` row references the right `mda_contact`, and
  that contact has the expected `ministry_key`.
- Confirm the JSON entry's `url` is https + reachable.
- Once fixed (and redeployed, if the secret changed), **redrive the DLQ** — the
  case `code` is the submission reference and delivery is idempotent
  (`X-Idempotency-Key`), so replays are safe.

## Related

- Decision record: `docs/decisions/0064-per-mda-webhook-destinations.md`
- Processor: `apps/api/src/forms/submissions/processors/webhook.processor.ts`
- Resolver: `apps/api/src/forms/webhook-destinations/`
- Recipe lint (CI gate): `scripts/webhook-recipe-guards.ts` (via `pnpm validate-recipes`)
