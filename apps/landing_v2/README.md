# landing_v2 — spike site

Server-renders content pages from `api_v2` (#2702), with the
`@govtech-bb/block-kit` renderer and the GOV.BB design system. A citizen gets
finished HTML: no spinner, and the browser never calls `api_v2`.

This is a spike, not the beginning of a new front end. The real migration
strangles `apps/landing` in place.

## How a page is served

- `/` lists the published pages; every other path is resolved against
  `content_pages.url` by the `$` route.
- Route loaders call only server functions (`src/server/pages.ts`). On the
  first request they run during SSR; on a client-side navigation the browser
  calls landing_v2's own server, which calls `api_v2`.
- Reads go through undici's HTTP cache in `shared` mode (`src/server/api.ts`),
  so `api_v2`'s `Cache-Control` sets the time-to-live: a minute fresh, five
  minutes stale-while-revalidate, a day stale-if-error. The cache is in
  memory, one per process.
- Every document is validated against `pageDocumentSchema` before it renders.
  A malformed document is an error naming its slug and the failing field. An
  unreachable `api_v2`, or one answering 5xx with nothing cached to serve (the
  database down), is a 503 naming `api_v2` and the error code or status. Both
  messages are shown on the page in full.

## Environment

Both are server-only and baked into Nitro `runtimeConfig` at build time,
because the Amplify SSR Lambda never sees the Console's variables at runtime.
A build without either still succeeds, so CI can build with no environment,
but the built server then fails at its first request with an error naming the
missing variable. `vite dev` falls back to the local ports. `.env` is read by
`vite dev` only; export the variables in the shell for `vite build`. See
`.env.example`.

| Variable     | What it is                            | `vite dev` default      |
| ------------ | ------------------------------------- | ----------------------- |
| `API_V2_URL` | `api_v2`'s base URL                   | `http://localhost:3020` |
| `FORMS_URL`  | The forms app, for Start buttons      | `http://localhost:3000` |

## Running it

```bash
pnpm exec nx run landing_v2:dev        # vite dev on :3030
API_V2_URL=… FORMS_URL=… pnpm exec nx run landing_v2:build
pnpm exec nx run landing_v2:test       # vitest, against a throwaway server
pnpm exec nx run landing_v2:e2e        # the built server's status codes
pnpm exec nx run landing_v2:typecheck
pnpm exec nx run landing_v2:lint
```

`build` runs `vite build` for the Nitro `aws_amplify` preset, then
`scripts/check-no-secret-leak.mjs`, which fails the build if either value
appears in a client asset. The built server is
`.amplify-hosting/compute/default/server.js`, and it listens on port 3000.

`e2e` builds a second copy of the server with Nitro's `node-server` preset,
into `.output/` rather than the Amplify output, because the Amplify server
can only listen on port 3000. It runs that server against a throwaway
`api_v2`, with no Postgres, and checks the status a citizen gets: 503 on a
page and on the server-function RPC when `api_v2` answers 5xx or can't be
reached, and still 200, 500 and 404 for a healthy page, a malformed document
and an unknown url.
