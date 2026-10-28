# Landing's fallback to static content is never silent

2026-10-28 · `landing` api_v2 page fetch · #3134

## Context

Landing asks api_v2 for a page and falls back to the static markdown on any
miss. A fallback caused by api_v2 failing looked the same as "api_v2 has no
such page": a normal 200, plus at most a free-text `[api-v2] …` warning. A
smoke test (#3140) couldn't assert which source served a page, and an alert
couldn't count failures. This branch is stacked on #3357 (#3127), which had
already added a typed miss `reason` and the cache and breaker.

## What we did

- Every `$` response that renders a page carries `x-content-source`:
  `api_v2`, `api_v2-stale`, `static` or `static-fallback`. The value comes
  from `contentSource(result)` and is set by the route's `headers` option.
  Redirects and 404s don't carry it.
- Each failed or unusable api_v2 fetch logs one JSON line,
  `{"event":"api_v2_fallback","reason",url,status?,error?}`, through
  `logFallback`. The free-text warnings are gone.
- A breaker trip logs once, as its own event `api_v2_circuit_open`.
- One `REASONS` table in `api-v2-log.ts` classifies each miss reason: whether
  it is a failure (breaker, not cached), its header value, and its log level.
- The contract is in the doc comment at the top of `api-v2-page.ts`.

## Why we did it that way

**Three header values, not two.** #3140 suggested `api_v2 | static`. With
two, "api_v2 has no such page" and "api_v2 is down" both read `static`, and
the only way to tell them apart is the logs. The third value costs one string
and answers the first question an on-call reader asks.

**The log level follows the breaker.** Every reason the breaker counts
(`status`, `timeout`, `network`, `malformed`, `no_target`) logs at `error`;
answers landing can't use (`rejected`, `bad_redirect`, `compile`) log at
`warn`. The first version split by "outage vs bad content", so `malformed`
and `no_target` logged at `warn` while still opening the breaker: one bad page
could stop api_v2 for every URL for 30 s with no `error` line to say why
(review on #3365). A level-based metric filter (#3364) now catches every
breaker-counted failure.

**One table, not three lists.** The failure set, the header mapping and the
level at each call site had drifted apart (the mismatch above).
`REASONS: Record<ApiV2MissReason, …>` makes the compiler demand a row for
every reason, and the cache, `contentSource` and `logFallback` all read it.

**A 4xx other than 404 logs at `warn`.** It used to be silent, but a 401 or
403 from an auth or WAF change would then look like "no page" (408 and 429
are `status` failures since #3357). It still doesn't count toward the
breaker, so junk URLs (for example ones over api_v2's 512-character limit)
can't open it. Its header stays `static`.

**Silent: `not_found`, `unconfigured`, `skipped`.** A 404 is the normal
state for every page not yet migrated, and for bot probes.

**`api_v2-stale` for a kept copy.** When the cache serves its last good page
because a fetch failed or the breaker is open, the header says
`api_v2-stale`, so the header agrees with the failure line and the #3140
smoke can see an outage while the cache still has copies. A fresh hit, and a
hit inside `stale-while-revalidate` (served before any refetch has failed),
stay `api_v2`. Only pages are marked: a kept redirect sends no header anyway.

**The breaker trip is its own event.** The request that trips the breaker
already logged its own reason; logging the trip as another `api_v2_fallback`
made the fallback count one too high per trip. `api_v2_circuit_open` is a
state change. Requests turned away while it is open don't log, so an outage
gives three failure lines and one `api_v2_circuit_open` line every 30 s.

**The network error keeps its cause.** Node's `fetch` fails with
`fetch failed`; the reason (`ECONNREFUSED`, `ENOTFOUND`, TLS) is in
`error.cause`, so the message joins the cause chain.

**Only rendered pages carry the header.** A redirect or `notFound()` thrown
in the loader has no `loaderData`, so `headers` sends nothing. We changed the
contract rather than add `setResponseHeader` before each throw: a server
function's response isn't the document response, and the smoke checks pages.

**A route `headers` option, not `setResponseHeader`.** A server function's
response is not the SSR document response (see the landing_v2
`setResponseStatus` quirk). Start merges each matched route's `headers()`
into the document response, and that function receives `loaderData`.

**`logFallback` and `REASONS` live in `api-v2-log.ts`.** `api-v2-page.ts`
imports the cache module and creates the cache when it loads, so neither can
sit in the page module without a circular import. The log module imports
only types, so both other modules can import it.

## Open questions

- **A 404 after a failure.** A page only in api_v2, with api_v2 down and no
  cached copy, 404s with no header, so the smoke can't tell it from "no page"
  except by the failure line.
- **Untested against Amplify.** Whether CloudWatch Logs Insights finds the JSON
  fields in Amplify compute logs, and whether the level shows in the line, is
  still to be checked when an environment sets `VITE_API_V2_URL` (#3311,
  #3364).
- **Not run against a real api_v2.** I didn't run landing against a local
  api_v2, so `api_v2`, `api_v2-stale` and the 500 → `status` case are covered
  by unit tests only. The `static-fallback` (network) and `static` (unset) cases were checked
  with `curl` on the dev server.
