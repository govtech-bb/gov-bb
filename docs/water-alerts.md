# Water-outage alerts (Wuh Water Doing?)

Migrates [alpha-wuh-water-doing](https://github.com/Zainab980/alpha-wuh-water-doing)
at `e37e25c1b338933e53c38729ec5fc194eb3eab24` into gov-bb. Reuses the earlier
`water-outages-service` implementation at `c6eba6c9`, updated for current main.

The service lives at `/health-and-emergency-services/water-outages` and retains
the prototype's parish picker, interactive Leaflet/OpenStreetMap map, location
lookup, current/general/past notices, water-storage advisory, and email alerts.
The shared gov-bb header, footer, breadcrumbs and feedback replace the prototype
chrome. Parish boundaries are from geoBoundaries gbOpen ADM1, CC BY 4.0; source
attribution is retained in the location module.

## Platform integration

- `apps/landing`: TanStack Start routes and server functions; the map loads only
  in the browser. Metadata registers the service in search and category listings.
- `apps/api`: NestJS `WaterAlertsModule`, BWA RSS feed parsing, opt-in/out endpoints,
  and an internal cron checker every 30 minutes. Emails reuse the existing SES
  configuration; no separate SMTP service or cron deployment is needed.
- `packages/database`: TypeORM entities and `CreateWaterAlertsTables1785917644000`
  add `water_subscribers` and `water_sent_alerts` to the existing Postgres database.
  The API runs pending migrations on startup, as it does for other services.

The BWA feed is cached for ten minutes. `checkedAt` is when that cached feed was
fetched. Expired cache failures and malformed feeds show an unavailable state;
sample notices are never served as live data. Requests have timeouts, and feed
size, notice fields, URLs, email addresses, parish values and tokens are checked.

The prototype's public demo endpoint is intentionally omitted: it sent simulated
alerts to every confirmed subscriber. Tests use local fixtures and mocked email
clients. No Next.js app, Neon database, Drizzle migration, SMTP credentials, or
external GitHub Actions scheduler is required.

## Endpoints

| Method     | API path                           | Behavior                                                                    |
| ---------- | ---------------------------------- | --------------------------------------------------------------------------- |
| GET        | `/water-alerts/outages`            | `{ outages, checkedAt }`, or 503 if the feed is unavailable                 |
| POST       | `/water-alerts/subscribe`          | `{ email, area }`; sends a confirmation email; delivery failure returns 503 |
| GET        | `/water-alerts/confirm/:token`     | Confirms the subscription: `done`, `already`, or `invalid`                  |
| GET / POST | `/water-alerts/unsubscribe/:token` | Opts out; POST supports email-provider one-click unsubscribe                |

`area` is `all`, an empty string (also all Barbados), or a parish slug such as
`saint-michael`. Subscribers only receive alerts after confirming their email.
The same email may subscribe to several parishes. Failed alert retries exclude
subscribers who have opted out.

A Postgres advisory lock prevents overlapping scheduled checker runs. A unique
notice/subscriber constraint and sent flag suppress repeat sends after a
successful round. Delivery is **not exactly once**: a crash after SES accepts a
message but before the database records it can cause a duplicate on retry.

## Configuration

The landing app uses its existing `VITE_FORMS_API_URL` to reach the API.

| API variable          | Default                          | Purpose                                               |
| --------------------- | -------------------------------- | ----------------------------------------------------- |
| `BWA_FEED_URL`        | BWA Service Disruptions RSS feed | Optional feed override                                |
| `LANDING_BASE_URL`    | `http://localhost:3000`          | Landing origin for confirmation and unsubscribe links |
| `API_PUBLIC_URL`      | `http://localhost:3001`          | API origin for one-click unsubscribe headers          |
| `WATER_OPS_RECIPIENT` | Unset                            | Optional inbox for checker failure notifications      |

Set both public origins for each deployed environment. Email uses the existing
`SES_REGION`, `SES_FROM_ADDRESS`, `SES_CONFIGURATION_SET`, and AWS credentials or
task role. The sender must be verified and SES must permit the intended recipients.
With SES unavailable, signup reports failure and preserves the pending row so the
resident can retry; it does not claim that confirmation mail was sent.

## Preview and local development

The service starts with `visibility: 'preview'` in `-meta.ts`. Use the existing
`?preview=<PREVIEW_SECRET>` flow for testing. Publish through the feature-flagging
UI by enabling `health-and-emergency-services/water-outages`, or change its default visibility.
Confirmation and unsubscribe pages remain reachable without a preview cookie,
including after withdrawing the service, and are excluded from search indexing.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev:api
VITE_FORMS_API_URL=http://localhost:3001 pnpm dev:landing
```

The API needs the same local Postgres and environment configuration as the other
gov-bb services. Open the water-outages URL with the configured preview token.
Location lookup needs localhost or HTTPS; a manual parish selection is always
available. Location coordinates stay in the browser. OpenStreetMap supplies tiles.

## Verification

```sh
pnpm --filter @govtech-bb/api exec vitest run src/water-alerts --coverage.enabled=false
pnpm --filter @govtech-bb/landing exec vitest run src/routes/health-and-emergency-services/water-outages
pnpm --filter @govtech-bb/landing typecheck
pnpm --filter @govtech-bb/landing build
pnpm exec nx run-many -t build --exclude=landing
```

Infrastructure rollout still needs the existing database migration permissions,
SES sender/recipient permissions, configured public origins, and outbound HTTPS to
`barbadoswaterauthority.com`. The migration adds no cloud resources and does not
transfer subscribers from the prototype database.

### Migration validation

The monorepo builds (20 other projects plus landing), landing TypeScript, and
changed-file lint/format checks passed. API: 1,612 passing tests and all coverage
gates, including 89.41% branch coverage. Database package: 32 passing tests.
Landing: 638 passing tests; one unrelated pharmacy test timed out during a
concurrent build and passed when its suite was rerun in isolation.

A local HTTP check of the built Amplify output exercised live-notice rendering
with fixtures, feed failure, the catalogue's actual publication key, and token
pages while the service was hidden. React Doctor's route-order and handler-name
findings were fixed; its remaining page-complexity warning is non-blocking.
Browser visual verification and real Postgres/SES delivery were not run in this
session; no emails were sent and no external database was migrated.
