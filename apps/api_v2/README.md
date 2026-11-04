# api_v2

The markdown content API uses Node, Fastify, Drizzle and its own PostgreSQL database. Citizen page resolution stays public. The editor's reads and writes require a Google Workspace account with a verified email on an allowed domain, authenticated by BetterAuth.

## Run locally

Create `gov_bb_v2`, then copy `.env.example` to `.env` and fill in the authentication settings. `pnpm dev` loads `.env` when it exists; the built server (`pnpm start`) reads only its environment. From this directory:

```sh
pnpm dev
```

In the Workspace's Google Cloud project, under **Google Auth Platform**, create a **Web application** OAuth client. The consent screen's audience must be **Internal**. Add this authorized redirect URI:

```text
http://localhost:3020/api/auth/callback/google
```

Use `http://localhost:3000` for the editor and set its public `VITE_API_ORIGIN` to `http://localhost:3020`. Use `localhost` consistently; mixing it with `127.0.0.1` changes the browser's cookie context. The editor offers unauthenticated visitors **Continue with Google** and starts OAuth only when they choose it, then returns them to their original editor URL. Authentication does not move or clear existing browser drafts.

Generate `BETTER_AUTH_SECRET` with `openssl rand -base64 32` and keep it stable. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from the OAuth client, and `GOOGLE_ALLOWED_DOMAINS` to the Workspace domains whose accounts may sign in (`govtech.bb`). The provider requests only `openid`, `email` and `profile`. Missing credentials or an empty domain list prevent startup in every environment.

For local development only, `AUTH_BYPASS=true` skips sign-in. BetterAuth is not started, so the credentials above are unused and placeholders will do, and every editor request runs as a fixed local developer. Pair it with the editor's `VITE_AUTH_BYPASS=true`. Under the bypass `API_V2_ADMIN_EMAILS` may be left empty, since the local developer holds every role; otherwise startup refuses without it. Because a bypassed API admits any caller, startup refuses it in production and whenever `EDITOR_ORIGIN` is not `localhost` or `127.0.0.1`, and a bypassed API listens on `127.0.0.1` only. The developer is added to `auth_user` at startup, so their edits are recorded against them. #3342 replaces the bypass with a real local session.

| Variable                                           | Purpose/default                                                                                                                                                                                                         |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD` | `localhost`, `5432`, `postgres`, `postgres`                                                                                                                                                                             |
| `DB_NAME`                                          | `gov_bb_v2`                                                                                                                                                                                                             |
| `DB_SSL_CA`                                        | Optional PEM contents or CA file path; production uses verified TLS                                                                                                                                                     |
| `PORT`                                             | `3020`                                                                                                                                                                                                                  |
| `SEED`                                             | `true` loads the committed estate snapshot on boot. Local development only: an additive seed on every boot brings back a page an editor deleted, so no deployed environment may set it, and production refuses to boot  |
| `BETTER_AUTH_URL`                                  | Required public API origin                                                                                                                                                                                              |
| `EDITOR_ORIGIN`                                    | Required editor origin; the exact credentialed CORS and write-origin allowlist                                                                                                                                          |
| `BETTER_AUTH_SECRET`                               | Required secret of at least 32 characters                                                                                                                                                                               |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`         | Required server-side Google OAuth client credentials                                                                                                                                                                    |
| `GOOGLE_ALLOWED_DOMAINS`                           | Required comma-separated Workspace domains whose verified accounts may sign in, such as `govtech.bb`                                                                                                                    |
| `AUTH_BYPASS`                                      | Local development only: `true` skips sign-in (see above)                                                                                                                                                                |
| `PREVIEW_SECRET`                                   | Optional; the site's preview token. Unset, every preview read is refused                                                                                                                                                |
| `LANDING_SECRET`                                   | Optional; landing's token. Landing sends it as `x-landing-token` and is then not rate-limited. Unset, nobody is exempt                                                                                                  |
| `API_V2_ADMIN_EMAILS`                              | Required unless `AUTH_BYPASS=true`: comma-separated emails granted `admin` and `editor` whenever they sign in (see Roles). Startup refuses an empty list, since without an admin nobody can grant `approver` (ADR 0079) |
| `REVIEW_NOTIFICATIONS`                             | `off` (default), `log` or `ses`: whether review steps email people (see Review emails). `log` writes each email to the log instead, for local runs and tests; production refuses it                                     |
| `SES_FROM_ADDRESS`                                 | Required when `REVIEW_NOTIFICATIONS=ses`: the verified SES sender, as apps/api's `SES_FROM_ADDRESS`. Startup refuses `ses` without it                                                                                   |
| `SES_REGION`                                       | Optional SES region; falls back to `AWS_DEFAULT_REGION`, then `us-east-1`                                                                                                                                               |

Production requires HTTPS API/editor origins on the same site, such as separate subdomains of the same organizational domain. Cookies are host-only, HttpOnly, Secure on HTTPS, and SameSite=Lax; API requests from the editor include credentials. Do not enable broad cookie domains or permissive CORS. Register the production API's exact `/api/auth/callback/google` URI on that environment's OAuth client, and no other environment's. Forwarded Host headers do not determine callback URLs; the configured origin does. This change does not configure hosting, DNS, or a reverse proxy.

## Boundaries

`main.ts` is the composition root. It parses configuration, creates one logger and pool, connects, migrates and seeds, then constructs the adapters (`PostgresPages`, BetterAuth or the local bypass), the services over them, and the HTTP app, and on shutdown closes the app before the pool. `src/test-db.ts` composes the same graph for tests.

| Layer             | Directory                  | Owns                                                                                                                                                                               |
| ----------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain            | `src/modules`              | Page shapes and write rules (placement, publication), what a viewer may see, categories and what they list, service grouping, search text, auth admission. Pure: no I/O, no clock. |
| Application       | `src/services`             | One use case each (`PageResolution`, `SiteNavigation`, `PageEditing`, `CategoryEditing`, `EditorIndex`, `EditorAccess`), with the ports it needs declared beside it.               |
| Outbound adapters | `src/adapters`             | `PostgresPages` (all content SQL, including the recursive hierarchy reads), BetterAuth, the local bypass.                                                                          |
| Inbound adapters  | `src/routes`, `src/app.ts` | Zod request/response contracts, the HTTP mapping of each result.                                                                                                                   |

Category HTTP handlers live in `src/routes/categories.ts`. Its editor plugin is registered inside `src/routes/editor.ts`, so employee, Origin and no-store checks apply before validation. Its public plugin is registered inside `src/routes/site.ts`, so preview admission, cache policy and ETags remain separate from employee access. Both reuse the parent scope's request identity reader; category rules and SQL stay in their existing domain, service and storage owners.

Route plugins receive their services and request identity readers explicitly through plugin options; nothing is decorated onto the Fastify instance and nothing is autoloaded, so dependencies are visible at registration. Expected failures are `Result` values that routes map to status codes; only defects throw. ESLint enforces the direction: domain and services cannot import Fastify, drizzle, pg, BetterAuth, adapters or routes, and routes cannot import infrastructure.

