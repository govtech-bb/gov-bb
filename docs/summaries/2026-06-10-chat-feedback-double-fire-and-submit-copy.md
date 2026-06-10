# Chat Feedback — Double-Submit Latch + Submit-Prompt Copy

**Date:** 2026-06-10
**Branch:** `chat-feedback-skip-optional-comment`

## Context

Two bugs reported against the in-chat feedback form:

1. **"The submit response fires twice."** The user pasted a transcript where the
   whole review-summary + "Submit your application now?" block rendered twice in
   a row.
2. **Wrong copy.** On the feedback form the approval prompt read "Submit your
   application now?" — it should say "Submit your feedback?".

## Root cause

**Double-fire.** Every turn-advancing control in a bubble — the choice pills
(the "Very good" rating), `ask_field` answers / the Skip button, the review
"Change" links, and the Submit / Not-yet approval buttons — gated re-clicks
**only** on `choicesDisabled` (`row.index < lastInteractiveIndex` in
`index.tsx`), which flips a network round-trip later, when the *next* message
lands. Between the click and that message arriving the control stayed live, so a
fast second click fired the handler again. A double-picked rating sends two user
messages → two assistant turns → each ends in `review_form` + `submit_form`,
which is exactly the duplicated block in the report. (A single assistant message
can't render the block twice — `findToolCall` returns the first match — so two
visible blocks prove two turns, i.e. a client-side double-send.)

**Wrong copy.** The string was hardcoded in `bubble.tsx`. `submit_form` takes no
args and its approval metadata is only `{id, needsApproval, approved}`, so the
client had no form identity at approval time.

## What we did

- **`bubble.tsx` — "respond once" latch.** Added `respondedRef` (a synchronous
  guard that blocks *before* React repaints the disabled state) plus a
  `responded` state flag (drives the disabled styling). All interactive controls
  route through `respondOnce(...)` via `handleChoice` / `handleApproval`, and
  every control's disable now reads `controlsDisabled = choicesDisabled ||
  responded`. First interaction wins; the rest are no-ops until the bubble goes
  stale.
- **`bubble.tsx` — feedback copy.** The submit prompt now branches:
  `isFeedbackForm ? "Submit your feedback?" : "Submit your application now?"`.
- **`chat-tools.ts` + `form/tools.ts` — carry the form id.** `review_form`'s
  output schema gained an optional `formId`, and its handler returns
  `session.slug ?? undefined`. The bubble reads it to compute `isFeedbackForm`.

## Why we did it that way

**`review_form` is the carrier because the approval can't be.** The approval
metadata has no free field, and `submit_form` is argument-free by design (it
reads the session). But `review_form` runs in the **same turn and same bubble**
as the submit approval (the collection prompt instructs review-then-submit
together), and its output is session-derived — so it's the natural, already-typed
channel for the form id. `ReviewOutput` is inferred from the tool def, so the
field flows to the client with no extra plumbing.

**Latch via ref + state, not state alone.** The whole point is the window
*before* React repaints the disabled buttons. A `useState` flag wouldn't have
updated between two synchronous clicks; the ref blocks the second call
immediately, and the state exists only to re-render the disabled styling.

**One latch for all controls.** The bug is one mechanism (no click-time latch),
so the fix is one mechanism applied uniformly — not a submit-only patch that
leaves the identical bug latent on the rating pills (which is what actually
produced the duplicate in the report).

## Verification

- `nx run chat:build` — green. `nx run chat:test` — 78/78 pass.
- `apps/chat` has no React component-test harness and these are
  interaction/UI-level behaviours, so end-to-end is to be confirmed on the
  Amplify preview: (a) the feedback submit prompt reads "Submit your feedback?",
  and (b) rapidly double-clicking a rating or Submit no longer duplicates the
  block.

## Merge note

When this branch was merged up to `sandbox`, it turned out `sandbox` had
**independently fixed the same copy bug** — via an `isFeedback` boolean on
`review_form`'s output rather than the `formId` field this session added (the
reasoning was nearly identical: review runs in the same turn as the
argument-less submit approval, so it's the carrier). The conflict was resolved
by **converging on sandbox's `isFeedback`** and dropping this session's `formId`
plumbing. The shipped copy is sandbox's wording — `Submit your {feedback |
application} now?`. The double-submit latch (this session's unique contribution)
was preserved unchanged.

## Notes

- **Known narrow gap (accepted):** the latch is component-local, and the
  transcript is windowed by `useVirtualizer`, so scrolling a bubble out of view
  and back remounts it and resets `responded`. The dominant double-click case is
  covered (the bubble is on-screen then); the residual is click → scroll away and
  back → click again *before* the next message lands, after which
  `choicesDisabled` covers it anyway. Closing it fully would mean lifting the
  "responded" set to the parent keyed by message id — judged not worth the
  invasiveness for so narrow a window.
- **Separate, not fixed:** `form/submit.ts` falls back to a fresh `randomUUID()`
  idempotency key when `session.submissionId` is unset, so two requests that ever
  raced past the `status === "submitting"` guard wouldn't dedupe upstream. The
  client latch removes the trigger; the server-side hardening is a separate change
  if wanted.

## Open questions

None.
