# Chat feedback: release a zero-value feedback pin via the RAG backstop

## Context

Follow-up to #1202 / PR #1221. #1221 added a `pinSessionForm` branch that
released a zero-value `chat-feedback` pin on an **info-question** or a
**title-matcher hit**, and we knowingly accepted a residual: a *non-question*
topic switch the matcher misses stays pinned. A real transcript showed that
residual is unacceptable in practice:

```
user: I would like to give feedback on the assistant   (matcher-pins feedback)
asst: How was your experience with the assistant?        (first field asked)
user: conductor license                                  (TRAP — stays pinned)
asst: <confused: "are you asking about the licence, or the feedback form?">
user: yeah let me apply for conductor license            (still pinned, loops)
```

Root cause, confirmed: the token matcher needs ≥2 overlapping title tokens
(`detect.ts` `MIN_SCORE = 2`), and the tokenizer does no licence/license
normalisation — so `"conductor license"` shares only `conductor` with the
"Conductor's Licence" title (score 1 → no match). It is also not an
info-question. So #1221's release never fires.

The deeper cause: a *fresh* user typing `"conductor license"` still reaches the
form — not via the matcher (it misses too) but via the **RAG fallback backstop**
(`applyRagFallback` → `topHandoffCandidateSlug`, which is semantic and
spelling-tolerant). That backstop is gated off whenever a form is pinned
(`resolution.kind === "none" && !session.slug`). A zero-value feedback pin is
really just an open offer, yet it suppresses the backstop that rescues the weak
matcher everywhere else.

## What we did

- **New pure helper `shouldReleaseFeedbackOffer(resolution, valueCount,
  hasServiceCandidate)`** in `feedback.ts` — the mirror of
  `shouldBindFeedbackOffer` on the other side of the offer. True when the active
  form is `chat-feedback`, no values are collected yet, and this turn's
  retrieval surfaced a real service candidate.
- **Release in `run-turn.ts`**, right after `buildCitedContext` (so `rawSources`
  is populated) and *before* the disambiguation / `applyRagFallback` gates: if
  `shouldReleaseFeedbackOffer` is true, `cancelFeedbackForm(session)` (preserving
  `feedbackOffered`, re-asserted for the never-re-offer invariant) and set
  `resolution = { kind: "none" }`. Both clear the pin so the two backstops below
  re-engage and route the topic switch like any no-form turn.
- Five unit tests in `feedback.test.ts` for the helper (release; hold when no
  service; hold mid-collection; never release a real service form; no-form).

## Why we did it that way

- **RAG is the right signal, not the token matcher.** The matcher is a cheap
  pre-retrieval heuristic that misses natural phrasings and spelling. RAG
  retrieval already backstops it everywhere except behind a pinned form. The fix
  simply stops a zero-value feedback *offer* from suppressing that backstop —
  principled and aligned with the existing routing, not a new mechanism.
- **Kept #1221's `pinSessionForm` branch as a first layer** (defense in depth):
  it releases pre-retrieval on a clean matcher hit or an info-question, cheaply,
  for turns where retrieval is skipped. The RAG release is the strong backstop
  for the common case.
- **`valueCount === 0` gate.** Once the user answers the rating the form is real
  collection (grounded via `retrievalBoostSlug`), never released. Because the
  first field is a *select* rating, picking an option ends the release window
  immediately.

## Known tradeoff

A free-text reply to the rating prompt that surfaces an above-threshold service
("it was good but I couldn't renew my passport") can false-release the pin
before a rating is captured, abandoning the feedback. Low probability, mitigated
by the select rating field (a click captures a value and closes the window), and
recoverable (feedback can be re-triggered). Accepted as the cost of using the
robust RAG signal.

## Verification

`chat:build` + `chat:test` (180 tests) green. The `run-turn` integration
(slug → null, `applyRagFallback` routes the handoff) is not unit-tested — chat
has no component-test infra — so it's verified on the Amplify preview, per the
chat-app gates. The decision logic itself is deterministic and unit-tested.