On both first and returning sign-ins, the API admits a Google account only when the ID token's `email_verified` is true, its `hd` (hosted domain) claim is on `GOOGLE_ALLOWED_DOMAINS`, and the email's domain matches `hd`. A personal Gmail account has no `hd` and is refused. The `hd` authorize parameter only steers Google's account chooser, so the claim is checked on the server. Password login and client-supplied ID-token sign-in are disabled. Existing users can link Google through the same verified email only after passing the Workspace check; provider trust never bypasses email verification. OAuth tokens are discarded before account persistence. Sessions expire absolutely after eight hours; reads do not extend them. Session cookies are checked against PostgreSQL on every protected request, so revocation takes effect immediately. Workspace changes, such as a suspended account, are checked on the next Google sign-in; existing application sessions must be revoked when immediate removal is required.

Migration `003_auth` adds BetterAuth's four core tables: `auth_user`, `auth_session`, `auth_account`, and `auth_verification`. It does not replace content tables or author data. BetterAuth reads and writes them through its Drizzle adapter, over the same tables defined in `schema.ts` (where `schema.test.ts` checks them column for column); migrations stay hand-written and replay-safe, never generated. The migration is checked against the installed BetterAuth schema in the PostgreSQL integration suite. Migration `004_github_sessions` revoked sessions without a linked GitHub account when sign-in briefly moved from Google to GitHub (6 Oct 2026). User IDs, accounts, content, audit history, and browser drafts were preserved. Migration `020_google_sessions` revokes every session without a linked Google account when sign-in moves to Google (#3412), so nobody keeps a session the Workspace check never admitted; users, accounts and roles stay. A Google sign-in links to an existing user, keeping their user ID, roles and history, only when their verified Google email equals the user's email. Migration `021_github_accounts` deletes the GitHub account links, which can never sign in again. A GitHub-era user whose email isn't their Workspace address is moved by `API_V2_EMAIL_MOVES` (#3418): comma-separated `old=new` pairs, applied on every boot before sign-in is served. A move keeps the user ID; if the person already signed in with Google, that new user is dropped when it has no history, and both are left alone (logged as `conflict`) when it has. Set it per environment, outside this public repo, and remove it once everyone has moved.

### Roles

