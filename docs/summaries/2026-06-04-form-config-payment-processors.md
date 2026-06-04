# 2026-06-04 — Payment processor config moves into `form_config` (#716)

## Context

Follow-up to #607, which built the per-form `form_config` store and moved the
MDA email recipient into it. This session moved the payment processor — the
ezpay department, payment code, amount, and flags — out of committed recipe
JSON and into `form_config.config.processors`, applied at API hydration and
edited/persisted by the builder. #750 (re-saving the six payment forms) is the
operational migration that follows.

## What we did

- `@govtech-bb/form-types`: `formConfigBlobSchema` (loose) +
  `parseFormConfigBlob`; exported `paymentConfigAuthorSchema`.
- `apps/api`: `FormConfigService.resolveProcessors` + DB-wins append in
  `findByFormId` — see [ADR 0034](../decisions/0034-payment-processors-resolve-from-form-config.md).
- Builder API: tolerant `processors` sibling (absent/clear/set, 400 on
  invalid or non-payment), merged into the blob inside the existing
  transaction; rekey test asserts the blob survives a `form_id` move.
- Builder UI: payment re-enabled in the selector, editable ezpay form,
  DB-merge on open with recipe-lift, serializer strips payment from recipe
  JSON, client-side guard blocks saving an incomplete payment config.

## Why we did it that way

- **Plan-level decisions** (DB-wins, fail-loud, builder-re-save-as-migration,
  sandbox rows over code special-casing) were settled in the planning session
  and are recorded in ADR 0034 — not restated here.
- **Parallel agent split.** The two planned sessions (API, builder) shared
  exactly one artifact: the blob schema. We built that contract first, then ran
  both sessions as concurrent subagents in one worktree on disjoint file sets,
  with all git operations held by the orchestrator. That worked cleanly — worth
  repeating when a plan's sessions only meet at a schema.
- **Loose blob, strict gate.** `formConfigBlobSchema` stays generic
  (`processors: Processor[]`, unknown keys pass through) so future config keys
  don't need a schema migration — but code review caught that a generic
  *write* gate lets a non-payment processor into the blob, where hydration's
  payment-only dedup would append it on top of the recipe's identical
  processor and run it twice. The write gate is now payment-only; the
  alternative (generic gate, document the risk) was rejected because the
  failure mode is silent duplicate side effects (double emails).
- **Hard save-gate for incomplete payment.** A freshly added payment processor
  seeds empty strings, which the API correctly 400s — but that rejected the
  whole save with an opaque error. The builder now validates payment configs
  client-side before sending and blocks even Save-draft (unlike contract
  errors, which Save-draft can override): a half-configured payment processor
  must never persist, anywhere, because persistence is what arms the DB-wins
  override.

## What we almost got wrong

- A pure append at hydration would have left the committed recipe payment
  silently winning (first-wins in `payment.processor.ts`) — the entire feature
  would have no-opped until #750 deleted the recipe blocks. Caught in
  planning; this is why DB-wins drops recipe payments explicitly.
- The three re-export getters added to `form-types/src/index.ts` tripped the
  package's 98% function-coverage threshold — index re-exports count as
  functions and need exercising via `index.spec.ts`.

## Open questions

- Manual end-to-end (builder → `form_config` row → submission charges from DB
  values) is deferred to the #750 migration pass; this session verified at the
  suite level only (docker socket unavailable locally).
- Whether `awR2Da5z7K` is an ezpay test code, and sandbox's ezpay env-vars —
  both tracked in #750.
