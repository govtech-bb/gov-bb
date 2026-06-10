# Chat feedback: invitation wording + decline path

## Context

A follow-up to the model-initiated feedback offer (see
`2026-06-10-chat-feedback-model-initiated.md`). Watching a real transcript
surfaced two problems with how the offer reads:

1. The offer asked **"Before you go, how was this?"** — which mimics the form's
   real first field (*"How was your experience with the assistant?"*). The user
   answered it ("It was good"), but that reply is **discarded**: the
   `chat-feedback` form isn't pinned until the *next* turn, so collection hasn't
   started yet. The form then re-asks the same question. The first answer was
   wasted and the duplication looked broken.
2. The ask wanted the feedback questions to come only from the form, not from
   hardcoded prose.

The user chose to handle a declined invitation cleanly rather than only reword.

## What we did

- **Reworded the offer to an invitation, not the rating question.** Both
  `offer_feedback`'s tool description and `FEEDBACK_OFFER_GUIDANCE` now tell the
  model to ask *whether* the user wants to give feedback ("would you like to
  give us quick feedback?"), explicitly forbidding "how was this?" /
  "how was your experience?". The rating is only ever collected by the form's
  own `ask_field`, so concern #2 falls out for free — the only hardcoded
  feedback question is gone.
- **Added a decline path.** New no-arg `decline_feedback` tool +
  `cancelFeedbackForm` helper (unpins via `resetSessionForNewForm`, preserving
  `feedbackOffered`). `buildFeedbackTools()` binds the normal collect tools plus
  `decline_feedback`, and `run-turn.ts` uses it whenever the active collect form
  is `FEEDBACK_FORM_ID`. `FEEDBACK_COLLECTION_GUIDANCE` (appended only on the
  feedback-collect turn) tells the model: decline → call `decline_feedback` +
  warm sign-off; willing → collect normally, and never treat the reply to the
  invitation as the rating answer.

## Why we did it that way

- **Pin-on-offer is load-bearing.** The form-collection tools only bind when a
  collectible form is pinned, so `offer_feedback` must pin to make the *next*
  turn able to collect. We kept that and added an explicit unpin
  (`decline_feedback`) rather than switching to pin-on-accept, which would have
  cost an extra dead acknowledgement turn on the common (accept) path.
- **Decline needs a real unpin, not just prompt guidance.** Without it, a
  declined-but-still-pinned feedback form would trap the *next* user message in
  feedback-collection (and, because collected forms skip retrieval, silently
  ungrounded). This is exactly the lingering-pin limitation flagged as an open
  question in the prior summary; `decline_feedback` → `resetSessionForNewForm`
  closes it. `feedbackOffered` survives the reset, so a user who said no is
  never re-asked.
- **`cancelFeedbackForm` is a thin alias** for `resetSessionForNewForm`, kept
  for named intent (it reads as the decline counterpart to `pinFeedbackForm`)
  and to anchor a dedicated test. Reviewer flagged it as keep-or-inline; we kept
  it.

## What we almost got wrong

- The decline tool only matters for the feedback form — binding it on every
  collect form would let users bail out of real service applications through a
  generic "decline" tool. It's scoped to `FEEDBACK_FORM_ID` in both the
  tool-wiring and the guidance prompt.

## Open questions

- None blocking. Behaviour (LLM wording + decline flow) is only verifiable on
  the Amplify preview — chat has no component-test infra; build + the
  `feedback.test.ts` unit tests are the local gates.
