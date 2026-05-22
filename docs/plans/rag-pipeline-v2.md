# RAG pipeline v2 — content ingestion overhaul

Status: **draft, awaiting approval before edits**.

Replaces the in-app, frontmatter-driven RAG layer with a two-table schema,
deterministic chunker, and offline ingest CLI. Forms integration is deferred
to a follow-up plan; this doc covers content (MDA + service) only.

---

## Why

The current `apps/chat/src/lib/rag/` pipeline has structural problems we've
hit in practice:

- **Source coupling.** `content.ts` reads landing MDs via relative
  filesystem paths (`../../../../apps/landing/src/content/...`). Brittle to
  repo moves, blocks deploying chat without landing tree present.
- **Card-text flattening is lossy.** `buildCardText` concatenates
  frontmatter fields into one blob. Embeddings under-weight question
  phrasing ("who is the minister of X?") versus structured fact lines
  ("Minister: X"). Confirmed in retrieval testing — the MIST card doc
  failed to rank in top-8 for "minister at MIST".
- **Chunking is dumb.** Paragraph-split + char overlap with no
  awareness of what kind of fact a chunk carries.
- **No validation gate.** Bad frontmatter silently produces empty or
  weird docs. No CI check, no preview of what gets indexed.
- **Hash-diff sync runs in the app.** Ingest happens on first request
  to `/api/sync`; the app boots responsible for content. Confuses
  dev-vs-prod boundaries and makes "what's currently indexed?" hard to
  reason about.
- **Single flat table.** All chunks live in `rag_documents`. Renames
  touch every chunk row. Deduping by source document at retrieve time
  is app-side glue. No clean place for non-MD sources (forms, FAQs,
  scraped pages) to land.

## Mental model

Content sources project into a single search index. Chat queries the index
and treats results uniformly regardless of where they came from.

```
landing/src/content/*.md ── chunker ── embedder ── pgvector ── chat retrieve
                                                       ▲
                                                       │
                                       (future) apps/api forms ─┘
```

## Schema

Two tables. One row per content entity in `documents`; N rows per entity
in `chunks`. Drizzle-managed.

```ts
documents {
  id              text PK            // "ministry-mist"
  kind            text NOT NULL      // ministry | department | state-body | service | (form, later)
  slug            text NOT NULL
  title           text NOT NULL
  url             text NOT NULL      // canonical alpha.gov.bb URL
  source_url      text               // legacy gov.bb if any
  metadata        jsonb NOT NULL     // status, keywords, category, etc.
  payload_hash    text NOT NULL      // hash of everything not embedded
  embedding_model text NOT NULL      // model used for this doc's chunks
  created_at, updated_at
}

chunks {
  id           text PK              // "ministry-mist:minister:0"
  document_id  text NOT NULL REFERENCES documents(id) ON DELETE CASCADE
  kind         text NOT NULL        // name | minister | head | contact | body | intent | section
  chunk_index  int NOT NULL
  text         text NOT NULL        // the embed input
  payload      jsonb                // chunk-specific facts (answer, phone, etc)
  embed_hash   text NOT NULL
  embedding    vector(1024) NOT NULL
  created_at, updated_at
}

INDEX hnsw ON chunks (embedding vector_cosine_ops) WITH (m=16, ef_construction=64)
INDEX ON chunks (document_id)
INDEX ON documents (kind)
```

`embedding_model` per-document lets us migrate models incrementally
(re-embed in batches, dual-index during cutover) rather than table-drop.

## Chunk kinds (the part that actually moves retrieval quality)

The chunker is the pipeline's centre of gravity. Each kind has a dedicated
embed-text template and payload shape, designed so the embedded text matches
the *question phrasing* end users actually type.

### Ministry / Department / State-Body

| Chunk kind | Embed text template | Payload |
|---|---|---|
| `name` | `"{title}. Also known as: {keywords joined}. {shortDescription}"` | `{aliases}` |
| `minister` / `head` | `"Who is the minister of {title}? {role}: {name}"` | `{name, role}` |
| `contact` (per item) | `"{label} for {title}: {value}"` (e.g. `"Phone number for MIST: (246) 535-1200"`) | `{type, label, value}` |
| `body` | prose, paragraph-split when >2000 chars | — |

The contact-per-channel split is critical: today a single "Contact:" block
concatenates phone + email + address, which dilutes the embedding for any
one channel-specific query.

### Service

| Chunk kind | Embed text template | Payload |
|---|---|---|
| `intent` | `"How do I {title}? {description}"` | `{description}` |
| `section` (per `##` heading) | `"{title} — {heading}\n{section text}"` | `{heading}` |
| `body` | fallback for un-headinged prose | — |

### Forms (deferred)

