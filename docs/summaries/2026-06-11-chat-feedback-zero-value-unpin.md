# Chat feedback: release a zero-value feedback pin on a topic switch

## Context

Issue #1202. `offer_feedback` pins the `chat-feedback` form **on offer**
(`pinFeedbackForm`) — a deliberate design that keeps the accept path one turn
shorter (see `2026-06-10-chat-feedback-decline-flow.md`). But pin-on-offer left
a trap: if the user's *next* message is a new question rather than a yes/no,
`pinSessionForm` early-returns (a non-submitted form is pinned), so the matcher
can't re-route. The feedback form then resolves to `collect` with empty values,
and an info-question triggers `offerOnly` → action `offer-start`, which binds
**only `present_choices`** — no field tools, no `decline_feedback`, and RAG
fallback/disambiguation suppressed (`resolution.kind !== "none"`). A user who
asked "how do I renew my passport?" right after the invite could neither get an
answer nor cleanly decline.

## What we did

Added a branch to `pinSessionForm` (before the `slug && status !== "submitted"`
early-return) that treats a **zero-value** `chat-feedback` pin as a still-open
offer, keyed off the **latest message only** (not the rolling window, which
still names the pre-feedback conversation):

- latest message matches a **different** form → `pinForm` to it (topic switch to
  another service);
- else `isInfoQuestion(latest)` with no match → `resetSessionForNewForm` and
  re-assert `feedbackOffered = true`, releasing the pin to normal `kind: "none"`
  routing so RAG answers the question;
- else (a yes/no-shaped reply) → fall through and stay pinned for the
  `collect-feedback` turn.

Four unit tests in `routing.test.ts` cover release-on-question, re-pin-on-match,
yes/no-stays-pinned, and in-progress-(values-present)-stays-pinned (matcher not
consulted).

## Why we did it that way

- **Chose unpin-on-topic-switch over pin-on-accept** (the issue's two options).
  Pin-on-accept reverses a deliberate prior decision and is a larger change to
  the `offerForm`/`consumeOfferReply` machinery (feedback needs different choice
  pills than the verbatim FILL/LINK labels). Releasing a zero-value pin is the
  surgical fix and preserves the cheap accept path.
- **Latest-message-only matching.** The rolling window still names the topic
  that *led* to the feedback offer, so matching it would risk re-pinning the
  just-finished service. The latest message is the only reliable signal for "the
  user has moved on."
- **Guarded on zero values.** A feedback form the user has already started
  (gave a rating, then asks a question) stays pinned and grounded via
  `retrievalBoostSlug` — we only release the *pure-offer* state.
- **Re-assert `feedbackOffered` on release.** `resetSessionForNewForm` already
  preserves it, but re-asserting makes the "implicit decline → never re-offer
  this session" invariant hold regardless of how a zero-value pin was reached.

## What we almost got wrong / known limitation

- The release condition keys off "info-question OR matches another form," not
  the broader "isn't an accept/decline reply." A **non-question** topic switch
  the token-matcher misses (e.g. a bare `"passport"`) still falls through and
  stays pinned. We **accepted this as a documented limitation**: it does *not*
  hit the reported hard trap — it routes to `collect-feedback`, where
  `decline_feedback` and the field tools are bound, so the model can still bow
  out. Widening to "release unless yes/no-shaped" would need a reliable
  affirmative/negative detector and would risk releasing genuine terse accepts
  (`"ok"`, `"sure"`), which we want to keep pinned.

## Open questions

- None blocking. As with the rest of the feedback flow, the model-facing
  behaviour is only fully verifiable on the Amplify preview; `chat:build` +
  `chat:test` are the local gates, and the trap itself is deterministic and
  unit-tested.
