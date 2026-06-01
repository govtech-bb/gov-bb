# CMS production deployment

Target stack as of this branch:

- **Runtime**: AWS App Runner or ECS Fargate (containerised)
- **Database**: AWS RDS Postgres (see [aws-database-sizing.md](./aws-database-sizing.md))
- **Email**: AWS SES via SMTP
- **Media uploads**: S3 when `S3_BUCKET` is set (local filesystem otherwise — see [media storage](#media-storage))

## What's in the box

- `apps/cms/Dockerfile` — multi-stage build, standalone Next.js output, non-root user.
- `apps/cms/.dockerignore`.
- `apps/cms/next.config.ts` — `output: 'standalone'` + `outputFileTracingRoot` pointed at the monorepo root.
- `apps/cms/src/app/api/health/route.ts` — `GET /api/health` (cheap) and `?deep=1` (DB ping).
- Secure cookies + CSRF allowlist in `payload.config.ts` keyed off `PAYLOAD_PUBLIC_URL`.
- `Users.read` restricted to `isAdminOrSelf` (was implicitly public).
- Max-login-attempt lockout (5 attempts, 10 min) on the Users collection.
- SES email adapter, wired only when `SES_SMTP_HOST` is set.

## Build

```bash
docker build -f apps/cms/Dockerfile -t gov-bb-cms .
```

Build from the **repo root**, not from `apps/cms` — the Dockerfile needs the
workspace lockfile and the other `packages/*` manifests.

## Runtime env vars

| Variable                | Required | Notes                                                                                       |
| ----------------------- | -------- | ------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | yes\*    | `postgres://USER:PASS@HOST:5432/cms` — RDS endpoint. \*Or the `DB_*` set below.            |
| `DB_HOST` / `DB_USERNAME` / `DB_PASSWORD` / `DB_NAME` / `DB_PORT` | alt | alpha-infra injects these; the connection string is assembled from them when `DATABASE_URL` is unset. |
| `DATABASE_SSL_CA_PATH`  | prod     | Path to the RDS CA bundle for verified TLS (Dockerfile writes `/etc/ssl/certs/rds-global-bundle.pem`). If unset, pg connects **without TLS** — set it in any RDS environment. |
| `PAYLOAD_SECRET`        | yes      | `openssl rand -hex 32`. Never reuse across environments. Rotate if leaked.                  |
| `PAYLOAD_PUBLIC_URL`    | yes      | The admin's deployed origin (e.g. `https://cms.alpha.gov.bb`) — used for CSRF allowlist     |
| `LANDING_URL`           | yes      | Landing site origin for Live Preview + CORS                                                 |
| `NODE_ENV`              | yes      | `production` — toggles secure cookies                                                       |
| `SES_SMTP_HOST`         | no       | e.g. `email-smtp.us-east-1.amazonaws.com`. If unset, Payload logs emails to console.        |
| `SES_SMTP_PORT`         | no       | 587 (TLS)                                                                                   |
| `SES_SMTP_USER`         | no       | SES SMTP username (NOT IAM access key)                                                      |
| `SES_SMTP_PASS`         | no       | SES SMTP password (NOT IAM secret key)                                                      |
| `SES_FROM_EMAIL`        | no       | Verified sender in SES, defaults to `no-reply@alpha.gov.bb`                                 |
| `SES_FROM_NAME`         | no       | Display name on outgoing emails                                                             |
| `CMS_ADMIN_EMAIL`       | seed     | Used by `pnpm seed` to create the first admin. Not read at runtime.                         |
| `CMS_ADMIN_PASSWORD`    | seed     | Same.                                                                                       |
| `S3_BUCKET`             | media    | Set to offload Media to S3 (required in prod — Fargate disk is ephemeral). Unset → local disk. |
| `S3_REGION`             | media    | Bucket region (falls back to `AWS_REGION`).                                                  |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | no | Only where no task IAM role is available; otherwise the role's credentials are used. |

## Health checks

App Runner / ALB / target-group probes hit `GET /api/health`:

- `/api/health` → 200 if the Next.js process is up. Cheap, safe for every probe.
- `/api/health?deep=1` → 200 if the database is reachable; 503 otherwise. Use sparingly (e.g. once per minute) since it opens a DB connection.

## Database migrations

The repo carries Payload migrations under `apps/cms/src/migrations/`. The
postgres adapter is configured with `prodMigrations`, so **the container
applies any pending migrations from the bundled set on boot** when
`NODE_ENV=production` — no separate CLI step or migrate-capable image is
needed. Applied migrations are tracked in the `payload_migrations` table, so
this is idempotent across restarts and rolling deploys.

A fresh database picks up the genesis migration automatically on first boot.
An existing database provisioned without migrations (e.g. via dev push mode)
may need the schema dropped or a delta regenerated — see the note at the top
of `src/migrations/20260528_090649.ts`. To apply manually instead:

```bash
DATABASE_URL=$PROD_URL pnpm --filter cms run payload migrate
```

## Initial admin

After the first deploy, either:

- Run `pnpm seed` once against the production DB with `CMS_ADMIN_EMAIL` / `CMS_ADMIN_PASSWORD` set, then **rotate that password immediately** through the admin UI.
- Or, sign in via the email-based create-first-admin flow that Payload renders on a fresh install.

## SES setup checklist

1. In the SES console, **verify the sending domain** (or at least the `no-reply@…` address) — until verified, SES rejects all sends.
2. Move SES out of the sandbox if you want to send to arbitrary recipients (sandbox limits sends to verified addresses).
3. **SMTP Settings → Create SMTP credentials**. AWS generates a username + password — these are NOT IAM keys. Save them to your secret store.
4. Set `SES_SMTP_*` env vars on the container.
5. Verify by triggering a password reset to a verified address.

## Media storage

The `s3Storage` plugin is wired in `payload.config.ts` and activates when
`S3_BUCKET` is set, offloading Media uploads to S3. **Set `S3_BUCKET` (and
`S3_REGION`) in production** — App Runner and ECS Fargate have ephemeral disk,
so without S3 every container restart, redeploy, or autoscale event silently
wipes uploaded files. Note that Organisations carry `upload` fields (hero
image, featured tiles), so Media is reachable as soon as an author edits one.

To provision:

1. Create an S3 bucket (e.g. `gov-bb-cms-media`).
2. Grant the task's IAM role `s3:PutObject` / `GetObject` / `DeleteObject` /
   `ListBucket` on it (credentials are taken from the role automatically; set
   `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` only where no role exists).
3. Set `S3_BUCKET` + `S3_REGION` on the container.

Leave `S3_BUCKET` unset locally to keep uploads on the local filesystem, which
is fine for dev.

## Security baseline (status)

- [x] `PAYLOAD_SECRET` from env, no default
- [x] HTTPS-only cookies in production (`NODE_ENV=production` toggle)
- [x] CSRF allowlist (`csrf: [LANDING_ORIGIN, ADMIN_ORIGIN]`)
- [x] CORS allowlist (`cors: [LANDING_ORIGIN, ADMIN_ORIGIN]`)
- [x] Max-login-attempt lockout (5 / 10min)
- [x] Role-based access control on Users (create/update/delete = admin)
- [x] Users.read restricted to admin or self
- [x] Public read on Services/Organisations constrained to published docs (`publishedOnly`); `readVersions` admin/editor-only — anonymous callers can't pull drafts via `?draft=true` or the versions API
- [x] Custom auth cookie prefix (`gov-bb-cms`) so cookies don't collide with another app on the same domain
- [ ] Server-side `flag` enforcement — flagged-but-published docs are still served by the API and hidden only by the landing site's query filter; a real reviewer-auth mechanism in the CMS is a follow-up
- [x] GraphQL disabled (`graphQL: { disable: true }`) and the `/api/graphql*` route files removed — landing uses REST only, so the playground/introspection surface is gone
- [x] `maxDepth: 5` caps relationship-population depth on the public API (landing requests ≤ 2)
- [ ] Rate limiting on the admin login endpoint (Payload's max-login-attempts is per-user; a real rate-limit on the route belongs at the load balancer or via AWS WAF)
- [ ] Backup retention beyond the RDS default 7 days — decide per data-retention policy
- [ ] WAF rules / IP allowlist for the admin route — optional, depends on threat model

## Logging + observability

Payload logs to stdout. App Runner / ECS pushes that to CloudWatch automatically. Useful filter patterns:

- `ERROR` / `WARN` → real problems
- `Lockout` → repeated failed logins (potential abuse signal)
- `Email sent` / SES bounce notifications → wire SES SNS topics to alert on bounces

For deeper observability:

- Enable RDS Performance Insights (free tier) to spot slow queries.
- Set CloudWatch alarms on Lambda/Fargate errors and on RDS connection count.
