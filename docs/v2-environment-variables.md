# v2 environment variables

This page lists every environment variable that v2 (api_v2, editor_v2 and landing's api_v2 reader) needs in sandbox, staging and prod, and where each value comes from. It exists so the cutover runbooks (#3311, #3227, #3228) have one place to check before a switch. It contains no secret values: secrets live in each environment's Secrets Manager and Amplify settings, which alpha-infra owns.

The list was taken from `main` on 20 Nov 2026 (#3779). When you add, rename or remove a variable in `apps/api_v2/src/config.ts`, `apps/editor_v2` or `apps/landing/vite.config.ts`, update this page in the same PR.

## Hosts

Since #3745, api_v2 is served under `/v2` on each environment's API host. Every URL below uses these hosts.

| Environment | api_v2 base URL | editor_v2 origin | Site origin |
|---|---|---|---|
| sandbox | `https://api.sandbox.alpha.gov.bb/v2` | `https://editor.sandbox.alpha.gov.bb` | `https://sandbox.alpha.gov.bb` |
| staging | `https://api.staging.alpha.gov.bb/v2` | `https://editor.staging.alpha.gov.bb` | `https://staging.alpha.gov.bb` |
| prod | `https://api.alpha.gov.bb/v2` | `https://editor.alpha.gov.bb` | `https://alpha.gov.bb` |

Each environment's Google OAuth redirect URI is `<api_v2 base URL>/api/auth/callback/google`, for example `https://api.staging.alpha.gov.bb/v2/api/auth/callback/google`.

## api_v2

These are set on the ECS task definition and parsed by `apps/api_v2/src/config.ts`. The API refuses to start when a required variable is missing or invalid.

| Variable | Required | Value / notes |
|---|---|---|
| `NODE_ENV` | yes | `production`, set in the Dockerfile. It turns on the production checks: HTTPS origins, no `SEED`, no `log` notifications |
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` | yes | When unset they quietly fall back to `localhost` / `postgres` / `gov_bb_v2`, so check them |
| `DB_SSL_CA` | for RDS | PEM contents or a file path |
| `BETTER_AUTH_URL` | yes | The api_v2 base URL, **with `/v2`**. Every route is mounted under that path |
| `EDITOR_ORIGIN` | yes | The editor_v2 origin |
| `BETTER_AUTH_SECRET` | yes | At least 32 characters, kept stable. Rotating it signs every editor out |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | yes | The environment's own OAuth client (#3415) |
| `GOOGLE_ALLOWED_DOMAINS` | yes | `govtech.bb` |
| `API_V2_ADMIN_EMAILS` | yes | At least one govtech.bb address. Startup refuses an empty list (ADR 0134) |
| `PREVIEW_SECRET` | optional | When unset, every preview read is refused. See [Values that must match](#values-that-must-match) |
| `LANDING_SECRET` | optional | When unset, landing is rate-limited like any other client (#3129). See [Values that must match](#values-that-must-match) |
| `REVIEW_NOTIFICATIONS` | optional | `off` by default. `ses` also needs `SES_FROM_ADDRESS` and a task role allowed `ses:SendEmail`. Production refuses `log` |
| `SES_FROM_ADDRESS`, `SES_REGION` | when `ses` | The same sender as `apps/api`. The region falls back to `AWS_DEFAULT_REGION`, then `us-east-1` |
| `API_V2_EMAIL_MOVES` | sandbox only | The one-off GitHub to Workspace account move (#3418). Staging and prod have no users to move. Remove it once everyone has moved |
| `SEED`, `AUTH_BYPASS` | **must be unset** | Production refuses `SEED`. `AUTH_BYPASS` is for local use only (#3342) |

## editor_v2

These are set on the Amplify app and read at build time, so a change needs a RELEASE build.

| Variable | Required | Value / notes |
|---|---|---|
| `VITE_API_ORIGIN` | yes | The api_v2 base URL, **with `/v2`**. `amplify.yml` fails the build when it is unset |
| `VITE_LANDING_ORIGIN` | optional | The site origin, so each service in the Services list links to its page |

## landing

These are set on the landing Amplify app and read at build time, so a change needs a rebuild. Setting `VITE_API_V2_URL` is the cutover switch, and unsetting it is the rollback (#3225).

| Variable | Value / notes |
|---|---|
| `VITE_API_V2_URL` | The api_v2 base URL, **with `/v2`**. Unset until the environment's cutover |
| `LANDING_SECRET` | Server-only: the build puts it in Nitro's `runtimeConfig`, and `scripts/check-no-secret-leak.mjs` checks it is not in the client bundle |
| `PREVIEW_SECRET` | Already set in every environment |

## Other apps and settings

These belong to other apps but change at a v2 cutover.

| Where | Variable | Value / notes |
|---|---|---|
| feature_flagging (Amplify) | `EDITOR_V2_URL` | The editor_v2 origin. Set it **at the start of the environment's cutover window, before the import**. While it is set, page rows are frozen (#3226, #3465) and `import-estate` must not run in that environment (api_v2 README) |
| api v1 (ECS) | `API_V2_URL` | The api_v2 base URL with `/v2`. `GET /services` then reads api_v2's `/catalog` (#3249). Unsetting it is the rollback |
| chat ingest | `API_V2_URL` | The api_v2 base URL with `/v2`. The ingest then reads api_v2 instead of the markdown (#3252) |
| GitHub repository variable | `CONTENT_FREEZE` | `true` at step 0 of the prod import. CI then refuses landing markdown edits (`content-freeze.yml`) |

## Values that must match

Two sets of values must be equal within each environment. Nothing checks either set yet (#3781), so a mismatch shows up only as failing previews or a rate-limited landing.

- **Preview token:** api v1's `RECIPE_PREVIEW_TOKEN`, api_v2's `PREVIEW_SECRET` and landing's `PREVIEW_SECRET`.
- **Landing token:** api_v2's `LANDING_SECRET` and landing's `LANDING_SECRET`. alpha-infra generates one value per environment and feeds it to both sides, so they cannot drift (alpha-infra#840).

## Where each environment stands

As of 20 Nov 2026:

- **Sandbox:** api_v2 and editor_v2 are live on the #3745 hosts. `LANDING_SECRET`, editor_v2's `VITE_LANDING_ORIGIN` and landing's `VITE_API_V2_URL` (#3311) are set by alpha-infra#840.
- **Staging:**
  - api_v2 and editor_v2 are live, and Deploy Staging builds both on every promotion (#3767).
  - The estate is imported (#3229).
  - api_v2 only starts when its required variables parse, so they are all set.
  - `LANDING_SECRET` and `VITE_LANDING_ORIGIN` come with alpha-infra#840. Whether the Google client has the `/v2` redirect URI is open in #3415.
  - Landing, api v1, chat and feature_flagging are switched in #3227.
- **Prod:** nothing exists yet. The stack, including `API_V2_ADMIN_EMAILS` and `VITE_LANDING_ORIGIN = https://alpha.gov.bb`, comes with alpha-infra#821 and #3130. `deploy-prod.yml` has no api_v2 or editor_v2 job yet (#3130). Landing is switched in #3228.
