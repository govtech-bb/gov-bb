# Chat feedback: graceful topic switch during collection

## Context

Follow-up to #1202 / #1242. With the crash fixed (#1242), a real transcript
showed the *conversational* outcome was still poor: on the feedback form's first
question, the user typed "conductor license", and the assistant replied that
feedback "would be best directed to the team running the platform … through the
main alpha.gov.bb site" and asked whether it could help with the licence —
without actually helping.

Two things were wrong:

1. **Misleading deflection.** The in-chat feedback form *is* how the platform
   collects feedback; telling the user to take it elsewhere is incorrect.
2. **No topic-switch handling.** `FEEDBACK_COLLECTION_GUIDANCE` covered decline,
   accept, and rating — but had no branch for "the user changed the subject to a
   different service", so the model improvised the deflection above.

This is the fallback path: ideally the RAG-backstop release (#1242 / the
`shouldReleaseFeedbackOffer` path) unpins the feedback form and routes the
switch to a handoff in one turn. When that release doesn't fire (retrieval
didn't surface the new service as an above-threshold candidate), the turn stays
in `collect-feedback` and this guidance is what the model follows — so it needs
to handle the switch too.

## What we did

Added a topic-switch bullet to `FEEDBACK_COLLECTION_GUIDANCE` (`prompts.ts`):
when the latest message is neither agreeing, declining, nor an answer — but asks
about/requests a different government service — the model calls
`decline_feedback` to set the feedback aside and then helps with the new
request, and is explicitly told **never** to send the user's feedback elsewhere
("the team" / "the platform" / another part of the site).

## Why a prompt change

`collect-feedback` is the only path where this misbehaviour appears, and it's
LLM-conversational, not deterministic-routing — so the fix lives in the
guidance the model follows on that turn. The deterministic release (#1242)
remains the preferred one-turn path; this makes the fallback graceful instead of
misleading.

## Verification

`chat:build` + `chat:test` (196) green. Prompt/behaviour changes are only fully
verifiable on the Amplify preview (chat has no model-behaviour test infra) —
confirm on `chat.sandbox.alpha.gov.bb` with: give feedback → (rating prompt) →
"conductor license" → expect the feedback set aside and help offered, with no
"direct it to the team" line.

## Open follow-up

If the switch should resolve in a single turn (deliver the conductor-licence
link immediately rather than next turn), the lever is making the
`shouldReleaseFeedbackOffer` retrieval signal fire reliably for this case —
needs the turn's server log (`action` / `query` / `retrieved` scores) to confirm
why it didn't, which wasn't available here.
