# Per-form webhook destinations

Forms that sync to an external case-management system deliver to **their own**
webhook destination — a distinct URL and secret per form — declared in the
form's recipe (#1920). This doc is the convention + the vars ops must provision.

## Convention

A form's webhook resolves its destination from a matched pair of env vars:

```
WEBHOOK_URL_<TOKEN>      base URL of the destination
WEBHOOK_SECRET_<TOKEN>   secret sent as the X-API-Key header
```

`<TOKEN>` is a short uppercase per-form label (`[A-Z0-9_]+`). The recipe names
both via the `webhook` processor:

```jsonc
{
  "type": "webhook",
  "config": {
    "endpoint": { "env": "WEBHOOK_URL_SCIENCE_CAMP" },
    "auth": { "scheme": "apiKey", "header": "X-API-Key", "secretEnv": "WEBHOOK_SECRET_SCIENCE_CAMP" },
    "mapping": { "programmeCode": "SCIENCE2026", "applicant": { /* stepId.fieldId paths */ } }
  }
}
```

**The URL token and the secret token must match** (`SCIENCE_CAMP` ↔ `SCIENCE_CAMP`).
This is enforced by the CI recipe-lint (`pnpm validate-recipes`) and prevents a
recipe from pairing one destination's URL with another destination's secret.

Several forms may deliver to the **same** system — point their (distinct) vars
at the same value. A form maps to exactly one destination.

## Fail-loud contract

A misconfiguration is **never** a silent no-sync. The processor throws → the
entry is routed to SQS retry → DLQ:

| Condition | Error | Kind |
|---|---|---|
| named `WEBHOOK_URL_*` / `WEBHOOK_SECRET_*` unset or empty | `WebhookConfigError` | permanent — fix the var |
| recipe has neither `endpoint` nor `url` | `WebhookConfigError` | permanent — fix the recipe |
| destination returns non-2xx / times out / network error | `WebhookDeliveryError` | transient — redrive after recovery |

Because it fails loud, **every referenced var must be provisioned before the
recipe ships** (provision-first). A startup audit logs any recipe-named var that
isn't set (and surfaces it on `/health`) so a gap shows at deploy, not at the
first submission.

## Provisioning (ops)

Set both vars for each form, in **every** environment. Values are supplied out
of band (secrets manager → ECS task env) — never in git.

| Form | Token | Vars | sandbox | staging | prod |
|---|---|---|:--:|:--:|:--:|
| science-camp | `SCIENCE_CAMP` | `WEBHOOK_URL_SCIENCE_CAMP` / `WEBHOOK_SECRET_SCIENCE_CAMP` | ☐ | ☐ | ☐ |

_(Youth-opportunity forms are added here when their migration ships — Session 2.)_

## Related

- Plan: `docs/plans/per-form-webhook-destinations.md`
- Processor: `apps/api/src/forms/submissions/processors/webhook.processor.ts`
- Convention helper: `packages/form-types/src/webhook-env.ts`
- Lint: `scripts/webhook-recipe-guards.ts` (run by `pnpm validate-recipes`)
