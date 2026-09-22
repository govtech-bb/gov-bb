# landing_v2 — spike site

Renders the three spiked page documents out of the local Postgres, with the
same `@govtech-bb/block-kit` renderer the editor's preview pane uses.

## This app ships PGlite. Production will not.

PGlite is roughly 3MB gzipped. That is fine for an editor behind a login and
completely wrong for a citizen-facing page on mobile. It is here because the
spike needs zero infrastructure — no container, no connection string, no
deploy target — and because a single origin is the only way the editor and
the site can share one IndexedDB database.

In production `apps/landing` reads over HTTP from `api_v2` and will never
ship a WASM Postgres. The `DocumentStore` interface exists precisely so that
swap is a driver change and not a rewrite.

A working prototype invites the wrong conclusion, so: **this is not the
production shape.**

## It is also not the beginning of a new front end

`apps/landing_v2` is deleted when the spike ends. The real migration
strangles `apps/landing` in place behind a `ContentSource` interface, with a
feature flag and dual-read verification. A surviving fork means every bug
fixed twice for as long as it lives.

## Running it

There is no dev server here. Both apps are served from one Vite dev server
in `apps/editor_v2`, because IndexedDB is scoped per origin and an editor on
`:3001` cannot see a site on `:3000`.

```
pnpm exec nx dev editor-v2
```

- `/` — index of the seeded pages
- `/editor` — the block editor
- everything else — resolved against `content_pages.url`

## Known simplifications

- `openNow` uses a trimmed version of `apps/landing`'s `pharmacyStatus`: it
  reads the weekly hours and ignores the `bankHolidayHours` override and the
  "next opening" lookahead. The spike is testing whether a facet can be
  configured, not re-shipping the production finder.
- Sorting by distance falls back to name; the spike does not ask for
  geolocation.
