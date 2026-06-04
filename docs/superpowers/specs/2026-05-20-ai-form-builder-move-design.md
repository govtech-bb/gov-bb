# AI Form Builder Move — Design Spec

**Date:** 2026-05-20
**Branch:** dev
**Author:** Isaiah Carrington

## Overview

The AI-powered form builder is currently split across three locations: a NestJS module in `apps/api/src/form-builder/`, a chat UI page in `apps/forms/src/routes/admin/form-builder.tsx`, and a runtime helper library in `apps/forms/src/lib/form-builder/` (which only relates by name — it renders forms at submission time and is **out of scope** for this move).

This spec moves the AI form builder (chat UI + backend logic) into the standalone `apps/form_builder/` TanStack Start app, so that **all form-authoring tooling lives in one app**. It also restructures the `/builder` route hierarchy so a user lands on a chooser and picks between the manual builder (`/builder/ui`) and the AI builder (`/builder/ai`).

## Goals

- Co-locate the AI builder backend with the manual builder backend (both run as TanStack Start server functions, both talk to the same Postgres via the existing `@govtech-bb/database` data source).
- Eliminate the cross-app round-trip: today the chat UI in `apps/forms/` calls the NestJS `apps/api/` via `VITE_API_URL` over CORS. After the move, the chat UI and its backend run in the same TanStack Start process.
- Remove the AI form builder code paths from `apps/api/` and `apps/forms/` entirely.
- Present a single, discoverable entry point at `/builder/`.

## Non-Goals

- **`apps/forms/src/lib/form-builder/`** (`build-form.ts`, `field-mapper.ts`, `validation-builder.ts`, etc.) is form-rendering logic used by the end-user forms app at runtime. It is named "form-builder" but is unrelated to authoring tooling. It stays where it is.
- Changing the system prompt, AI provider abstraction, or recipe-extraction logic. This is a lift-and-shift, not a rewrite.
- Persisting chat sessions across server restarts. Sessions remain in-memory in a single process, matching current behavior.
- Authentication / authorisation for the builder. The current build has none; this move does not add any.
- Unifying the AI publish semantics (immediate publish with `publishedAt: NOW()`) with the manual builder's draft → publish flow. Both behaviors continue to coexist for now; unification is future work.

## Current State

| Concern | Location | Notes |
|---|---|---|
| NestJS controller (`/form-builder/*`) | `apps/api/src/form-builder/form-builder.controller.ts` | 8 endpoints: status, sessions (CRUD), messages, recipe, extract, sql, publish, delete |
| NestJS service | `apps/api/src/form-builder/form-builder.service.ts` | In-memory `Map<string, Session>`, recipe extraction, SQL builder, publish via TypeORM `FormDefinitionEntity` |
| AI provider | `apps/api/src/form-builder/ai.service.ts` | Anthropic SDK or AWS Bedrock; selected by `AI_PROVIDER` env |
| System prompt | `apps/api/src/form-builder/prompts/system-prompt.{md,ts}` | Loaded at boot from `getSystemPrompt()` |
| DTOs | `apps/api/src/form-builder/dto/chat-message.dto.ts` | Shared message/session/publish types |
| Chat UI | `apps/forms/src/routes/admin/form-builder.tsx` | Single-file React page; talks to NestJS over `fetch(VITE_API_URL)` |
| Manual builder UI | `apps/form_builder/app/routes/builder/index.tsx` + 14 sibling `-*.tsx` helpers | TanStack Start route; reducers, panels, pickers |
| Manual builder server fns | `apps/form_builder/app/server/{forms,registry,db}.ts` | `listForms`, `submitRecipe`, `updateRecipe`, `nextVersion`, `getCatalogFn`, `validateRecipe`, `previewRecipe` |

## Target State

