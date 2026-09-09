# @govtech-bb/form-builder-api

The backend for the [form builder](../form_builder) app. A small Express 5
service handling recipe CRUD, validation, hydration, publishing, editing
presence, and streamed AI assistance for form and content drafts.

It is deliberately lightweight — direct REST routing, no NestJS — and is a
companion to the `form_builder` frontend rather than a public API.

## Stack

Express 5 + TypeScript · AWS SDK (S3 for uploads, **Textract** for PDF/image text
extraction) · TypeORM (shared `@govtech-bb/database`) · `@tanstack/ai` + `@tanstack/ai-bedrock`
(Claude on Bedrock) · `@govtech-bb/git-publish` (publish recipes to GitHub) ·
`@govtech-bb/form-builder` + `@govtech-bb/form-types` (recipe domain) · Zod.

## Routes (`src/routes/`)

- **Recipes** — list/published, config, validate, rekey, enable/disable/delete,
  uniqueness checks
- **Publish** — `git-publish`-backed deploy to GitHub
- **Presence** — editing-claim locking so two authors don't clobber a draft
- **AI** — short-lived access tokens, direct SSE chat with approved client tools,
  and signed document upload/extraction references. Legacy generation routes
  return 410 so stale tabs ask the author to refresh.
- **MDA contacts** and **registry** lookups

## Running

```bash
pnpm exec nx dev form-builder-api   # from repo root (tsx watch)
# or
cd apps/form_builder_api && pnpm dev
```

Copy [`.env.example`](./.env.example) to `.env`. Key variables:

- `PORT` — defaults to `3003`
- `CORS_ORIGIN` — comma-separated exact editor origins; required for AI in production
- `ADMIN_API_TOKEN` — required in production to lock down `/builder/*`; in dev,
  requests pass through when unset
- `API_BASE_URL` — upstream apps/api base URL, proxied for the builder's "Open"
  modal (defaults to the sandbox API when unset)
- `DB_*` — Postgres connection, shared with apps/api
- `AI_MODEL` / `BEDROCK_REGION` — Bedrock model/inference profile + region
- `S3_BUCKET` / `S3_REGION` — document uploads bucket + region; its CORS policy
  must permit POST from the editor origin. The API role needs S3 read access,
  Textract document analysis, and Bedrock streaming invocation permissions.

## Tests

```bash
pnpm exec nx test form-builder-api   # Vitest 4 + supertest
```

## Build

```bash
pnpm build   # tsc + tsc-alias → dist/, run with `node dist/main.js`
```

## Streaming and documents

`POST /builder/ai/access` uses admin authentication and is called only by the
editor's authenticated server function. `/builder/ai/chat` and
`/builder/ai/documents/{presign,start,status}` require a short-lived,
origin-bound bearer token. Documents are additionally scoped to their owner.

Chat uses the official TanStack Bedrock Converse adapter with the AWS
credential chain. A small pnpm patch forwards AbortSignal to its AWS SDK calls;
remove the patch when upstream includes that fix. Streams send 15-second
heartbeats, stop after 180 seconds, and cancel on disconnect. Configure the
load balancer/proxy to pass SSE without buffering. Limits are per process:
20 chat requests per minute and two active requests per user.

PDFs are limited to 20 MB, PNG/JPEG to 10 MB. S3 policies enforce upload size
and type; the API checks object metadata and file signatures before Textract.
Extraction retries reuse the same signed job reference. Stop cancels polling
and model generation; Textract jobs may finish remotely.

Run `pnpm test` for the mocked AWS integration checks, including a real
TanStack approval round trip and a stream lasting beyond Amplify's 28-second
SSR ceiling. Tests do not invoke a paid model.
