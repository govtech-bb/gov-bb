# Close link-delivery handoffs with "Anything else I can help with?"

## Context

When the chat assistant hands the user a form link — because the service needs a
file upload or payment and can't be completed in chat — the reply ended on the
link with no invitation to continue. That dead-ends the conversation: a user who
then says "no" / "that's all" isn't recognised as winding down, so the assistant
can't route into its warm sign-off + optional feedback path.

The wind-down path already exists. `retrieval.ts` defines
`WRAP_UP_RE = /anything else/i` and checks the *previous* assistant message: if
it asked "anything else?", a terse closer ("no") is treated as the end of the
conversation. `buildCantHelpDisclosure` already ends with the exact line
`Anything else I can help with?` for precisely this reason. The link-delivery
templates didn't.

Resolved on `chat-handoff-anything-else-close` (targets `sandbox`).

## What we did

In `apps/chat/src/lib/chat/prompts.ts`, made the three link-delivery templates
close with the exact wrap-up line `Anything else I can help with?`:

- `buildHandoffDisclosure` (the payment/upload handoff — the first reply that
  delivers the link): added the line to the `REPLY EXACTLY IN THIS SHAPE` body
  and an explicit `CLOSING QUESTION` rule placing it as the very last line, after
  any guidance / fallback / side-answer. Updated the TONE/conciseness note to
  list it.
- `buildHandoffContinuationDisclosure` (follow-up turns after a handoff): same
  `CLOSING QUESTION` close.
- `buildDirectLinkDisclosure` (the "just send me the link" choice): replaced the
  vague "brief offer to help if they have questions" with the exact wrap-up line.

Tests: three new cases in `prompts.test.ts` asserting each template ends with
`/Anything else I can help with\?/` (and that the direct-link reply still embeds
the markdown link).

## Why we did it that way

- **Exact wording, not a paraphrase.** The line plugs into the existing closer
  machinery only if it matches `WRAP_UP_RE` and reads as the canonical wrap-up.
  Reusing the verbatim string `buildCantHelpDisclosure` already uses keeps all
  the "we asked, so a no winds down" moments consistent and detectable, rather
  than inventing per-template phrasing the closer can't reliably catch.
- **Tests pin the wrap-up line, not the surrounding prose.** The rest of each
  reply is model-generated; the tests assert only the presence of the exact
  closing question, leaving wording tunable on preview without test churn.
- **Left the submit-success path alone (deliberate).** The successful in-chat
  submission reply (`FORM_COLLECTION_PROTOCOL`, "report the `referenceNumber`
  verbatim and stop") is a different surface: it ends on a real outcome, has its
  own narrow exception (a second need raised earlier), and is exactly the
  "natural conclusion" that triggers `FEEDBACK_OFFER_GUIDANCE`. Adding "anything
  else?" there would compete with the feedback invitation, so it was excluded.
- **Recovery prompts left alone too.** `buildMissDisclosure` and
  `NO_FORM_DISCLOSURE` end with a guiding/clarifying question (mid-task, not a
  close), and `CLOSER_GUIDANCE` deliberately forbids re-asking "anything else?".

## Follow-up

- The reproduced phrasing is model-generated; verify on the PR's Amplify preview
  that each link-delivery reply ends with the wrap-up line and that a following
  "no" winds the chat down into the sign-off + feedback path.
