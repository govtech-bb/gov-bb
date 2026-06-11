# Cap clarifying questions on a miss — clarify once, then disclose (#1176)

## Context

[#1176](https://github.com/govtech-bb/gov-bb/issues/1176) flagged that on a
retrieval miss (zero grounded context) the assistant kept asking clarifying
questions turn over turn with no stopping point. The miss-recovery added for
[#1099](https://github.com/govtech-bb/gov-bb/issues/1099) deliberately never
hard-stops on the first miss — but its "keep guiding turn over turn" instruction
(`buildMissDisclosure`) had no exit, so when a clarified query still grounded
nothing the assistant looped, reading as going in circles instead of admitting
it can't help.

Resolved on `chat-clarify-once-then-disclose` (targets `sandbox`).

## What we did

- Added `consecutiveMisses` to `FormSession` and a `recordMissOutcome(session,
  noContext)` transition in `form/funnel.ts`: a miss increments the streak, any
  non-miss turn resets it, and it returns `{ clarifyExhausted }` (true on the
  2nd+ consecutive miss). It sits with the other code-derived funnel transitions
  (ADR 0048) — the model only executes the chosen disclosure.
- New `buildCantHelpDisclosure()` in `prompts.ts`: warmly says it can't help,
  forbids another clarifying question, invents nothing, no paper/in-person push,
  and ends with the exact line `Anything else I can help with?`.
- `prompt-builder.ts` `noContext` branch now picks `buildCantHelpDisclosure()`
  when `missClarifyExhausted`, else the existing `buildMissDisclosure()`.
- `run-turn.ts` calls `recordMissOutcome` right after computing `noContext` and
  threads `missClarifyExhausted` into `buildSystemPrompts`.
- Tests (red-first): funnel counter increment/reset/exhaust-at-2; the can't-help
  disclosure contract; the prompt-builder routing switch.

## Why we did it that way

- **Binary miss signal, not a new score threshold.** The issue asked us to
  decide the "context score still low" condition. We reused the existing binary
  `noContext` (zero citations) rather than reading similarity scores. The
  highest-similarity near-misses are exactly the dangerous ones (passport vs
  certificates, etc. — the reason `buildMissDisclosure` already refuses to name
  "closest" services), so a numeric band would add a tunable that risks
  confidently misclassifying. Consistent with the #1099 definition of a miss.
- **State on the session, not in history.** Consecutive-miss counting is funnel
  state like the rest (`slug`, `status`, `offeredForm`), so it lives on the
  server-side `FormSession` and resets through the same `resetSessionForNewForm`
  path. Greeting/closer/active-collection turns aren't misses, so they reset the
  streak too — a topic change starts a fresh clarify.
- **Reused the closer path for feedback instead of new wiring.** Per the agreed
  behaviour, the can't-help turn keeps the feedback offer suppressed (it's still
  a miss turn) and ends with `Anything else I can help with?`. A follow-up "no"
  is then caught by the existing `isConversationalCloser` (`WRAP_UP_RE =
  /anything else/i`), which routes to `CLOSER_GUIDANCE` + the feedback offer.
  No change to the feedback-offer logic.
- **Cap at 2 (clarify once).** A single constant (`>= 2`) decides exhaustion;
  if product later wants two clarifications before disclosing, it's a one-line
  change.

## Note on code drift

The dev-plan was written against the pre-funnel chat code. By implementation the
sandbox had moved on: `buildSystemPrompts` now lives in `prompt-builder.ts` as a
pure function over `PromptTurnState`, session state is fronted by the
`form/funnel.ts` state machine (ADR 0048), and the miss path no longer carries an
illegitimate-request carve-out (fraud declines lean on the base model now). The
implementation followed the actual sandbox shape; the design held.

## Follow-up

- The can't-help copy is model-generated; verify on the PR's Amplify preview
  (live RAG + Bedrock): miss → one clarify → still-miss → can't-help ending in
  "Anything else…" → "no" → warm sign-off + feedback offer.
