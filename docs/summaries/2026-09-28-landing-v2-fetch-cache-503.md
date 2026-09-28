# landing_v2 fetches pages server-side, caches per URL, and answers real 404, 301 and 503

## Context

Session 3 of the #2820 landing plan (#2828). Session 2 had the `$` route
rendering a committed fixture through a server-function stub. This session
makes the stub real: one server-side `GET /pages?url=` to `simple_mock_api`
per request, a per-URL last-known-good cache copied from v1, and the SEO
statuses the audit on #2819 demands — an unknown page is a 404, a bare slug is
a 301, and an outage serves the cached copy or a genuine 503, never a 200
"unavailable" page or a redirect.

## What we did

Two commits. `c1a5cba5` is the feature: `src/lib/content-api.ts` (fetch,
status mapping, cache, the `getPage` server function), a verbatim copy of
v1's `cached-resolver.ts` and its test, `src/start.ts` (the request
middleware that keeps the 503), the route's error mapping and error page,
`scripts/check-no-api-url-leak.mjs` wired into `build`, and
`.env.example`. `6d9e55de` is the hardening the task review asked for:
trailing-slash trimming on the base URL, shape checks on the 200 and 301
bodies, cancelling unread response bodies, and moving the route error
component to `src/components/ContentRouteError.tsx` with tests for both
branches. Forty-two tests in the app now.

## Why we did it that way

**The 503 is set inside the server function, not the loader, and a request
middleware re-issues it.** The plan put `setResponseStatus(503)` in the
loader. The loader is isomorphic and Start's import protection refuses
`@tanstack/react-start/server` there, so the status has to be set in the
server-only handler. During SSR the server function runs in-process under
the same request context, so `getResponseStatus()` in the middleware sees
it. The middleware is still needed: a thrown loader error makes the router
answer 500 and h3 returns that response untouched. Re-wrapping the same
body with status 503 is the smallest thing that works, and the live check
confirmed 503 with the "temporarily unavailable" copy for an uncached URL
while the API was stopped.

**The CSRF middleware is re-added with Start's own filter.** Defining
`requestMiddleware` replaces Start's default, and the plan said to put
`createCsrfMiddleware()` back. Bare, that middleware rejects any request
without `Sec-Fetch-Site`, `Origin` or `Referer` headers, which describes
every crawler page fetch. Start's default applies it to server-function
calls only, so that filter is mirrored. The plan's sketch would have 403'd
the exact traffic the spike is for.

**A route's error component has to carry the generic 500 copy itself.** The
plan wanted the route to show the outage page for the API error and let
everything else fall through to the root's `ServerErrorPage`. On the server
an errored match renders only the route's own `errorComponent`; there is no
boundary to rethrow into. So `ServerErrorPage` became a shared component and
the route's error component picks a branch by the error message. A class
would not survive hydration: Start serialises only `message` to the client.

**A 404 is a result; everything else is a failure.** `fetchPage` returns
`not-found` for a 404 without touching the body and throws for any other
status, a network error, or malformed JSON. The cache treats a throw as
"API down": a warm entry keeps serving (a page, a redirect, or a 404 alike),
a cold miss retries three times and then yields `unavailable`, which is
never cached. Throwing on a 404 instead would have turned every unknown URL
into a 503 during an outage and kept serving unpublished pages afterwards.

**The review's hardening was taken now, not deferred.** A trailing slash on
`CONTENT_API_URL` produced `//pages`, which Express rejects with a 404 that
the cache then remembered as "page not found" — the worst SEO failure,
silently. v1's own base-URL helper trims the slash; the copy had dropped
that. A 301 body without `redirect` would have resolved to the current
location and cached a redirect loop, and a 200 that is JSON but not a page
would have been cached and crashed the render, so both bodies are now
shape-checked and rejected as failed fetches. Unread bodies on the 404 and
throw paths are cancelled so undici releases the connection; a 404 is a
normal outcome here, not a rarity.

## Open questions

- The per-URL cache is unbounded: every scanner path becomes a permanent
  `not-found` entry. Fine for a local spike; cap it before any deployment
  (router-core ships an LRU).
- Worst case for a cold miss against a black-holed API is about 62 s
  (four 15 s attempts plus backoff), longer than the 28 s SSR cap the team
  hit on Amplify WEB_COMPUTE. Revisit the timeout and retry counts before
  deploying, and note the timeout guards the headers, not the body read.
- `head()` yields an undefined title on 404 and 503 renders; Session 4's
  head builder must keep every `loaderData` read optional.
- The route error copy no longer offers a contact action, because v2 has no
  feedback route.
