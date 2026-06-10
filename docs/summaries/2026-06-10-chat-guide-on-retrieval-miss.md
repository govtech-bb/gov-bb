# Chat: guide toward the closest service instead of dead-ending on a miss

## Context

[#1099](https://github.com/govtech-bb/gov-bb/issues/1099): when the chat had no
retrieved context for a question it tended to dead-end (*"I don't have that
detail right now"*) instead of keeping the user moving. The only recovery
instruction was the under-specified "offer the next-best step" half of the
STRICT RAG rule, so the model frequently stopped at the decline.

## What we did

- Reworked the STRICT RAG recovery in `SYSTEM_PROMPT` (`prompts.ts`): never
  hard-stop; pair any limitation with a forward step (name what *was* found, or
  ask one clarifying question); kept the no-invented-services guarantee; made it
  explicitly subordinate to ILLEGITIMATE REQUESTS.
- Added `buildMissDisclosure()` and routed it in `run-turn.ts`'s
  `buildSystemPrompts` via a new `noContext` flag
  (`citations.length === 0 && !skipRetrieval && !rewrite.illegitimate`),
  replacing the misapplied `NO_FORM_DISCLOSURE` on genuine no-context turns.
- Added a `"miss"` eval category (`eval/responses/run.ts` judge + `cases.json`)
  with three out-of-corpus cases; existing `ambiguous`/`refusal` cases stay as
  regression guards.
- Recorded the sourcing principle as ADR 0046.

## Why we did it that way

The phrase "surface the closest matching services" hides a real fork. On a true
miss the citation block is empty, so a prompt-only change can't name anything
unless we relax retrieval to surface sub-threshold matches. We deliberately did
**not** do that: `rag/config.ts` documents that the highest-similarity *wrong*
matches are the dangerous ones (passport↔certificates,
driver's-licence↔conductor-licence), so naming them would mislead. That tradeoff
is the whole reason the recovery splits by where the context is — off-target
hits (citations present) get "name what I found"; pure misses get a clarifying
question only. ADR 0046 is the durable record of that choice.

The routing fix matters as much as the prompt text. A `none` resolution was
unconditionally pushing `NO_FORM_DISCLOSURE` — titled *"NO ONLINE FORM
AVAILABLE"* and instructing the model to "answer the substance from the
context." On a genuine miss there is no context, so that disclosure was actively
nudging the curt dead-end. `noContext` excludes greetings (`skipRetrieval`) and
illegitimate requests so those keep their existing behaviour — in particular,
fraud requests stay on the decline path and are never invited to "clarify."

The change was built on a worktree branched from the default branch, which does
*not* carry the unmerged model-initiated feedback-offer work. That kept
`buildSystemPrompts` simpler than the plan assumed (no `offerFeedback`
interaction) — a welcome simplification, noted so a future reader isn't confused
that the plan's file references mention feedback wiring.

## What we almost got wrong

The first instinct (and the issue's own "Scope / notes") was to add a relaxed
retrieval pass to source "closest" suggestions. Following that without the
config caveat would have shipped a bot that confidently suggests the wrong
service. Surfacing it during discussion flipped the design to "above-threshold
only."

Verification also nearly tripped: the fresh worktree had no `node_modules`, so
the `form/*` tests failed on unresolved workspace packages — looked like
breakage but was purely the missing install. Resolved by `pnpm install` in the
worktree; full suite then passed 78/78.

## Open questions

- The relaxed-retrieval pass is deferred, not dead. If the `miss`-category evals
  on the preview show pure near-misses still dead-ending too often, revisit ADR
  0046's "future relaxed pass must clear a confidence bar" clause.
