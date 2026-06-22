# `apps/chat` — System Specification

`apps/chat` is **"Ask alpha.gov.bb"**: a server-rendered conversational assistant that answers
questions about Government of Barbados services and can fill simple government forms
conversationally. Every factual answer is grounded in retrieved content from the official site
(strict RAG), and the language model runs on **AWS Bedrock** (Claude, `claude-haiku-4-5` by
default). The store behind retrieval is **Postgres + pgvector**.

This document describes the system as it is built — its layers, the lifecycle of a single chat
turn, the retrieval and form-filling subsystems, the data model, how it is operated, and how it is
deployed. It is derived from the codebase's knowledge graph and is organised around the system's
actual architecture rather than a feature checklist.

---

## 1. Architecture

The application is a single TanStack Start (React SSR) app. Source decomposes into ten cohesive
layers; the request path runs top-to-bottom on each turn, while the data path is fed offline by the
ingestion pipeline.

| Layer | Responsibility | Key modules |
|---|---|---|
| **Presentation** | SSR chat UI: bootstrap, root document, chat page, message rendering, client persistence | `src/router.tsx`, `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/components/chat/bubble.tsx`, `src/components/trident-avatar.tsx`, `src/lib/chat/persistence.ts`, `src/styles.css` |
| **API** | TanStack server route modules — HTTP endpoints for chat, retrieval, diagnostics, health | `src/routes/api.chat.ts`, `api.retrieve.ts`, `api.documents.ts`, `api.health.ts`, `api.health.public.ts`, `src/lib/http.ts` |
| **Chat Domain** | The turn pipeline (orchestration, prompts, query rewrite, cited-context assembly, telemetry) and the conversational form flow | `src/lib/chat/*`, `src/lib/chat/form/*`, `src/lib/chat-tools.ts` |
| **RAG Retrieval** | Bedrock embeddings + pgvector similarity search | `src/lib/rag/embed.ts`, `src/lib/rag/retrieve.ts` |
| **Data** | Drizzle schema, lazy pgvector client, migrations | `src/lib/db/index.ts`, `schema.ts`, `migrate.ts`, `reset.ts`, `migrations/*` |
| **Ingestion Pipeline** | Offline job that chunks content, diffs it, and embeds-then-upserts into pgvector | `src/ingest/chunker.ts`, `plan.ts`, `write.ts`, `cli.ts` |
| **Shared Utilities** | Validated env, AWS Secrets access, abort/timeout helpers, health check, `cn()` | `src/config/env.ts`, `src/lib/secrets.ts`, `abort.ts`, `health.ts`, `utils.ts` |
| **Infrastructure & Build** | Container images, Vite/Drizzle/TS/Nx config, env scaffolding | `Dockerfile`, `Dockerfile.ingest`, `vite.config.ts`, `drizzle.config.ts`, `tsconfig.json`, `package.json`, `project.json`, `.env.example` |
| **Documentation** | README, this spec, agent conventions, robots | `README.md`, `SPEC.md`, `AGENTS.md`, `public/robots.txt` |
| **Evaluation** | Offline quality harnesses (LLM-judged responses, RAG parameter sweep) | `eval/responses/run.ts`, `eval/sweep.ts`, `eval/responses/cases.json` |

**Foundational dependencies.** Three modules are imported almost everywhere: `src/lib/db/index.ts`
(the single most-depended-on file — the pgvector client), `src/config/env.ts` (validated config),
and `src/lib/chat/types.ts` (the shared citation/source/context shapes). The orchestrator
`src/lib/chat/run-turn.ts` has the highest fan-out: it pulls in the form flow, prompts, rewrite,
retrieval, and telemetry.

### 1.1 Data flow

Two paths feed the system. The **request path** is per-turn and online; the **ingest path** is
offline and fills the store the request path reads from.

