# 48. Chat funnel is an explicit state machine; RAG matches become confirmable offers

Date: 2026-06-11

Supersedes, in part: [45. Chat form handoff can be RAG-driven](0045-chat-form-handoff-can-be-rag-driven.md)

## Status

Accepted

## Context

ADR 0045 allowed the RAG fallback to hand off a **link** for handoff-required
forms, but forbade it from ever starting inline collection: "if inline
collection ever needs a second trigger, revisit this record rather than
quietly widening the fallback." This is that revisit.

Two problems had accumulated:

1. **The same need produced two different experiences depending on phrasing.**
   "I want to redirect my mail" overlaps the form title, so the lexical
   matcher pins the form and full guided collection starts. "I'm moving
   house, how do I get my letters sent to the new place?" has no title-token
   overlap; only RAG finds the service, and under ADR 0045 the user got a
   bare link. The *weaker* signal (token overlap) granted the *richer*
   experience, and users who phrase needs naturally — including Bajan
   speakers, whose raw text rarely overlaps formal titles — systematically
   got the lesser path.

2. **The session had become an unwritten state machine.** `slug`, `status`,
   `handedOffSlug`, `askedFieldIds`, `reviewedSinceChange` encode a funnel
   (exploring → collecting → submitted, with handed-off and cancelled
   parkings), but the transitions lived as scattered field mutations across
   run-turn, routing, and the cancel tool. Each new behaviour added another
   ad-hoc field and another scattered guard.

## Decision

**1. The funnel is explicit.** `form/funnel.ts` derives a named
`FunnelPhase` (exploring / offered / collecting / submitting / submitted /
failed / handed-off) from the session and owns every transition as a named
function (`pinForm`, `parkHandoff`, `offerForm`, `consumeOfferReply`,
`cancelForm`). No code outside the funnel and `resetSessionForNewForm`
mutates funnel-relevant session fields.

**2. A confident RAG match for a collect-capable form produces an OFFER, not
a link.** The model is instructed to present two choices verbatim —
"Fill it out with you here" / "Just send me the link" — and the server acts
on the **exact strings**: fill pins the form (collection starts next turn),
link parks it and delivers the URL. ADR 0045's underlying concern was that
fuzzy semantic matches must not *non-deterministically* start collection;
the user's tap is the deterministic confidence top-up, so collection still
never starts on a fuzzy match alone. Any other reply lapses the offer.

**3. Tool binding derives from a code-chosen turn action.** The turn action
(collect / collect-feedback / offer-start / feedback-offer / none) is
computed in run-turn and maps to a fixed toolset. An offer turn binds
`present_choices` only — the model cannot upgrade an offer into collection
because the field tools are not registered.

## Consequences

- **Phrasing no longer changes the experience class.** Natural phrasings get
  the same fill-here/link choice the title matcher's info path already
  offered; the only difference from a lexical match is one confirm tap.
- **ADR 0045's handoff behaviour is unchanged** for handoff-mode forms
  (payment/upload/policy): fresh handoff links and continuations work as
  before. Only the collect-capable branch is upgraded from link to offer.
- **Offers are single-turn.** An unrelated reply lapses the offer; a fresh
  strong match re-offers. Typed affirmatives ("yes please") are not matched
  by the exact-string consume — they fall through to normal routing, where
  the rewrite + matcher path handles them. The clickable pills are the
  primary affordance.
- **The funnel phases are the hook for what's next**: server-driven
  disambiguation (narrowing), compound-request queueing, and decision-table
  routing all become transitions on this machine rather than new ad-hoc
  fields (the staged plan lives in the chat roadmap discussion of
  2026-06-11).
- **Candidate generation still runs on raw user text** for the lexical
  matcher; unifying it with the rewritten (standard-English) query is the
  next stage — until then, dialect phrasings reach forms via the RAG offer
  path rather than the matcher.
