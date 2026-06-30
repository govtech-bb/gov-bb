# @govtech-bb/form-builder-api

The backend for the [form builder](../form_builder) app. A small Express 5
service handling recipe CRUD, validation, hydration, publishing, editing
presence, and AI-assisted conversion of uploaded PDFs/documents into recipes.

It is deliberately lightweight — direct REST routing, no NestJS — and is a
companion to the `form_builder` frontend rather than a public API.

## Stack

Express 5 + TypeScript · AWS SDK (S3 for uploads, **Textract** for PDF text
extraction) · TypeORM (shared `@govtech-bb/database`) · `@govtech-bb/ai-bedrock`
(Claude on Bedrock) · `@govtech-bb/git-publish` (publish recipes to GitHub) ·
`@govtech-bb/form-builder` + `@govtech-bb/form-types` (recipe domain) · Zod.

## Routes (`src/routes/`)

- **Recipes** — list/published, config, validate, rekey, enable/disable/delete,
  uniqueness checks
- **Publish** — `git-publish`-backed deploy to GitHub
- **Presence** — editing-claim locking so two authors don't clobber a draft
- **AI** — upload (Textract → recipe), edit, content generation
- **MDA contacts** and **registry** lookups

## Running

```bash
pnpm exec nx dev form_builder_api   # from repo root (tsx watch)
# or
cd apps/form_builder_api && pnpm dev
```

Copy [`.env.example`](./.env.example) to `.env`. Key variables:

- `PORT` — defaults to `3003`
- `CORS_ORIGIN` — comma-separated allowed origins (defaults to `*`)
- `ADMIN_API_TOKEN` — required in production to lock down `/builder/*`; in dev,
  requests pass through when unset
- `API_BASE_URL` — upstream apps/api base URL, proxied for the builder's "Open"
  modal (defaults to the sandbox API when unset)
- `DB_*` — Postgres connection, shared with apps/api
- `AI_MODEL` / `BEDROCK_REGION` — Bedrock model + region for AI conversion

## Tests

```bash
pnpm exec nx test form_builder_api   # Vitest 4 + supertest
```

## Build

```bash
pnpm build   # tsc + tsc-alias → dist/, run with `node dist/main.js`
```
