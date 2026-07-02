# @govtech-bb/analytics-app

Internal analytics dashboard for the alpha.gov.bb platform — top pages, form
funnels (starts, completion, drop-off, field errors and *why* fields fail), and
search queries. Vite + React + Tailwind, styled with the `@govtech-bb/react`
design system.

```bash
pnpm dev      # start on port 3100
pnpm test     # run Vitest unit tests
pnpm build    # production build
```

The page is `noindex` and carries no navigation — it's a standalone internal
view, not part of the public site.

## How it works

The dashboard renders **static data** from a JSON snapshot committed to the repo
([`src/content/analytics-snapshot.json`](./src/content/analytics-snapshot.json))
and bundled at build time. It never calls Umami at request time (that fanned out
to ~30 calls per view and made the page slow), and the build does no fetching
either — so deploys need no `UMAMI_*` env vars and previews are stable.

Report shaping lives in the shared [`@govtech-bb/umami-analytics`](../../packages/umami-analytics)
package; form titles/categories are resolved from [`@govtech-bb/content`](../../packages/content)
so the snapshot is self-describing.

## Refreshing the snapshot

```bash
pnpm run generate:analytics   # fetch from Umami, rewrite the snapshot, then COMMIT it
```

The generator auto-loads the repo-root `.env` for credentials. Set these (see
the forms/landing Umami setup for where the website IDs come from):

```env
UMAMI_API_KEY=...
UMAMI_LANDING_WEBSITE_ID=...
UMAMI_FORMS_WEBSITE_ID=...
UMAMI_API_URL=...                 # optional — defaults to Umami Cloud
UMAMI_TIMEZONE=America/Barbados   # optional
```

**Resilient by design:** if the credentials are absent or any fetch fails, the
existing committed snapshot is left untouched and the script exits 0 — running
it without creds can never blank out the committed data.

## Deployment

Deployed as a static build on **AWS Amplify**. Because the data is baked into the
committed snapshot, the build fetches nothing and needs no environment variables.
Refresh the dashboard by regenerating the snapshot locally and committing it.