Form ingestion lands in a separate plan. Schema reserves `kind='form'` and
`metadata.formId`. Chat's form-CTA logic stays unchanged for now — wired
off frontmatter `onlineServices[].formId` until the forms plan lands.

## Ingest CLI

Lives in `apps/chat/src/ingest/`. Invoked as `pnpm ingest`.

```
1. loadContent()                  → typed entity[] from landing MDs
2. plan = diff(planned, existing)
     per-doc:   payload_hash compare
     per-chunk: embed_hash compare
     classify:  new / re-embed / meta-only / unchanged / orphan
3. if --dry-run: print plan, exit 0
4. embed only new + re-embed chunks (Bedrock, batched)
5. upsert docs, upsert chunks, delete orphan docs (CASCADE removes chunks)
6. write ingest_runs row for audit
```

### Idempotency

Structural, not bolted on:

- **Stable IDs.** `{kind}-{slug}:{chunk-kind}:{index}`. Deterministic from
  content. Renames produce new IDs; old IDs become orphans and CASCADE
  delete cleanly.
- **embed_hash** = sha256 of the text fed to the embedder. Skip Bedrock
  call when unchanged.
- **payload_hash** on documents covers everything *not* embedded. Lets
  metadata refresh without re-embedding.
- **Model switch.** CLI refuses to run when `embedding_model` env differs
  from any existing row unless `--reset-embeddings` is passed.

### Modes

```
pnpm ingest               # full reconcile
pnpm ingest --dry-run     # print plan, no writes
pnpm ingest --report      # coverage stats (docs by kind, stale chunks)
pnpm ingest --reset-embeddings   # required on embedding model swap
```

## Retrieve

Single SQL query. Returns top chunk per document.

```sql
WITH ranked AS (
  SELECT d.id, d.kind, d.title, d.url, d.metadata,
         c.text, c.payload, c.kind AS chunk_kind,
         1 - (c.embedding <=> $1) AS sim,
         ROW_NUMBER() OVER (
           PARTITION BY d.id
           ORDER BY 1 - (c.embedding <=> $1) DESC
         ) AS rank
  FROM chunks c
  JOIN documents d ON c.document_id = d.id
  WHERE d.metadata->>'status' IS DISTINCT FROM 'draft'
)
SELECT * FROM ranked
WHERE rank = 1 AND sim > 0.3
ORDER BY sim DESC
LIMIT 8;
```

Returns mixed-kind chunks ranked by cosine. Chat doesn't care which kind a
result is; it composes the response from `c.text` and reads
`d.kind`/`c.payload` only to drive tool selection (e.g. enable
`openFormReviewDef` later, when forms land).

## Triggers

- **Content** → GitHub Action on merge to `main` runs `pnpm ingest`.
  Cold ~30 s, diff steady-state ~5 s.
- **Local dev** → `pnpm ingest` manually after editing MDs.
- **Forms** → deferred.

## Observability

- `pnpm ingest --dry-run` — plan output, no writes
- `pnpm ingest --report` — coverage report (docs by kind, oldest embedding)
- `ingest_runs` table — every run logged with plan summary, duration, cost
- `/api/documents` (existing route, adapted) — inspect any indexed chunk
- `/api/health` (existing) — counts, dim, model id

## What gets deleted

| File / field | Fate |
|---|---|
| `apps/chat/src/lib/rag/content.ts` | → `packages/content/` (loader + Zod) + `apps/chat/src/ingest/chunker.ts` |
| `apps/chat/src/lib/rag/auto-ingest.ts` | Deleted |
| `apps/chat/src/lib/rag/ingest.ts` | → `apps/chat/src/ingest/write.ts` |
| `apps/chat/src/routes/api.sync.ts` | Deleted (or kept as a protected webhook trigger) |
| `apps/chat/src/routes/api.ingest.ts` | Deleted |
| `rag_documents` table | Dropped after cutover |

What stays: `embed.ts` (chat embeds queries at request time),
`retrieve.ts` (slimmed, points at new tables), `db/*`, `api.retrieve.ts`,
`api.documents.ts`, `api.chat.ts`, `api.health.ts`.

## New packages / dirs

```
packages/content/                           # NEW
  src/
    schemas.ts          Zod schemas for MDA + service frontmatter
    load.ts             walks landing MDs, validates, returns typed entities
    types.ts            exported types
  package.json

apps/chat/src/ingest/                       # NEW
  cli.ts                entry point (pnpm ingest)
  plan.ts               diff logic
  chunker.ts            per-kind chunk emitters
  write.ts              embed + upsert
  chunker.spec.ts       unit tests asserting retrieval-relevant invariants

apps/chat/src/lib/db/migrations/0001_*.sql  # NEW: documents + chunks tables
```

## Migration plan

Each step independently testable. Existing chat keeps working until step 6.

