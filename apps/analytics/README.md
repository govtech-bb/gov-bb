# @govtech-bb/analytics-app

Internal analytics dashboard for the alpha.gov.bb platform — a slim site
overview (visitors, pageviews, top pages) plus a list of forms; select a form to
load its **funnel** (start → review → submit, distinct visitors + drop-off),
**top journeys**, and **submit-error rate**. TanStack Start + React + Tailwind on
**Amplify SSR compute** (Nitro), styled with the `@govtech-bb/react` design
system.

```bash
pnpm dev      # start on port 3100 (SSR dev server)
pnpm test     # run Vitest unit tests
pnpm build    # production build → .amplify-hosting (aws_amplify Nitro preset)
```

The page is `noindex` and carries no navigation — it's a standalone internal
view, not part of the public site.

## How it works

The dashboard reads Umami **directly, server-side, in real time** — no database,
no cron, no committed snapshot.

- On page load, a TanStack `createServerFn` loader
  ([`src/lib/report.ts`](./src/lib/report.ts) → [`umami-server.ts`](./src/lib/umami-server.ts))
  fetches the site overview: `/stats` + top-pages `/metrics` from the **landing**
  Umami website, and the published-forms list from `GET /form-definitions`.
- When a form is selected, a second server function fetches that one form's
  detail from the **forms** Umami website: `POST /reports/funnel` (steps
  `<formId>:form-start → :form-review → :form-submit`), `POST /reports/journey`,
  and a `/metrics` lookup for the `<formId>:form-submit-error` count.
- The Umami API key stays on the server (Nitro runtime config); the browser
  never talks to Umami. A short **~60s in-memory TTL** ([`cache.ts`](./src/lib/cache.ts))
  dedupes calls across refreshes / concurrent loads. Any Umami error degrades to
  an empty section rather than throwing, so the page always renders.

Funnel/journey shaping and the thin Umami REST client live in the shared
[`@govtech-bb/umami-analytics`](../../packages/umami-analytics) package.

> Funnel counts are distinct **visitors** (Umami's funnel-report semantics).
> Per-step reached-vs-completed (#1915) is not shown in the real-time model — it
> needs the step in the URL (#1931).

## Configuration

Set on the deployment (Amplify Console), per environment:

```env
UMAMI_API_KEY=...                  # secret — server-only, never exposed
UMAMI_LANDING_WEBSITE_ID=...       # landing site (overview stats/pages)
UMAMI_FORMS_WEBSITE_ID=...         # forms site (funnels/journeys/events)
VITE_FORMS_API_URL=https://forms.api.sandbox.alpha.gov.bb   # public — lists forms
```

These are snapshotted into the Nitro **server** runtime config at build time
(see [`vite.config.ts`](./vite.config.ts)) because the Amplify SSR Lambda never
sees Console env vars at runtime. They are deliberately **not** `VITE_`-prefixed
(that would inline them into the browser bundle). With `UMAMI_*` unset the page
renders a "not configured" message.

## Deployment

Deployed as **Amplify SSR compute** (Nitro `aws_amplify` preset), like the
landing and chat apps. `amplify.yml` serves `apps/analytics/.amplify-hosting`.
The standalone `gov-bb-analytics` Amplify app must run as SSR/compute (not static
hosting) and have the env vars above set. There is no snapshot to regenerate and
no scheduled job — data is fetched live on each request (with the short TTL).

<!-- preview smoke test: analytics -->
