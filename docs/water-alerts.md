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
  add `water_subscribers` and `water_sent_alerts` to the existing Postgres database;
  `CreateWaterOpsAlerts1791536637000` adds `water_ops_alerts` (see Ops alerts).
  The API runs pending migrations on startup, as it does for other services.

The BWA feed is cached for ten minutes. `checkedAt` is when that cached feed was
fetched. Expired cache failures and malformed feeds show an unavailable state;
sample notices are never served as live data. Requests have timeouts, and feed
size, notice fields, URLs, email addresses, parish values and tokens are checked.

Notices are validated one at a time, so one bad notice can't take the feed down
(#2969). A notice with an invalid or unsafe link, an unparseable date or an
over-long ID is skipped and never served. Skips are logged once per fetch as
`Skipped N invalid BWA notice(s)`, with the guid/link and reason of the first
five. Only the first 100 notices are read; BWA's feed serves 10. An untitled notice is kept, because it is still
a real outage, and titled from up to 80 characters of its body, cut at a word
boundary (or "BWA service notice" when the body is empty too). The feed shows
the unavailable state only when its structure is broken or it has notices but
none are valid — an empty list there would wrongly say there are no outages. A
skipped notice is also emailed to ops once (see Ops alerts). The public outages
endpoint returns only `outages` and `checkedAt`, never the skipped notices or
their reasons.

## Ops alerts

When `WATER_OPS_RECIPIENT` is set, the checker emails the team about three
signals, without repeating itself every 30-minute run (#2970):

| Signal | Email |
| --- | --- |
| The checker crashes | When it starts, a reminder every 6 hours while it lasts, and one "recovered" email |
| Alert sends fail (SES rejects) | The same; "recovered" only after a run that actually sent. If the failed sends' notice ends first, the signal is cleared without an email |
| A feed notice is skipped as invalid | Once per notice (keyed by a hash of its guid or link), all new ones in one email |

A signal is never emailed more than once every 6 hours, so a failure that
flaps (fail, recover, fail…) can't flood the inbox either: a failure inside that
window is recorded but not emailed, and then recovers without a "recovered"
email. Any pattern costs at most one alert and one recovery per 6 hours. The
trade-off is that a new failure starting within 6 hours of the last alert waits
for that window (the logs still show it on every run).

Each email leads with a one-line summary, then the raw error or run summary.
The logs still record every failed run.

What has been sent lives in `water_ops_alerts`, one row per signal key, because
several API tasks run the checker and the record must survive restarts and
deploys. Each "should I email?" decision is a single atomic statement, so tasks
reporting the same failure send one email. It is claimed before sending; if the
ops email itself fails (often because SES is what's down), the claim is undone
so the next run tries again, and a recovery before then stays silent because the
team was never told. A failed "recovered" email is not retried. If the table
can't be reached (for example the database is what's down), each task falls
back to remembering its own last alert: at most one email per task every 6
hours, and no "recovered" email for that outage.

`water-ops-alert.repository.smoke.spec.ts` runs these statements against a real
Postgres (lifecycle, flapping, two concurrent tasks, claim and release). Like the
other smoke specs it is skipped unless `DB_HOST` is set, so CI skips it: run it
against a local database after changing that SQL.

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
| `LANDING_BASE_URL`    | `https://alpha.gov.bb`           | Landing origin for confirmation and unsubscribe links |
| `API_PUBLIC_URL`      | Unset: headers omitted           | API origin for one-click unsubscribe headers          |
| `WATER_OPS_RECIPIENT` | Unset                            | Optional inbox for checker failure notifications      |

Set both public origins for each deployed environment. Email uses the existing
`SES_REGION`, `SES_FROM_ADDRESS`, `SES_CONFIGURATION_SET`, and AWS credentials or
task role. The sender must be verified and SES must permit the intended recipients.
With SES unavailable, signup reports failure and preserves the pending row so the
resident can retry; it does not claim that confirmation mail was sent.

## Preview and local development

The service is `visibility: 'public'` in `-meta.ts`; it launched on 14 September
2026, when the production `service_status` row was set to `enabled`. Withdraw it
through the feature-flagging UI by setting `health-and-emergency-services/water-outages`
to disabled; the existing `?preview=<PREVIEW_SECRET>` flow still shows a withdrawn service.
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