```
apps/form_builder/
└─ app/
   ├─ routes/
   │  ├─ index.tsx                       (redirects to /builder — unchanged)
   │  └─ builder/
   │     ├─ index.tsx                    (NEW — landing page: "UI" vs "AI" chooser)
   │     ├─ ui/
   │     │  ├─ index.tsx                 (moved from routes/builder/index.tsx)
   │     │  └─ -*.tsx                    (moved from routes/builder/-*.tsx — 14 files)
   │     └─ ai/
   │        └─ index.tsx                 (moved from apps/forms/.../admin/form-builder.tsx, adapted)
   ├─ server/
   │  ├─ db.ts                           (unchanged)
   │  ├─ forms.ts                        (unchanged)
   │  ├─ registry.ts                     (unchanged)
   │  └─ ai-builder/                     (NEW)
   │     ├─ sessions.ts                  (server fns: createSession, sendMessage, getSession, getRecipe, extract, sql, publish, deletePublished, status)
   │     ├─ session-store.ts             (module-scoped Map<string, Session>)
   │     ├─ ai-client.ts                 (Anthropic / Bedrock client, ported from ai.service.ts)
   │     ├─ recipe-extractor.ts          (extractRecipe + tryParseRecipe, ported from form-builder.service.ts)
   │     ├─ sql-builder.ts               (buildSql, ported)
   │     └─ prompts/
   │        ├─ system-prompt.md          (copied verbatim)
   │        └─ system-prompt.ts          (copied verbatim)
   └─ package.json                       (adds @anthropic-ai/sdk, @aws-sdk/client-bedrock-runtime)

apps/api/src/form-builder/                DELETED
apps/api/src/app.module.ts                FormBuilderModule import removed
apps/forms/src/routes/admin/form-builder.tsx   DELETED
apps/forms/src/routes/admin/                   DELETED if empty after removal
```

## Routing

| Route | Component | Purpose |
|---|---|---|
| `/` | redirect | → `/builder` (unchanged) |
| `/builder` | new landing | Two cards: "Build with the UI" → `/builder/ui`, "Build with AI" → `/builder/ai` |
| `/builder/ui` | manual builder | Existing builder, moved one level deeper. All `-*.tsx` helpers live as siblings inside `routes/builder/ui/` so they remain "private" (TanStack Start hides leading-dash files from routing). |
| `/builder/ai` | AI chat UI | Ported chat panel + recipe preview + publish controls. Calls local server functions instead of `fetch(VITE_API_URL)`. |

The landing page is intentionally lightweight — a heading, two clickable cards, no shared state. Visual styling reuses the builder CSS modules already in `app/styles/`.

## Backend: Server Functions (replaces NestJS controller)

Each existing NestJS endpoint maps to a TanStack Start server function in `app/server/ai-builder/sessions.ts`. Where possible the function names mirror the controller methods:

| NestJS endpoint | Server function | Method | Input | Output |
|---|---|---|---|---|
| `GET /form-builder/status` | `getAiStatus` | GET | — | `{ available, message }` |
| `POST /form-builder/sessions` | `createSession` | POST | `{ name? }` | `SessionResponse` |
| `POST /form-builder/sessions/:id/messages` | `sendMessage` | POST | `FormData { sessionId, message, pdf? }` | `SessionResponse` |
| `GET /form-builder/sessions/:id` | `getSession` | GET | `{ sessionId }` | `SessionResponse` |
| `GET /form-builder/sessions/:id/recipe` | `getRecipe` | GET | `{ sessionId }` | `{ recipe }` |
| `POST /form-builder/sessions/:id/extract` | `extractRecipeFromSession` | POST | `{ sessionId }` | `{ recipe }` |
| `GET /form-builder/sessions/:id/sql` | `getSql` | GET | `{ sessionId }` | `{ sql }` |
| `POST /form-builder/sessions/:id/publish` | `publishSession` | POST | `{ sessionId, formId? }` | `PublishResponse` |
| `POST /form-builder/sessions/:id/delete` | `deletePublished` | POST | `{ sessionId }` | `{ message }` |

All inputs use Zod validators (matching the convention in `server/forms.ts`). All functions throw plain `Error`s — TanStack Start surfaces these to the client, and the UI inspects `err.message` for substrings like `"not found"` / `"No recipe"` to render appropriate states. The current chat UI already uses string-matching error handling, so this is preserved.

### PDF upload via server function

TanStack Start `createServerFn` POST handlers accept `FormData` directly: the client passes a `FormData` instance, and the handler reads fields via `formData.get(...)`. The `sendMessage` server function will:

1. Receive a `FormData` body containing `sessionId`, `message`, and optionally a `pdf` File.
2. Read the file bytes (`await file.arrayBuffer()`), base64-encode, push onto a one-element `pdfPages` array.
3. Call the session-store helper that calls the AI client.

If `createServerFn` proves awkward for multipart in practice (the API around input validators and raw bodies is still evolving), the fallback is a TanStack Start API route handler at `app/routes/api/ai-builder/send-message.ts` returning JSON — same wire shape, just outside the server-fn helper. The chat UI's call site is small either way.

