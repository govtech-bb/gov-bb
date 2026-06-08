# 0044 — Builder var paths resolve under `values`

**Date:** 2026-06-08
**Status:** Accepted

## Context

ADR 0043 established that builder editors are UI-only state that **compile to the
JSONLogic the server already resolves**. The first instance — conditional
payment amounts (#937, equality slice) — shipped with a latent bug: the compiler
emitted `{ var: "applicant.nationality" }`, the bare `stepId.fieldId` path that
`ValuePathPicker` produces.

But submission-time resolution evaluates the rule against a context of the shape
`{ values, meta, submission }` — see
`apps/api/src/forms/submissions/submission-processor.listener.ts` (passes
`{ values: payload.values, meta, submission }` to `resolveProcessors`). JSONLogic
`var` resolves from the **root** of that context, so a reference to a submitted
answer must be written `{ var: "values.applicant.nationality" }`. Every resolver
test uses this form (`apps/api/src/expressions/expressions.service.spec.ts`:
`{ var: "values.email" }`, `{ age: [{ var: "values.dob" }] }`).

An unprefixed `var` therefore resolves to `undefined`. The failure is **silent**:
no error is thrown, the comparison is simply false, and every conditional amount
falls through to its default. The equality slice's unit tests were structural
(asserting the emitted object) and the resolver's tests were separate, so nothing
connected the two and the bug passed CI.

## Decision

Any JSONLogic `var` reference the builder emits into a persisted expression
**must be prefixed with `values.`** when the reference is to a submitted answer.

1. **Store the bare path; prefix at the boundary.** The structured editor state
   holds `ValuePathPicker`'s bare `stepId.fieldId`. The `values.` prefix is added
   in compile and stripped in parse — it never lives in the editable table. See
   `VALUES_PREFIX` in
   `apps/form_builder/app/routes/builder/-amount-rule.ts`.
2. **Pin the emitted shape against the resolver.** Because the failure is silent,
   a structural unit test is not enough on its own — the emitted shape must be
   asserted to equal the exact form the resolver consumes (the
   `{ var: "values.…" }` / `{ age: [{ var: "values.…" }] }` shapes that
   `expressions.service.spec.ts` exercises). Treat the resolver's accepted shapes
   as the contract the compiler is tested against.

## Consequences

- Future structured editors that emit `var` references (a templated
  `description`, a conditional `paymentCode`, the #937 calculated-field
  expansion) must apply the same prefix at their compile/parse boundary. This is
  a corollary of ADR 0043, not a new persistence decision.
- The parse direction must **require** the prefix to recognize its own output:
  an unprefixed `var` is not a shape this editor emits, so it routes to the
  read-only advanced fallback rather than being silently re-prefixed (which would
  rewrite a hand-authored expression). The pre-fix equality-slice shape is pinned
  to advanced by a regression test.
- Non-answer references (`meta.*`, `submission.*`) use their own root key, not
  `values.`. Only submitted answers carry the `values.` prefix.
- This is why the conductor / age-band work emits
  `{ age: [{ var: "values.applicant.dob" }] }`: the `age` op wraps the same
  prefixed answer reference.
