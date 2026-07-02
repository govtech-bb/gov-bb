# form_builder_api: centralized error handling (#1404)

## Context

The `apps/` consolidation audit (ARCH-02, #1404) flagged that form_builder_api
had no central error middleware — every router hand-rolled
`catch (err) { res.status(500).json({ error: err.message }) }` — and that the
Zod-error-to-string formatting was copy-pasted across three sites. The audit's
broader question was whether to make form_builder_api adopt apps/api's
`{ status, message, data, … }` response envelope.

## What we did

- Added `lib/http-error.ts` (`HttpError` + `badRequest`/`notFound` +
  `formatZodError`) and `middleware/error-handler.ts` (a terminal
  `ErrorRequestHandler`), wired last in `app.ts`.
- Refactored the router surfaces to throw instead of writing the generic 500,
  unified the three inline Zod formatters into `formatZodError`, and converted
  the simple request-validation (400) and not-found (404) guards to
  `throw badRequest(...)` / `throw notFound(...)` so they answer through the
  central handler too (bodies unchanged).
- Recorded the response-shape decision in ADR `0062`.
- Updated the route specs that unit-test error paths to assert the new throw
  contract; added specs for the new helper + middleware.

## Why we did it that way

**Bare bodies stay; only the error path centralizes.** Enveloping success
responses was rejected. form_builder's `app/server/api-client.ts` is the single
consumer and reads success bodies bare (`api.get<T[]>("/builder/forms")`); on a
non-2xx it reads **only** `errBody.error` + the HTTP status and discards
everything else. Enveloping would break every call site for a private admin tool
with no payoff. So the error body shape stays `{ error: string }` (non-breaking)
and ADR 0062 documents the divergence as deliberate.

**"Preserve" over "flatten" (user decision).** The plan floated standardizing
*all* error bodies to `{ error: string }`. We checked the specs first: three
richer bodies are pinned — publish `400 {error,issues}`, presence
`409 {error,code:"presence_conflict"}`, and the published-proxy
`502 {error,upstreamStatus,upstreamBody}`. The api-client drops those extra
fields anyway, so flattening would have been a behavior change (spec rewrites)
with zero consumer benefit. The user chose to preserve them: the copy-pasted
generic 500, the duplicated Zod formatting, and the simple single-string 400/404
guards all route through the central handler (bodies unchanged), while the
deliberate richer responses stay as direct `res.status().json()`.

**Throw vs. keep-as-direct, per handler.** Not every `catch` was the targeted
copy-paste. We kept and did not convert: result-based handlers
(`listPublishedHandler`'s 502/500, `fetchPublishedForms`, `rekeyFormHandler`'s
dynamic `res.status(result.status)`), and domain-classifying catches
(`ai-upload`'s Textract `InvalidS3Object`→404 / `LimitExceeded`→429 /
`InvalidJobId`→404, and `createFormHandler`'s Postgres `23505`→409 deploy-race
map). For the classifiers we converted only the unclassified fallthrough to
`throw err`, so unexpected errors reach the central handler while the domain
mapping stays local. `publish.ts`'s inner catch keeps its GitHub branch-cleanup
side-effect and re-throws after cleanup. `authMiddleware` was left as-is
(runs before the routers; routing it through the handler was low value).

**Express 5 does the forwarding.** form_builder_api is on Express ^5.1.0, which
auto-forwards rejected async handlers to error middleware — so a single terminal
`app.use(errorHandler)` suffices with no `express-async-errors` shim. The
middleware integration spec uses supertest to prove this end-to-end.

**Spec impact came from the unit-test style.** The route specs call handlers
directly with mock req/res and assert `res.statusCode`. Once a handler throws
instead of writing its own 500/400, those assertions had to become
`rejects.toThrow(...)` / `.catch(e => e)` + `HttpError` checks. That, not any
HTTP-level behavior change, is why the error-path assertions across the route
specs moved — at the app level the behavior is identical (throw → central
handler → same status + `{ error }`).

## Plan drift worth noting

The plan claimed `validate-recipe.ts` held one of the duplicated Zod formatters.
It doesn't — it delegates to `@govtech-bb/form-builder` and returns a
`ValidationResult`. The actual three inline formatters were in `forms.ts`
(`readProcessors`, `disableFormHandler`) and `mda-contacts.ts`.

## Open questions

None. The empty-`ZodError` fallback (`formatZodError` no longer returns a
"Invalid X" label for a zero-issue error) was consciously dropped as an
unreachable case — a failed parse always carries ≥1 issue.