```
REQUEST PATH (per chat turn)
  Browser ─ index.tsx (useChat) ── POST /api/chat (SSE) ──▶ api.chat.ts
                                                              │
                                                  run-turn.ts │ (per-thread lock)
                                                              ▼
        jailbreak guard ▶ form resolve ▶ query rewrite ▶ retrieve ▶ cited context
                          (detect/defs/    (rewrite.ts)  (retrieval.ts)  (buildCitedContext)
                           schema/session)                    │
                                                              ▼
                                            ${RAG_URL}/retrieve ─▶ api.retrieve.ts ─▶ rag/retrieve.ts
                                                                                       │
                                                              embed (Bedrock Titan) + pgvector(chunks)
                                                              ▼
        system prompts + tools(set_field/present_choices/submit_form) ─▶ Bedrock chat ─▶ withTurnLog
                                                              │
  Browser ◀── bubble.tsx (markdown + citation badges + choices/approval) ◀── SSE tokens + citations event

INGEST PATH (offline, `pnpm ingest`)
  @govtech-bb/content ─▶ chunker.ts ─▶ plan.ts (diff vs rows) ─▶ write.ts ─▶ documents + chunks (pgvector)
                         (intent +      new/changed/            (embed +      └─ run recorded in ingest_runs
                          section        unchanged/orphan        upsert)
                          chunks)                                     ▲ cli.ts orchestrates + preflight checks
```

### 1.2 Dependencies & boundaries

The app owns the chat domain, the RAG plumbing, and the data/ingest layers; it leans on workspace
packages and a few external libraries for everything else.

| Dependency | Role | Consumed by |
|---|---|---|
| `@tanstack/react-start`, `@tanstack/react-router` | SSR framework + file-based routing | bootstrap, all routes |
| `@tanstack/ai` (+ `ai-react`) | Chat/streaming/tool-call abstraction — the spine of the chat domain | `run-turn`, `chat-tools`, `messages`, `turn-log`, `bubble`, `index`, `api.chat` |
| `@govtech-bb/ai-bedrock` | Bedrock chat adapter + model-alias resolution | `run-turn.ts`, `rewrite.ts` |
| `@aws-sdk/client-bedrock-runtime` | Titan embeddings (and Bedrock runtime) | `rag/embed.ts` |
| `@aws-sdk/client-secrets-manager` | DB credentials at runtime | `secrets.ts` → `db/index.ts` |
| `drizzle-orm` + `pg` (pgvector) | Data layer: schema, client, migrations | `db/*` |
| `@govtech-bb/content` | The source corpus the ingest reads | `ingest/chunker.ts`, `ingest/cli.ts` |
| `@govtech-bb/form-types` | `ServiceContract` and field type definitions | `form/defs.ts`, `form/schema.ts`, `form/values.ts` |
| `@govtech-bb/form-conditions` | Conditional active-field evaluation | `form/schema.ts` |
| `@govtech-bb/react` + `@govtech-bb/design` | Shared UI components + brand tokens | `index.tsx`, `styles.css` (`@import`) |
| `zod` | Runtime validation (env, tool inputs, `/api/retrieve` body) | `config/env.ts`, `chat-tools.ts`, `api.retrieve.ts` |
| `react-markdown` + `remark-gfm` | Assistant markdown rendering | `bubble.tsx` |

The upstream **forms API** (`FORM_API_URL`) is an external service, not a package: the form flow
fetches definitions and submits to it. Browser-handoff links are derived from the retrieved source's
own URL (`<source url>/start`, see `handoff.ts`), not from a separately configured forms frontend.

---

## 2. Lifecycle of a chat turn

A turn begins when the chat page POSTs to `/api/chat` and ends when the server-sent-events stream
closes. `runTurn` serialises execution **per thread** behind an async lock so `set_field` writes and
`session.status` transitions for the same conversation never interleave. Inside the lock,
`runTurnInner` performs the following sequence:

1. **Jailbreak guard.** The latest user message is matched against a small synchronous deny-list
   ("ignore previous instructions", "you are now DAN", system-prompt-dump attempts). A hit returns a
   `blocked` result (HTTP 400) with a redirect-to-scope message, before any model or DB call.
2. **Form resolution.** The per-thread session is loaded. If no form is pinned (or the previous one
   was submitted), the assistant tries to match a government form from the rolling window of recent
   user text, then from the latest message only. The active form resolves to one of three states —
   `collect`, `handoff`, or `none` (see §4).
