# Project Protégé Mentor Chatbot Bugs (#899) — Implementation Session

**Date:** 2026-06-09
**Branches:** `chat/autoscroll-protege-899`, `chat/form-prompt-adherence-899` (both → `sandbox`)
**Issue:** [#899](https://github.com/govtech-bb/gov-bb/issues/899)

## Context

Issue #899 reported four problems against the *Apply to be a Project Protégé
mentor* chatbot flow (`apps/chat`): (1) the chat doesn't reliably auto-scroll to
the latest output, (2) it opens with "What is your educational status?" whose
options can't be selected, (3+4) it asks for date of birth twice, and a
suggestion to label the second referee distinctly instead of a generic "add a
reference".

There were no GitHub sub-issues — the four are listed inline in the body.

## What we did

Split into two independent worktrees, each its own PR against `sandbox`, both
referencing #899:

- **`chat/autoscroll-protege-899`** — `apps/chat/src/routes/index.tsx`. Added a
  `stickToBottomRef` updated on scroll from the real-DOM `isAtEnd()` signal, plus
  a `useLayoutEffect` that re-pins to the end on every list growth (`rows.length`
  for appends, `getTotalSize()` for streaming deltas) — but only when the reader
  was already at the bottom.
- **`chat/form-prompt-adherence-899`** — `apps/chat/src/lib/chat/prompts.ts`.
  Four surgical edits to `SYSTEM_PROMPT`'s FORM COLLECTION section: use the
  field's exact label verbatim; always route closed-set questions through
  `present_choices` (never plain text); ask each field once and advance to the
  next *unfilled* field; use each referee step's distinguishing title.

## Why we did it that way

**The four issues split across two layers, only one of which is
deterministic.** Auto-scroll is a real frontend bug. The other three are the
LLM disobeying instructions it largely already had — the recipe says
"employment status" (never "educational"; confirmed via git history), the schema
serializer already skips the hidden declaration-date DOB, and `run-turn.ts`
already emits an "Already collected (do NOT re-ask…)" block. So those three are
prompt-adherence, fixable only by tuning `prompts.ts`, and they all touch that
one file. That killed the original "one sub-agent per issue, four worktrees"
framing: three of four would have collided on `prompts.ts`. We landed on two
worktrees — frontend vs. prompt — which are conflict-free (different files).

**The DOB fix deliberately avoids an absolute "never re-ask".** The obvious
phrasing — "never re-ask a collected field" — is actively harmful here.
`set_field` (`form/tools.ts`) does **no value validation**; it records whatever
the model passes, and recipe validations only fire upstream at submit. So an
absolute ban would (a) trap a user trying to correct a value and (b) strand bad
input until submit. The fix is framed positively ("advance to the next unfilled
field") and explicitly preserves both legitimate re-ask paths: the user wants to
change a value, or `submit_form` returned a validation error naming the field.
The existing run-turn.ts "unless the user wants to change them" carve-out was
left untouched. (This nuance was caught by the user reviewing the plan.)

**Auto-scroll root cause: virtual distance lags real-DOM height during
streaming.** Confirmed against `@tanstack/react-virtual@3.13.26` that the
library's streaming-growth pin gates on `getVirtualDistanceFromEnd` (a virtual
measure from `getTotalSize()`), while the "Jump to latest" button uses
`isAtEnd()` (real-DOM `scrollHeight`). As the assistant bubble appends tiny and
grows via `measureElement`, its virtual size lags the real height, so the
library can read "not at end" and stop following. The fix re-pins from the same
real-DOM signal the button uses, so the two never disagree. It is a reasoned
hypothesis (documented in a code comment) — `apps/chat` has no component-test
infra and the behaviour can't be reproduced without a browser, so it is to be
confirmed on the Amplify preview.

**Verification is build + manual preview repro, not tests.** `apps/chat` has no
nx `lint` target and no React component-test harness (its only test is
`tsx --test` on `messages.test.ts`). Build is the only local gate (green in both
worktrees; the 6 existing tests still pass). Behavioural repro happens on each
branch's Amplify preview — agreed up front, since a subagent in a worktree can
run neither a browser nor Bedrock.

## Open questions

None blocking. Both fixes need manual confirmation on their Amplify previews
before merge; #899 stays open until both PRs land.
