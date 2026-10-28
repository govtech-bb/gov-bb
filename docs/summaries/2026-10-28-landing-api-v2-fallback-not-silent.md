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

- Every `$` page response carries `x-content-source`: `api_v2`, `static` or
  `static-fallback`. The value comes from `contentSource(result)` and is set
  by the route's `headers` option.
- Each api_v2 failure logs one JSON line,
  `{"event":"api_v2_fallback","reason",url,status?,error?}`, through
  `logFallback`. The free-text warnings are gone.
- A breaker trip logs once, as `circuit_open`.
- The contract is in the doc comment at the top of `api-v2-page.ts`.

## Why we did it that way

**Three header values, not two.** #3140 suggested `api_v2 | static`. With
two, "api_v2 has no such page" and "api_v2 is down" both read `static`, and
the only way to tell them apart is the logs. The third value costs one string
and answers the first question an on-call reader asks.

**`console.error` for outages, `warn` for bad content.** The user chose the
split: `status`, `timeout`, `network` and `circuit_open` are errors;
`malformed`, `no_target`, `bad_redirect` and `compile` are warnings. That
lets a level-based metric filter (#3364) catch outages without parsing
`reason`. The plan had recommended `warn` everywhere, because the alerts can
key on `reason` either way.

**Silent: `not_found`, `rejected`, `unconfigured`, `skipped`.** A 404 is the
normal state for every page not yet migrated, and for bot probes. A 4xx is
api_v2 answering junk URLs, for example ones over its 512-character limit.
Logging these would let any visitor fill the log. The header still shows
`static` for them.

**The breaker logs once per trip, not per request.** Requests turned away
while the breaker is open don't log, so an outage gives three failure lines
and one `circuit_open` line every 30 s, not one line per page view.

**A route `headers` option, not `setResponseHeader`.** A server function's
response is not the SSR document response (see the landing_v2
`setResponseStatus` quirk). Start merges each matched route's `headers()`
into the document response, and that function receives `loaderData`.

**`logFallback` lives in `api-v2-cache.ts`.** `api-v2-page.ts` imports the
cache module and creates the cache when it loads. If the helper sat in the
page module, the two files would import each other, and loading the cache
module first (as its test does) would crash.

## Open questions

- **Stale page served after a failure.** When api_v2 fails and the cache still
  has a page, the visitor gets that page with `x-content-source: api_v2`, yet
  the failure still logs. That's deliberate: the body did come from api_v2,
  and the failure is real. But the log count and the header can disagree.
- **Untested against Amplify.** Whether CloudWatch Logs Insights finds the JSON
  fields in Amplify compute logs, and whether the level shows in the line, is
  still to be checked when an environment sets `VITE_API_V2_URL` (#3311,
  #3364).
- **Not run against a real api_v2.** I didn't run landing against a local
  api_v2, so `api_v2` and the 500 → `status` case are covered by unit tests
  only. The `static-fallback` (network) and `static` (unset) cases were checked
  with `curl` on the dev server.
