# 0046 — Chat service suggestions must be above-threshold grounded

**Date:** 2026-06-10
**Status:** Accepted

## Context

Issue [#1099](https://github.com/govtech-bb/gov-bb/issues/1099) reported that on
a retrieval miss the chat tends to dead-end (*"I don't have that detail right
now"*) and leaves the user with nowhere to go. The desired behaviour is to keep
guiding: ask a clarifying question and surface the closest matching services so
the user can explore the nearest path.

"Surface the closest matching services" raised a sourcing question. On a turn
where nothing clears `SCORE_THRESHOLD` (0.45), `buildCitedContext` returns
`(no relevant context found)` and zero citations — but the sub-threshold matches
are still sitting in `rawSources`. The obvious-looking move is to surface those
as "closest" suggestions.

We rejected that. The `rag/config.ts` tuning note documents that the most
dangerous out-of-corpus failures are *high-similarity wrong matches*:
passport↔certificates, driver's-licence↔conductor-licence,
visa↔financial-assistance. These are exactly the candidates a relaxed pass would
surface. Suggesting "did you mean Conductor Licence?" to someone asking about a
driver's licence is confidently misleading — worse than admitting the miss.

## Decision

**User-facing service suggestions may be sourced only from above-threshold
(trustworthy) retrieved context. Sub-threshold near-miss matches are never
surfaced as suggestions.**

Concretely, recovery on a miss splits by where the context actually is:

- **Off-target hit** — something cleared the threshold, just not what the user
  asked. Citations exist, so the model already has trustworthy context. The
  always-on STRICT RAG recovery (`prompts.ts`) tells it to name what it *did*
  find and ask whether that's what they meant.
- **Pure miss** — nothing clears the threshold. `buildMissDisclosure`
  (`prompts.ts`), routed in `buildSystemPrompts` when retrieval was attempted
  and returned zero citations, tells the model to ask one focused clarifying
  question and to name nothing it can't see. No sub-threshold titles are
  surfaced.

This composes with, and is subordinate to, the ILLEGITIMATE REQUESTS rule: a
fraud/falsification miss is declined, not "guided."

## Consequences

- **No confidently-wrong suggestions.** The chat will not steer a passport
  seeker to the conductor-licence form just because it scored highest among
  weak matches. The cost is that on a pure near-miss it asks to clarify rather
  than naming a candidate.
- **A future relaxed-retrieval pass must respect this.** Surfacing sub-threshold
  candidates as suggestions would overturn this record. If a relaxed pass is
  added (e.g. to source "closest" titles), it must either clear a suitable
  confidence bar or present candidates as tentative coverage examples, never as
  confident answers — and this record should be revisited explicitly.
- **`NO_FORM_DISCLOSURE` stays scoped to its real case.** It now fires only when
  there *is* above-threshold context for an in-corpus service with no online
  form; the genuine-miss turns it was being misapplied to now get
  `buildMissDisclosure` instead.