1. **Drizzle migration**: add `documents` + `chunks` tables alongside the
   current `rag_documents`. Old table stays.
2. **Stand up `packages/content`**: extract loader + Zod schemas from
   current `landing/src/lib/frontmatter.ts` and `content/mda.ts`. Landing
   imports the new package; chat does not yet.
3. **Write chunker + ingest CLI** in `apps/chat/src/ingest/`. Smoke test
   against local pgvector. Write `chunker.spec.ts` asserting:
   - "Who is the minister of MIST?" retrieves the `minister` chunk for MIST
     entity at sim ≥ 0.7 (Bedrock) / ≥ 0.5 (local MiniLM)
   - "BRA phone number" retrieves the `contact` chunk for BRA at sim ≥ 0.6
   - "how do I get a passport" retrieves the `intent` chunk for the
     passport service at sim ≥ 0.6
4. **Point `retrieve.ts` at the new tables** behind a `RAG_V2=1` env flag.
   A/B against the current pipeline using the same query set.
5. **Cutover.** Drop `RAG_V2` flag; delete `rag_documents` table and the
   deprecated files.
6. **CI cron**. Wire the GitHub Action to run `pnpm ingest` on landing
   merges to main.

## Acceptance criteria

- [ ] `pnpm ingest --dry-run` on a clean DB plans 500-600 chunks across the
      five entity kinds, with non-zero counts for every kind.
- [ ] Second run with no content changes plans 0 inserts / 0 re-embeds.
- [ ] Editing one MDA's minister field plans exactly 1 chunk re-embed and
      1 doc metadata update on the next run.
- [ ] Deleting an MDA file produces 1 orphan document + N orphan chunks in
      the plan; running the ingest removes them.
- [ ] All four original retrieval acceptance queries pass with score ≥ 0.5
      under Bedrock Titan v2 on the new schema:
      - "who is the minister of finance"
      - "BRA phone number"
      - "who is the minister at MIST"
      - "what services does MIST run"
- [ ] `chunker.spec.ts` passes in CI.
- [ ] `pnpm ingest --report` outputs coverage by kind and a list of any
      docs with zero chunks (sanity gate).

## Tradeoffs and risks

| Risk | Mitigation |
|---|---|
| Two-table join cost on retrieve | Negligible at this scale; both indexes hot |
| Chunker quality regression on a kind we miss | Unit tests pinned to the original acceptance queries; CI gate |
| Embedding model migration mid-cutover | `embedding_model` column lets us dual-index, then switch retrieve |
| Cost of accidental full reingest | CLI requires `--reset-embeddings` flag for any operation that would re-embed unchanged chunks |
| `packages/content` becomes a bottleneck owned by neither team | Owned by whoever touches landing content; chat consumes it read-only |

## Out of scope (for this plan)

- **Forms ingestion** — separate plan. Reserves `kind='form'` and
  `metadata.formId` in the schema but does not populate them. Frontmatter
  `forms:` / `onlineServices:` fields stay as-is until that plan lands.
- **Webhook trigger from apps/api** — cron / manual for v1.
- **Admin UI** — `pnpm db:studio` + `/api/documents` is the inspection
  surface.
- **Reranker** — only if eval results say so after Bedrock Titan v2.
- **FAQs in frontmatter** — chunker manufactures question-phrased text
  from existing fields; no editorial overhead added.

## Rollback

All work lands on `feat/rag-pipeline-v2`. If abandoned mid-migration:

- Steps 1-4 add new code alongside the old; revert PR cleanly drops them.
- Step 5 (table drop) is the only destructive step; only run after a clean
  A/B in step 4 and a DB snapshot.
- `rag_documents` data is reproducible from landing content + an ingest
  run, so even a botched cutover is recoverable in minutes.

## Effort estimate

| Stage | Effort |
|---|---|
| Schema + drizzle migration | 1 hr |
| `packages/content` extraction | 2 hr |
| Chunker + ingest CLI | 3 hr |
| Chunker unit tests | 1 hr |
| Retrieve.ts adapt + A/B flag | 1 hr |
| Cutover + cleanup | 1 hr |
| CI wiring | 1 hr |
| **Total** | **~10 hr** |

## Decision points before starting

1. Confirm two-table schema. Alternative: single table with
   `entity_id`/`entity_kind` columns. Recommendation: two tables — cleaner
   semantics, free cascade, easier renames.
2. Confirm `packages/content` location. Alternative: keep loader in
   `apps/landing/src/lib/` and have chat import directly. Recommendation:
   shared package — prevents chat-vs-landing drift on schema.
3. Confirm chunker kinds enumerated above. Add/remove before we start.
4. Confirm Titan v2 as the embedding model for v2. Alternative: Cohere
   embed-english-v3 (better recall, more cost).
