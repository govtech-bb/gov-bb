# @govtech-bb/chat — "Ask alpha.gov.bb"

A server-rendered conversational assistant that answers questions about
Government of Barbados services and can fill simple forms conversationally.
Every factual answer is grounded in content retrieved from the official site
(**strict RAG**); the language model runs on **AWS Bedrock** (Claude,
`claude-haiku-4-5` by default), with **Postgres + pgvector** behind retrieval.

For the full system design — funnel state machine, retrieval pipeline, form
handoff, feedback flow — see [SPEC.md](./SPEC.md). Before changing code here,
read [CLAUDE.md](./CLAUDE.md): these TanStack libraries move fast, so verify
APIs against installed `.d.ts` files rather than from memory.

## Stack

TanStack Start + TanStack Router (SSR) · TanStack AI (streaming + tool calls) ·
AWS Bedrock (`@govtech-bb/ai-bedrock`) · Postgres + pgvector via Drizzle ORM ·
react-markdown + remark-gfm.

## Running

```bash
pnpm dev        # vite dev on port 3000
```

Needs a Postgres (pgvector) instance and AWS credentials. Local `.env`:

```env
RAG_URL=http://localhost:3000/api
DATABASE_URL=postgres://...        # pgvector-enabled
AWS_PROFILE=...                    # credentials via the AWS SDK default chain
AWS_REGION=ca-central-1
```

Bedrock requires `bedrock:InvokeModel` and
`bedrock:InvokeModelWithResponseStream` on the inference-profile ARN for the
chosen model. The adapter falls back to non-streaming `Converse` if streaming
is denied, so streaming permission is recommended but not required.

## Database & content ingestion

```bash
pnpm db:generate    # drizzle-kit: generate a migration from schema changes
pnpm db:migrate     # apply migrations
pnpm db:studio      # drizzle studio
pnpm db:reset       # drop + recreate (destructive)
pnpm ingest         # crawl/chunk/embed official content into pgvector
```

> After chunker changes, re-ingest: the chunker appends `chunkIndex` to each
> chunk's slug, so old rows won't dedupe against new ones. Run
> `pnpm db:reset && pnpm ingest` to rebuild.

## Evaluation

```bash
pnpm eval:sweep       # retrieval sweep over the eval set
pnpm eval:responses   # end-to-end response eval
```

## Tests

```bash
pnpm test   # Node test runner via tsx (src/**/*.test.ts)
```

## Deployment

Deployed as SSR on **AWS Amplify Compute** (not Docker in prod). Env vars are
read from `process.env` at request time — set them in Amplify Console → App
settings → Environment variables (no build-time baking):

- **Required:** `RAG_URL` (usually `https://<chat-domain>/api`), `DATABASE_URL`
  (pgvector RDS), `FORM_API_URL` (forms submission API base)
- **Optional (defaulted):** `BEDROCK_REGION` (→ `AWS_REGION`, else
  `ca-central-1`), `LLM_MODEL` (`claude-haiku-4-5`), `REWRITE_MODEL`
  (`claude-haiku-4-5`)
