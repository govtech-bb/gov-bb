# Shared TTL cache for the builder catalog (ARCH-03)

**Issue:** [#1405](https://github.com/govtech-bb/gov-bb/issues/1405) —
enhancement, area:backend/frontend, subsystem:form-builder, severity:minor.

## What changed

The byte-identical `{ data, expiresAt }` 60s TTL cache that was hand-rolled in
two places — `apps/form_builder_api/src/catalog.ts` (`getFullCatalog`) and
`apps/form_builder/app/server/registry.ts` (`getCatalogFn`) — is now one shared
helper, `ttlCache<T>(fn, ttlMs)`, exported from `@govtech-bb/form-builder`
(`packages/form-builder/src/ttl-cache.ts`). Both apps already depend on that
package, so no new dependency edge. Each memoizer dropped its module-level
`_catalogCache` and now wraps its loader in `ttlCache(...)`.

## Why it looks the way it does

**Only the memoizer is shared, not the merge logic.** The issue suggested the
two "catalog builders" could share their merge logic too. They can't:
`form_builder_api` builds the builtin catalog **+ DB custom components**
(TypeORM), while `form_builder` **fetches over HTTP** (`/builder/registry/catalog`)
with a DEV-only fallback to the built-in catalog. The only genuinely common
code is the `{ data, expiresAt }` cache wrapper, so that's all that was
extracted.

**No request coalescing — deliberate.** `ttlCache` does not dedupe concurrent
in-flight calls on a cold cache; each call invokes `fn`. This exactly matches
the behaviour of the two caches it replaced. Adding coalescing would have been
a behaviour change, and this PR is a pure refactor.

**The 120s stacked-lag is not fixed here.** `form_builder` fronts
`form_builder_api`, and both keep independent 60s caches — so a DB-added
component can still take up to two stacked 60s windows to appear. Cutting that
worst case needs shared invalidation across layers, which is out of scope. This
change removes the duplication, not the layering.

**`apps/api`'s registry cache was left alone.** `apps/api`'s
`registry.service.ts` uses a *keyed* `NodeCache` (per-component refs + a
`__loaded__` sentinel) — a different access pattern, and not part of the stacked
builder-catalog chain that causes the lag. Migrating it is a noted follow-up.

## Verification

`nx run-many -t build --exclude=landing,cms` (16 projects), `tsc -b`, and the
`form-builder` / `form-builder-api` / `form-builder-app` test suites all green.
The new `ttl-cache.spec.ts` covers a fresh hit (no re-invoke), a within-window
hit, and a refetch after expiry.
