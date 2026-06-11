# Chat nudges users toward applying online, not in person (#1079)

## Context

[#1079](https://github.com/govtech-bb/gov-bb/issues/1079) reported the chatbot
sometimes leads with the in-person route ("visit the office at…") even when an
online application exists. We wanted a subtle online-first nudge: surface online
as the easy default, keep in-person as a fallback, never disparage or withhold
it. Resolved on `worktree-online-application-nudge` (targets `sandbox`).

## What we did

- Added a `CHANNEL PREFERENCE — ONLINE FIRST` section to the always-on
  `SYSTEM_PROMPT` in `apps/chat/src/lib/chat/prompts.ts`: lead with the online
  path when the retrieved context shows one, frame in-person as an "if you'd
  rather" fallback, and stay in-person (no invented path) when the context shows
  no online option.
- Added a test in `prompts.test.ts` asserting the section exists and is
  context-conditioned (not an unconditional online claim).

## Why we did it that way

- **The gap was the plain informational / RAG turn, not the form turns.**
  Form-active turns already enforce online-only — `run-turn.ts:454` and the
  handoff disclosures in `prompts.ts` say "NEVER suggest a paper form … or going
  to an office in person." The leak was the no-form informational answer, where
  the model parrots the in-person process described in the retrieved gov.bb
  context. So the fix belongs in the always-on `SYSTEM_PROMPT`, which governs
  exactly those turns.
- **Self-scoped to "when the context shows an online option" rather than a new
  injected disclosure.** This keeps it compatible with `NO_FORM_DISCLOSURE`
  (`prompts.ts:106`), which deliberately frames purely in-person services as
  in-person/phone/mail. An unconditional "prefer online" rule would fight that
  override and tempt the model to invent an online path that isn't in the
  context — both failure modes the third bullet of the new section forbids.
- **Left the birth-registration EXAMPLE unchanged.** It already models the
  pattern ("pre-register online, then visit … to sign"), so it doubles as a
  worked example of online-first without edits.
- **Phrasing pattern: online clause first, in-person as the "if you'd rather"
  tail.** Subtle and non-pushy, per the issue's ask — no editorialising, no
  refusal to give the in-person route.

## Follow-up

- The nudge is a prompt-behaviour change, so it's verified on the PR's Amplify
  preview (live RAG + Bedrock), not locally. Spot-check: a service with an
  online path should lead online; an in-person-only service should still read
  in-person with no invented online path.
