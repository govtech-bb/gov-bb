# Landing caches api_v2 pages and trips a breaker when it fails

2026-10-27 · `landing` api_v2 page reads · #3127

## Context

Every catch-all request awaited `getApiV2Page` with a 5 s timeout and no
cache, so a slow api_v2 cost every citizen up to 5 s per page, and a healthy
one was asked (and its markdown recompiled) on every view. With
`VITE_API_V2_URL` unset, client navigations still made a `/_serverFn` round
trip just to be told "miss". The issue's fix requirements set the budgets:
750 ms timeout, 3 failures → 30 s open, honour api_v2's
`max-age=60, stale-while-revalidate=300`, cache 404s, skip the call when unset.
Built on top of #3353 (#3126, same-site redirects), which edits the same 301
branch.

## What we did

- `apps/landing/src/lib/api-v2-cache.ts`: `createApiV2Cache().get(url, resolve, now)`
  — per-URL entries holding the *compiled* result, TTLs parsed from the
  stored `Cache-Control`, stale-while-revalidate with one in-flight refetch
  per URL, last-known-good on failure, a global breaker, a cap of 500.
- `api-v2-page.ts`: timeout 750 ms; results carry `cacheControl`; every miss
  carries a `reason`; `getApiV2Page` goes through one module-level cache.
- `$.tsx`: skips the server fn when `import.meta.env.VITE_API_V2_URL` is unset.
- Checked by hand on the dev server against a stub api_v2 (hung / page / 404):
  +~750 ms per failing load, silence for 30 s after the third failure, one
  stub hit for five loads of a page and of a 404, cached page still served
  while the stub hung.

## Why we did it that way

**TTLs come from api_v2's headers, not landing constants.** #2702 and #2850
already decided "the time-to-live lives in api_v2's headers". Two regexes make
pages (60 + 300 s), 404s (10 s) and `no-store` (stored nowhere) one code path.
So the 404 TTL is **10 s, not the issue's 60 s**: api_v2 chose 10 s so a
just-published URL appears quickly. If 60 s is wanted, change `NOT_FOUND_READ`
in api_v2.

**A small module, not `resolveCachedValue`, undici or nitro's cache.**
`cached-resolver.ts` has a fixed TTL, refetches synchronously and needs a
throwing fetcher; extending it would change two other callers. undici's
shared cache isn't a landing dependency, caches raw JSON (recompiling
markdown per hit), doesn't coalesce revalidations and needed the #2850 leak
fix. Nitro's `defineCachedFunction` has a fixed `maxAge`, an unbounded store
under visitor-controlled keys, and vitest doesn't boot nitro.

**`reason` splits answers from failures.** `not_found`, `rejected` (any 4xx),
`bad_redirect` and `compile` are api_v2 *answering* — cached for their
header's TTL, reset the failure count. `no_target`, `status` (a 5xx),
`malformed`, `timeout`, `network` are api_v2 *failing* — never cached,
counted by the breaker. `unconfigured`, `skipped`, `circuit_open` are
landing's own. A compile error is cached so an editor's typo isn't
recompiled per view.

**A 4xx doesn't count toward the breaker (found in review).** The first cut
counted every non-200/301/404 status. api_v2 answers 400 to a `url` over 512
characters, so three long junk paths from any visitor would have switched
api_v2 off site-wide for 30 s, repeatable every window. `malformed` and
`no_target` stay failures even though one bad URL could produce them: api_v2
validates its own 200 and 301 bodies against a schema, so either one points
at a proxy or a broken API rather than a single record.

**Failures that land after the breaker opened are ignored.** Concurrent
requests already in flight when the third failure tripped it used to keep
counting, re-opening it early or leaving a count that re-opened it after one
new failure. Now the breaker only counts requests that started while it was
closed.

**`bad_redirect` is cacheable (a user decision).** #3353 turned an off-site
301 into a plain miss; here it's bad content, not a broken api_v2, so it must
not trip the breaker or refetch per view. A 301 with no target at all stays a
failure (`no_target`), since that looks like a proxy rather than api_v2.

**Breaker resets fully after 30 s, no half-open probe.** Fewer lines, and the
issue asks only for "then try again". After the window, three new failures
re-open it.

**Evict the oldest non-page first, then FIFO.** 116 real pages fit many
times in 500, but URLs are visitor-controlled: plain FIFO let 500 junk 404s
push out every page, including the last good copy served during an outage
(review finding; the plan had accepted plain FIFO). A ≤500-entry scan for the
oldest non-page fixes that; LRU stays deferred (`ponytail:` comment).

**Gating on `import.meta.env` in the loader.** The loader is isomorphic, so
only a build-time value lets the client bundle skip the RPC. That makes the
server fn's runtime `process.env.VITE_API_V2_URL` fallback irrelevant for
navigations; no environment relies on it and `.env.example` already called
the value build-baked.

**A timeout while reading the body is `timeout`, not `malformed`.** The
first cut parsed the body with `.catch(() => null)`, which swallowed the abort.
Same caching outcome, but #3134 will log the label.

## Open questions

- #3134 should build its header/log on `reason`, not a second field.
- No `stale-if-error` bound: a cached page serves at any age during an outage,
  like the app's other caches. Add api_v2's 86 400 s bound if needed.
- Amplify may freeze compute between requests, stalling a background
  refetch until the next thaw (where it may land as a `timeout`). Not
  verified; watch for spurious breaker trips in sandbox logs.
- The landing build wasn't run locally, so the `/* @__PURE__ */` marker that
  keeps the cache out of the client bundle is unverified (`grep -rl
  circuit_open apps/landing/.amplify-hosting/static` after a build).
- The cache key is the URL alone, safe only while landing never forwards
  `x-preview-token`; the module comment says so.
