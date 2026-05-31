# 0022 — Submission outcome dispatches on the lifecycle status, never the envelope status

## Context

The API wraps every response in an `ApiResponse` envelope. On any 2xx the
backend hardcodes the envelope's top-level `status` to `"success"`
(`ApiResponse.success()`, `apps/api/src/common/response.ts`). The real
submission lifecycle status — `submitted` / `pending_payment` / `processing` /
`complete` / `error` / `draft` — lives one level down, in
`response.data.status` (the `FormSubmissionEntity.status` field).

The forms submit handler (`apps/forms/src/routes/forms/$formId/index.tsx`)
switched on `response.status`. Because that field is *always* `"success"` on a
2xx, only the success branch ever ran in production: every submission committed
`hasPayment: false`, and the `pending_payment`, `processing`, and
`error`/`failed` branches were all unreachable. The bug was invisible because
the route spec mocked `postFormSubmission` to return the lifecycle status at the
**envelope** top level — a shape the real API never produces — so the suite
pinned a contract that didn't match reality (fixed in #463).

This is a genuine trap: `response.status === "success"` reads like a meaningful
business check, but it is a transport-level constant. The danger is precisely
that it *looks* load-bearing.

## Decision

Business dispatch on a submission outcome reads the lifecycle status at
`response.data.status`. The envelope `status` is transport-level only
(`"success"` on 2xx; non-`"success"` envelopes already throw in `makeFetch`
before any dispatch) and must never drive UI or business logic.

- The citizen-facing confirmation screen renders off a `displayStatus`
  discriminant (`"success" | "processing" | "error"`) committed onto
  `SubmissionState`, derived from the lifecycle status — not from the envelope.
- Genuine failures (validation/server/network) throw in `makeFetch` and surface
  in the submit handler's `catch`; that path must commit an honest error state
  too, not silently return. Distinguish unreachable-server (`FormFetchError`
  with `status === 0`) from server-side failures for analytics.
- Tests must mock the **real** envelope shape —
  `{ status: "success", data: { status: <lifecycle> }, meta }` — so they can't
  pass against a contract the API never emits.

## Consequences

- Any future code that keys submission behaviour off `response.status` is a bug;
  reviewers should treat a read of the envelope `status` for business purposes
  as a red flag and ask for `response.data.status`.
- The confirmation component has exactly one render path keyed on
  `displayStatus`; new outcomes are added by extending the discriminant, not by
  forking on `submissionSuccess` (kept only for back-compat, deriving a default
  `displayStatus`).
- This continues the "no fabricated confirmations" line from #254: every
  outcome the user sees is backed by committed, honest state.
