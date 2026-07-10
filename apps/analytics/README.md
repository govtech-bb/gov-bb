# @govtech-bb/analytics-app

Internal analytics dashboard for the alpha.gov.bb platform — top pages, form
funnels (starts, completion, drop-off, field errors and *why* fields fail),
session-based journeys/funnels, and search queries. TanStack Start + React +
Tailwind on **Amplify SSR compute** (Nitro), styled with the `@govtech-bb/react`
design system.

```bash
pnpm dev      # start on port 3100 (SSR dev server)
pnpm test     # run Vitest unit tests
pnpm build    # production build → .amplify-hosting (aws_amplify Nitro preset)
```

The page is `noindex` and carries no navigation — it's a standalone internal
view, not part of the public site.

## How it works

The dashboard fetches its data **server-side** from the API's cached endpoint
`GET /analytics/report` (see [`src/lib/report.ts`](./src/lib/report.ts), a
TanStack `createServerFn` loader). The API refreshes that cache from Umami every
15 minutes on a schedule (advisory-locked so exactly one ECS task crawls), so:

- data is near-real-time (≤15 min stale) without crawling Umami per request;
- the Umami API key stays in the API — this app never sees it;
- the browser never talks to Umami or the API directly (the fetch is SSR/RPC).

On cold start, before the first refresh populates the cache, the endpoint
reports `ready: false` and the page shows a "warming up" state. If the API is
unreachable the loader degrades to the same state rather than erroring.

Report shaping lives in the shared [`@govtech-bb/umami-analytics`](../../packages/umami-analytics)
package (used by both this app and the API's refresher, so the report shape is
produced in exactly one place). The committed
[`src/content/analytics-snapshot.json`](./src/content/analytics-snapshot.json)
is real, PII-safe data kept only as a rendering **test fixture** — it is no
longer a data source.

## Configuration

One env var, the API base URL (a public URL — **not** a secret):

```env
VITE_API_URL=https://forms.api.sandbox.alpha.gov.bb   # per environment
```

It is snapshotted into the Nitro server runtime config at build time (see
[`vite.config.ts`](./vite.config.ts)) because the Amplify SSR Lambda never sees
Console env vars at runtime. Unset → falls back to the sandbox default. The
Umami crawl credentials (`UMAMI_*`) live on the **API**, not here.

## Deployment

Deployed as **Amplify SSR compute** (Nitro `aws_amplify` preset), like the
landing and chat apps. `amplify.yml` serves `apps/analytics/.amplify-hosting`.
Set `VITE_API_URL` in the Amplify Console per environment. Data freshness is
handled entirely by the API's scheduled refresh — there is no snapshot to
regenerate or commit.