Maximum upload size remains 50 MB, enforced inside the handler by checking `file.size` before reading. Larger files cause the handler to throw before the AI call.

### Session storage

`server/ai-builder/session-store.ts` exports a module-scoped `Map<string, Session>`:

```ts
const sessions = new Map<string, Session>();
export function getOrThrow(id: string): Session { ... }
export function create(name?: string): Session { ... }
```

This mirrors the NestJS `FormBuilderService.sessions` field. In dev the map resets on Vite HMR boundaries the same way the NestJS map resets on Nest reload — acceptable. In prod (`node dist/server/server.js`) it lives for the lifetime of the single process. **Same constraints as today.**

### AI client (`ai-client.ts`)

Direct port of `ai.service.ts`, but converted from a NestJS provider to a module with a lazy-initialised singleton:

```ts
let client: AnthropicClient | BedrockClient | null = null;
let provider: "anthropic" | "bedrock" = "anthropic";
let systemPrompt = "";

export async function ensureInitialised(): Promise<void> { ... }
export function isAvailable(): boolean { ... }
export function buildSystemPrompt(customComponentsList: string): string { ... }
export async function chat(systemPrompt: string, messages: ChatMessage[], pdfPages?: string[]): Promise<string> { ... }
```

Environment variables read directly from `process.env` (no NestJS `ConfigService`):

- `ANTHROPIC_API_KEY` — required when provider=anthropic
- `AI_PROVIDER` — `"anthropic"` (default) or `"bedrock"`
- `AI_MODEL` — model id, defaulting to `claude-sonnet-4-20250514` (anthropic) or `us.anthropic.claude-sonnet-4-6` (bedrock)
- `AWS_REGION` — for bedrock

These are added to `apps/form_builder/.env.example` so dev setup is documented.

### Dependencies added to `apps/form_builder/package.json`

- `@anthropic-ai/sdk` — for Anthropic provider
- `@aws-sdk/client-bedrock-runtime` — for Bedrock provider

Both are loaded via dynamic `import()` so the missing-package warning path in the current `ai.service.ts` is preserved.

## Frontend: AI chat page (`/builder/ai`)

The existing `apps/forms/src/routes/admin/form-builder.tsx` is moved verbatim to `apps/form_builder/app/routes/builder/ai/index.tsx` and modified as follows:

1. **Route literal** changes from `"/admin/form-builder"` to `"/builder/ai"`.
2. **Remove `API_URL` constant and all `fetch(...)` calls.** Replace each with a call to the corresponding server function imported from `~/server/ai-builder/sessions`.
3. **PDF upload**: the current code uses `FormData` + raw fetch. Replace with a server-fn call passing FormData as the input.
4. **Error display**: unchanged — server fn errors are caught the same way.
5. **Styles**: keep the inline styles initially (lift-and-shift). Future work may switch to the `builder.module.css` pattern used by the manual builder, but that is **out of scope**.

The recipe-preview panel (right-hand column with JSON output, Extract/Export SQL/Publish buttons) is preserved exactly.

### Landing page (`/builder/index.tsx`)

```
+---------------------------------+----------------------------------+
|                                 |                                  |
|   🧱 Build with the UI          |   🤖 Build with AI               |
|                                 |                                  |
|   Drag, configure, validate.    |   Describe your form or upload   |
|   Full control, manual editor.  |   a PDF — Claude does the rest.  |
|                                 |                                  |
|       [Open UI builder →]       |       [Open AI builder →]        |
|                                 |                                  |
+---------------------------------+----------------------------------+
```

Simple two-column flex layout, each card is a `<Link>` to the respective sub-route. Reuses CSS variables from `builder.global.css`.

## Removals

After the new code is wired and verified:

- Delete `apps/api/src/form-builder/` (entire directory).
- Remove `FormBuilderModule` import from `apps/api/src/app.module.ts`.
- Remove form-builder-related entries from `apps/api/src/main.ts` if any (the CORS/throttler config is module-level so likely no changes).
- Remove `@anthropic-ai/sdk` and `@aws-sdk/client-bedrock-runtime` from `apps/api/package.json` if they are no longer referenced elsewhere in the API.
- Delete `apps/forms/src/routes/admin/form-builder.tsx`.
- Delete `apps/forms/src/routes/admin/` directory if empty.
- Let the TanStack router plugin regenerate `routeTree.gen.ts` in both `apps/forms` and `apps/form_builder` (happens automatically on next `vite dev`/`vite build`); commit the regenerated files.

