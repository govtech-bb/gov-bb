# Chat — Feature Specification

`apps/chat` is the **"Ask alpha.gov.bb"** assistant: a conversational front door to Barbados government services that grounds every answer in retrieved content from the official site. This document describes **what the app does** as observed from the source, independent of implementation choices.

> Scope: this spec covers the `apps/chat` application only. Other apps in this monorepo (API, forms, form-builder, landing) are out of scope and have their own SPECs. Where something was unclear during exploration, it is called out under §10.

---

## 1. Product Intent

A single-page chat that helps a member of the public:

1. **Find information** about a Barbados government service (eligibility, fees, documents, where to go, who to contact).
2. **Decide what to do next** through guided multiple-choice prompts when the next answer is a small closed set.
3. **(Planned)** Be handed off to a pre-filled application form on alpha.gov.bb once the chat has collected the required details.

The product positions itself as "Ask alpha.gov.bb" with a friendly tone — short, human, conversational, never brochure-like. Every factual claim must come from retrieved source content; the assistant is not allowed to invent or "round" facts.

---

## 2. Primary User Surfaces

### 2.1 Chat page (`/`)

The only user-facing route. Header reads **"Ask alpha.gov.bb"** with a back link and the trident avatar.

**Empty state** — when there are no messages yet:
- Large greeting ("Hello. What can we help you with today?").
- Four suggested starter questions presented as clickable cards:
  - "How do I get a passport?"
  - "How do I register a birth?"
  - "What financial assistance is available?"
  - "How do I apply for a driver's licence?"

**Conversation state** — once a message has been sent:
- A scrolling transcript of user and assistant bubbles.
- User bubbles right-aligned, plain text.
- Assistant bubbles left-aligned with the trident avatar and Markdown rendering.
- A "Thinking…" shimmer while the assistant has not yet streamed any text for the latest turn.
- Inline error pill if the request fails.

**Composer** — fixed at the bottom of the viewport:
- Multi-line text area with "Ask anything" placeholder.
- Submit button (paper-plane chevron) becomes enabled when input is non-empty.
- While the assistant is streaming, the submit button becomes a **Stop** button that cancels generation.
- Enter sends; Shift+Enter inserts a newline.
- A disclaimer below the composer: "AI can make mistakes. Please double-check responses."

### 2.2 Source pills

Each assistant message may be accompanied by up to three **source pills** below the bubble:
- Each pill links to the relevant page on alpha.gov.bb (or the current gov.bb when a service has not migrated yet).
- Pill label is the page title; tooltip includes the section name when one is known.
- URLs are deep-linked using the browser **text-fragment** feature (`#:~:text=…`) so the linked page scrolls to and highlights the quoted sentence when possible.
- Pills open in a new tab.

### 2.3 Choice buttons (`present_choices` tool)

When the assistant asks a question whose answer is a small closed set (yes/no, a service variant, a role like *parent vs guardian*), it emits a `present_choices` tool call instead of typing the question as text. The UI then renders:
- The question as a sentence.
- Each option as a clickable pill button.

Clicking a button submits that label as the user's next message and continues the conversation.

---

## 3. Conversational Behaviour

The behaviour below is enforced via the system prompt and is part of the product contract:

### 3.1 Voice and formatting
- Conversational, warm, direct. No "I'm here to help you with…" intros, no capability lists.
- Greetings get a one-line reply that asks what the user needs.
- Replies use Markdown rendered in the UI: bold section labels, hyphen bullets, numbered lists for ordered steps.
- Em-dashes and en-dashes are forbidden anywhere in output.
- Trivial replies are 1 sentence; standard informational replies are a 1-sentence intro + 2–4 labelled sections + a 1-line follow-up question.

### 3.2 Grounded retrieval (strict RAG)
- Every factual claim (fee, eligibility rule, document name, contact detail, opening hours) must come from the context retrieved for the current turn.
- If a fact is not in the retrieved context, the assistant says it does not have that detail and offers a next-best step instead of inventing one.
- The model uses prior conversation only to interpret follow-ups ("how much?", "what documents?") — it does not invent facts from memory.

### 3.3 Pushback resilience
- When a user says "are you sure?" or otherwise pushes back, the assistant must not capitulate by retracting a grounded statement. It re-grounds in the retrieved context and quotes the source.
- If a contested fact is not in the current turn's context, the assistant says so plainly and suggests verifying with the relevant office.

### 3.4 Legacy-source disclosure
- When **every** source for a turn comes from the current (non-alpha) gov.bb site, the assistant appends a short closing line indicating the alpha version is not yet available — e.g. *"This one's still on the current gov.bb site — alpha version coming soon."*

### 3.5 No-form disclosure
- When no online form exists for the service in question, the assistant must not imply that one does. It does not say "pre-register online" or offer to start an application; it frames the process as in-person / phone / by-mail as the context says.

### 3.6 Streaming and turn control
- Responses are streamed token-by-token over Server-Sent Events.
- A single assistant turn is bounded — the agent loop is capped at one iteration so a tool call ends the turn, and the next turn begins from the user's reply.

