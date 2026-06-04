# 0034 — Payment processors resolve from `form_config`, DB wins, invalid fails loud

**Date:** 2026-06-04
**Status:** Accepted — extends [ADR 0032](0032-recipient-resolution-degrades-on-miss-not-on-infra-error.md) and [ADR 0033](0033-per-form-db-config-never-enters-the-recipe.md)

## Context

Issue [#716](https://github.com/govtech-bb/gov-bb/issues/716) moves the payment
processor configuration out of the committed recipe and into the per-form,
per-environment `form_config` store. [ADR 0033](0033-per-form-db-config-never-enters-the-recipe.md)
established the shape: per-form DB config never enters the recipe; it travels as
a sibling of `recipe` on save and is read back from the DB, never out of recipe
JSON. The payment processor is the first non-email consumer of that store.

The DB blob lives in `form_config.config` (nullable JSONB). Its author schema is
`formConfigBlobSchema` in `@govtech-bb/form-types`:

```ts
z.looseObject({ processors: z.array(processorSchema).optional() })
```

It is **loose on purpose** — the blob is a shared envelope, so unknown future
keys survive parsing and writers must merge into it rather than overwrite it.
`processors` carries author-time processor entries; `dynamic()` fields are
allowed and resolved by the expressions pipeline at submission, exactly as for
recipe processors.

Two design questions fall out of merging this DB set into the recipe's
processors at submission:

1. **What if both the recipe and the DB carry a payment processor?**
   `payment.processor.ts` is **first-wins** on duplicate `type: "payment"`
   entries — `extractConfig` does `.find(isPaymentProcessor)` and logs a warning
   for any extras. A pure append (`[...recipe, ...db]`) would therefore leave the
   *committed recipe* payment silently winning, and the DB override — the whole
   point of #716 — would never fire.

2. **What if the DB blob is present but invalid?** The processors path is the
   submission path, where a payment processor is what makes a paid form charge.
   Silently dropping a malformed payment config would make a paid form free.

## Decision

**DB wins over the recipe for payment.** When `findByFormId` runs with
`includeProcessors: true` (the submission path only — the client path strips
processors and must not pay the DB cost), after `hydrateForm` it calls
`FormConfigService.resolveProcessors(formId)`. If the DB set contains at least
one `type: "payment"` processor, **all** `type: "payment"` processors are
dropped from the recipe array *first*; the DB processors are then appended to
the (possibly filtered) array. This makes DB-wins explicit rather than relying
on the first-wins accident of array order. With no DB payment, recipe payments
stay; with an empty DB set (`[]`), the recipe array is returned untouched —
zero behaviour change for the common case.

**Invalid config fails loud — the payment-flavoured counterpart of ADR 0032.**
`resolveProcessors` returns `[]` only for a *resolved miss*: no `form_config`
row, a null `config` column, or a blob with no `processors` key. A `config`
present but failing `parseFormConfigBlob` validation **throws** — it is
misconfiguration, not a miss. Mirroring `resolveMdaEmail`, there is no
try/catch, so a DB error propagates as an infra failure. This is ADR 0032's
split applied to payment: degrade only on a resolved miss, never on
misconfiguration, never on an infra error.

**The builder write gate is payment-only.** Although `formConfigBlobSchema`
accepts any author-time processor, the builder API's `processors` sibling
rejects (400) any non-`payment` entry before its transaction opens. The
hydration merge above only defines a dedup rule for payment; a non-payment
entry in the blob would append on top of the recipe's identical processor and
execute twice (a duplicate email, a double webhook). The gate stays closed for
a processor type until that type defines its own DB-wins drop rule in
`findByFormId`.

## Consequences

- **The DB override actually takes effect.** Because recipe payments are dropped
  before the append, the operator-configured DB payment is the one
  `payment.processor.ts` finds — not the committed recipe value.
- **No silent free forms.** A malformed `config.processors` blob fails the
  submission loudly (the submission errors and retries on the SQS → DLQ path)
  rather than dropping the charge. A resolved miss (`[]`) is the safe,
  zero-cost common case.
- **The client path is unchanged and pays nothing.** `resolveProcessors` is only
  called when `includeProcessors: true`; the public form-fetch path strips
  processors and never touches `form_config`.
- **Appended DB processors are first-class.** Their `dynamic()` fields resolve
  through the same expressions pipeline as recipe processors at submission —
  array position is irrelevant to resolution (see
  `expressions-pipeline.integration.spec.ts`).
- **Future DB-only processors follow the same merge contract.** Any new
  side-effecting, first-wins processor type added to the recipe must define its
  own DB-wins drop rule here rather than relying on append order; non-idempotent
  processors compose by replacement, not accumulation.
