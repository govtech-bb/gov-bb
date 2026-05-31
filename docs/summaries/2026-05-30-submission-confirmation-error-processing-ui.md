# Dedicated error/processing UI for submission-confirmation

**Issue:** [#463](https://github.com/govtech-bb/gov-bb/issues/463) — follow-up
from [#254](https://github.com/govtech-bb/gov-bb/issues/254). Decision record:
[0022](../decisions/0022-submission-outcome-dispatches-on-lifecycle-status-not-envelope.md).

## Context

#254 stopped the confirmation step fabricating a fake "payment confirmed"
receipt and added a redirect guard: on `submission-confirmation` with no
committed `submissionState`, bounce back to `check-your-answers`. That left
`processing`, `error`/`failed`, and `draft` submissions silently bouncing
instead of showing a genuine outcome. This session was meant to give those
states a real UI.

## What we did

Tracing the data flow first surfaced a deeper bug that made the whole feature
dead on arrival, so it had to be fixed before anything else (see
[0022](../decisions/0022-submission-outcome-dispatches-on-lifecycle-status-not-envelope.md)):

- **`index.tsx`** — switched the dispatch from `response.status` (envelope,
  always `"success"`) to `responseData.status` (the lifecycle status). Then
  committed honest state for every reachable branch: `processing` →
  `displayStatus: "processing"`; `error`/`failed` → `displayStatus: "error"`
  with the reference number + a real message; the `catch` block → a
  reference-less error state (was a bare `return`), with the analytics `reason`
  split into `network` (unreachable server, `FormFetchError.status === 0`) vs
  `server`. `draft` left a documented no-op (never returned by `/submissions`).
- **`props.type.ts`** — added the `displayStatus` discriminant + `errorMessage`;
  made `referenceNumber`/`date`/`serviceName` optional so a body-less error is
  representable. Kept `submissionSuccess` for back-compat.
- **`submission-confirmation.tsx`** — render off a derived `displayStatus`:
  success (unchanged), a new processing panel (+reference when present), and a
  real error message replacing the "More error details go here." placeholder.
- **Specs** — corrected every route-spec fixture to the real envelope shape and
  added processing / error / network-catch / server-catch coverage; added
  processing + error render coverage to the component spec.

## Why we did it that way

- **Fix the dispatch field before building any UI.** The issue asked for
  error/processing screens, but those branches were unreachable in prod because
  the switch keyed on the always-`"success"` envelope field. Adding UI without
  the dispatch fix would have shipped dead code. The minimal correct fix is
  reading `response.data.status`, which the frontend already had in hand — not a
  backend change to surface the lifecycle status at the envelope top level
  (rejected: larger, cross-cutting, and would force `makeFetch` to stop throwing
  on non-`"success"`).
- **A `displayStatus` discriminant over a separate error/processing component.**
  The component already forked success-vs-error on `submissionSuccess`;
  extending that to a three-way discriminant keeps one render path and one
  redirect guard. `submissionSuccess` is kept and derives a default
  `displayStatus` so existing callers/tests don't break.
- **Wire the `catch` block, not just the switch.** Most genuine failures
  (validation/server/network) throw in `makeFetch` and never reach the switch —
  they land in `catch`. Leaving `catch` as a bare `return` would mean real
  errors still bounce. The reason split (`network` vs `server`) is low-risk
  analytics tidy, included here.
- **Honest placeholder copy, finalized before merge.** Wording for the
  processing panel and error messages is plain-English placeholder by agreement;
  the component renders `errorMessage ?? <default>` so copy lives near where the
  cause is known (network vs server vs replay-after-failure).

## Open questions

- **Copy not finalized.** Processing/error wording is placeholder — confirm
  before merge to `sandbox`.
- **`error`/`complete` only arrive via idempotent replay** after async
  processing finishes (the first-submit response is always
  `submitted`/`pending_payment`). Confirmed acceptable as the trigger to design
  the error screen around.
- **`draft` UX** remains out of scope — drafts come from the separate
  `/form-drafts` flow (see `docs/plans/save-draft-bypass-validation.md`).

## Verify

- `tsc -b`, `nx run-many -t build --exclude=landing`, and `nx run-many -t test`
  all green (forms: 685 passed, 1 skipped; 13 projects).
- Manual browser smoke (the four plan scenarios) still pending — owner to click
  through in a real browser.