---

## 4. Retrieval-Augmented Generation (RAG)

### 4.1 What the assistant retrieves over
Content is sourced from the shared `@govtech-bb/content` package and ingested into a Postgres+pgvector store. Each ingested item is one of:
- **Ministry**, **department**, or **state-body** (collectively "MDAs") — with name, optional aliases/acronyms, minister or head, contact channels, and body copy.
- **Service** — with title, description, and a body of sections (eligibility, steps, fees, documents, etc.).
- **Form** — defined in the schema; reserved for future content.

### 4.2 How content is chunked for retrieval
Each entity is split into purpose-built **chunks**, each phrased the way a user is likely to ask:
- **Name** chunk — entity name + aliases + short description. Front-loaded with a short acronym alias when available (e.g. "BRA", "MIST") so users who type the acronym match correctly.
- **Minister / Head** chunk — phrased as "Who is the minister of X?".
- **Contact** chunks — one per channel, phrased as "Phone number for X", "Email address for X", etc.
- **Body** chunks (MDAs) — long-form description, split at ~2000 chars with overlap.
- **Intent** chunk (services) — phrased as "How do I {service title}?".
- **Section** chunks (services) — one per `##` heading in the service body, prefixed with `"{title} — {section}"`.

Each chunk stores stable IDs, a content hash for change detection, and an embedding vector.

### 4.3 Query handling
- The retrieval query is **the latest user message only**, by default — to prevent topic shifts ("MIST → register a birth") dragging the prior topic into the new search.
- For short generic follow-ups ("how much?", "what documents?", "where do I go?"), the previous user message is concatenated so the topic survives.
- Greetings and very short inputs (under 8 chars) **skip retrieval entirely**, and no sources are shown.

### 4.4 Retrieval pipeline
1. Embed the query with **Bedrock Titan Text Embeddings v2 (1024-dim)**.
2. Run a cosine-similarity search against the `chunks` table using pgvector's HNSW index, keeping the top chunk per document.
3. Drop draft documents (`metadata.status == 'draft'`).
4. Apply a similarity threshold (`> 0.30` in SQL, `>= 0.55` when filtering for citation pills).
5. Return up to **top_k = 8** contexts and at most **3 deduplicated sources** to the LLM and the UI.

### 4.5 Context block sent to the LLM
- Retrieved chunks are formatted into a numbered context block, capped at ~6000 characters total, deduplicated by `(title, section, first 80 chars)`.
- The block is sent as a per-turn system prompt; the static base prompt is marked for Anthropic prompt caching, so only the volatile context is re-tokenised each turn.

---

## 5. Form Handoff (V1: scaffolding only)

The UI and API include the wiring for a *form handoff* feature — but it is intentionally disabled in V1.

**Intended behaviour:**
- When the retrieved context covers a service that has a built online form, the assistant collects required fields conversationally.
- After every required field is collected and the user confirms the summary, the assistant calls the `open_form_review` tool with the service slug and field map.
- The client validates the fields against the form schema, pre-fills a session for that form, and navigates the user to the Check-your-answers (review) page where they submit the form themselves.

**V1 status:**
- `open_form_review` is only registered as a tool when retrieved sources include a known form slug. The form-slug registry (`CHAT_FORM_SCHEMA_LOADERS`) is empty, so today **no source URL ever matches** and the tool is not exposed.
- The form-field summariser, validator, and prefill-session functions are stubs:
  - `summarizeFormFields` returns `null`.
  - `validateFormFields` always returns a `"form integration pending"` error.
  - `prefillFormSession` always rejects with `"form prefill not yet wired"`.
- When the registry is empty, the system prompt is augmented with a hard-override disclosure forbidding the assistant from promising any online submission.

This means the user-visible feature today is **information-only**, with form handoff prepared for a future release.

---

## 6. Public HTTP Surface

| Method & path | Purpose |
|---|---|
| `POST /api/chat` | Streams the assistant's reply over Server-Sent Events. Accepts the `@tanstack/ai` chat-params body; emits a custom `sources` event prefix followed by LLM stream chunks. Returns `500` if `RAG_URL` or `ANTHROPIC_API_KEY` is missing, `400` for an invalid body. |
| `POST /api/retrieve` | Vector-search endpoint used by `/api/chat` (and any external caller). Body: `{ query: string, topK?: number (≤ 50, default 8) }`. Returns `{ contexts, sources }`. Returns `503` if no database is configured. |
| `GET /api/documents` | Stats endpoint: count of documents grouped by `kind`, count of chunks grouped by `kind`, and the latest document `updated_at`. |
| `GET /api/health` | Liveness/readiness probe with database status (`connected` / `disconnected` / `unconfigured`), document and chunk counts, and last-updated timestamp. Returns `503` when the DB is configured but unreachable. |

