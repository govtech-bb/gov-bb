# Auto-offer feedback after a completed in-chat application

Follow-up to #1203 / #1220 (same session, earlier today).

## Context

#1220 made post-submission feedback *possible*: after a real `collect` form
submitted, `pinSessionForm` parked it so a later turn could resolve to `none`
and the model *might* offer feedback via `offer_feedback`. The ask was to
streamline that: at the end of a submission, just ask for feedback **once**,
in place of the generic "Anything else I can help with?" wrap-up.

## What we did

- `form/routing.ts` `pinSessionForm`: the submitted-form branch is now
  three-way — feedback form → `resetSessionForNewForm`; real form &
  `!feedbackOffered` → **`pinFeedbackForm` (auto-offer)**; real form & already
  offered → `parkHandoff` (no second ask).
- `prompt-builder.ts`: on a real-form collect turn with `!feedbackOffered`,
  append forward-looking guidance — *after a successful `submit_form` this turn,
  invite feedback once instead of "Anything else I can help with?"*.
- Tests for both the auto-pin and already-offered park paths, and for the
  collect-turn invitation guidance (present / withheld / excluded-for-feedback).

## Why we did it that way

**Auto-pin over a model-decided offer.** `pinFeedbackForm` produces a zero-value
`chat-feedback` pin, which the existing #1202 logic already treats as an *open
offer* with topic-switch / info-question escape hatches. So the auto-pin reuses
all of that machinery: the turn after submission, a "yes" is collected, a "no"
is declined, and a topic switch escapes — identical to a model-initiated offer,
but guaranteed and exactly once (`feedbackOffered` is set on pin). This
supersedes #1220's not-yet-offered park branch; the model's `offer_feedback`
path stays for non-submission endings (info chats, handoffs).

**The invitation had to be forward-looking guidance on the collect turn — not a
"submitted" branch.** The first implementation gated the invitation on
`session.status === "submitted"` in the prompt builder. Code review caught that
this is **unreachable**: `buildSystemPrompts` runs at turn start
(`run-turn.ts:262`), but `submit_form` sets `status="submitted"` mid-stream
(`tools.ts:310`) — so at prompt-build time the status is still `"collecting"` —
and `pinSessionForm` unpins the form the next turn, so the submitted branch never
fires in a real turn. The isolated unit test masked it by constructing a
`submitted` session directly. The fix: the post-submit reply is composed *this*
turn, so the invitation must live on the collect turn (the form is pinned,
status `collecting`, `feedbackOffered` known at build time), phrased
conditionally ("AFTER A SUCCESSFUL submit_form THIS TURN"). The dead
`submitted`-block edit was reverted to its original plain reference line.

## What we almost got wrong

Assuming the prompt builder's `status === "submitted"` block runs on (or right
after) the submit turn. It doesn't — and #1220 had already quietly made that
block unreachable when it started unpinning submitted forms. The reference
number still reaches the user via the base `SUBMIT RESULT` prompt + the tool
result, so there was no user-facing regression, but it's why the invitation
could not live there.

## Open questions

One residual, flagged in review: the invitation guidance is present on *every*
real-form collect turn (it's conditioned on a successful submit, which is
code-gated and can't happen early). At temperature 0 the model could in
principle paraphrase the conditional as an unconditional ask mid-collection.
Low risk, but worth a look on the Amplify preview — confirm feedback is only
invited after the application actually submits.