Signing in decides who is an employee; roles decide what they can do (ADR 0079). Roles are rows in `user_roles` (migration `008_user_roles`, numbered after #3340's 006 and 007), read on every request, so a revocation applies to the employee's next request.

- `editor` writes: creating, saving and deleting pages. A new user has no role at their first sign-in: they can read the editor but not write until an admin grants `editor` (ADR 0079, amended for #3412). Under GitHub sign-in api_v2 granted it by default, and migration `009_default_editor_role` granted it once to everyone who had signed in before; those grants stay.
- `approver` changes what citizens see: changing a page's `visibility`, deleting a `public` page, rejecting or publishing a pending revision, and creating, editing, reordering and deleting categories, so landing shows only category changes an approver made (#3201). These are direct actions, with no request waiting for a second approver, except that an approver can't make public content they changed (see Making a page public). An editor who isn't an approver can make every other edit, and submit a revision for review.
- `admin` lists employees and grants and revokes roles (`/editor/employees…`), recording who granted each. A signed-in employee whose email `API_V2_ADMIN_EMAILS` lists is granted `admin` and `editor`, with no grantor, if they lack them, so a listed admin can write as well as grant roles; an admin cannot revoke a listed admin's roles for good.

A refusal is a 403 `{error: "forbidden", message}` and the database is unchanged. Reads stay open to every signed-in employee, roles or not. Each write route names the role it needs in its route options (`config: { role: "editor" }`, or `"approver"` for publishing and rejecting revisions and for every category write), and the editor scope's `onRequest` hook enforces it; a write route that names none is refused to everyone, and `src/route-auth.test.ts` fails until it names one. That test also fails when a route that changes what citizens see names neither `approver` nor is one of the page writes (`POST`, `PUT` and `DELETE /pages…`) whose approver check sits in `PageEditing`, because only some of their writes need one.

### Making a page public

Making a page public approves its content, so the self-approval rule (ADR 0079) applies to it as it does to a revision (#3201). A save that makes a page public is a 403, and nothing is written, when the approver changed the page's content since it was last public, or ever when it never was: in an earlier save, or in this one. Another approver makes it public. Who changed it comes from the page's `change_events`: the actor of each `created`, `updated`, `published` or `unpublished` entry since the last one whose snapshot is public, counting only entries whose row differs from the one before in more than `visibility` and its stamps (and, for a sub-page, its category, which follows its parent's when a write above it carries it along), so an approver who only took the page out of public view, or moved it between Draft and Preview, may still make it public. Creating a page as `public` needs the approver role, and is refused to an approver for the same reason, so outside `AUTH_BYPASS` nobody creates a page as `public`: create it as Preview or Draft. Under `AUTH_BYPASS` the rule is relaxed, as it is for revisions. So an approver can't skip review by taking a public page private, editing it and making it public again, nor by deleting it and creating it again as `public`.

Unpublishing a page and deleting a `public` page stay direct approver actions: they take content away from citizens rather than show them unreviewed content. Deleting a Preview or Draft page needs only the editor role (#3187).

Under `AUTH_BYPASS` the local developer holds every role. `GET /editor/me` returns the signed-in employee and their roles, which the editor uses to hide what they cannot do.

### Write preconditions and cutover

All existing-content writes require the version displayed by the editor. Versions
are positive JavaScript-safe integers issued by the database; compare them for
equality, never increment or derive them from timestamps. Page/category PUTs and
review commands send `expected_version` in JSON. Page/category/record DELETEs
send it as a canonical decimal query value. Category reorder and record writes
use the additional baselines documented below.

Authentication, Origin and role checks still run first. Missing or malformed
versions return 400, without looking up the target. With valid input, missing targets return 404 and stale versions return
409 `version_conflict`, including stale no-ops. Business conflicts such as
`under_review`, `not_submitted`, `record_exists` and `category_in_use` retain
their existing codes.

Do not restore timestamp fallback or write ETags. If a response is lost, retry only the immutable original request
with its original versions. A matching server value does not prove that this
client's earlier request succeeded; never silently adopt a fresh version and
resubmit. Public representations and public ETags remain version-free.

### Pending revisions

A save that keeps a `public` page public, whoever sends it, approvers included, goes into the page's pending revision in `page_revisions` (migration `010_page_revisions`, #3198). The live row, its search chunks and every site read stay as they were until an approver publishes the revision (#3199). A page has at most one open revision, and a later save updates it. The revision keeps the fields as the save sent them, the live `updated_at` it was saved over, who started it, and everyone who saved to it, since none of them may approve it (ADR 0079). It is refused with the same field-level 422s as a live save, and it goes when its page is deleted.

The editor reads and saves the working copy. `GET /pages/:id` and the save response lay the revision over the live page, set `pending_revision`, and return the enclosing page's numeric `version`. Send that version as `expected_version` on the next write. `updated_at` remains a display timestamp. `GET /pages/:id/revision` returns the revision with the page's version, or 404 when there is none.

Editor page responses also include `last_edited_by: { id, name } | null` (#3171), from the page's highest `version_no` change event joined to `auth_user`. Review steps count; pending-revision saves do not create events, so this may not identify the working copy's last saver or the author of its `updated_at`. A system event returns `{ id: "system", name: "System" }`. No event returns null; an event whose actor's name is unavailable keeps its id with `name: null`, as history does. Public page, category, catalog and search reads never include attribution, even for signed-in callers.

A save to a page that is not public writes the page as before. Changing `visibility` stays a direct approver action (ADR 0079): an approver's save that takes a public page out of public view changes only the live row's `visibility`. The other fields it sends are ignored and the live content stays, so revision content never reaches `content_pages` that way, to be made public again without review. It closes the page's open revision, keeping the rule that only a public page has one: a draft is dropped, and a revision waiting for review is marked `discarded` with the approver and the time (migration `015_revision_discarded`, #3203), so an urgent takedown needs no rejection first. The page's history then reads `discarded` followed by `unpublished`, both by the approver. A rejected revision retires as the live page moves on. An approver who then edits the page while it is not public can't make it public themselves (see Making a page public). A revision save writes no `change_events` entry, because the live page did not change; its review steps are recorded (see below).

### Reviewing a revision

Migration `011_revision_review` (#3199) adds the review statuses and who moved a revision through them. A revision goes `draft` → `submitted` → `rejected` or `published`, or `discarded` when an approver unpublishes the page while it waits (`015`, #3203):

- `POST /pages/:id/revision/submit` (editor role) sends the page's draft for review and records the submitter. With no draft it is a 404; already submitted, a 409 `under_review`. A rejected revision can be submitted again as it is: it is copied into a new submitted revision with the same `updated_at` (its content hasn't changed), and the rejected one keeps its comment as history. The copy's `contributors` are the rejected round's plus its submitter, and a new draft saved over a rejected revision inherits them the same way, so whoever submitted an earlier round still can't approve it.
- `POST /pages/:id/revision/reject` (approver role) takes `{ comment, expected_version }`, with a comment of 1 to 2000 characters after trimming. The live page is unchanged. The rejected revision is kept with its comment and the rejecter, and the editor keeps working from it: `GET /pages/:id` lays it over the live page with `pending_revision: { status: "rejected", comment }`. The next save starts a new draft beside it, carrying its contributors over, since it starts from their content. A live write retires a rejection: it no longer shows once the live page has moved past the version it was saved over.
- `POST /pages/:id/revision/publish` (approver role) approves and publishes in one transaction: the revision's fields are checked again as a save checks them (placement, a url a category owns, and the database's own refusals), since its parent, its category or its url can have changed while it waited. A stale revision is a 422 naming the field, and nothing changes. Otherwise the revision is marked `published` with the approver and the time (an `approved` `change_events` entry), then the live row is written, its search chunks re-cut and an `updated` (or `published`) entry appended, both by the approver.

Submit and publish take `{ expected_version }`; reject takes `{ comment, expected_version }`. Every command checks the page's version under its row lock before review-state rules. Missing versions return 400; stale versions return 409 `version_conflict`. With a current version, publish and reject return 404 when nothing waits for review and 409 `not_submitted` for a draft. Submit, reject, publish and revision saves all advance the page version, even when the live content is unchanged.

**Self-approval** (ADR 0079): the approver who publishes or rejects a revision must not be its submitter or one of its `contributors`; otherwise it is a 403. It is allowed only under `AUTH_BYPASS`, where `main.ts` passes `allowSelfApproval` to `PageEditing` so one developer can try the whole flow.

**One open revision.** A page has at most one revision that is `draft` or `submitted` (`page_revisions_open_page_id_key`). Editors keep working while a change waits (#3203). A save to a submitted revision updates it in place and it stays in the review queue. Like every save, it requires the page's `expected_version`. The saver joins its `contributors`, so whoever changes a waiting revision cannot approve it. The page version advances, and an approver holding the earlier version receives 409 `version_conflict` on publish or reject.

`GET /pages/:id/revision`, and the submit and reject responses, carry `changes`: `{ field, live, proposed }` for each page field whose proposed value differs from the live page's, in field order. Publish returns the page as it now stands.

`GET /revisions?status=submitted` is the review queue (#3202): every revision waiting for review, the longest-waiting first, each with its `page_id`, its proposed `title` and `url`, `submitted_by` and the submitter's name, `submitted_at` and its `updated_at`. Like every read it is open to any signed-in employee, so an approver who holds no other role sees what to review.

### Review emails

Review steps email the people who need to act or know (#3267). When an editor submits a change, every user with the `approver` role gets an email, except the submitter and anyone who changed it, since none of them may decide on it. When an approver publishes or rejects it, the submitter gets one. Publishing is the approval: there is no separate approve step, so "approved" means published. Each email has the page's title and a link to the editor, never the page's content: `/reviews/:pageId` for an approver, and the page's own screen, `/services/:serviceId/:pageId`, for the submitter, which shows a rejection's comment (a page outside any service links to its review screen when rejected, and to the services list when published). Addresses come from `auth_user` and `user_roles`.

Emails go after the review step commits, through the `ReviewNotifier` port `PageEditing` depends on. A failed lookup or send is logged, without the address, and the step still succeeds; SES calls are bounded by short timeouts and one retry, since the step's response waits for them. The `log` mailer does write addresses to the log, which is why production refuses it. `REVIEW_NOTIFICATIONS` turns them on per environment and picks the mailer (`log` or `ses`); they are off by default. Sending through SES needs the ECS task role to be allowed `ses:SendEmail` from the sender.

## Database

Generated from the migrated database by `src/erd.ts`; do not edit it by hand. `src/erd.test.ts` fails when it no longer matches the migrations.

<!-- ERD:START: generated by src/erd.test.ts, do not edit -->

```mermaid
erDiagram
  auth_account {
    text id PK
    text accountId
    text providerId
    text userId FK
    text accessToken "nullable"
    text refreshToken "nullable"
    text idToken "nullable"
    timestamptz accessTokenExpiresAt "nullable"
    timestamptz refreshTokenExpiresAt "nullable"
    text scope "nullable"
    text password "nullable"
    timestamptz createdAt
    timestamptz updatedAt
  }
  auth_session {
    text id PK
    timestamptz expiresAt
    text token UK
    timestamptz createdAt
    timestamptz updatedAt
    text ipAddress "nullable"
    text userAgent "nullable"
    text userId FK
  }
  auth_user {
    text id PK
    text name
    text email UK
    bool emailVerified
    text image "nullable"
    timestamptz createdAt
    timestamptz updatedAt
  }
  auth_verification {
    text id PK
    text identifier
    text value
    timestamptz expiresAt
    timestamptz createdAt
    timestamptz updatedAt
  }
  categories {
    uuid id PK
    varchar(100) slug UK
    varchar(200) title
    text description "nullable"
    timestamptz(3) created_at
    timestamptz(3) updated_at
    uuid parent_id FK "nullable"
    int4 position
    int8 version
  }
  change_event_counters {
    varchar(40) entity_kind PK
    text entity_id PK
    int4 last_version
  }
  change_events {
    uuid id PK
    varchar(40) entity_kind "unique (entity_kind, entity_id, version_no)"
    text entity_id
    int4 version_no
    change_action action
    jsonb snapshot
    text actor FK
    timestamptz(3) occurred_at
    int4 snapshot_version "nullable"
  }
  collection_records {
    uuid id PK
    varchar(100) collection_key FK "unique (collection_key, record_key)"
    varchar(200) record_key
    jsonb data
    timestamptz(3) created_at
    timestamptz(3) updated_at
    int8 version
  }
  content_pages {
    uuid id PK "unique (id, category_id)"
    varchar(512) url UK
    varchar(200) slug
    varchar(300) title
    text description "nullable"
    timestamptz(3) created_at
    timestamptz(3) updated_at
    uuid category_id FK "nullable"
    page_visibility visibility
    varchar(100) form_id "nullable"
    text body_markdown
    jsonb frontmatter
    timestamptz(3) published_at "nullable"
    uuid parent_id FK "nullable"
    timestamptz(3) content_updated_at
    int8 version
  }
  data_collections {
    uuid id PK
    varchar(100) key UK
    varchar(200) title
    varchar(100) record_key
    jsonb schema
    int4 schema_version
    timestamptz(3) created_at
    timestamptz(3) updated_at
    int8 version
  }
  page_revisions {
    uuid id PK
    uuid page_id FK
    text status
    jsonb fields
    timestamptz(3) live_updated_at
    text created_by
    text[] contributors
    timestamptz(3) created_at
    timestamptz(3) updated_at
    text submitted_by "nullable"
    timestamptz(3) submitted_at "nullable"
    text decided_by "nullable"
    timestamptz(3) decided_at "nullable"
    text comment "nullable"
  }
  search_chunks {
    uuid id PK
    uuid page_id FK "unique (page_id, ordinal)"
    int4 ordinal
    text heading "nullable"
    text body
    tsvector tsv "generated"
  }
  user_roles {
    text user_id PK, FK
    text role PK
    text granted_by "nullable"
    timestamptz(3) granted_at
  }
  auth_user ||--o{ auth_account : "userId -> id"
  auth_user ||--o{ auth_session : "userId -> id"
  categories |o--o{ categories : "parent_id -> id"
  auth_user ||--o{ change_events : "actor -> id"
  data_collections ||--o{ collection_records : "collection_key -> key"
  categories |o--o{ content_pages : "category_id -> id"
  content_pages |o--o{ content_pages : "parent_id, category_id -> id, category_id"
  content_pages |o--o{ content_pages : "parent_id -> id"
  content_pages ||--o{ page_revisions : "page_id -> id"
  content_pages ||--o{ search_chunks : "page_id -> id"
  auth_user ||--o{ user_roles : "user_id -> id"
```

<!-- ERD:END -->

## HTTP surface

| Method   | Path                                   | Access                                                                 |
| -------- | -------------------------------------- | ---------------------------------------------------------------------- |
| GET      | `/pages?url=…`                         | Site page resolution (public, or preview with the token)               |
| GET      | `/categories`                          | Site category tree                                                     |
| GET      | `/categories/:slug`                    | A category's subcategories and root pages                              |
| GET      | `/categories/:c/:s`                    | A subcategory's root pages                                             |
| GET      | `/catalog`                             | Every visible page (sitemap, service lists)                            |
| GET      | `/site-version`                        | Opaque token that moves on any content change; the site polls it       |
| GET      | `/search/documents`                    | Every visible page with its search text in chunks                      |
| GET      | `/collections/:key/records`            | A data collection and its records (public, without edit versions)    |
| GET      | `/docs`                                | Public API reference (Scalar)                                          |
| GET      | `/docs/openapi.json`                   | Public OpenAPI document                                                |
| GET      | `/health`                              | Load balancer check: 200 while the process serves; never hits the DB   |
| GET      | `/health/db`                           | 200 if the database answers in 2 s, else 503; not for the ALB          |
| GET      | `/pages/:id`                           | Employee; includes drafts and previews, with any pending revision      |
| GET      | `/pages/:id/revision`                  | Employee; a public page's pending revision, with its `changes`         |
| GET      | `/pages/:id/history`                   | Employee; the page's changes and review steps, newest first            |
| GET      | `/revisions?status=submitted`          | Employee; the review queue: revisions waiting for an approver          |
| GET      | `/services`                            | Employee service index, grouped by `parent_id`                         |
| GET      | `/services/:id`                        | Employee; one service's pages with their roles, entry first            |
| GET      | `/editor/categories`                   | Employee; every shared category, counts, address protection and stamps |
| POST     | `/editor/categories`                   | Approver; append a category or subcategory                             |
| PUT      | `/editor/categories/:id`               | Approver; edit with body `expected_version`                          |
| PUT      | `/editor/categories/order`             | Approver; reorder a complete expected sibling snapshot                 |
| DELETE   | `/editor/categories/:id`               | Approver; delete an empty category with query `expected_version`                |
| GET      | `/collections`                         | Employee; every data collection with its field list and record count   |
| GET      | `/collections/:key/records/:recordKey` | Employee; coherent versioned `{ collection, record }` snapshot |
| POST     | `/collections/:key/records/:recordKey` | Editor; add a record with `expected_collection_version`      |
| PUT      | `/collections/:key/records/:recordKey` | Editor; replace data with record and collection versions              |
| DELETE   | `/collections/:key/records/:recordKey` | Editor; delete a record with query `expected_version`                      |
| GET      | `/version`                             | Employee change token                                                  |
| POST     | `/pages`                               | Employee create; as `public`, refused (approver under `AUTH_BYPASS`)   |
| PUT      | `/pages/:id`                           | Editor save with body `expected_version`; public pages save to a revision |
| DELETE   | `/pages/:id`                           | Employee delete; a `public` page, approver only                        |
| POST     | `/pages/:id/revision/submit`           | Editor; submit the draft revision for review                           |
| POST     | `/pages/:id/revision/reject`           | Approver, not its author or submitter; reject with a `comment`         |
| POST     | `/pages/:id/revision/publish`          | Approver, not its author or submitter; publish it to the live page     |
| GET      | `/editor/me`                           | Employee; who is signed in, with their roles                           |
| GET      | `/editor/employees`                    | Admin; everyone who has signed in, with their roles                    |
| PUT      | `/editor/employees/:id/roles/:role`    | Admin; grant a role                                                    |
| DELETE   | `/editor/employees/:id/roles/:role`    | Admin; revoke a role                                                   |
| GET/POST | `/api/auth/*`                          | BetterAuth's Google/session protocol                                   |

Missing, expired, or revoked sessions produce JSON 401 responses; disallowed employees or write origins produce 403; unavailable session verification produces 503. The API does not redirect protected content requests to Google. The editor handles navigation. Authenticated writes require `Origin: <EDITOR_ORIGIN>`. Auth/session/editor responses use `Cache-Control: no-store` and do not receive ETags. Page, category and collection record write audit rows record the authenticated user ID, never a caller-supplied actor, and commit with the write they record.

The database writes the history itself: a trigger (`record_change`, migration `007`) adds a `change_events` row for every insert, update and delete of a content table (`content_pages`, `categories`, `data_collections`, `collection_records`), including the sub-pages a parent's move carries with it. Its `actor` is the transaction's `app.user_id`, which the editor's writes set (transaction-local, so a pooled connection never carries it into the next request), or `system`, a user with no account, when nothing set it: the seed, the import, raw SQL. `actor` references `auth_user`, so a user with history cannot be deleted. An update that changes nothing but `updated_at` is not recorded; a page going public is `published` and one leaving public is `unpublished`. The snapshot is the row as stored. A new content table attaches `record_change` in the migration that creates it, or `migrate.test.ts` fails.

Review is recorded the same way (`record_review`, migration `013`): when a page's revision changes status, the page's own history gets `submitted` (a first submission or a resubmission), `rejected`, `approved` (on publish) or `discarded` (unpublished while waiting, migration `015`), by the transaction's user, numbered after the page's last event. The snapshot is the revision row, so it names the submitter (`submitted_by`), the approver or rejecter (`decided_by`) and a rejection's `comment`. A page's history therefore holds two snapshot shapes under `entity_kind = 'content_page'`: review events (`submitted`, `rejected`, `approved`, `discarded`) store a `page_revisions` row, whose `snapshot->>'id'` is the revision's id (the page's is `snapshot->>'page_id'`), and every other event stores a `content_pages` row. Anything that rebuilds a page's state from its history must filter on `action`. A publish then logs the live write as `updated` (or `published`) by the same approver, so a page's history reads who submitted a change, who approved it, and when it went live. Saves to a revision, draft or submitted, are not recorded.

Public site reads (`/pages?url=`, `/categories…`, `/catalog`, `/search/documents`, `/collections/:key/records`) send `public, max-age=60, stale-while-revalidate=300, stale-if-error=86400`; unknown public URLs send `public, max-age=10`. `/site-version` sends `public, max-age=5`: landing checks it at most every 5 s and expires its cached pages when it moves, so a publish shows within seconds rather than after the pages' max-age. ETags and 304s remain available for public reads. These routes do not look up or refresh employee sessions.

The editor loads record detail through authenticated `GET /collections/:key/records/:recordKey`, which returns `{ collection, record }` from one database snapshot with both versions. It never derives a write baseline from the public record list. PUT sends `{ data, expected_version, expected_collection_version }` and returns the same envelope, including for a no-op. POST sends `{ data, expected_collection_version }` from the displayed collection definition and returns the created versioned record. DELETE needs only the record's `expected_version` query parameter. The definition's edit `version` is separate from `schema_version`.

Preview: the site's server sends its `PREVIEW_SECRET` as `x-preview-token`, and the same reads then include `preview` content. Those responses are `no-store` with no ETag, so preview content never enters a shared cache. A wrong token, or any token when `PREVIEW_SECRET` is unset here, is a 401 rather than a quiet fall-back to the public view. `draft` content is only ever served to the editor.

The hierarchy is `parent_id`, not the url. A page is served only when it and every page above it are visible; its breadcrumbs are its category (and parent category, for a subcategory), then the pages above it; a category lists only the pages at its root (`parent_id` null), so `start` steps and sub-pages never appear in a listing. A sub-page must share its parent's category (moving the parent moves its sub-pages), a page cannot sit beneath itself, and a page with sub-pages cannot be deleted: each is a field-specific 422.

`GET /pages?url=` returns `{url, frontmatter, body_markdown, form_id, hide_start_links, breadcrumbs, category, subcategory}`. `category` and `subcategory` are slugs, null when the page has none. `hide_start_links` is true when the page's `start` sub-page is hidden from the viewer. `visibility` is `preview` when the page or any page above it is preview; the site shows its review banner and `noindex` from it (#3246). Whether a form is open is the forms API's to say: `form_id` is a name, and the site asks the forms API for the form's status. The API serves markdown as written; the site owns sanitization and rendering. Editor writes return field-specific 422s for invalid references or duplicates, 409 for a stale supplied version, and stamp `published_at` only on first publication. `content_updated_at`, the site's "Last updated" line, is moved by a trigger only when the title, description, body, frontmatter or form changes, so a visibility change or a move keeps it (migration `016_content_updated_at`, #3105). A save replaces the page, so it sends every field; only `parent_id` may be left out, which keeps the page's parent. Changing `url` moves that page alone: its sub-pages keep theirs, and nothing redirects from the old url. Each write still records an append-only audit snapshot (see above); `GET /pages/:id/history` lists them read-only, newest first, with who made each change and which fields it changed (#3423); nothing restores an earlier version. A request its route's schema refuses (a missing field, an id that is not a UUID, an explicitly malformed version, a url over 512 characters, a title over 300) is a 400; Fastify's own refusals keep their status (a body that is not JSON is a 415), and an unknown route is a JSON 404.

### Category management

The one shared list serves category management, every page picker and every content
type. `GET /editor/categories` returns `{ categories: [...] }` with each parent
followed by its ordered children. Rows contain `id`, `parent_id`, `title`, `slug`,
nullable `description`, `url`, `position`, `services`, `reserved_route` and
`updated_at`, `version` and `last_edited_by`. Attribution uses the category's latest change event
and the same nullable author shape as editor pages. Service counts match `/services`
roots, including unpublished work.
Public category reads expose none of the private counts or editor metadata.
The former taxonomy endpoint is removed without an alias.

Create/update send all four fields:
`{ title, slug, parent_id, description }`; update also requires `expected_version`. Unknown keys are refused. Titles and
descriptions are trimmed; blank descriptions become null. Names need not be
unique; slugs must be globally unique, lower-case hyphenated words of at most
100 characters. Renaming a title never changes the slug. Empty categories may
change slug/parent, but any assigned page, subcategory or reserved app-route
anchor blocks address changes. Names and descriptions remain editable at anchors.

Create and reparent append to the current destination under the shared content
write lock. Update requires `expected_version` in its body; delete requires it in the query.
Reorder sends `{ parent_id, expected: [{ id, version }], ordered_ids }` for the
complete sibling group and returns `{ categories: [...] }` in saved order.
Missing or malformed fields, versions or ID sets are 400;
field rules are 422; stale membership or versions are 409 `version_conflict`. Occupied deletion is 409 `category_in_use` with
`blockers: { pages, subcategories, reserved_route }`. The page blocker counts
all pages, not just services. No operation cascades deletion or moves page URLs.
A missing category target is 404; successful deletion is 204.

All category writes and page create/save/delete transactions take the same
advisory lock before row locks. They check page/category URL collisions in both
directions, including drafts and empty categories. Existing page operations
otherwise retain their behavior. App-owned route/asset reservations and category
anchors are explicit in `src/modules/category.ts`, with landing route coverage
in its test. The complete contract is [ADR 0078](../../docs/decisions/0078-category-write-rules.md).

Do not automatically retry a mutation whose response was lost or was a 5xx.
The write may already have committed. Refresh and reconcile the saved slug/fields,
sibling order or deleted ID first; a changed timestamp alone does not prove success.

Category writes are recorded by the change history trigger against the
signed-in employee and advance `/version`. A save that changes nothing keeps
the category's `updated_at` and `last_edited_by`, so other editors' copies stay current. The editor's persisted category controls are
tracked in #3178, landing integration in #3179, and sandbox acceptance in #3180.

`search_chunks` holds each page's body split at its headings, as plain text, rewritten in the same transaction as every save. Rejoined, a page's chunks are exactly the text landing's search indexes today (`search-text.test.ts` checks every seeded page), so moving search onto the API does not move its ranking. The generated `tsv` column and its GIN index are there for server-side search and are not read yet.

The seed is a committed snapshot of legacy markdown and the category taxonomy, subcategories included, with each sub-page's parent. Every page keeps its frontmatter `publish_date` as `published_at`, public or not, so going public later keeps that date. Inserts are additive and idempotent and never replace authored changes. It runs only with `SEED=true`, because an additive insert also brings back a page an editor deleted. Each page and category it adds gets a `created` entry by `system` in the audit log, which also moves the editor's change token. Regenerate it with `pnpm seed-data` (or `pnpm generate:seed-data` from the root) when intentionally updating the snapshot. The import (see "Importing the estate" below) reports `source`, a sha1 of the snapshot's categories and pages computed at import time. It is not stored in `estate.json`, so content PRs don't all rewrite one shared line and conflict. CI's "Generated Files Up To Date" job regenerates the snapshot on every PR and, when it differs, commits the regen back to the PR branch, or fails when it can't push. So a content change can't merge with a stale `estate.json`.

## Importing the estate (once per environment)

Each deployed database gets the estate once, by a command rather than by `SEED`. It is compiled into the image beside `main.js`, so it runs with the task's own database settings:

```sh
node dist/src/import-estate.js --forms-api <origin> [--dry-run] [--force "<reason>"]
```

Locally, from this directory, run `pnpm import-estate --forms-api https://forms.api.sandbox.alpha.gov.bb --dry-run` (or without `--dry-run`); it reads `.env` like `pnpm dev`. Do not add a `--` separator: this pnpm forwards it literally and tsx then rejects the flag.

Before it touches the database, the command reads that environment's `service_status` (see "Each environment's service_status" below) and prints `service_status: N rows from <url>`, then one JSON line listing every page whose visibility the overlay changed: `{"visibility_changes":[{"url":"…","from":"preview","to":"public"},…]}`. Both lines come before `database:` and so before any refusal. The command then migrates, prints `database: <name> host: <addr>` before writing anything, then one JSON line: `{"mode":"dry-run"|"import"|"replace","source":"<content sha1>","reason":"<reason>"|null,"existing":N,"actors":{…},"revisions":N,"categories":N,"documents":N,"collections":N,"records":N}`. It refuses, with exit code 1, when `content_pages` already has rows: `content_pages has N rows (history actors: …; revisions: N); refusing. Pass --force "<reason>" to replace them.` `revisions` counts the rows in `page_revisions`: pending editor saves, which write no history event, so the actor histogram cannot show them, and which `--force` deletes. `--force` deletes every row of `search_chunks`, `page_revisions` (the pending revisions of the pages it replaces), `content_pages` and `categories` and then imports, all in one transaction, so the history records each replaced page and category as `deleted` by `system`; `change_events` is never emptied. The transaction holds a lock on `content_pages` until it commits or rolls back, so editor saves stall for the few seconds it takes; public reads keep seeing the old content until it commits. `--dry-run` does the real work and rolls it back, so its counts and errors are real. `--force` keeps `data_collections` and `collection_records`, and records are seeded only into a new collection, so a replace normally reports `"collections":0,"records":0`; that is expected. On an occupied database a plain `--dry-run` refuses (after printing `visibility_changes`), so `--dry-run --force "<reason>"` is the only way to see the JSON line before the real run. Every imported page's and category's `created` history entry is by `system`; the source hash and the `--force` reason are in the JSON line, not the history.

### Each environment's service_status

The snapshot's visibility is the markdown frontmatter's. Each environment's admins have since set services `enabled`, `disabled` or `form_disabled` in feature flagging, and landing applies that at request time; after cutover landing ignores it for api_v2 pages (#3125), so the import applies it instead (#3188, ADR 0063's mapping):

| `service_status` | Imported visibility                                      |
| ---------------- | -------------------------------------------------------- |
| `enabled`        | `public` (raises a `draft` or `preview` page)            |
| `disabled`       | `preview` (lowers a `public` page, raises a `draft` one) |
| `form_disabled`  | the frontmatter level, unchanged                         |
| no row           | the frontmatter level, unchanged                         |

A page's key is its `form_id`, or its `content_slug` (landing's registry slug) when it has no form. A `/start` page that carries its parent's `form_id` shares its parent's row; one without a form (e.g. `calculate-severance-pay/start`) keys on its own slug, keeps its own level and is not listed in `visibility_changes`, but is still hidden whenever its parent is, because a page is served at the most restrictive level of itself and its ancestors. A row that matches no page is ignored. `published_at` stays the frontmatter `publish_date` whatever the level; an undated page is dated now only if it imports `public`.

`--forms-api` is required. A missing flag, a network error, a non-2xx answer or a body that is not the `{"status":"success","data":[{slug,status}]}` envelope exits 1 before the database is opened, so nothing is written.

Before every run, confirm in the Amplify Console that the environment's feature_flagging branch has no `EDITOR_V2_URL` set. If it is set, stop: that environment is past cutover, where a `disabled` row hides only the form (ADR 0063, "After cutover"), and the overlay would wrongly lower the page. The importer cannot detect this.

`--forms-api` is that environment's api v1 origin, the same value as its `VITE_FORMS_API_URL`:

| Environment | `--forms-api`                                               |
| ----------- | ----------------------------------------------------------- |
| sandbox     | `https://forms.api.sandbox.alpha.gov.bb`                    |
| staging     | `https://api.staging.alpha.gov.bb`                          |
| prod        | prod's `VITE_FORMS_API_URL`; confirm it at #3230 before use |

### Per environment

Sandbox re-imports while no editor has written there (#3234). Staging (#3229) and prod (#3230) import after `v2-rewrite` merges into `main` (#3131), inside the #3164 cutover windows. Every run imports the snapshot on the deploying branch at the deployed commit.

1. Pick the snapshot: the content you want is merged, and the api_v2 deploy of that commit has finished, so the running image carries its `estate.json`. Note the commit sha. The `source` the import reports is a sha1 of that commit's parsed `estate.json` (`ESTATE_SOURCE` in `src/seed-data/index.ts`), not of the file's bytes, so `sha1sum estate.json` will not match it.
2. Set up the shell for the environment, then confirm the task definition does not set `SEED`. Sandbox's no longer does (since revision `api-v2-sandbox:9`, alpha-infra#748); staging's and prod's (#3130) must never set it. If it does, stop: production mode refuses to boot with it (#3052). The staging and prod cluster and service names follow sandbox's pattern; confirm them against #3130's task definitions.

   ```sh
   export AWS_PROFILE=<your profile>
   export AWS_REGION=ca-central-1
   ENV=sandbox
   CLUSTER=modular-forms-$ENV
   SERVICE=api-v2-$ENV
   aws ecs describe-task-definition --task-definition "$SERVICE" --query 'taskDefinition.containerDefinitions[0].environment'
   ```

3. Run the command inside the live container with ECS Exec (needs the AWS Session Manager plugin and credentials for the account). The deployed image has no `psql`, so every database step goes through the command. First confirm the running task's image is tagged with the sha you noted in step 1 (the deploy tags images with the commit sha); an older image imports an older snapshot. Dry run first; read the `visibility_changes` line, the `database:` line and the counts; then the real run.

   ```sh
   TASK=$(aws ecs list-tasks --cluster "$CLUSTER" --service-name "$SERVICE" --query 'taskArns[0]' --output text)
   aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK" --query 'tasks[0].containers[?name==`api-v2`].image' --output text
   aws ecs execute-command --cluster "$CLUSTER" --task "$TASK" --container api-v2 --interactive --command /bin/sh
   ```

   Then, inside that shell, set the environment's origin from "Each environment's service_status" above, and on an empty database:

   ```sh
   FORMS_API=<origin>
   node dist/src/import-estate.js --forms-api "$FORMS_API" --dry-run
   node dist/src/import-estate.js --forms-api "$FORMS_API"
   ```

   and on a database that already has content, only after the check in "A database that already has content" below:

   ```sh
   node dist/src/import-estate.js --forms-api "$FORMS_API" --dry-run
   node dist/src/import-estate.js --forms-api "$FORMS_API" --dry-run --force "<env>: re-import from <branch> <deployed sha>"
   node dist/src/import-estate.js --forms-api "$FORMS_API" --force "<env>: re-import from <branch> <deployed sha>"
   ```

   A one-shot form also works when the command needs no quoting, e.g. `--command "node dist/src/import-estate.js --forms-api <origin> --dry-run"`; for a forced run as a one-shot, wrap it as `--command "/bin/sh -c 'node dist/src/import-estate.js --forms-api <origin> --force \"<reason>\"'"` and confirm the quoting on sandbox before relying on it.

4. Record it on the import issue (#3234, #3229 or #3230): paste the refusal line, if there was one, the `visibility_changes` line, the dry run's JSON line and the real run's JSON line, which names the `source` hash and any `--force` reason. The `change_events` rows it wrote are by `system` and carry `occurred_at`.
5. Check every page from your machine, on a checkout of the sha from step 1 (the check reads that checkout's `estate.json`). Each page's expected level is its `estate.json` level, overlaid with the environment's `service_status` as the import did, then made as restrictive as any page above it. Per page, `GET /pages?url=` without and with the `x-preview-token` header must give 200/200 for `public`, 404/200 for `preview` and 404/404 for `draft`, and every 200 must carry a title, a body and that `visibility`. The token is the task's `PREVIEW_SECRET`; read it into the environment so it stays out of shell history and the process list:

   ```sh
   read -rs PREVIEW_SECRET; export PREVIEW_SECRET
   FORMS_API=<origin>   # the same origin as step 3, set again on your machine
   pnpm --filter @govtech-bb/api-v2 check-import --base-url https://<api origin> --forms-api "$FORMS_API"
   ```

   No `--` before the flags (pnpm forwards it and tsx rejects it). Each failing page prints `FAIL <url> expected <level>: no token <status>, token <status>`, with the problem in brackets after a 200 whose body is wrong (a status of `ERR …` is a network error). Then one `<level>: <n> pages, <n> failing` line per level, and a last line with the failure count and the snapshot's `source` hash, which must match the import's. It exits 1 on any failure. `preview token refused` means `PREVIEW_SECRET` is wrong, or unset on the API, and `rate limited` means the site routes' 1,000-requests-a-minute limit was hit; both stop the run at once. Paste the output on the import issue with step 4's lines.

### A database that already has content

#3095 contains the sandbox rehearsal and snapshot evidence; #3234 tracks the later refresh. The production `SEED` guard is implemented (#3052). An open issue is not a reason to repeat an import. Verify the target task definition and recorded source/actor evidence before any separately approved environment work.

Run `--dry-run`: it refuses an occupied database and shows the actor histogram of every recorded page and category event. A histogram containing only `system` does not prove that no editor has changed content: category edits made before migration `007` left no events, and migration `007` rewrites legacy non-user actors to `system`. Do not use the histogram alone as permission to replace an estate. Only run `--force "<reason>"` after separately verifying that no editor-owned content will be overwritten and obtaining approval for the replacement. If editors have written, or that cannot be established, do not replace: preserve editor-owned data; fix forward in the editor, or use an approved RDS point-in-time recovery to a moment before the bad import. The same rule is the rollback rule after a bad import.

An editor has written if any of these holds:

- **(a)** the refusal's `history actors:` lists any actor other than `system`. Only `system` is a machine actor; editors are recorded by their `auth_user` id, which `007` kept.
- **(b)** the refusal's `revisions:` is not 0. A pending save writes no history event (see "Pending revisions"), and `--force` deletes it.
- **(c)** on sandbox only, a category was edited between #3351 (28 Oct 2026, 00:24 UTC) and sandbox's deploy of #3340 running migration `007` (merged 28 Oct 2026, 19:21 UTC), when category edits left no event. #3234 checks this with a one-off query.

If any holds, stop, record it on the import issue, and fix forward.

### The markdown freeze

`apps/landing/src/content` freezes at the prod import. Until then it stays editable, and CI keeps `estate.json` current on every PR. `apps/landing` reads api_v2 when `VITE_API_V2_URL` is set and falls back to the markdown otherwise; deleting the directory is part of retiring the v1 content path (#3165).

There is one switch: the GitHub repository variable `CONTENT_FREEZE=true`. #3236 adds the check that, while it is set, fails any PR into `main` that edits `apps/landing/src/content/**/*.md` or either `categories.ts`, including the PRs the v1 form builder opens. Turn it on as step 0 of the prod import, **before** the prod deploy whose snapshot is imported; a content PR merged in between is otherwise lost. A repository admin runs:

```sh
gh variable set CONTENT_FREEZE --body true   # on
gh variable delete CONTENT_FREEZE            # off
```

The "Generated Files Up To Date" job (#3136) stays on: it also regenerates two v1 files (`services-index.generated.ts`, `form-categories.generated.ts`) and writes only generated files, so the freeze check never trips on it, and with the markdown frozen its `estate.json` regen is a no-op. From then on `estate.json` no longer tracks the prod database; it is read only by local `SEED` and fresh imports. After the prod import, content changes go through the editor only.

## History protection

`change_events_no_mutate` rejects ordinary updates and all deletes. The
controlled redaction exception is described below. Migration `017` adds
`change_events_no_truncate`, a statement-level trigger that also rejects emptying
the table with `TRUNCATE`, even when it has no rows. Ordinary inserts still work.

These guards do not stop a table owner from disabling triggers. The API currently
uses the same database credentials for migrations and requests. Separate owner
and runtime roles, credentials and migration startup are follow-up work tracked
from #2968; the runtime role should only read and insert history rows.

## Snapshot formats

Migration `018` adds `change_events.snapshot_version`. Existing events stay null,
which means their format is unknown. New events default to `1`, covering both
`record_change` and `record_review` without rewriting either trigger.

Version `1` identifies the table-row formats in use when this migration lands.
Use `entity_kind` and `action` to identify the source table, then the format number
to interpret its row. Review actions still hold revision rows, not page rows.
A migration that changes an audited table's row shape must bump the default.
Do not backfill old events or assume a null label means one particular format.

## Removing sensitive history snapshots

Migration `019` allows one exception to the append-only history rule. An operator
can replace an event's entire snapshot with
`{"redacted":true,"reason":"<ticket>","by":"<operator>"}`. Its ID, entity, version
number, action, author and timestamp stay unchanged. A removal notice cannot be
rewritten, and events still cannot be deleted.

Redaction also preserves `snapshot_version`. It describes the removed snapshot,
not the removal notice. Readers must check `snapshot.redacted === true` before
using `snapshot_version` to choose a parser.

This is an operator command, not an API endpoint. It uses the API's configuration
and verified database TLS settings, but does not run migrations. Use authorized
database credentials. The `app.redacting` transaction setting is an explicit
switch, not an administrator permission check; `--by` records the name the
operator supplies. Database-role separation is not part of this change.

Before running it:

1. Remove the sensitive text from the source page or record so another save
   cannot copy it into history again.
2. Check retained page revisions, other history versions, search copies, caches,
   logs and backups. This command changes none of them and is not a complete
   data-erasure procedure.
3. Identify each affected event by its ID. To list a page's event IDs without
   printing its content, query `id, version_no, action, actor, occurred_at` from
   `change_events`, filtered by `entity_kind = 'content_page'` and its
   `entity_id`.
4. Use a ticket reference for the reason. Do not repeat the sensitive text there.

From `apps/api_v2`, inspect one event first:

```sh
pnpm redact-change-events --event-id "<event UUID>" --reason "incident-42" --by "<operator>"
```

Check the printed database and event metadata, then repeat with `--apply`:

```sh
pnpm redact-change-events --event-id "<event UUID>" --reason "incident-42" --by "<operator>" --apply
```

In the deployed image, use `node dist/src/redact-change-events.js` with the same
arguments. Do not add a `--` separator to the pnpm command. Without `--apply`,
nothing is written. A missing or already-redacted event exits non-zero. The
command never prints snapshot content and commits the replacement in one
transaction.

Repeat for every affected event. Then refresh the editor's history and check that
the content is gone. History keeps the original author, action and date, removes
a redacted rejection's comment, and does not compare fields across a missing
snapshot. The history count and timestamps do not change, so the version poll is
not a redaction notification.

Self-approval checks still count the author of a redacted content event. If the
last public snapshot was removed, the check may include earlier contributors
too. Another approver who did not contribute must publish the page.

## Operations and tests

SIGINT/SIGTERM drain HTTP requests before closing the shared pool; startup failures also release acquired resources. JSON logs omit cookies, OAuth callback query parameters, provider tokens and raw driver error objects. The exact warning `idle database connection dropped` remains the operational alarm marker; its safe `code` identifies the failure. Public content failures continue to use the existing 500 response, while authentication outages fail closed with 503.

The site routes (`/pages`, `/categories…`, `/collections/:key/records`, `/site-version`, `/catalog`, `/search/documents`) are limited to 1,000 requests a minute per client, answering 429 beyond it; editor, auth and `/docs` routes are not limited. `trustProxy` trusts only private-address peers (the ALB), so the client is the address the ALB forwards and a client's own `X-Forwarded-For` entries are ignored. Buckets are in memory, per task. Landing is exempt: its server sends `LANDING_SECRET` as `x-landing-token`, and such requests skip the limit and carry no `x-ratelimit-*` headers. It has to be, because landing reads `/pages` on every uncached page view (and a category listing on every category page view, and `/site-version` on its poll) from a few shared egress addresses, so its rate follows citizen and bot traffic and no limit can be sized above it (#3129). With `LANDING_SECRET` unset, nobody is exempt.

Migrations run at boot. Each script checks `schema_migrations` after acquiring the PostgreSQL advisory lock, then conditionally executes and records completion in the same transaction on the same connection. Each migration commits separately so later scripts can use newly added enum values. A runner with an outdated ledger read skips scripts another runner completed; scripts must still tolerate replay after lost bookkeeping.

Migration `023` gives pages, categories, collection definitions and records numeric edit versions from one noncycling sequence, capped at JavaScript's maximum safe integer. These identities are separate from timestamps and audit event numbers. Editor snapshots include them; public projections and audit snapshots do not. This additive stage still accepts the existing timestamp write preconditions.

PageEditing bumps a locked page after revision edits and review transitions. Revision-only maintenance outside PageEditing must explicitly bump each surviving page in the same transaction (`UPDATE content_pages SET version = version + 1 WHERE ...`); stopping editors alone does not invalidate baselines held by old tabs. Replacement imports acquire the content advisory lock before table locks and recreate roots with fresh versions. Never reset the sequence below an issued identity, including during recovery.

Before any deployment, inventory live editors and shared migration histories. Migration `023` rejects incompatible existing version columns or sequence settings; it does not adopt experimental PR #3370 schemas. Such databases need an explicitly approved recovery/migration plan, not an automatic reset. Drain old migration processes before rollout: a binary without the locked-ledger guard can still replay an older function body. Preserve unsaved drafts and gate writers during incompatible changes or recovery. Rollback must retain the version sequence and version-aware functions; deploying an old migration runner is not a safe rollback. If migration bookkeeping is partially lost, inspect and repair it before restarting writers: replaying only an old function migration while keeping newer ledger rows can reinstall an obsolete body. The locked recheck prevents concurrent stale-runner replay, not repair of a damaged ledger.

```sh
pnpm exec nx run api_v2:build
pnpm exec nx run api_v2:typecheck
pnpm exec nx run api_v2:test
DB_HOST=localhost pnpm exec nx run api_v2:e2e
```

Unit/integration tests run against PostgreSQL (`DB_HOST` etc., defaulting to `localhost:5432` as `postgres`/`postgres`): the global setup migrates one template database per run and each test clones it, dropping it afterwards. There is no skip; with no database the run fails and says so. CI's Test job provides a `postgres` service. PostgreSQL e2e creates and drops uniquely named scratch databases and exercises the compiled Node process, migrations, cookie sessions, session expiry/revocation, origin protection, audit identity, pool recovery and shutdown. Test sessions are created through the real BetterAuth internal adapter in test code; no production login bypass exists. The e2e suite skips when `DB_HOST` is unset. OAuth provider admission and the sign-in handshake are tested without live Google credentials; deployment still requires a real Google sign-in and TLS smoke check.

`openapi.json` is a file snapshot of the document the running app generates from its route schemas (`src/routes/contracts.ts`), so `src/openapi.test.ts` fails when the two differ. It is served at `/docs/openapi.json`, with a browsable reference at `/docs`. Update it from this directory with `pnpm exec vitest run src/openapi.test.ts -u`.

The diagram under "Database" is the same kind of snapshot, of the tables the migrations create, so `src/erd.test.ts` fails when a migration changes a table without it. Refresh it from this directory with `pnpm exec vitest run src/erd.test.ts -u`.
