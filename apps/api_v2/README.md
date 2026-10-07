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
| `SEED`                                             | `true` loads the committed estate snapshot on boot; off by default             |
| `BETTER_AUTH_URL`                                  | Required public API origin                                                     |
| `EDITOR_ORIGIN`                                    | Required editor origin; the exact credentialed CORS and write-origin allowlist |
| `BETTER_AUTH_SECRET`                               | Required secret of at least 32 characters                                      |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`         | Required server-side GitHub OAuth credentials                                  |
| `AUTH_BYPASS`                                      | Local development only: `true` skips sign-in (see above)                       |
| `PREVIEW_SECRET`                                   | Optional; the site's preview token. Unset, every preview read is refused       |

Production requires HTTPS API/editor origins on the same site, such as separate subdomains of the same organizational domain. Cookies are host-only, HttpOnly, Secure on HTTPS, and SameSite=Lax; API requests from the editor include credentials. Do not enable broad cookie domains or permissive CORS. Register the production API's exact `/api/auth/callback/github` URI in GitHub. Forwarded Host headers do not determine callback URLs; the configured origin does. This change does not configure hosting, DNS, or a reverse proxy.

## Boundaries

`main.ts` is the composition root. It parses configuration, creates one logger and pool, connects, migrates and seeds, then constructs the adapters (`PostgresPages`, BetterAuth or the local bypass), the services over them, and the HTTP app, and on shutdown closes the app before the pool. `src/test-db.ts` composes the same graph for tests.

| Layer             | Directory                  | Owns                                                                                                                                                                               |
| ----------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain            | `src/modules`              | Page shapes and write rules (placement, publication), what a viewer may see, categories and what they list, service grouping, search text, auth admission. Pure: no I/O, no clock. |
| Application       | `src/services`             | One use case each (`PageResolution`, `SiteNavigation`, `PageEditing`, `EditorIndex`, `EditorAccess`), with the ports it needs declared beside it.                                  |
| Outbound adapters | `src/adapters`             | `PostgresPages` (all content SQL, including the recursive hierarchy reads), BetterAuth, the local bypass.                                                                          |
| Inbound adapters  | `src/routes`, `src/app.ts` | Zod request/response contracts, the HTTP mapping of each result.                                                                                                                   |

Route plugins receive exactly the services they use as plugin options from `buildApp`; nothing is decorated onto the Fastify instance and nothing is autoloaded, so every dependency is visible where the app is composed. Expected failures are `Result` values that routes map to status codes; only defects throw. ESLint enforces the direction: domain and services cannot import Fastify, drizzle, pg, BetterAuth, adapters or routes, and routes cannot import infrastructure.

Better Auth verifies the GitHub email, and the API checks `GET /user/memberships/orgs/govtech-bb` using the sign-in token on both first and returning sign-ins. Only `state: active` membership in `govtech-bb` is admitted; pending invitations, missing membership, and failed checks deny access. Any verified email domain is allowed. Password login and client-supplied ID-token sign-in are disabled. Existing users can link GitHub through the same verified email only after passing the membership check; provider trust never bypasses email verification. OAuth tokens are discarded before account persistence. Sessions expire absolutely after eight hours; reads do not extend them. Session cookies are checked against PostgreSQL on every protected request, so revocation takes effect immediately. Organization membership changes are checked on the next GitHub sign-in; existing application sessions must be revoked when immediate removal is required.

Migration `003_auth` adds BetterAuth's four core tables: `auth_user`, `auth_session`, `auth_account`, and `auth_verification`. It does not replace content tables or author data. The migration is checked against the installed BetterAuth schema in the PostgreSQL integration suite. Migration `004_github_sessions` revokes sessions without a linked GitHub account, forcing existing Google users through the new membership check. User IDs, accounts, content, audit history, and browser drafts are preserved. Use the same verified email on GitHub to retain an existing user ID.

## HTTP surface

| Method   | Path                 | Access                                                             |
| -------- | -------------------- | ------------------------------------------------------------------ |
| GET      | `/pages?url=…`       | Site page resolution (public, or preview with the token)           |
| GET      | `/categories`        | Site category tree                                                 |
| GET      | `/categories/:slug`  | A category's subcategories and root pages                          |
| GET      | `/categories/:c/:s`  | A subcategory's root pages                                         |
| GET      | `/catalog`           | Every visible page (sitemap, service lists)                        |
| GET      | `/search/documents`  | Every visible page with its search text in chunks                  |
| GET      | `/docs`              | Public API reference (Scalar)                                      |
| GET      | `/docs/openapi.json` | Public OpenAPI document                                            |
| GET      | `/pages/:id`         | Employee; includes drafts and previews                             |
| GET      | `/services`          | Employee service index, grouped by `parent_id`                     |
| GET      | `/version`           | Employee change token                                              |
| POST     | `/pages`             | Employee create                                                    |
| PUT      | `/pages/:id`         | Employee save; existing optional `if-updated-at` concurrency check |
| DELETE   | `/pages/:id`         | Employee delete                                                    |
| GET/POST | `/api/auth/*`        | BetterAuth's GitHub/session protocol                               |

Missing, expired, or revoked sessions produce JSON 401 responses; disallowed employees or write origins produce 403; unavailable session verification produces 503. The API does not redirect protected content requests to GitHub—the editor handles navigation. Authenticated writes require `Origin: <EDITOR_ORIGIN>`. Auth/session/editor responses use `Cache-Control: no-store` and do not receive ETags. Create, save and delete audit rows record the authenticated user ID, never a caller-supplied actor, and commit with the write they record.

Public site reads (`/pages?url=`, `/categories…`, `/catalog`, `/search/documents`) send `public, max-age=60, stale-while-revalidate=300, stale-if-error=86400`; unknown public URLs send `public, max-age=10`. ETags and 304s remain available for public reads. These routes do not look up or refresh employee sessions.

Preview: the site's server sends its `PREVIEW_SECRET` as `x-preview-token`, and the same reads then include `preview` content. Those responses are `no-store` with no ETag, so preview content never enters a shared cache. A wrong token, or any token when `PREVIEW_SECRET` is unset here, is a 401 rather than a quiet fall-back to the public view. `draft` content is only ever served to the editor.

The hierarchy is `parent_id`, not the url. A page is served only when it and every page above it are visible; its breadcrumbs are its category (and parent category, for a subcategory), then the pages above it; a category lists only the pages at its root (`parent_id` null), so `start` steps and sub-pages never appear in a listing. A sub-page must share its parent's category (moving the parent moves its sub-pages), a page cannot sit beneath itself, and a page with sub-pages cannot be deleted: each is a field-specific 422.

`GET /pages?url=` returns `{url, frontmatter, body_markdown, form_id, hide_start_links, breadcrumbs}`. `hide_start_links` is true when the page's `start` sub-page is hidden from the viewer. Whether a form is open is the forms API's to say: `form_id` is a name, and the site asks the forms API for the form's status. The API serves markdown as written; the site owns sanitization and rendering. Editor writes return field-specific 422s for invalid references or duplicates, 409 for a stale supplied version, and stamp `published_at` only on first publication. A save replaces the page, so it sends every field; only `parent_id` may be left out, which keeps the page's parent. A request its route's schema refuses (a missing field, an id that is not a UUID, an `if-updated-at` that is not a timestamp, a url over 512 characters, a title over 300) is a 400; Fastify's own refusals keep their status (a body that is not JSON is a 415), and an unknown route is a JSON 404.

`search_chunks` holds each page's body split at its headings, as plain text, rewritten in the same transaction as every save. Rejoined, a page's chunks are exactly the text landing's search indexes today (`search-text.test.ts` checks every seeded page), so moving search onto the API does not move its ranking. The generated `tsv` column and its GIN index are there for server-side search and are not read yet.

The seed is a committed snapshot of legacy markdown and the category taxonomy, subcategories included, with each sub-page's parent. Inserts are additive and idempotent and never replace authored changes. It runs only with `SEED=true`, because an additive insert also brings back a page an editor deleted. Regenerate it with `pnpm seed-data` when intentionally updating the snapshot.

## Operations and tests

SIGINT/SIGTERM drain HTTP requests before closing the shared pool; startup failures also release acquired resources. JSON logs omit cookies, OAuth callback query parameters, provider tokens and raw driver error objects. The exact warning `idle database connection dropped` remains the operational alarm marker; its safe `code` identifies the failure. Public content failures continue to use the existing 500 response, while authentication outages fail closed with 503.

Migrations run at boot. Each script commits with its `schema_migrations` row under a PostgreSQL advisory lock, so instances that boot together apply them one at a time; every script must be safe to replay, because an instance that waited on the lock runs it again.

```sh
pnpm exec nx run api_v2:build
pnpm exec nx run api_v2:typecheck
pnpm exec nx run api_v2:test
DB_HOST=localhost pnpm exec nx run api_v2:e2e
```

Unit/integration tests run against PostgreSQL (`DB_HOST` etc., defaulting to `localhost:5432` as `postgres`/`postgres`): the global setup migrates one template database per run and each test clones it, dropping it afterwards. There is no skip; with no database the run fails and says so. CI's Test job provides a `postgres` service. PostgreSQL e2e creates and drops uniquely named scratch databases and exercises the compiled Node process, migrations, cookie sessions, session expiry/revocation, origin protection, audit identity, pool recovery and shutdown. Test sessions are created through the real BetterAuth internal adapter in test code; no production login bypass exists. The e2e suite skips when `DB_HOST` is unset. OAuth provider admission and the sign-in handshake are tested without live GitHub credentials; deployment still requires a real GitHub sign-in and TLS smoke check.

`openapi.json` is a file snapshot of the document the running app generates from its route schemas (`src/routes/contracts.ts`), so `src/openapi.test.ts` fails when the two differ. It is served at `/docs/openapi.json`, with a browsable reference at `/docs`. Update it from this directory with `pnpm exec vitest run src/openapi.test.ts -u`.