3. **Retrieval decision.** Retrieval and the rewrite LLM call are **skipped** when the user is
   actively collecting form fields (a form is matched *and* at least one value is already captured)
   or the message is a greeting / shorter than two characters. Otherwise the conversation is folded
   into a standalone query (§3) and the RAG service is queried.
4. **Cited context assembly.** Retrieved chunks are reranked, thresholded, deduplicated, and
   formatted into a numbered context block with text-fragment deep links; the matching citations are
   collected to send back to the UI (§3).
5. **System prompt assembly.** The static base prompt is combined with the per-turn context block
   and, depending on the form state, a schema disclosure (collect), a handoff disclosure (handoff),
   or a no-form disclosure (none). Already-collected field values and any submission outcome are
   appended so the model never re-asks answered fields.
6. **Tool wiring.** When the state is `collect`, the per-turn LLM tools (`set_field`,
   `present_choices`, `submit_form`) are bound to the active session and schema. Otherwise no tools
   are exposed.
7. **Bedrock stream.** `@govtech-bb/ai-bedrock` runs the chat against the configured model
   (`maxTokens: 600`, `temperature: 0`), optionally using a Bedrock prompt cache point for the
   static system prompt. A child `AbortController` ties the model call to the request so a client
   disconnect cancels generation.
8. **Telemetry wrapper.** The stream is wrapped by `withTurnLog`, an async generator that proxies
   every chunk while accumulating duration, token usage, finish reason, and cancellation, then emits
   a structured `TurnRecord` when the stream settles.

The route then streams the model output as SSE and emits a custom **`citations`** event (keyed by
the assistant message id, sent once the id is known) that the client uses to render source pills.

---

## 3. Retrieval-augmented generation

Answers are grounded strictly in retrieved content. The chat pipeline talks to a RAG service over
HTTP (`${RAG_URL}/retrieve`) rather than calling the database directly — the same `/api/retrieve`
endpoint this app exposes — so the retriever can be deployed separately from the chat handler.

**Query rewriting.** `rewrite.ts` asks Bedrock to fold the conversation history into a single
self-contained query, so a follow-up such as *"how much does it cost?"* becomes a standalone search
phrase instead of dragging the prior topic along by accident.

**Retrieval call.** `retrieve()` POSTs `{ query, topK, boostSlug }` to the RAG service under a
**4-second** timeout (`AbortSignal.any` of the request signal and a timeout signal). An abort
returns an empty result treated as success (the turn continues with no context); any other failure
is reported as **degraded** and logged.

**Vector search (`src/lib/rag/retrieve.ts`).** Embeds the query with Bedrock Titan embeddings, runs
a pgvector cosine-similarity search over the `chunks` table (HNSW index), optionally pins/boosts a
service slug, reranks by per-document-kind weight, and formats friendly citations.

**Cited context (`buildCitedContext`).** Walks reranked results, drops anything below the score
cutoff, deduplicates by `url + section`, and builds a numbered block (`[1] Title: Section …`). Each
source URL is rewritten as a **text-fragment deep link** (`#:~:text=…`) using a cleaned quotable
sentence from the chunk, so the linked page scrolls to and highlights the cited text. The block is
capped at a character ceiling; the matching `Citation[]` is returned for the UI.

**Tuning constants (`src/lib/chat/rag-config.ts`, last tuned 2026-06-08 via `eval/sweep.ts`):**

| Constant | Value | Meaning |
|---|---|---|
| `SIMILARITY_THRESHOLD` | `0.25` | Minimum raw cosine similarity for the SQL probe |
| `SCORE_THRESHOLD` | `0.45` | Minimum weighted score (similarity × kind weight) for the chat-side cutoff after reranking |
| `TOP_K` | `10` | Reranked chunks considered before the cutoff |
| `MAX_SOURCES` | `6` | Cap on chunks/citations delivered to the LLM per turn |
| `MAX_CONTEXT_CHARS` | `6000` | Hard ceiling on context-block size |
| `DOC_KIND_WEIGHTS` | `service 1.0`, `form 1.0`, `news 0.7` | Per-kind rerank weight |

