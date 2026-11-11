# Chat feedback: route service/site feedback to the general feedback form

## Context

A transcript showed the assistant mishandling feedback *about a service*. After
a conductor's-licence conversation, the user said "feedback about the service"
and the assistant recited a ministry phone number (`246-536-0282`) and "submit
through alpha.gov.bb"; "feedback about the chat" got a vague "submit through
alpha.gov.bb" too.

Two gaps:

1. **No routing for service/site feedback.** The chat only had an *assistant*
   feedback path (the `offer_feedback` tool + the notice-banner trigger, both
   pinning `chat-feedback`). Feedback about a government service or the site
   fell through to ordinary RAG, where the model improvised a department contact
   - which is never the feedback channel.
2. **A ministry contact is the wrong answer.** Feedback belongs in the general
   feedback form, not a phone call to an MDA.

The desired behaviour: feedback about *this assistant* stays in-chat (unchanged);
feedback about *a service or the site* is handed off to the landing app's general
feedback form (`<LANDING_URL>/feedback`), the same redirection shape a
payment/upload service uses.

## What we did

Extended the ADR 0083 deterministic funnel with a feedback disambiguation:

- **Detection** — `guards.looksLikeFeedbackIntent` recognises an offer to *give*
  feedback. It is deliberately conservative and distinguishes giving from
  receiving: "give/leave/submit … feedback" and "feedback about/on **the/this/
  your** service/site/chat/assistant" match, but "get feedback on **my** exam
  results / application" (an ordinary service question) does not. The
  give-vs-receive tell is the article — platform feedback says "the/this service",
  the receive case says "my results".
- **Disambiguation** — when intent is detected on a no-form turn, the server
  emits `present_choices` pills itself (`representChoicesStream`, sibling of
  `representFieldStream`) with the exact labels "About this assistant" / "About a
  service or the site", and marks `session.feedbackChoice = "pending"`. No model
  in the loop.
- **Routing the tap** — `feedback.consumeFeedbackChoice` (mirror of
  `consumeOfferReply`) resolves the label verbatim next turn: "assistant" pins
  `chat-feedback` (the existing in-chat flow takes over); "service" sets
  `serviceFeedback={url}`, which short-circuits matching/retrieval and routes the
  prompt to `buildServiceFeedbackDisclosure` (hand over
  `[Tell us what you think](<LANDING_URL>/feedback)`, never a ministry contact).
  A non-matching reply *lapses* (distinguished from "no choice pending" so the
  next turn doesn't immediately re-show the pills).
- **Backstop** — one always-on `SYSTEM_PROMPT` line: never tell a user to phone,
  email, or visit a ministry to give feedback. Covers any phrasing detection
  misses.
- **Plumbing** — new `LANDING_URL` server env (defaults to the sandbox origin,
  mirroring `chrome.tsx`'s client fallback; prod sets it).

## Why these choices

- **Deterministic, not model-judged.** The product call was "deterministic
  choices": the pill tap is the single source of truth, code not interpretation
  - consistent with the rest of the funnel. We don't try to pre-classify "chat"
  vs "service" from free text; the pills *are* the one quick question.
- **Detection fires before the matcher.** The early return sits ahead of
  `pinSessionForm`, so a lingering service topic in the rolling window (e.g. the
  conductor licence still in scope) can't pre-empt the feedback choices — which
  was the exact failure in the transcript. The banner phrase is excluded by exact
  match, so it still pins `chat-feedback` directly (#1206).
- **A prose handoff, not a `FormResolution`.** The general feedback form lives in
  the landing app, not as a forms-API recipe, so it can't ride the recipe-backed
  handoff path; it's a prompt-level link disclosure instead.
- **Summary, not an ADR.** This extends ADR 0083's funnel rather than setting a
  new principle, matching how the sibling feedback decisions (banner-pin,
  topic-switch, post-application) were recorded.

## Verification

`chat:build` + `chat:test` (208) green; added unit tests for the detector
(incl. receive-feedback negatives), `consumeFeedbackChoice` (assistant / service
/ lapse / no-op), `representChoicesStream`, the service-feedback disclosure, the
`SYSTEM_PROMPT` backstop, and the prompt-builder branch. Prompt/UI behaviour is
only fully verifiable on the Amplify preview (chat has no model-behaviour test
infra) — confirm on the preview: "I'd like to give feedback" → two pills → "About
a service or the site" → expect the `[Tell us what you think]` link and no
ministry contact; "About this assistant" → expect the in-chat rating to start.