Notes:
- The chat handler retrieves via an external `RAG_URL` (the same `/api/retrieve` endpoint, called from the server side). This split lets the retriever live separately from the chat handler in deployment.
- Client disconnects propagate through an `AbortController` that cancels both the LLM stream and the SSE response.

---

## 7. Content Ingest

A CLI (`pnpm ingest`) keeps the vector store in sync with the `@govtech-bb/content` package. It is run by operators, not end users, but is part of the application's feature set.

Modes:
- `pnpm ingest` — reconcile: insert new, re-embed changed, leave unchanged alone, delete orphans.
- `pnpm ingest --dry-run` — print the plan with no writes.
- `pnpm ingest --report` — show coverage by document and chunk kind.
- `pnpm ingest --reset-embeddings` — required when the embedding model changes; drops all chunks and documents and rebuilds.
- `pnpm ingest --limit=N` / `--content-dir=…` — scoping flags for partial runs.

Properties:
- **Idempotent**: hashes of payload and embed-text decide whether a row needs rewriting; otherwise it is skipped.
- **Resumable telemetry**: each run is recorded in an `ingest_runs` table (`running` → `success` / `failed`) with an error message and a plan summary.
- **Progress reporting**: prints periodic progress with elapsed time and ETA every 25 chunks.
- **Embedding-model safety**: refuses to run if the DB contains chunks embedded with a different model unless `--reset-embeddings` is passed.

The same `pnpm db:migrate` / `pnpm db:studio` / `pnpm db:reset` scripts manage the underlying schema.

---

## 8. Resilience & Degraded Modes

- **Missing API key or `RAG_URL`** → `/api/chat` returns 500 with a clear error; the UI surfaces the message in a red pill.
- **Retrieve call fails or times out (4 s)** → the chat continues with an empty context block; the assistant truthfully says it doesn't have that detail. A warning is logged.
- **Retrieve aborts because the user disconnected** → treated as an empty result, not an error.
- **Database missing** → `/api/health` and `/api/documents` return `503` with `db: "unconfigured"`; `/api/retrieve` returns `503`.
- **Streaming aborted by Stop** → both the LLM call and the SSE response are cancelled; any queued navigation (form handoff) is discarded.
- **Stale topic guard** → if the user starts a form flow and then changes topic, source pills are suppressed on assistant messages from the form-flow turn onward to avoid showing unrelated sources.

---

## 9. Visual / Brand

- Trident avatar (the Barbados trident) is used as the assistant identity, with a subtle "humming" animation in the empty state.
- Brand colour tokens (blue, teal, grey) come from the shared `@govtech-bb/design` package.
- The "Thinking" shimmer uses a teal-blue gradient sweeping across the word.
- Source pills carry a small coloured swatch and a hostname fallback when the title is missing.

---

## 10. Open Questions and Caveats for Reviewer

These are things we noticed during exploration that the team should clarify before this spec is locked in:

1. **Form handoff timeline.** The `open_form_review` tool, schema registry, prefill, and validation are all wired in code but stubbed. We've assumed this is a deliberate V1 deferral. **Q:** When is this expected to ship, and where will the real `CHAT_FORM_SCHEMA_LOADERS` come from (which package, which forms first)?
2. **Source mode hard-coded to `"alpha"`.** `search()` labels every retrieved source as `source: "alpha"`. The system prompt and UI also recognise `"legacy"` (current gov.bb pages still served by the old site) and there is a "legacy disclosure" path. **Q:** Is the legacy classification supposed to be driven by document metadata, by URL, or is it simply not active yet?
3. **`form` document kind.** The DB schema includes a `form` document kind, but the chunker only handles MDA and service entities. **Q:** Is there a planned ingest path for forms, or is this slot reserved?
4. **Retriever deployment.** `/api/chat` calls `${RAG_URL}/retrieve` rather than using the local `search()` directly. **Q:** Is the intent to deploy retrieval as a separate service eventually? Today the same app serves both endpoints.
5. **Conversation persistence.** There is no transcript storage — refreshing the page loses the chat. **Q:** Is that intentional for V1 (privacy by default), or is persistence planned?
6. **Suggested prompts.** The four empty-state prompts are hard-coded. **Q:** Should these become content-driven (top services, seasonally relevant suggestions, etc.)?
7. **Rate limiting / abuse controls.** No rate limiting, auth, or captcha is visible on `/api/chat`. **Q:** Is this expected to sit behind an upstream gateway, or do we need in-app controls?
8. **Analytics / observability.** Beyond `console.log` lines and the `ingest_runs` audit table, there is no telemetry of chat usage (which questions are asked, retrieval hit rates, source-pill clicks). **Q:** Is there a planned analytics surface, and should it be in scope here?
9. **Internationalisation.** All copy is English-only and the prompt assumes English input. **Q:** Is multi-language support in scope?
10. **Accessibility.** The composer has an `aria-label`, choice buttons are real buttons, and source pills carry descriptive labels. We did not see a full a11y audit. **Q:** Has the chat been keyboard- and screen-reader-tested end to end, particularly the streaming state and the Stop button?
