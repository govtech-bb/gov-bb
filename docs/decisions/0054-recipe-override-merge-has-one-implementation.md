# 0054 — Recipe override-merge has one implementation

## Context

Recipe→ServiceContract hydration runs in two places: the production serving
path (`apps/api/src/registry/resolution.ts`, async resolver) and the builder
preview path (`packages/form-builder/src/resolution.ts`, sync catalog). Each
contained a byte-identical override-merge function that deep-merges a field's
`validations` and `ui` while shallow-spreading the rest.

Keeping two copies in sync failed twice. A wholesale spread dropped
un-restated `validations` keys (#371) and `ui` keys (#789); each fix had to be
applied to both copies. The failure mode is "fix one, forget the other → the
builder preview silently diverges from what citizens are served."

## Decision

The recipe field-override merge lives in exactly one place:
`@govtech-bb/form-types` `applyFieldOverrides`. Every hydrator — the served
path, the builder preview, and any future consumer — calls it. Merge semantics
are never re-inlined into a `resolution.ts`.

What may legitimately differ per path, and is explicitly **out** of this single
source:

- The resolver shell — async (API, resolves refs over a `Promise`) vs sync
  (builder, looks up a catalog).
- The error type — `UnresolvableComponentError` (throws on the first
  unresolved ref) vs `UnknownRefError` (collects all misses, throws once).
- The block-iteration shell that flattens block elements before merging.

Only the field-override merge itself is shared.

## Consequences

- A change to override-merge semantics is made once, in `applyFieldOverrides`,
  and both paths move together — the preview cannot drift from the served form.
- A future third hydrator must consume `applyFieldOverrides` rather than copy
  the body.
- The merge is unit-tested at its source (`resolution-merge.spec.ts`, covering
  the #371/#789 shapes), and each consumer retains its own hydration-level
  #371/#789 regression test as a guard against re-inlining.
- A cross-path "byte-identical output" test was considered and rejected: it
  would force `apps/api` to depend on `@govtech-bb/form-builder`, and is
  redundant now that both paths call the same function.

Supersedes the prior approach of managing the duplication with paired
"merges identically in the other file" comments.
