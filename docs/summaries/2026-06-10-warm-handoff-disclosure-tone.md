# Warm up the chat tone when handing off a form link (#1065)

## Context

[#1065](https://github.com/govtech-bb/gov-bb/issues/1065) flagged that when the
chat assistant surfaces a form link it reads as abrupt and transactional. The
curt copy came verbatim from the handoff template in
`apps/chat/src/lib/chat/prompts.ts`:

> That's the form. You'll need to complete it there.

Resolved on `worktree-warm-handoff-disclosure-tone` (targets `sandbox`).

## What we did

- Rewrote the `REPLY EXACTLY IN THIS SHAPE` body of `buildHandoffDisclosure`:
  the curt line is now **"Here's the form to get started. You can finish the
  rest there."**, plus an explicit `TONE` directive (warm, acknowledge intent,
  frame the link as the helpful next step).
- Added a `GUIDANCE LINE` rule: surface prerequisites (e.g. a Police Certificate
  of Character) as one short friendly sentence, cited with `[N]`, **only** when
  this turn's retrieved context names them — never invented.
- Kept the link-first shape and every anti-drift guardrail unchanged (no "start
  it for you", no `set_field`/`present_choices`/`submit_form`, no paper-route,
  no `[1]` on the link).
- Light warmth touch on `buildHandoffContinuationDisclosure` so follow-up turns
  read warm too.
- Tests: 5 new `buildHandoffDisclosure` cases in `prompts.test.ts` (markdown
  link, warm phrasing + old curt line gone, prerequisite guidance, guardrails
  retained, no em/en dashes), written red-first.

## Why we did it that way

- **Rewrote the fixed template rather than relaxing it.** The "REPLY EXACTLY"
  shape exists on purpose: it stopped the #965 drift (model skipping the link,
  hallucinating inline collection, pushing the paper route). The alternative,
  softening "REPLY EXACTLY" to give the model free rein to be warm, was rejected
  as it reopens that drift risk for a `severity:minor` tone change. Warming the
  fixed copy keeps the guardrails and is the lower-risk path.
- **Prerequisites are RAG-gated, not always-on.** The issue example shows a
  prerequisite surfaced proactively, but STRICT RAG forbids stating anything not
  in this turn's context. The handoff turn always includes the context block
  (`run-turn.ts:304`), so the template instructs the model to add the guidance
  line only when the context names a prerequisite, and to skip it otherwise.
- **Dash-free reproduced copy.** The SYSTEM_PROMPT bans em/en dashes in output,
  and the model reproduces this template near-verbatim, so the rewrite replaced
  every `—` in the disclosure with periods/colons. A test pins this to stop a
  dash creeping back into the template the model copies.
- **Tests pin shape and guardrails, not prose.** The exact in-chat sentence is
  model-generated, so the tests assert the link, the warm signal (`get
  started`), the prerequisite-guidance cue, the guardrails, and the no-dash
  rule, leaving the precise wording tunable on preview without test churn.

## Follow-up

- Final tone is model-generated and can't be asserted in unit tests; verify it
  on the PR's Amplify preview (live RAG + Bedrock), including the prerequisite
  case (e.g. conductor licence) to confirm the guidance line fires from context.
