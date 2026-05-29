# 0017 — Recipe ref resolution fails loud

**Date:** 2026-05-28
**Status:** Accepted
**Related:** [#359](https://github.com/govtech-bb/gov-bb/issues/359). Sits alongside the catalog-dependent validate-endpoint backstop pattern from [0010](0010-form-data-fieldids-are-recipe-wide-unique.md).

## Context

A recipe element points at a component/block via a `ref` (`components/text`,
`blocks/name`). The Zod schema validates only the ref *format* (the
`^components/` / `^blocks/` prefix), never that the ref *exists* in the registry
catalog — by design, so `packages/form-types` stays free of a registry
dependency (0010).

Ref *existence* is therefore resolved later, at hydration. Two hydrators do this
independently:

- `packages/form-builder/src/resolution.ts` `hydrateForm()` — the **preview**
  path.
- `apps/api/src/registry/resolution.ts` — the **production renderer** path.

These diverged. The production resolver threw `UnresolvableComponentError` on an
unknown ref; the preview hydrator did `console.warn` + `continue`, **silently
dropping the field**. The same bad recipe (a removed/renamed component, a recipe
authored against a different registry version) quietly lost a field in preview
but detonated in production — the worst kind of inconsistency, because preview is
exactly where an author would expect to catch it.

## Decision

Every code path that resolves recipe component/block refs **must fail loud on an
unknown ref** — collect all offending refs in one pass, then throw (or, at a
user-facing validation endpoint, report them all as issues). A ref that does not
resolve is never silently dropped.

Preview hydration and production rendering **must stay behaviorally consistent**
on ref resolution: if one rejects an unknown ref, so must the other.

Concretely, as of #359:

- `hydrateForm()` collects unknown refs across the whole recipe and throws
  `UnknownRefError` (carrying every `{ ref, path }`), mirroring the API
  resolver's `UnresolvableComponentError`.
- `/builder/registry/validate` walks every `step.elements`, resolves each ref
  against the catalog, and returns `{ ok: false, issues }` listing all unknown
  refs — catching the problem before preview/render. This is a catalog-dependent
  check, so it lives at the endpoint, not in `validateFormContract` (per 0010).

## Consequences

- **Collect-all, not fail-fast.** Resolution surfaces *every* unknown ref in one
  pass so an author gets a complete report, not a fix-one-rerun loop. New
  resolution paths should follow this shape, not throw on the first miss.
- **A third hydrator must not regress to silent-skip.** Any future code that
  expands recipe refs (a new renderer, a migration, an export) inherits this
  constraint: unknown refs fail loud. Don't reintroduce `console.warn` + skip.
- **The schema stays format-only.** Existence is a catalog-dependent concern and
  remains out of `form-types` (0010). Do not "fix" unknown refs by tightening the
  Zod regex or pulling a catalog into the schema layer.
- **No client-side existence pre-flight.** `/validate` is the single source of
  truth for ref existence; the client renders the server's issues. A client
  catalog can lag the server's and would risk false-positive "unknown ref" errors
  on refs the server would resolve.
