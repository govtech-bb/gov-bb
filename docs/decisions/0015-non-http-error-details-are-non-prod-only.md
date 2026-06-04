# 0015 — Non-HttpException error details are non-prod only

**Date:** 2026-05-28
**Status:** Accepted
**Related:** [#343](https://github.com/govtech-bb/gov-bb/issues/343)

## Context

The global exception filter has two response paths. An `HttpException` body
is surfaced to the client unconditionally — `message`, `statusCode`, and
`meta.errors` for validation — because those bodies are *authored*: they
come from `AppError`, `class-validator`, or explicit `throw new
HttpException(...)`. A non-`HttpException` `Error` is a *rogue* throw the
code did not plan for; the filter collapses it to a generic
`"An unexpected error occurred"` with statusCode 500 and no body detail.

Issue #343 surfaced an operator-pain consequence of the generic path: when
a non-`HttpException` reaches the response in any environment, the body
gives the operator nothing to work with, and they fall back to grepping
CloudWatch (or shelling into the container) to find the real cause. The
obvious fix — include the exception `name` and `message` — is fine in
dev/staging but is a leak in prod (stack traces, paths, sensitive
substrings in messages).

A second, separate fix is also being made for the same incident: wrapping
loader/internal errors as a typed `AppError.internal(detail)`. We considered
and **rejected** that approach. `AppError.internal` would be an
`HttpException` with a 500 status — and the filter surfaces those bodies
unconditionally. Adopting it would push detailed messages into prod
responses by construction. Env-gating inside `AppError`, or adding a second
filter branch that special-cases internal `AppError`s, restores the
constraint but at the cost of two policy chokepoints instead of one.

## Decision

Implementation detail of a non-`HttpException` `Error` is added to the
response body under `meta.error = { name, message }` **only when
`NODE_ENV !== "production"`**. The env gate lives inside `parseException`
in `apps/api/src/common/exception.filter.ts` and nowhere else.

Prod responses for non-`HttpException` exits stay opaque: statusCode 500,
`"An unexpected error occurred"`, no `meta`.

Any future error class or filter branch that would carry operational
detail must route through this same env-gated `meta.error` path. It must
**not** bake operational detail into a 500 `HttpException` body, where the
filter would surface it unconditionally.

## Consequences

- **`AppError.internal(detail)` is off the table** under this policy. If
  that pattern is wanted for a future use case, it must either populate
  `meta.error` (env-gated by the filter) or the filter must grow an
  explicit env-gated branch for it. The single-chokepoint rule stands.
- **`meta.errors` (validation) and `meta.error` (implementation detail)
  are siblings, not an overload.** `meta.errors` is authored field-level
  errors and is surfaced in prod; `meta.error` is rogue-throw detail and
  is non-prod only. Tooling that scrapes responses can distinguish.
- **One env check, one policy.** Callers (services, controllers, other
  filters if any) never see `NODE_ENV`. The filter is the boundary.
- **Regression tests pin both halves.** `exception.filter.spec.ts`
  asserts `meta.error.name` + `meta.error.message` are present in
  non-prod, and that `meta` is undefined in prod, with `NODE_ENV`
  save/restore around the cases. A future refactor that drops the gate
  fails the prod test; a future refactor that drops the passthrough
  fails the non-prod test.
