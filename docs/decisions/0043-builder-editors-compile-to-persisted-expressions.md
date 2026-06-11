# 0043 — Builder editors compile to persisted expressions

**Date:** 2026-06-08
**Status:** Accepted

## Context

Issue #937 asked for payment amounts that depend on a form field — e.g. a
marriage certificate charging $10 for nationals and $20 for non-nationals —
where today only a single fixed number can be authored.

The author schema already wraps `amount` in `dynamic()`
(`packages/form-types/src/processor.type.ts:34`,
`amount: dynamic(z.number().nonnegative())` = `number | jsonLogicRule`), and the
server already resolves it: `@govtech-bb/expressions` evaluates the JSONLogic
rule, and `ExpressionsService.resolveProcessors`
(`apps/api/src/expressions/expressions.service.ts`) re-validates the resolved
config against `resolvedProcessorSchema`, which forces `amount` back to a plain
non-negative number before the payment processor runs. So a conditional amount
is *already* expressible end-to-end as stored data — the only missing piece was
a way to author it.

Two ways to add that authoring affordance were on the table:

- **Extend the author schema with a structured `amount` variant** (a list of
  `{ when, amount }` rules + default) and teach the resolver to read it.
- **Keep the structured table as builder-UI state only** and compile it to the
  JSONLogic the schema and resolver already accept.

The first changes the stored recipe format, the resolved schema, and the
authoritative server payment path — for no functional gain, since the resolver
can already evaluate the expression. It also forks the format: every consumer
(server resolver, preview hydrator — which already diverge, see the
`two_hydrators_diverge` note) would need to learn the new shape.

## Decision

Author-time structured editors in the form builder are **UI-only state**. They
compile, on save, to the expression format the recipe already persists and the
server already resolves, and parse that format back on load. Adding an
authoring affordance must **not** introduce:

- a new stored recipe shape,
- a new author-time or resolved-time schema variant, or
- a new server-side resolution path.

Anything the editor cannot deterministically round-trip — a hand- or
AI-authored expression it didn't emit — is surfaced **read-only** and never
overwritten.

Today's instance: conditional payment amounts persist as a JSONLogic `if`-chain
in the existing `amount` slot. The `{ when, amount }[] + default` table lives
only in `apps/form_builder/app/routes/builder/-amount-editor.tsx`, with
`-amount-rule.ts` compiling/parsing between the table and the chain. An
unrecognized `amount` object renders read-only. Zero change to
`processor.type.ts`, the resolver, or the payment DB entity.

## Consequences

- The #937 **fast follow** (age-band / calculated amounts — price by age derived
  from DOB) must extend the *compiler*, not the schema: add ordering operators
  (`<`, `<=`, …) and wire the existing `age` op
  (`@govtech-bb/expressions`, `{"age":[{"var":"dob"}]}`) into the editor so it
  emits richer JSONLogic. The compile/parse helper was written to make this
  additive.
- The parse direction must stay **conservative**: only decompile the exact shape
  the editor emits, and fall back to the read-only advanced view for everything
  else. Loosening the guard to "best-effort parse arbitrary expressions" risks
  clobbering an expression the editor would re-emit differently — don't.
- A future request to "store the rules table directly so the UI doesn't have to
  compile" should be declined on these grounds: the persisted format is the
  resolver's contract, and the table is a view over it, not a second source of
  truth.
- This generalizes beyond payments: any later structured editor (conditional
  `description`, templated `paymentCode`, etc., all already `dynamic()`) follows
  the same rule — compile to the persisted expression, don't fork the format.
