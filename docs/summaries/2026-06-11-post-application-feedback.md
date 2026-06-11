# Feedback offer after a completed in-chat application

Issue: [#1203](https://github.com/govtech-bb/gov-bb/issues/1203)

## Context

Model-initiated feedback could fire after informational chats and parked
handoffs, but never after a user completed a real `collect` application in
chat — arguably the most natural moment to ask. Only the banner "Give feedback"
link remained there.

## What we did

- Generalized the terminal-form handling in `pinSessionForm`
  (`apps/chat/src/lib/chat/form/routing.ts`): any submitted form is now
  unpinned on the next turn, not just `chat-feedback`. Feedback clears via
  `resetSessionForNewForm` (unchanged); a real service form is **parked** via
  `parkHandoff(session, session.slug)`.
- Added a `routing.test.ts` case covering the real-form park path.

## Why we did it that way

The bug: `submit_form` sets `status = "submitted"` but leaves `session.slug`
pinned. The next turn's matcher re-pins the just-completed form from the rolling
window, `resolveActiveForm` keeps returning `kind: "collect"`, and
`shouldBindFeedbackOffer` (which requires `"none"`) never fires.

We **parked** the submitted real form rather than fully resetting it. A bare
`resetSessionForNewForm` clears `handedOffSlug` too, so the rolling-window
matcher could immediately re-pin the same form from the user's earlier
application messages — reintroducing the wedge. Parking sets `handedOffSlug`,
which makes the matcher defer to the user's **latest** message: "thanks, bye"
stays unpinned (→ resolution `none` → feedback can be offered), while a fresh
mention of any service re-engages via `pinForm`'s reset-on-switch. This reuses
the exact park semantics the matcher-driven and RAG-driven handoffs already use,
rather than inventing a parallel special case.

No prompt-builder or tool changes were needed: once resolution is `none`, the
existing closer (`CLOSER_GUIDANCE` + `FEEDBACK_OFFER_GUIDANCE`) and no-form
(`NO_FORM_DISCLOSURE` + `FEEDBACK_OFFER_GUIDANCE`) paths already invite feedback.
The offer can only fire the turn *after* submission (`pinSessionForm` runs at the
start of a turn, before resolution), so the reference-number confirmation is
delivered cleanly first.

The no-resubmit guard is untouched: with the form parked, `slug` is `null`, so
`submit_form` isn't even bound on the parked turn.

## Open questions

None blocking. One known interaction (pre-existing, not introduced here): a
post-submission turn that is a *same-topic* follow-up rather than a closer (e.g.
"can I track it?") hits `decideRagFallback`'s `"continuation"` branch, which sets
`handoffContinuation` and suppresses the feedback offer for that turn. Feedback
still fires on the next closer / non-continuation turn, so the #1203 goal holds —
worth knowing if we later want the offer to win on same-topic follow-ups too.
