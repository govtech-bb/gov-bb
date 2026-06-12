# Matcher Tie Disambiguation — Implementation Session

**Date:** 2026-06-12
**Branch:** `worktree-matcher-tie-disambiguation`
**Issue:** [#1296](https://github.com/govtech-bb/gov-bb/issues/1296)

## Context

A broad chat request ("redirect mail") was being handed straight to one form
even when several forms matched it about equally well (redirect **personal**
mail / for an **individual** / for a **deceased person**). The user was forced
down one path instead of being asked which they meant.

Two paths route a request to a form in `apps/chat`:

1. The **title-token matcher** (`form/detect.ts`) — lexical overlap with a form
   title. It returned a single best, breaking ties by shortest `formId`, then
   pinned it (`resolution.kind = "collect"`).
2. **RAG-driven disambiguation** (ADR 0048, in `run-turn.ts`) — when the matcher
   pinned *nothing* and retrieval surfaced ≥2 distinct services, it already
   presents clickable choices instead of guessing.

The bug lived entirely in path 1: a tie was resolved silently. Path 2 already
did the right thing for its own trigger.

## What we did

- `detect.ts`: factored the scoring into a pure `matchFormCandidatesFromIndex`
  and added `matchFormCandidates`, returning the **within-margin** candidate set
  (near-tie margin **1**, capped at **3**, deterministic order).
  `matchFormsFromText` is now a thin `candidates[0]` shim.
- `routing.ts`: `pinSessionForm` uses a `matchCandidates` seam; when the
  effective match yields ≥2 candidates it **doesn't pin** — it records them as a
  pending disambiguation and returns their titles (new `PinResult`).
- `run-turn.ts`: feeds matcher-ambiguous titles into the **existing**
  `disambiguation` path (preferred over the RAG service candidates), reusing
  `buildDisambiguationDisclosure` verbatim.
- `funnel.ts` / `session.ts`: new `disambiguationForms` pending state with
  `offerDisambiguation` / `consumeDisambiguationChoice`.

## Why we did it that way

**Near-tie margin of 1, not exact-tie.** The user chose to "catch near ties to
be safe" — disambiguate whenever a rival sits within 1 point of the top, so a
weakly-distinguished winner doesn't get picked silently. The trade-off (called
out and accepted): with margin 1, even a phrase that names one variant more
specifically ("redirect mail for a deceased person", scoring that form 1 above
the others) still offers all of them. That's the deliberate "safe" bias.

**Reused the existing disambiguation surface rather than inventing one.** The
matcher tie produces the same `{ titles }` shape ADR 0048's RAG path already
feeds to `buildDisambiguationDisclosure` and the `offer-start` action
(present_choices only — no field tools, so collection can't be forced). A
matcher tie leaves the session unpinned, so it flows through the identical
gating.

**The tap had to resolve deterministically — this was the load-bearing fix.**
The first cut assumed "tapping a full title makes that form's extra tokens win
uniquely next turn." Code review caught that this is **false** at margin 1: on
the issue's own example, tapping "Redirect personal mail" scores that form 3 and
its siblings 2 — still within margin — so the matcher re-ties and the
disambiguation loops forever, and the server binds only `present_choices` so the
form never opens. The fix mirrors `consumeOfferReply`: store the candidates as a
pending offer and resolve the next turn's tap by **exact title match → pin**,
before the matcher runs. The pill sends its label verbatim (same contract the
offer/feedback pills rely on), so this is code, not model judgment.

**A lapsed choice matches the latest message only.** "Something else" (or a
topic switch) clears the pending offer and returns `{ kind: "lapsed" }`. If we
then matched the rolling 5-message window, it would still contain "redirect
mail" and re-offer the identical set — a second dead-end. So on a lapse the
matcher runs against `lastUserText` only: "Something else" names no form and
falls through to RAG / no-form, and a genuine topic switch re-decides on the new
text. (This mirrors the existing `handedOffSlug` defer trick, which exists to
dodge the same window-stickiness.)

## Known limitation

The disambiguation pills are emitted by the **model** via `present_choices`
(instructed to use the titles "EXACTLY"), not server-rendered like the feedback
disambiguation. This is the same model-fidelity reliance the pre-existing RAG
disambiguation already ships with; with `temperature: 0` and the explicit
instruction the risk is low, and the lapse-then-match-latest path degrades
gracefully if the model rewords a pill (it re-matches the reworded text rather
than hard-looping). Server-rendering these pills (as the feedback flow does)
would remove the reliance entirely and is the natural follow-up if it proves
flaky on the preview.

## Verification

- `nx run chat:test` → 247 pass (new `detect.test.ts`; updated `funnel.test.ts`,
  `routing.test.ts`).
- `nx run chat:build` → success.
- End-to-end "redirect mail" → choice list → tap → form, and the "Something
  else" escape, are verified on the Amplify preview (the chat app has no
  component-test infra; UI/model behaviour is a preview gate).

## Open questions

None blocking. Spot-check a second broad phrase on the preview to confirm the
generic tie-detection covers more than the mail example (per the issue's
"audit other phrases" note).
