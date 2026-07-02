# 0062 — form_builder_api keeps bare response bodies; apps/api keeps its envelope

## Context

The two backends speak deliberately different wire formats, and the
`apps/` consolidation audit (ARCH-02, #1404) flagged the split as a possible
convergence target:

- **apps/api** (the public forms API) wraps every response in a
  `{ status, message, data, statusCode, meta }` envelope via a global
  `ResponseInterceptor` + `GlobalExceptionFilter` (`ApiResponseShape`,
  single-sourced in `@govtech-bb/form-types`, #1399).
- **form_builder_api** (the private, admin-token-gated builder tool) returns
  **raw JSON on success** and a bare `{ error: string }` on failure. Its only
  consumer is form_builder's server-side `api-client`, which calls
  `api.get<FormDefinitionSummary[]>("/builder/forms")` and reads the bare body
  directly. On a non-2xx, `api-client` reads **only** `errBody.error` (a string)
  and the HTTP `status`, then throws `ApiError(status, message)` — it never
  parses `issues`, `code`, or any other field.

Two further problems were called out: there was **no** central error
middleware, so every router hand-rolled
`catch (err) { res.status(500).json({ error: err.message }) }`, and the Zod
error-to-string formatting was copy-pasted across `forms.ts`, `mda-contacts.ts`,
and `readProcessors`.

## Decision

**Do not** wrap form_builder_api success responses in apps/api's envelope, and
**do not** change the error body shape. Enveloping success would be a breaking
change to every `api-client` call site for a private browser tool, with no
payoff — the two surfaces have different audiences (public citizen-facing API
vs. internal admin tool) and different single consumers.

Instead, centralize only the **error path**, which is non-breaking:

1. A single terminal `ErrorRequestHandler` (`middleware/error-handler.ts`),
   registered after all routers in `app.ts`. Express 5 auto-forwards rejected
   async handlers to it, so no `express-async-errors` shim or per-handler
   wrapper is needed. It maps:
   - `ZodError` → `400` `{ error: formatZodError(err) }`
   - `HttpError` (carries an explicit status) → its status `{ error: msg }`
   - anything else → `500` `{ error: message }`
2. One `formatZodError(err, fallbackLabel?)` helper (`lib/http-error.ts`)
   producing the existing `"path: message; …"` string, replacing the three
   inline copies.
3. Handlers stop hand-rolling the generic `catch → 500`; they `throw` (or
   `throw badRequest(...)` / re-throw) and let the central handler answer.

The error **body shape is unchanged** (`{ error: string }`), so `api-client`'s
`ApiError` is unaffected. A few responses keep a **richer** body on purpose
because they carry information the wire format already exposed and specs pin:
publish's `400 { error, issues }`, the presence `409 { error, code:
"presence_conflict" }`, and the published-proxy `502 { error, upstreamStatus,
upstreamBody }`. These are deliberate, not the copy-pasted generic 500, so they
stay as direct responses.

## Consequences

- form_builder_api success bodies remain byte-identical; the forms preview smoke
  (which hits the shared sandbox API) and every `api-client` call are
  unaffected. Frontend↔API changes here must still be backward-compatible /
  expand-contract.
- The central handler is now the one place to add error logging/metrics for
  form_builder_api. Handlers that need a non-500 status throw `HttpError`
  (or its `badRequest`/`notFound` shorthands) rather than writing `res.status`.
- Domain-specific error classification stays in the handler that owns it
  (e.g. Textract `InvalidS3Object`→404 / `LimitExceeded`→429 in `ai-upload.ts`,
  and the Postgres `23505`→409 deploy-race map in `createFormHandler`); only the
  unclassified fallthrough is delegated to the central handler via `throw`.
- `authMiddleware` still writes its `{ error }` responses directly (it runs
  before the routers); routing it through the central handler was judged low
  value and left as-is.
- This divergence is intentional and should not be "fixed" by a later
  consolidation pass without re-deciding the consumer cost.
