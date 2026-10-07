# api_v2

The markdown content API uses Node, Fastify, Drizzle and its own PostgreSQL database. Citizen page resolution stays public. The editor's reads and writes require a GitHub account with a verified email and active membership in `govtech-bb`, authenticated by BetterAuth.

## Run locally

Create `gov_bb_v2`, then copy `.env.example` to `.env` and fill in the authentication settings. The process reads its environment; it does not load `.env` automatically. From this directory:

```sh
set -a
. ./.env
set +a
pnpm dev
```

Create a [GitHub OAuth App](https://github.com/settings/developers) with homepage URL `http://localhost:3000` and this authorization callback URL:

```text
http://localhost:3020/api/auth/callback/github
```

Use `http://localhost:3000` for the editor and set its public `VITE_API_ORIGIN` to `http://localhost:3020`. Use `localhost` consistently; mixing it with `127.0.0.1` changes the browser's cookie context. The editor automatically redirects unauthenticated visitors to GitHub and returns them to their original editor URL. Authentication does not move or clear existing browser drafts.

Generate `BETTER_AUTH_SECRET` with `openssl rand -base64 32` and keep it stable. Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` from the GitHub OAuth App. The provider requests `read:user`, `user:email`, and `read:org`; grant the app access to `govtech-bb` if the organization restricts OAuth apps. Missing credentials prevent startup in every environment.

For local development only, `AUTH_BYPASS=true` skips sign-in. BetterAuth is not started, so the credentials above are unused and placeholders will do, and every editor request runs as a fixed local developer. Pair it with the editor's `VITE_AUTH_BYPASS=true`. Because a bypassed API admits any caller, startup refuses it in production and whenever `EDITOR_ORIGIN` is not `localhost` or `127.0.0.1`.

| Variable                                           | Purpose/default                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD` | `localhost`, `5432`, `postgres`, `postgres`                                    |
| `DB_NAME`                                          | `gov_bb_v2`                                                                    |
| `DB_SSL_CA`                                        | Optional PEM contents or CA file path; production uses verified TLS            |
| `PORT`                                             | `3020`                                                                         |
| `SEED`                                             | Only `false` disables the additive seed                                        |
| `BETTER_AUTH_URL`                                  | Required public API origin                                                     |
| `EDITOR_ORIGIN`                                    | Required editor origin; the exact credentialed CORS and write-origin allowlist |
| `BETTER_AUTH_SECRET`                               | Required secret of at least 32 characters                                      |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`         | Required server-side GitHub OAuth credentials                                  |
| `AUTH_BYPASS`                                      | Local development only: `true` skips sign-in (see above)                       |

Production requires HTTPS API/editor origins on the same site, such as separate subdomains of the same organizational domain. Cookies are host-only, HttpOnly, Secure on HTTPS, and SameSite=Lax; API requests from the editor include credentials. Do not enable broad cookie domains or permissive CORS. Register the production API's exact `/api/auth/callback/github` URI in GitHub. Forwarded Host headers do not determine callback URLs; the configured origin does. This change does not configure hosting, DNS, or a reverse proxy.

## Boundaries

`main.ts` parses configuration, creates one logger and pool, connects, migrates, seeds, then constructs BetterAuth, `ApiStore`, `EditorAccess`, and the HTTP app. Only the root constructs these dependencies. Routes translate HTTP; the access service consumes a session capability; the auth adapter owns BetterAuth and the GitHub identity boundary. Content persistence stays in the existing store.

Better Auth verifies the GitHub email, and the API checks `GET /user/memberships/orgs/govtech-bb` using the sign-in token on both first and returning sign-ins. Only `state: active` membership in `govtech-bb` is admitted; pending invitations, missing membership, and failed checks deny access. Any verified email domain is allowed. Password login and client-supplied ID-token sign-in are disabled. Existing users can link GitHub through the same verified email only after passing the membership check; provider trust never bypasses email verification. OAuth tokens are discarded before account persistence. Sessions expire absolutely after eight hours; reads do not extend them. Session cookies are checked against PostgreSQL on every protected request, so revocation takes effect immediately. Organization membership changes are checked on the next GitHub sign-in; existing application sessions must be revoked when immediate removal is required.

Migration `003_auth` adds BetterAuth's four core tables: `auth_user`, `auth_session`, `auth_account`, and `auth_verification`. It does not replace content tables or author data. The migration is checked against the installed BetterAuth schema in the PostgreSQL integration suite. Migration `004_github_sessions` revokes sessions without a linked GitHub account, forcing existing Google users through the new membership check. User IDs, accounts, content, audit history, and browser drafts are preserved. Use the same verified email on GitHub to retain an existing user ID.

## HTTP surface

| Method   | Path            | Access                                                             |
| -------- | --------------- | ------------------------------------------------------------------ |
| GET      | `/pages?url=…`  | Public citizen page resolution                                     |
| GET      | `/openapi.json` | Public API documentation                                           |
| GET      | `/pages/:id`    | Employee; includes drafts and previews                             |
| GET      | `/services`     | Employee service index, grouped from page urls                     |
| GET      | `/version`      | Employee change token                                              |
| POST     | `/pages`        | Employee create                                                    |
| PUT      | `/pages/:id`    | Employee save; existing optional `if-updated-at` concurrency check |
| DELETE   | `/pages/:id`    | Employee delete                                                    |
| GET/POST | `/api/auth/*`   | BetterAuth's GitHub/session protocol                               |

Missing, expired, or revoked sessions produce JSON 401 responses; disallowed employees or write origins produce 403; unavailable session verification produces 503. The API does not redirect protected content requests to GitHub—the editor handles navigation. Authenticated writes require `Origin: <EDITOR_ORIGIN>`. Auth/session/editor responses use `Cache-Control: no-store` and do not receive ETags. Create/save audit rows record the authenticated user ID, never a caller-supplied actor. Existing deletion and audit transaction behavior is unchanged.

Public page responses retain `public, max-age=60, stale-while-revalidate=300, stale-if-error=86400`; unknown public URLs retain `public, max-age=10`. ETags and 304s remain available for public reads. These routes do not look up or refresh employee sessions.

`GET /pages?url=` returns `{url, frontmatter, body_markdown, form_id, hide_start_links, breadcrumbs}`. It preserves ancestor visibility, form visibility, unique bare-slug redirects, and the full breadcrumb trail. The API serves markdown as written; `landing_v2` owns sanitization and rendering. A missing form counts as hidden. Editor writes still return field-specific 422s for invalid references or duplicates, 409 for a stale supplied version, and stamp `published_at` only on first publication.

The seed is a committed snapshot of legacy markdown, categories, and form visibility. Inserts are additive and idempotent and never replace authored changes. Regenerate it with `pnpm seed-data` when intentionally updating the snapshot.

## Operations and tests

SIGINT/SIGTERM drain HTTP requests before closing the shared pool; startup failures also release acquired resources. JSON logs omit cookies, OAuth callback query parameters, provider tokens and raw driver error objects. The exact warning `idle database connection dropped` remains the operational alarm marker; its safe `code` identifies the failure. Public content failures continue to use the existing 500 response, while authentication outages fail closed with 503.

```sh
pnpm exec nx run api_v2:build
pnpm exec nx run api_v2:typecheck
pnpm exec nx run api_v2:test
DB_HOST=localhost pnpm exec nx run api_v2:e2e
```

Unit/integration tests use PGlite without a database service. PostgreSQL e2e creates and drops uniquely named scratch databases and exercises the compiled Node process, migrations, cookie sessions, session expiry/revocation, origin protection, audit identity, pool recovery and shutdown. Test sessions are created through the real BetterAuth internal adapter in test code; no production login bypass exists. Database tests skip when `DB_HOST` is unset. OAuth provider admission and the sign-in handshake are tested without live GitHub credentials; deployment still requires a real GitHub sign-in and TLS smoke check.

`openapi.json` is generated from the same schemas used to register routes. Update it with `pnpm openapi`; the drift/route-coverage tests keep the committed document accurate.
