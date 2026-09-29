# A ten-second policy on the api_v2 by-url 404 (#2835)

## Context

Since #2702 ([summary](2026-09-27-landing-v2-cached-api-v2.md)), `api_v2`'s public reads carry `PUBLIC_READ` and `landing_v2` holds them in a shared undici cache, but the `/pages/by-url` 404 carried no `Cache-Control`, so every hit on an unknown url was a Postgres query. #2835 asked whether to give that 404 a short policy. The plan (`docs/plans/2835-api-v2-by-url-404-max-age.md`) had already picked `max-age=10`. The branch is based on and targets `v2-rewrite`.

## What we did

- `api_v2`: `NOT_FOUND_READ = "public, max-age=10"` beside `PUBLIC_READ` / `EDITOR_READ`, sent only from the by-url 404 without `drafts`; tests pin it and pin the drafts 404 and the `/pages/:id` 404 as header-less.
- `landing_v2`: `apiGet` reads a non-ok body to its end instead of cancelling it; two cache tests, one with the body sent after the headers (`holdBody` on the test server).
- `landing_v2`: undici `^7.29.1` → `^8.11.2`, with a test that a cached 404 is evicted once the cache passes its 1,024-entry cap.
- A comment on #2835 recording the decision and the collections finding; an end-to-end run against a throwaway Postgres, repeated after the undici bump (five unknown-url hits → one api_v2 request; a new url rendered under 8 s after publishing; `?drafts=true` uncached).

## Why we did it that way

- **Ten seconds, no `stale-while-revalidate` or `stale-if-error`.** The cost is at most ten seconds before a brand-new url appears; edits to existing pages are 200s under `PUBLIC_READ` and don't change. Stale-serving a cached "no page here" through an api_v2 outage would hide a page for up to a day, and ten seconds needs no background refresh.
- **Only the public by-url 404.** `?drafts=true` is the editor's lookup, and a draft must show the moment it exists. `/pages/:id` is editor-only. The error handler's 404s and the 500s keep #2702's rule that a failure never carries a policy.
- **Collections needed nothing.** `store.records()` on an unknown key returns `[]`, so `/collections/:key/records` already answers a cached 200. There's no 404 to give a policy.
- **Why landing_v2 changed at all.** The plan assumed undici would store the 404 once it carried `max-age`. It does, but its cache handler commits an entry only on `onResponseEnd`, and `onResponseError` destroys the pending write. `apiGet` called `response.body?.cancel()` on every non-ok response, so the 404 was stored only when its ~40-byte body happened to arrive in the same packet as the headers. On a real network that silently fails. The test that sends the body 50 ms after the headers made 2 requests before the fix and 1 after.
- **`.arrayBuffer().catch(() => undefined)`, not a bare read.** `cancel()` could never make `apiGet` reject. A bare read could, on a truncated or timed-out error body, turning a 404 or 5xx into a raw 500. The status has already decided the answer, so a body that fails to arrive is ignored. The price: an error response whose body stalls now waits up to the 5 s `bodyTimeout` before `apiGet` answers, where `cancel()` answered at once.
- **Why undici 8.** Caching 404s lets a visitor choose the cache key: any path reaches `/pages/by-url?url=<path>`. undici 7's `MemoryCacheStore` never deletes an expired entry, and its eviction, `splice(0, entries.length / 2)`, removes nothing from a url holding one entry. So every unknown url a scanner asked for stayed in memory for the life of the process (~1.7 KB each, measured). That is exactly the traffic #2835 targets. undici 8.11.2 rounds up (`Math.ceil`), so the store stays bounded; latest 7.x (7.30.0) still rounds down. Rejected: a bounded store of our own (about 40 lines to own, where the upstream fix already exists); accepting the leak for the spike; dropping the 404 policy. The cost of 8's eviction: passing the cap empties nearly the whole cache, real pages included, so a scan costs refetches instead of memory.
- **Rejected: a negative cache inside `landing_v2`.** #2702 decided that cache lifetimes live only in `api_v2`'s headers.

## What we almost got wrong

- The plan's consumer test (two lookups within ten seconds, one request) passes with the `cancel()` bug still in place, because the local test server sends headers and body together. Without the late-body test, this change would have shipped a negative cache that works locally and fails in production.
- The first version of this branch passed every test and the end-to-end run, and still leaked memory. The pre-merge review caught it by reading undici's store instead of its cache handler. The handler says *whether* a 404 is stored; only the store says whether it ever leaves.
- `api_v2`'s `tsc` build excludes `*.test.ts`, and Vitest doesn't type-check, so the new api_v2 tests were type-checked separately with a throwaway tsconfig.

## Open questions

- sajclarke (#2807's author) was tagged on #2835 to object to ten seconds before the PR merges.
- #2834's plan wraps `response.json()` a line above this change and adds `raw` / `contentLength` to the same test server; expect a small textual conflict, not a semantic one.
- If flushing the whole cache on overflow proves costly under real scans, the next step is a store with a smaller, explicit cap or least-recently-used eviction. Not needed for the spike.