## Data Flow

```
User → /builder/ai (chat UI in form_builder)
     ↓ server fn: createSession
       session-store.create() → returns sessionId
     ↓ server fn: sendMessage(sessionId, text, pdf?)
       session-store.getOrThrow → ai-client.chat (Anthropic|Bedrock)
                                  → recipe-extractor.extractRecipe
                                  → store latest recipe on session
       returns { messages, recipe }
     ↓ server fn: publishSession(sessionId, formId?)
       Validates recipe shape (same checks as today)
       sql-builder.buildSql for export
       getDataSource().getRepository(FormDefinitionEntity).save({ formId, version, schema, publishedAt: new Date() })
       Records publishedFormId on session for later delete
       returns { formId, message, sql, previewUrl }
```

The published row is written by the **same TypeORM data source** the manual builder uses, so a recipe authored via AI is immediately visible in the manual builder's `listForms()` picker.

## Error Handling

The current NestJS controller throws typed `HttpException`s; the UI checks `res.ok` and reads `errData.message`. After the migration:

- Server functions throw plain `Error` with the same messages.
- TanStack Start serialises the error message to the client.
- The chat UI's existing `catch (err: any) { ... err.message }` blocks continue to work without change.

No new error categories are introduced. The `"AI service not configured"` 503 case becomes a thrown Error with the same message — the UI surfaces it identically in the error pane.

## Testing

| Test | Location | Type |
|---|---|---|
| `recipe-extractor.test.ts` | `apps/form_builder/app/server/ai-builder/` | Jest unit — port of existing extraction edge cases (json fences, $recipe$ wrappers, INSERT prefixes) |
| `sql-builder.test.ts` | same | Jest unit — confirms SQL output is byte-identical to current `buildSql` for representative recipes |
| `session-store.test.ts` | same | Jest unit — create, retrieve, missing-id throw |
| Manual smoke: full chat → publish | live | Run dev server, upload sample PDF, confirm recipe is written to DB and visible in manual builder's form picker |
| Manual smoke: landing chooser | live | `/builder` shows two cards, each navigates to the correct sub-route |
| Manual smoke: api removal | live | `apps/api` boots without FormBuilderModule; no broken imports |

`apps/form_builder/jest.config.ts` already exists (it tests `-recipe-reducer.spec.ts`); the new test files follow the same convention.

## Migration / Rollout

This is a single-PR change with no production data migration (the database schema is untouched — recipes still land in `form_definitions`).

Order of operations during implementation:

1. **Add** the new files in `apps/form_builder/app/server/ai-builder/` and `app/routes/builder/{ai,ui}/` and `app/routes/builder/index.tsx`. Update `package.json` and `.env.example`. Run route generation.
2. **Wire** the new chat UI to the new server functions. Verify end-to-end against a running Postgres.
3. **Remove** the old code paths (NestJS module, forms admin route).
4. **Update** any docs/READMEs that reference the old endpoints (`apps/api/README.md`, `docs/form-builder-ai-guardrails.md` if it lists URLs).

The user-visible URL changes:

| Before | After |
|---|---|
| `<forms app>/admin/form-builder` | `<form_builder app>/builder/ai` |
| `<api>/form-builder/*` | _gone_ (replaced by internal server functions) |

Anyone holding bookmarks to the old `/admin/form-builder` route gets a 404 after deploy. This is acceptable because the route is admin-internal and not publicly linked.

## Open Questions

None blocking — the design is implementable as written. Items deliberately deferred:

- **Session persistence.** Today's sessions die on restart. Putting them in Postgres or Redis is meaningful work and unrelated to the move.
- **Auth on the builder.** Both manual and AI builders are open inside the app. Out of scope.
- **Publish semantics unification.** The AI builder publishes immediately; the manual builder follows draft → publish. Worth aligning later.
- **Renaming `apps/forms/src/lib/form-builder/`.** The name is confusing now that the actual builders live elsewhere. Rename (e.g., to `form-renderer/`) is its own small refactor.

## Summary

Three directories collapse to one. The AI form builder lives next to the manual one in `apps/form_builder/`, the user lands on a chooser at `/builder`, and the NestJS form-builder module + `apps/forms` admin page go away.
