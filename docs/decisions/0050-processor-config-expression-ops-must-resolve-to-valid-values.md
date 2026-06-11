# 0050 — Processor-config expression ops must resolve to valid values

## Context

A recipe's `processors` array drives post-submission side effects (emails, payments,
spreadsheets, webhooks). Each processor config field marked `dynamic()`
(`packages/form-types/src/processor.type.ts`) may be a JSONLogic rule, resolved
per-submission by `ExpressionsService.resolveProcessors`
(`apps/api/src/expressions/expressions.service.ts`).

`resolveProcessors` validates the **whole batch atomically**: it resolves each
processor's config, then parses the result against `resolvedProcessorSchema`. The
first processor whose resolved config violates the schema throws a
`BadRequestException`. In the submission listener
(`apps/api/src/forms/submissions/submission-processor.listener.ts`) that throw is
caught and the handler returns, so **every** non-gating processor on that
submission is dropped — not just the offending one. A single bad dynamic value
silently takes down unrelated, working emails (e.g. the applicant confirmation).

This surfaced wiring the textbook-grant school email (#1213): a new `schoolEmail`
op resolves the recipient address from the submitted school. The resolved
`emailConfigResolvedSchema.recipientField` is `z.string().min(1)`, so any input
the op couldn't map — a missing selection, a forged/unknown key, `null` — must
still yield a non-empty string. Returning `""` would have failed the schema and
dropped the applicant confirmation along with the school email.

## Decision

Any JSONLogic op used in a processor's `dynamic()` config field MUST always
resolve to a schema-valid value for that field — never `null`, `""`, or
`undefined`. Where the op can be handed an input it cannot map, it provides a
safe fallback that still satisfies the resolved-time schema.

The `schoolEmail` op (`packages/expressions/src/operations/school-email.ts`)
implements this with `SCHOOL_EMAILS[String(key)] ?? SCHOOL_EMAIL_FALLBACK`, where
the fallback is a real, monitored inbox.

## Consequences

- New processor-config ops are responsible for their own total-ness: a fallback,
  a guaranteed-valid default, or a guard — chosen so resolution cannot produce a
  schema-invalid value for any reachable input.
- Op unit tests must cover the empty/null/unmapped paths, and a batch-level test
  should assert that a bad value resolves to the fallback **without throwing**, so
  the regression (sibling processors silently dropped) stays caught.
- This is a property of the op, not of the recipe author: a recipe can route a
  `dynamic()` field to any registered op, so the safety must live in the op.
- If a future requirement genuinely needs "no recipient" to mean "skip this
  processor," that belongs in the processor/listener layer (an explicit skip), not
  in an op returning an empty string — which the schema rejects and which fails
  the entire batch.
