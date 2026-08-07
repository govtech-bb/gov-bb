# Water-outage alerts ("Wuh Water Doing?")

A gov-bb service that shows Barbados Water Authority (BWA) water-outage notices
by parish and lets residents subscribe to email alerts. Migrated in from a
standalone Next.js prototype.

## Architecture

Two halves, talking over HTTP — the standard gov-bb split:

- **`apps/api` → `WaterAlertsModule`** (NestJS): reads the BWA RSS feed, stores
  subscribers, sends email via SES, and runs the 30-minute alert checker as an
  in-process `@Cron` job. Deployed as the existing api container (ECS/Fargate).
- **`apps/landing` → `health-and-emergency-services/water-outages`**
  (TanStack Start): the citizen-facing page + confirm/unsubscribe pages. It
  holds no secrets and no DB — it calls the api through server functions.

```
landing page ──server fn──▶ GET  /water-alerts/outages         (map/list)
subscribe form ─────────────▶ POST /water-alerts/subscribe        (double opt-in)
confirm page ───────────────▶ GET  /water-alerts/confirm/:token
unsubscribe page ───────────▶ GET  /water-alerts/unsubscribe/:token
alert email one-click ──────▶ POST /water-alerts/unsubscribe/:token   (RFC 8058)
@Cron('*/30 * * * *') ──────▶ reads feed, emails confirmed subscribers exactly once
```

Exactly-once delivery is enforced in Postgres: `water_sent_alerts` is
`UNIQUE(notice_id, subscriber_id)`; the checker claims (INSERT … ON CONFLICT DO
NOTHING), sends, then marks sent — all set-based, so it scales to thousands of
recipients. A Postgres advisory lock keeps a single api task running each round.

## Endpoints (`apps/api`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/water-alerts/outages` | Parsed BWA notices for the page; 503 if the feed is unreachable |
| POST | `/water-alerts/subscribe` | `{ email, area }` → pending subscriber + confirm email |
| GET | `/water-alerts/confirm/:token` | Confirm a sign-up → `done \| already \| invalid` |
| GET/POST | `/water-alerts/unsubscribe/:token` | Unsubscribe (POST = one-click) |

## Configuration

### `apps/api` (all optional; read from `process.env`, defaults shown)

| Var | Default | Purpose |
|---|---|---|
| `BWA_FEED_URL` | live BWA feed | RSS feed source |
| `PUBLIC_SITE_URL` | `http://localhost:3000` | Landing origin for confirm/unsubscribe links in emails |
| `API_PUBLIC_URL` | `http://localhost:3001` | This API's origin for the one-click List-Unsubscribe header |
| `WATER_OPS_RECIPIENT` | _(unset → skipped)_ | Inbox for checker failure alerts |

Email sending reuses the api's existing SES config (`SES_*` / `email.*`) and the
shared `SesMailer` (sender = `SES_FROM_ADDRESS`).

### `apps/landing`

Only `VITE_FORMS_API_URL` (already used) — the same NestJS API base.

## Rollout

Ships behind the visibility gate at `visibility: 'preview'` in the route's
`-meta.ts`. Flip to `'public'` to launch. The confirm/unsubscribe pages sit
under the same gate, so they open automatically at launch; during `preview`,
testers append `?preview=<PREVIEW_SECRET>`.

## Local development

1. Postgres running; run migrations: `pnpm --filter api migration:run`.
2. API: `pnpm --filter @govtech-bb/api run start:dev` (needs `apps/api/.env`).
3. Landing: `VITE_FORMS_API_URL=http://localhost:3001 pnpm --filter @govtech-bb/landing dev`.
4. Open `http://localhost:3000/health-and-emergency-services/water-outages`
   (temporarily set `visibility: 'public'` in `-meta.ts`, or use `?preview=`).

Without SES configured locally, sign-up/alert sends fail gracefully (the
subscriber row is still saved; the checker retries next run).

---

## Infra hand-off

What the app team builds vs. what infra needs to provide.

> **We build:** the api module + endpoints + `@Cron` checker, the two tables +
> migration, SES email templates, and the landing pages. All merged.
>
> **Infra needs to provide:**
>
> 1. **Database — no new instance.** The two tables (`water_subscribers`,
>    `water_sent_alerts`) are added to the api's existing Postgres by the
>    migration `CreateWaterAlertsTables…` on deploy. Just confirm migrations run
>    per environment.
> 2. **SES:**
>    - a **verified From address** (e.g. `alerts@gov.bb`) set as `SES_FROM_ADDRESS`;
>    - **production access** (move SES out of the sandbox) so it can email any
>      resident, not just verified test addresses;
>    - **DKIM/SPF/DMARC** on the sending domain (inbox, not spam);
>    - `ses:SendEmail` on the api task role;
>    - a **configuration set** (bounce/complaint tracking);
>    - enough **sending quota/rate** for burst sign-ups.
> 3. **Outbound network:** allow outbound HTTPS from the api to the **BWA feed
>    host** (`barbadoswaterauthority.com`).
> 4. **Env vars/secrets** per environment: `PUBLIC_SITE_URL`, `API_PUBLIC_URL`,
>    `WATER_OPS_RECIPIENT` (and `BWA_FEED_URL` only if overriding the default).
> 5. **Scheduling:** nothing — the checker runs in-process via `@nestjs/schedule`
>    on the existing api container (guarded by a Postgres advisory lock). No
>    EventBridge/GitHub Action needed.
