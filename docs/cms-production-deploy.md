# CMS production deployment

Target stack as of this branch:

- **Runtime**: AWS App Runner or ECS Fargate (containerised)
- **Database**: AWS RDS Postgres (see [aws-database-sizing.md](./aws-database-sizing.md))
- **Email**: AWS SES via SMTP
- **Media uploads**: local filesystem (see [warning](#warning-media-on-ephemeral-disk))

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
| `DATABASE_URL`          | yes      | `postgres://USER:PASS@HOST:5432/cms` — RDS endpoint                                         |
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

## Health checks

App Runner / ALB / target-group probes hit `GET /api/health`:

- `/api/health` → 200 if the Next.js process is up. Cheap, safe for every probe.
- `/api/health?deep=1` → 200 if the database is reachable; 503 otherwise. Use sparingly (e.g. once per minute) since it opens a DB connection.

## Database migrations

The repo carries Payload migrations under `apps/cms/src/migrations/`. Apply them against the target database before serving traffic:

```bash
DATABASE_URL=$PROD_URL pnpm --filter cms run payload migrate
```

A fresh database can use the genesis migration as-is. An existing database
provisioned without migrations may require regenerating a delta — see the
note at the top of `src/migrations/20260528_090649.ts`.

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

## Warning: media on ephemeral disk

This deployment runs Media uploads on the container's local filesystem. App Runner and ECS Fargate both have **ephemeral disk** — every container restart, redeploy, or autoscale event wipes the uploaded files.

If Media is used:

- **Short-term mitigation**: avoid container restarts mid-day; redeploys lose uploads silently.
- **Proper fix (ECS Fargate)**: mount an EFS volume at the Media upload path. Roughly $0.30/GB/month, persists across restarts. Requires task definition changes.
- **Better fix**: swap to S3 via `@payloadcms/storage-s3`. ~30 minutes of work — adds a plugin to `payload.config.ts` and an S3 bucket + IAM role.

For an alpha-stage site without uploads yet, the current choice is fine; revisit before the first Media-using author lands.

## Security baseline (status)

- [x] `PAYLOAD_SECRET` from env, no default
- [x] HTTPS-only cookies in production (`NODE_ENV=production` toggle)
- [x] CSRF allowlist (`csrf: [LANDING_ORIGIN, ADMIN_ORIGIN]`)
- [x] CORS allowlist (`cors: [LANDING_ORIGIN, ADMIN_ORIGIN]`)
- [x] Max-login-attempt lockout (5 / 10min)
- [x] Role-based access control on Users (create/update/delete = admin)
- [x] Users.read restricted to admin or self
- [x] Custom auth cookie prefix (`gov-bb-cms`) so cookies don't collide with another app on the same domain
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
