# End-of-conversation feedback flow

**Branch:** `worktree-end-of-conversation-feedback-flow` → `sandbox`
**Issue:** [#1125](https://github.com/govtech-bb/gov-bb/issues/1125)

## Context

The chat assistant never invited feedback at the end of a conversation. The
reported transcript: a user applies for a conductor licence (a handoff form, so
the session parks with `slug = null`), then says "thank you, bye" — and the bot
just signs off, no feedback offer.

Root cause was an interaction with #1099 (commit `4a239f07`, "guide toward the
closest service on a retrieval miss"). The feedback offer in `run-turn.ts` is
gated by `!noContext`, and `noContext = citations.length === 0 && !skipRetrieval
&& !illegitimate`. A conversational closer ("thank you, bye") isn't caught by
`isGreetingOrTooShort` (that only matches `hi`/`hello`/…), so retrieval runs,
returns zero grounded citations, and `noContext` goes true — suppressing the
offer and routing the turn to the "guide toward the closest service" miss path.

The crux: a closer and a genuine retrieval miss are **identical at the
citation-count level** (both zero), so the guard can't tell them apart and
guesses "miss." Because a "thanks/bye" closer never retrieves grounded context,
the feedback offer was effectively unreachable.

## What we did

- **`isConversationalCloser(latest, prevAssistantText)`** (`retrieval.ts`) —
  content-based, two tiers. Unambiguous closers (`bye`, `thanks`, `that's all`,
  `no thanks`, `cheers`, "thanks for your help") always fire. Ambiguous terse
  replies (`no`, `ok`, `nope`, `nah`) fire **only** when the previous assistant
  message asked the wrap-up question (matched via `/anything else/i`). A message
  ending in `?` is never a closer.
- **`lastAssistantText(messages)`** (`messages.ts`) — mirrors `lastUserText`, so
  the ambiguous tier can read what we just said.
- **`run-turn.ts`** — computes `closer` (gated to non-`collect` turns), folds it
  into `skipRetrieval` (so `noContext` can't trip), and adds a dedicated closer
  branch in `buildSystemPrompts`, placed before the `noContext` branch.
- **`prompts.ts`** — new `CLOSER_GUIDANCE` (brief warm sign-off, no
  re-explaining), plus a `WRAP-UP` instruction in `SYSTEM_PROMPT` so a completed
  answer ends with the fixed phrase "Anything else I can help with?".

Resulting flow: substantial answer ends with "anything else?" → user says
"no"/"ok" (ambiguous, but we asked) or any unambiguous exit ("bye", "thanks") →
warm sign-off + a one-time feedback invitation. Genuine misses keep the
`buildMissDisclosure` path unchanged.

## Why we did it that way

**Content-based detection, not a new session flag.** The distinction between a
closer and a miss has to come from message content — citation count can't
separate them. We rejected a tracked `wrapUpOffered` session flag (more state to
keep coherent) in favour of prompt guidance for the "anything else?" step, so no
new server-side state.

**Two tiers because terse words are context-dependent.** A bare "no"/"ok" is a
goodbye after "anything else?" but a field answer mid-form. Hence the
`resolution.kind !== "collect"` gate plus the prior-assistant-message check —
unambiguous farewells skip the context check entirely (they catch the exact bug
transcript).

**Closer branch before `noContext`, feeding the existing machinery.** Rather
than special-casing the `offerFeedback` guard, a closer sets `skipRetrieval`,
which makes `noContext` false through the existing logic; the new branch then
replaces both the miss disclosure and `NO_FORM_DISCLOSURE` (whose "answer the
substance from the context" instruction is meaningless on a goodbye).

**Fixed wrap-up wording.** The `/anything else/i` matcher and the prompt's
mandated "Anything else I can help with?" must stay in lockstep — if the phrasing
is tuned later, the regex has to move with it.

## Verification

`apps/chat` has no run-turn unit harness and no component-test infra (build is
the local gate; behaviour is verified on the Amplify preview). The two pure
functions carry direct unit coverage in `retrieval.test.ts` and
`messages.test.ts` — including the exact #1125 transcript, both tiers, the
wrap-up gating, and question-rejection. `chat:test` 84/84 pass; `chat:build`
green (both `--skip-nx-cache`).

## Note

Mid-session the first round of edits accidentally landed in the main repo
working tree (main-repo absolute paths) instead of the worktree, so the initial
"78 pass" was the worktree's *old* suite — the new tests hadn't run. Caught it,
moved the changes into the worktree, reverted the main repo to clean, and
re-verified for real (which surfaced and fixed one wrong test assertion about
"thanks for &lt;arbitrary noun&gt;").
