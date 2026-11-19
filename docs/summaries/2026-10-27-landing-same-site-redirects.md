# Landing follows only same-site api_v2 redirects

2026-10-27 · `landing` api_v2 page fetch · #3126

## Context

When api_v2 returned a 301, `fetchApiV2Page` passed the target straight to
the catch-all loader, and the loader 301s the visitor to it. TanStack forwards
`href` as given, so an off-site target became a redirect that browsers cache.
The 301 doesn't have to come from api_v2: a load balancer's http→https 301
reaches the `Location` fallback, and a bad stored page url (`//evil.example/…`)
can come back through api_v2's bare-slug redirect.

## What we did

- `isSitePath` in `apps/landing/src/lib/api-v2-page.ts`. A 301 becomes
  `{ kind: 'redirect' }` only when its target is `/…`, with no second `/`, no
  backslash and no whitespace. Any other target logs an `[api-v2]` warning and
  becomes a miss.
- Table-driven tests in `api-v2-page.test.ts`, plus a manual check against a
  stub api_v2 on the dev server. `//evil.example` now gives a 404 and a
  warning; a same-site target still gives a 301.

## Why we did it that way

**Validate in landing, inside `fetchApiV2Page`.** Landing is the trust
boundary: it is the only place that sees every hop that can produce the 301.
Doing it in the fetch function, rather than in `$.tsx`, means the planned
cache (#3127) only ever stores checked results. It also keeps clear of the
`$.tsx` edits in #3125 and #3133.

**A regex, not `new URL(to, origin).origin === origin`.** The URL check needs
a try/catch and lets `/<TAB>evil` through, because the parser strips the tab.
The regex covers the shapes a browser treats as a different origin: `//`,
backslash, and whitespace the parser deletes. Percent-encoded forms such as
`/%2F%2Fevil` stay on the site and are allowed.

**A same-origin absolute URL is refused too.** api_v2 never sends one, and
this module doesn't know landing's own origin, so a miss is the safe default.

**Keep the `Location` fallback; keep the 301.** Once the target is checked,
both are harmless. A cached same-site 301 is the intended canonical redirect.

## Open questions

- api_v2's `PageUrl` regex (`^\/[^?#]*[^/?#]$`) still accepts
  `//evil.example` and `/\evil.example` when a page is saved. Tightening it
  (and regenerating `openapi.json`) would be a second layer of protection for
  the api owner. Deliberately not filed yet.
- #3134 may want to drop the `Location` fallback to get a separate "proxy, not
  api_v2" reason for falling back.