The score threshold was raised from `0.30` to `0.45` after adding out-of-corpus cases to the golden
set: it rejects most queries the corpus can't answer (tax, firearm, company registration) without
the recall loss that `0.50` begins to cause. A threshold is not a complete relevance gate — a few
high-similarity false matches (passport↔certificates, driver's licence↔conductor licence) still
leak and are tracked as a content/coverage problem rather than a tuning one.

---

## 4. Conversational form filling

Beyond answering questions, the assistant can collect and submit a government form within the chat.
The form flow lives under `src/lib/chat/form/*` and is orchestrated by `run-turn.ts`. Each turn the
active form resolves to one of three states (`resolveActiveForm`):

- **`none`** — no form is in play. The model answers from retrieved context only; no form tools are
  exposed; a no-form disclosure forbids implying an online submission exists.
- **`collect`** — a fillable form is active. The model is given the form's **active field schema**
  and the per-turn tools, and walks the user through the fields.
- **`handoff`** — the form exists but cannot be safely filled in chat. The assistant hands the user
  a link to the form's start page (`<source url>/start`, from the retrieved source) instead of collecting.

**Form matching.** `detect.ts` tokenises the user's text and scores it against an indexed catalogue
of form titles fetched and cached from the upstream forms API (`defs.ts`). Matching runs over a
rolling window of recent text, with a guard so a just-handed-off form is not re-offered turn after
turn while a genuine topic switch still activates a new form.

**Active-field resolution (`schema.ts`).** The form's `ServiceContract` is fetched, then
`@govtech-bb/form-conditions` evaluates conditional logic to compute exactly which fields are
currently active. The collectable subset excludes `file` and `show-hide` types, hidden fields, and
repeatable/field-array behaviours; the remainder is summarised into a compact schema block (field
id, html type, required/optional, option values, label) for the model.

**Handoff rules (`needsHandoff`).** A form is handed off rather than collected when it contains a
file upload, when its public contract reports `requiresPayment === true`, or when its `formId` is on
an explicit allow-list of forms that collect bank/account details (auditable per-ID rather than
matched by field-name patterns). Examples currently on the list include the textbook-grant,
school-uniform-grant, and vendor-registration forms.

**Tools (`src/lib/chat-tools.ts`, bound per turn by `form/tools.ts`):**

| Tool | Purpose | Notes |
|---|---|---|
| `set_field` | Record one field value | `fieldId` must be an exact schema id; dates as `YYYY-MM-DD`; select/radio/checkbox use the option `value`. Multiple calls per turn allowed. |
| `present_choices` | Ask a closed-set question as clickable buttons | For yes/no, certificate type, parent-vs-guardian, etc. — never for open answers. The question text lives only in the tool args; the model ends its turn after calling. |
| `submit_form` | Submit the active form from recorded values | Takes no arguments; reads the session. `needsApproval: true` — the user gets an Approve/Deny prompt in the UI, so the model does not ask for confirmation in chat. |

**Session (`session.ts`).** Per-thread, in-memory, swept on a TTL, guarded by a per-thread async
lock. Holds the active slug, captured values, status (`collecting` → `submitted` / `failed`),
reference number, last error, and the last handed-off slug.

**Validation & submission (`values.ts`, `submit.ts`).** Captured raw values are coerced into typed
form values (dates, enums, checkbox sets) and reshaped per the contract, then submitted to the
upstream forms API. On success the session records the returned **reference number**; on failure,
upstream validation errors are flattened to `{ field, message }` pairs and surfaced so the model can
help the user correct just those fields and retry.

---

## 5. Conversational contract

The following behaviours are enforced through the system prompt and are part of the product
contract (`src/lib/chat/prompts.ts`, with output cleanup in `normalize-markdown.ts`):

- **Voice.** Warm, direct, conversational — no "I'm here to help you with…" intros and no
  capability lists. Greetings get a one-line reply asking what the user needs.
- **Grounding.** Every factual claim (fee, eligibility rule, document name, contact, hours) must
  come from the current turn's retrieved context. If a fact is not present, the assistant says so
  and offers a next-best step rather than inventing one. Prior conversation is used only to
  interpret follow-ups.
- **Pushback resilience.** When challenged ("are you sure?"), the assistant re-grounds in the
  retrieved source rather than retracting a correct, grounded statement; if the contested fact isn't
  in context, it says so plainly and points the user to the relevant office.
- **Formatting.** Markdown with bold section labels, hyphen bullets, and numbered lists for ordered
  steps. Em-dashes and en-dashes are forbidden in output (the context block even uses a colon
  separator so the model isn't primed with the character it must not emit).
- **Disclosures.** A no-form disclosure prevents promising online submission where none exists; a
  handoff disclosure frames the browser hand-off when a form can't be filled inline.

---

## 6. Data model

The RAG store is Postgres with the `pgvector` extension. `src/lib/db/index.ts` lazily constructs a
shared `pg` Pool and Drizzle client; the connection string is resolved at runtime from
`process.env.DATABASE_URL` (CLI/ECS), `CHAT_DATABASE_URL`, or AWS Secrets Manager
(`CHAT_DATABASE_URL_SECRET_ARN`, the SSR Lambda path), with RDS SSL quirks handled internally.
Schema is declared in `src/lib/db/schema.ts` and applied via Drizzle migrations.

| Table | Role |
|---|---|
| `documents` | One row per ingested government entity (service, form, ministry, news). Stores a payload hash and the embedding model used, so change-detection and model-mismatch checks are possible. |
| `chunks` | Embedded text fragments, foreign-keyed to `documents` with cascade delete. Holds a `vector` embedding column with an **HNSW cosine** index (`vector_cosine_ops`) for fast approximate nearest-neighbour search. |
| `ingest_runs` | One row per ingest job for observability — lifecycle status (`running` → `success`/`failed`), a plan summary, and any error message. |
| `rag_documents` | Legacy single-table RAG store, superseded by the `documents`/`chunks` model. |

**Embedding-dimension lockstep.** `embed.ts` exports an `EMBED_DIMS` constant (the Titan embedding
dimensionality); the Drizzle schema imports it to size the `chunks.embedding` vector column.
Changing the embedding model changes one constant and the storage column follows — and a re-ingest
with `--reset-embeddings` is required (§7).

---

## 7. Ingestion pipeline

The `chunks` table is filled by an offline job, `pnpm ingest` (`src/ingest/cli.ts`), which keeps the
vector store in sync with the `@govtech-bb/content` package. In the deployed environment it runs
**automatically** — on every chat-affecting deploy and on a 15-minute cron (see §10.1) — while the
same CLI is used directly for local development and operator-driven runs.

**Pipeline.**
1. **`chunker.ts`** splits each service entity into deterministic, content-addressed chunks: one
   *intent* chunk phrased as the user would ask ("How do I {service}?") plus one *section* chunk per
   `##` heading, each prefixed `"{title} — {section}"`. Every chunk carries stable ids and a
   SHA-256 embed hash.
2. **`plan.ts`** diffs the planned documents/chunks against existing rows, classifying each as
   **new**, **changed**, **unchanged**, or **orphaned** — so only altered content is re-embedded.
3. **`write.ts`** applies the plan: upserts document rows, then embeds-then-upserts chunk rows into
   pgvector, emitting progress callbacks.
4. **`cli.ts`** parses args, runs a preflight model-consistency check, drives the plan, prints
   periodic progress (elapsed + ETA), and records the run in `ingest_runs`.

**CLI modes.** `--dry-run` (plan only, no writes), `--report` (coverage by document/chunk kind),
`--reset-embeddings` (drop and rebuild — required when the embedding model changes),
`--limit=N` / `--content-dir=…` (scoped partial runs). The job is **idempotent** (hashes decide
whether a row needs rewriting) and refuses to run against chunks embedded with a different model
unless `--reset-embeddings` is given. Schema is managed by `pnpm db:migrate` / `db:studio` /
`db:reset`; `pnpm db:reset && pnpm ingest` rebuilds the store from scratch.

---

## 8. HTTP surface

All endpoints are TanStack Start server route modules under `src/routes`. They are thin: they
validate input, delegate to the domain/data layers, and use the shared `jsonError` helper.

| Method & path | Purpose | Failure modes |
|---|---|---|
| `POST /api/chat` | Runs a Bedrock turn via `run-turn.ts`, streams SSE, and emits a custom `citations` event keyed by message id. | `400` invalid body or jailbreak; `500` on misconfiguration/model error. |
| `POST /api/retrieve` | Exposes raw pgvector search (`{ query, topK?, boostSlug? }`) for the chat handler, diagnostics, and the eval sweep. Validated with Zod. | `503` when no database is configured. |
| `GET /api/documents` | Diagnostics: document and chunk counts grouped by kind plus the latest `updated_at`. | `503` when the DB is unconfigured/unreachable. |
| `GET /api/health` | Internal health probe — DB status (`connected`/`disconnected`/`unconfigured`), counts, last-updated. | `503` when configured but unreachable. |
| `GET /api/health/public` | Same status JSON, unauthenticated, for external uptime checks. | as above |

Client disconnects propagate through an `AbortController` (`src/lib/abort.ts`) that cancels both the
LLM stream and the SSE response together.

---

## 9. Front-end

**Bootstrap.** `router.tsx` builds the TanStack Router from the generated route tree; `__root.tsx`
is the layout route defining the HTML document shell, head metadata, global styles, and footer
chrome that wrap every page. File-based routing means modules named `api.*.ts` compile to server
endpoints while the rest are pages.

**Chat page (`src/routes/index.tsx`, `/`).** The only user-facing route and the highest-fan-out
front-end module. It wires TanStack's `useChat` hook to the `/api/chat` SSE endpoint, **virtualizes**
the transcript (TanStack Virtual) so long conversations stay performant, and owns the composer, the
streaming/"thinking" indicator, citation rendering, and the tool-approval flow. A `?q=` deep link
auto-sends an initial question on load. The empty state shows a greeting and four clickable starter
questions; the composer's submit button becomes a **Stop** button mid-stream that aborts generation.

**Message rendering (`bubble.tsx`, `trident-avatar.tsx`).** The bubble runs model markdown through
`normalize-markdown`, maps inline citation markers to numbered `CitationMarker` badges (linking to
alpha.gov.bb with text-fragment deep links), and renders `present_choices` buttons and `submit_form`
Approve/Deny controls driven by the assistant's tool calls. It parses **partial streaming JSON** so
tool-call arguments render before they finish arriving. The trident avatar is the assistant's
Barbados identity, with a subtle animation in the empty state.

**Persistence (`persistence.ts`).** Messages and citations are persisted to `sessionStorage`, with a
stable per-session thread id — a reload restores the in-progress conversation, but it is not stored
server-side.

---

## 10. Runtime configuration & deployment

**Environment (validated by `src/config/env.ts` via Zod, fail-fast):**

| Var | Required | Purpose |
|---|---|---|
| `RAG_URL` | yes | Base URL of the retrieval service (the chat handler calls `${RAG_URL}/retrieve`). |
| `FORM_API_URL` | yes | Upstream forms API (definitions + submission). |
| `BEDROCK_REGION` | no | AWS region for Bedrock; bundle default `ca-central-1` (baked at build time). |
| `LLM_MODEL` | no | Chat model alias (default `claude-haiku-4-5`). |
| `REWRITE_MODEL` | no | Query-rewrite model alias (default `claude-haiku-4-5`). |
| `BEDROCK_PROMPT_CACHE` | no | Opt-in (`1`/`true`) to cache the static system prompt via a Bedrock cache point. |
| `DATABASE_URL` | * | Resolved outside the schema by `db/index.ts` (env, `CHAT_DATABASE_URL`, or a Secrets Manager ARN). |

AWS credentials come from the SDK default chain (`AWS_PROFILE` / env / instance role). Bedrock
access requires `InvokeModel` / `InvokeModelWithResponseStream` on the model's inference-profile ARN.

**Hosting (production).** The SSR app is deployed on **AWS Amplify Hosting Compute** — *not* via the
Dockerfile. The Vite build runs the Nitro `aws_amplify` preset (`vite.config.ts`), producing the
`.amplify-hosting/` artifact: static assets are served directly and all other paths fall back to a
**`server.js` Compute function (the SSR Lambda) on `nodejs24.x`**. Because Amplify Compute does not
pass Console env vars into the SSR Lambda at runtime, selected vars are **baked into the bundle at
build time** via Vite `define` (`RAG_URL`, `FORM_API_URL`, `BEDROCK_REGION` — bundle
default `ca-central-1`, `LLM_MODEL`, `REWRITE_MODEL`, and `CHAT_DATABASE_URL_SECRET_ARN`), which is
why each `process.env.X` in `env.ts` is referenced as a literal. The database connection string is
deliberately **not** baked — only the Secrets Manager ARN is, and `db/index.ts` fetches the actual
credentials from SM at runtime via the compute role.

**Containers (not the production server).** The `Dockerfile` is a **local-development image only**:
it runs `vite dev` under `NODE_ENV=development` on `node:20-alpine` for docker-compose parity with
`apps/landing` and `apps/forms` — its own header notes that production hosting is separate and that
it does no production-build validation. The one container that *does* run in the deployed
environment is **`Dockerfile.ingest`** — a lean, server-less one-shot image that runs migrations
then the ingest CLI as a **Fargate task** against the pgvector RDS. Both images apply pending DB
migrations on boot, share a BuildKit pnpm-store cache mount, and copy per-package `package.json`
files before source so dependency layers cache across builds.

### 10.1 Continuous deployment & automated ingest

Deployment is driven by GitHub Actions (`.github/workflows/deploy-sandbox.yml`) on push to the
`sandbox` branch (plus `workflow_dispatch`). A `setup` job uses **nx-affected** — with the base set
to the *last successful deploy* — to decide which apps changed and exposes a `chat` flag. Because
chat depends on `@govtech-bb/content` as a workspace package, nx marks chat affected both when chat
**code** changes and when **content** changes, so a pure content edit triggers the chat pipeline
with no code change.

When `chat` is affected, two jobs run:

- **`amplify-chat`** — triggers an Amplify `RELEASE` build for the chat app and, on success, smoke-
  tests `https://chat.sandbox.alpha.gov.bb/api/health`, asserting `ok: true`, `db: "connected"`, and
  **`docCount > 0`**. A broken or empty index therefore **fails the deploy** at build time rather
  than surfacing later as empty answers.
- **`deploy-chat-ingest`** — builds `Dockerfile.ingest`, pushes it to ECR
  (`chatbot-ingest-sandbox`), then invokes a **"rag-indexer" Lambda** (its name read from SSM
  `/chatbot/sandbox/rag-indexer-name`) that fires the one-shot Fargate ingest task. This pushes
  content changes into the vector store within seconds of a merge.

**RAG ingest runs automatically by two mechanisms.** (1) The per-deploy instant ingest above, on any
chat-affecting merge; and (2) a **15-minute EventBridge cron** that re-ingests on a schedule
regardless of deploys. The supporting infrastructure — the ECR repo, ECS task definition, the
indexer Lambda, and the cron — lives in the `govtech-bb/alpha-infra` repository
(`SANDBOX-CHATBOT-INGEST.md`), not here; this repo builds the image and triggers the run. Operators
and local development still invoke the same `pnpm ingest` CLI directly (§7).

**Environment scope.** This automated chat pipeline targets the **sandbox** environment only
(`chat.sandbox.alpha.gov.bb`). `deploy-prod.yml` detects chat in its affected set but does **not**
currently deploy the chat app or run its ingest — chat does not yet ship to production through CI.

---

## 11. Resilience & degraded modes

- **Retrieve fails or times out (4 s)** → the turn continues with an empty context block; the model
  truthfully says it lacks the detail. The failure is logged as degraded.
- **Retrieve aborts (client disconnect)** → treated as an empty result, not an error.
- **Database unconfigured/unreachable** → `/api/health`, `/api/documents`, `/api/retrieve` return
  `503`.
- **Jailbreak attempt** → `400` before any model/DB work.
- **Stop pressed mid-stream** → the child `AbortController` cancels the LLM call and the SSE response
  together.
- **Submission failure** → upstream validation errors are flattened and fed back into the prompt so
  the model can guide the user to fix the listed fields and retry, without losing collected values.
- **Concurrent turns on one thread** → serialised by a per-thread lock so field writes and status
  transitions stay coherent.

---

## 12. Observability & evaluation

**Per-turn telemetry (`turn-log.ts`).** Each turn emits a structured `TurnRecord` — timestamp,
thread/run ids, model, user input size, retrieved source ids and scores, active form slug, whether
retrieval degraded, plus duration, token usage, and finish reason captured by wrapping the stream in
an async generator. (Verbose provider-chunk tracing is DEV-only and must never run on the deployed
Lambda — it would log message content to CloudWatch.)

**Response-quality eval (`eval/responses/run.ts`, `pnpm eval:responses`).** Drives categorised chat
cases (`cases.json`) against the **live SSE endpoint**, collects replies/citations/choices, grades
each with a Claude LLM-as-judge, and emits an HTML report.

**Retrieval sweep (`eval/sweep.ts`, `pnpm eval:sweep`).** Caches query embeddings and pgvector rows,
then grid-searches the RAG ranking parameters in `rag-config.ts` against a golden set, scoring
recall / MRR / precision and printing the best configurations. This is the harness that produced the
current threshold values in §3.

---

## 13. Module map

```
apps/chat/
├─ src/
│  ├─ router.tsx                 # TanStack Router bootstrap            (Presentation)
│  ├─ routes/
│  │  ├─ __root.tsx              # HTML shell / layout route            (Presentation)
│  │  ├─ index.tsx               # chat page (/)                        (Presentation)
│  │  └─ api.*.ts                # chat, retrieve, documents, health    (API)
│  ├─ components/                # bubble, trident-avatar               (Presentation)
│  ├─ lib/
│  │  ├─ chat/                   # run-turn, prompts, rewrite,          (Chat Domain)
│  │  │  │                       #   retrieval, rag-config, messages,
│  │  │  │                       #   normalize-markdown, turn-log, types
│  │  │  ├─ form/                # detect, defs, schema, session,       (Chat Domain)
│  │  │  │                       #   tools, submit, values, index
│  │  │  └─ persistence.ts       # sessionStorage transcript            (Presentation)
│  │  ├─ chat-tools.ts           # LLM tool registry                    (Chat Domain)
│  │  ├─ rag/                    # embed (Titan), retrieve (pgvector)   (RAG Retrieval)
│  │  ├─ db/                     # client, schema, migrate, reset, …    (Data)
│  │  ├─ abort.ts secrets.ts     # shared cross-cutting helpers         (Shared Utilities)
│  │  ├─ health.ts http.ts utils.ts
│  └─ config/env.ts             # validated server env                  (Shared Utilities)
│  └─ ingest/                    # chunker, plan, write, cli            (Ingestion Pipeline)
├─ eval/                         # responses harness, sweep             (Evaluation)
├─ Dockerfile (local dev) + Dockerfile.ingest (Fargate ingest job)      (Infrastructure & Build)
└─ vite/drizzle/ts/nx config, README, SPEC, AGENTS
```

---

## 14. Constraints & non-goals

- **No server-side transcript storage.** Conversations live in `sessionStorage` only; there is no
  account, history sync, or analytics surface beyond per-turn logs and the `ingest_runs` audit
  table.
- **No in-app auth / rate limiting.** `/api/chat` has no captcha, auth, or throttle of its own — it
  assumes an upstream gateway.
- **English only.** All copy and prompting assume English input/output.
- **Retrieval coverage, not just thresholds.** A few out-of-corpus questions still surface
  high-similarity wrong answers; closing these needs content coverage or a relevance gate, tracked
  separately from RAG tuning.
- **Separate retriever is optional.** The chat handler calls `${RAG_URL}/retrieve` over HTTP, which
  *allows* the retriever to run as its own service, but today the same app serves both.
