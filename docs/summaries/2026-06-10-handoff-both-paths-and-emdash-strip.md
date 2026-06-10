# Handoff link response shows both paths; em dashes stripped in code (#1079 follow-up)

## Context

A follow-up to the online-first nudge (#1079). Reviewing a live birth-certificate
handoff reply surfaced two issues: (1) it contained an em dash, which the
SYSTEM_PROMPT bans but the model emitted anyway; (2) the handoff disclosure
forbade mentioning the paper / in-person route at all, but we want users to see
**both** paths (online first, in-person as a fallback). Done on
`worktree-handoff-both-paths-emdash` (targets `sandbox`).

## What we did

- **`normalize-markdown.ts`** — added a deterministic em/en dash strip
  (`/\s*[—–]\s*/g` → `", "`) at the top of `normalizeMarkdown`. This runs on
  every render (`bubble.tsx`), including streaming, so a dash can never reach the
  user regardless of what the model emits. Plain hyphens (`self-employed`) are
  untouched. New `normalize-markdown.test.ts` covers it.
- **`prompts.ts` (`buildHandoffDisclosure`)** — removed the *"Do NOT recite the
  paper-form path…"* prohibition and replaced it with a positive **BOTH PATHS**
  rule: the online form leads, and the model MAY add one short in-person/paper
  fallback sentence when the retrieved context has it. Reshaped the reproduced
  copy to a lead-in + link + closing line:

  > Here's the form to get started:
  >
  > [title](url)
  >
  > You can complete your application there when you're ready.

- Updated `prompts.test.ts`: the existing warmth/anti-drift/no-dash assertions
  still hold; added tests for the new copy and for the both-paths allowance.

## Why we did it that way

- **Punctuation is enforced in code, not the prompt.** The em-dash ban lived
  only in the SYSTEM_PROMPT, which is a soft instruction the model follows most
  of the time but not always, and nothing downstream caught the misses.
  `normalizeMarkdown` is the single chokepoint every rendered message passes
  through, so a strip there is a hard guarantee. We replace with a comma (the
  prompt's own suggested substitute) and absorb surrounding spaces so "x — y"
  becomes "x, y", not "x ,  y".
- **Both paths, not online-only — superseding #1065.** The handoff disclosure
  (hardened in #1065 against the #965 drift) had grown an absolute "never mention
  paper/in-person" rule. That over-rotated: the #1079 direction is online-*first*,
  not online-*only*. Removing the prohibition and adding a positive, secondary
  fallback line lets the global CHANNEL PREFERENCE rule do its job (online leads,
  in-person as "if you'd rather") on handoff turns too.
- **Kept scoped to the handoff link response.** Three other disclosures still
  forbid the paper/in-person route (`buildFormLinkOfferDisclosure`,
  `buildHandoffContinuationDisclosure`, and the collect-form ONLINE OPTIONS block
  in `run-turn.ts`). Those are different turn types (RAG link offers, post-handoff
  follow-ups, in-chat form-filling) and were left unchanged this session.

## Follow-up

- The both-paths phrasing is a prompt-behaviour change, verified on the PR's
  Amplify preview (live RAG + Bedrock), not locally.
- Open question deferred by the user: whether to extend the both-paths treatment
  to the three other online-only disclosures listed above.
