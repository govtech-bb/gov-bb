# landing_v2 server-renders from a cached api_v2 (#2702)

## Context

#2702 asked for a server-rendered `apps/landing_v2` whose pages come from `apps/api_v2`'s database through a cache, with no browser call to the API, a publish visible within a minute and no rebuild, and drafts never served. The plan (`docs/plans/2702-landing-v2.md`, assumptions posted on the issue) built on two open PRs: #2807 (`api_v2`, `block-kit` as a CommonJS library) and #2789 (the React renderer and a `landing_v2` scaffold that fetched from the browser). The branch is based on and targets `feat/v2-api-init`.

## What we did

- `api_v2`: per-endpoint `Cache-Control` (`PUBLIC_READ` / `EDITOR_READ` constants), set only after the store call succeeds; the `onSend` ETag hook falls back to `no-cache` instead of overwriting; `/pages/by-url` hides drafts unless `?drafts=true` (#2802); landing_v2's origins out of CORS; OpenAPI regenerated.
- `block-kit`: #2789's renderer copied verbatim and re-exported from the barrel; `collectionsFor` on `./document`; tsconfig on `nodenext`.
- `landing_v2`: `src/server/api.ts` (one undici `Agent` + `interceptors.cache({ type: "shared" })`, 5 s timeouts, typed `ApiResult`), `src/server/pages.ts` (load, validate, fetch collections in parallel; `ApiUnavailableError` → 503), `src/server/config.ts` (server-only URLs via Nitro `runtimeConfig`), `src/server/status.ts` (restores the 503 on SSR), routes, head tags, the copied secret-leak check.
- A live acceptance pass against local Postgres (8/8 rows) and the local gate. #2831 filed for an `api_v2` crash found on the way.

## Why we did it that way

- **TTL lives only in `api_v2`'s headers.** Nitro's `defineCachedFunction` would have worked but moves the policy out of the API, so "which endpoint is cacheable" stops meaning anything. undici's shared-mode cache obeys the header. That is also why the public policy has **no `s-maxage`**: undici reads it as proxy-revalidate and switches off both `stale-while-revalidate` and `stale-if-error`.
- **Error responses are never cacheable.** The first api_v2 commit set `Cache-Control` before the awaited store call, so a 500 would have advertised itself as publicly cacheable for a minute. Review caught it; the header now goes on after the data is in hand, and a test pins it.
- **No build-time failure without `API_V2_URL` / `FORMS_URL`.** The plan's assumption 8 wanted a production build to fail without them. CI's `nx affected -t build` and the CLAUDE.md `nx run-many -t build` gate set no environment, so that would have failed every PR. We followed `apps/landing`'s pattern instead: the build bakes `process.env.X ?? ""` into `runtimeConfig`; the runtime resolver throws at the first request in production; `vite dev` falls back to localhost. `.env` reaches `vite dev` only, never a build's snapshot.
- **A root-route middleware for the 503.** `setResponseStatus(503)` in a server function does not change the SSR page status: TanStack Start sets it from the router (500 for any failed loader) and only the `/_serverFn` RPC path saw the 503. A route-level `server.middleware` re-applies it; a `start.ts` `requestMiddleware` would have replaced the default CSRF protection.
- **Any api_v2 5xx is a 503, not only a refused connection.** With Postgres closed, api_v2 stays up and answers 500; the acceptance row says an uncached page gets 503 naming api_v2. Cached pages still render through `stale-if-error`, which covers 500–504 during revalidation but not a dead process.
- **`nodenext` for block-kit.** `@govtech-bb/react` is ESM-only (an `exports` map, no `main`), invisible to the `moduleResolution: node` the base tsconfig gives a CommonJS library. `module` + `moduleResolution: nodenext` lets tsc see it, output stays CommonJS, `./document` emits byte-identically, and `api_v2` still has no `react` in its dist. `landing_v2` bundles block-kit's source through `tsconfigPaths`, so the CommonJS renderer output is never executed.
- **`.validator()`, not `.inputValidator()`.** The installed start-client-core (1.170) deprecates `inputValidator` and warns on every build; `apps/landing` still uses the old spelling.

## What we almost got wrong

- Planned to run the api_v2 and block-kit sessions in parallel; one worktree and one git index made that a bad idea, so they ran in sequence.
- Ruled `inputValidator` from a stale grep and had to reverse it on the implementer's evidence.
- `127.0.0.1:1` is a fetch-blocked port, not a refused connection, so the first "unreachable" check proved nothing; a freed high port does.
- The Nitro Amplify server ignores `PORT` and always listens on 3000.

## Open questions

- `lib: ["ES2022", "DOM"]` on block-kit lets `./document` use DOM globals without a compile error; a `/// <reference lib="dom" />` in the two renderer files that need it would scope it. For #2807's author to choose.
- `@govtech-bb/react` is a hard dependency of block-kit, so api_v2's install closure now includes the design system it never loads. Peer dependency or a later split.
- In undici's synchronous revalidation path (a page idle past `max-age` + `stale-while-revalidate`), a 304 that carries `Cache-Control` evicts the entry and the next request is a full GET; the background path merges it correctly. One extra read per reawakening; the ETag never spared Postgres anyway.
- Follow-ups filed: #2833 (a Start harness for the 503 path), #2834 (`response.json()` rejections outside the typed result), #2835 (negative caching of by-url 404s). #2831 tracks the `api_v2` pool crash.
