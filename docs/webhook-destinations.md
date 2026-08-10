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
  "education": { "url": "https://cms.education.gov.bb/api/intake", "secret": "…" },
  "health":    { "url": "https://cms.health.gov.bb/api/intake",    "secret": "…" }
}
```

The parser is an N-ministry map, so adding a ministry is a secret edit plus the DB
link below — never a code change.

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

## Ministry of Health (`health`) — the per-catchment destination

MOH is the first destination that breaks two assumptions the rest of this runbook
makes. `apply-for-temporary-restaurant-licence` and
`request-an-environmental-health-officer` both route by **polyclinic
catchment**, so:

**Two forms, each with its own eight CMS queues.** `programme_code` is chosen
per submission from the event's catchment (coordinates → point-in-polygon, else
parish fallback), not fixed per form — and the code depends on **which form**
as well as which catchment, because one polyclinic catchment serves both
services with distinct CMS queues. The codes live in
[`apps/api/src/catchment/polyclinic-routing.ts`](../apps/api/src/catchment/polyclinic-routing.ts)
(`PROGRAMME_CODES_BY_FORM`, keyed by formId then catchment) and are
**CMS-issued** — MOH created the CMS programmes using exactly these
`TEMP_RESTAURANT_LICENCE_*` / `ENV_HEALTH_OFFICER_*` strings, so a rename has to
happen in the CMS first. `Frederick Miller Polyclinic` has no Environmental
Health Department and no officer-request queue of its own, so officer requests
there route to the St. Philip queue instead — the licence form is unaffected and
keeps its own Frederick Miller code. Keys must match the GeoJSON
`properties.name` values, for every form; a mismatch **throws at boot**, by
design.

**The `mda_contact` row is not in this form's email path.** Its MDA notification
resolves via `catchment.mdaEmail` (the per-polyclinic Environmental Health
inbox), *not* `config.mdaEmail`. So `mda_contact.mda_email` for MOH is unused by
this form. The row still has to exist, for two other reasons:

- the **ministry-key walk** this runbook describes (`resolveMinistryKey`) — no
  row, no `ministry_key`, no webhook destination;
- `resolveDepartmentName`, which names the department in the citizen
  confirmation email.

Don't "clean up" that row because its email looks unused, and don't expect a
change to it to alter where the MDA notification goes.

**Non-prod never emails a real polyclinic.** `resolveCatchmentRecipient`
overrides the resolved catchment inbox with `SES_DEFAULT_RECIPIENT`
(`testing@govtech.bb`) and records `DEFAULTED` in `notification_log` whenever
`MDA_REQUIRE_RECIPIENT` is unset. Two consequences:

- `POLYCLINIC_EMAILS` is a checked-in file shared by every environment — the
  guard, not the data, is what protects staging.
- **Production must have `MDA_REQUIRE_RECIPIENT` set**, or prod silently emails
  the test inbox. Check this before loading the real addresses, not after.

**The form is `visibility: "draft"`.** Staging therefore needs
`ALLOW_PREVIEW_SUBMISSIONS` to accept a submission (ADR 0065); without it a
submission 404s, then hits the ADR 0043 "unpublished preview cannot be submitted"
400. Do **not** flip the recipe to `public` as a workaround — the post-deploy
smoke matrix only lists `visibility: public` forms, and a non-public form in that
matrix 404s and breaks the deploy gate (#1842).

### Environment status

| | staging | production |
|---|---|---|
| `health` in `MDA_WEBHOOK_DESTINATIONS` | provisioned | **outstanding** (#2211) |
| `mda_contact` row + `form_config` link | provisioned | **outstanding** (#2211) |
| `POLYCLINIC_EMAILS` | test inbox, by design | real inboxes pending (#2211) |
| `MDA_REQUIRE_RECIPIENT` | unset (override active) | must be set |
| CMS programme codes | `TEMP_RESTAURANT_LICENCE_*` | same — codes do not differ by env |

Because the codes are identical in both environments, they stay in the
checked-in file. If prod ever needs different codes, that file is the wrong home
for them and the DB-backed routing table (design spec §11, deferred on purpose)
comes back on the table.

Staging provisioning history: #2150. Prod cutover: #2211.

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
  "configuredMinistries": ["youth", "education", "health"],
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
- Catchment routing data (MOH): `apps/api/src/catchment/polyclinic-routing.ts`
- Catchment/config email degrade: `EmailProcessor.resolveCatchmentRecipient` / `resolveConfigRecipient`
