# Chat Feedback — Skip the Optional Comment

**Date:** 2026-06-10
**Branch:** `chat-feedback-skip-optional-comment`

## Context

On the in-chat feedback form (`chat-feedback` recipe), the second field —
`improvement-comment` ("What could we do to improve? (optional)") — is an
optional `additional-details` textarea. The ask was to "add a skip option since
it's optional." The recipe itself was already correct (no `required` rule, label
already says "(optional)"), so this was never a form-recipe change — the problem
lived entirely in how the **chat collects forms conversationally**.

Two things combined so the comment was neither shown nor skippable:

1. **Never asked.** The collection prompt told the model to call `review_form`
   "once every *required* field is collected." The rating is the only required
   field, so the model jumped straight to review and skipped the optional comment.
2. **Not skippable even if asked.** A free-text field renders with no in-bubble
   control — the user just types in the composer. With no "Continue"/"Skip"
   button, advancing effectively forces the user to type a comment.

## What we did

- **`ask-field.tsx`** — added a **Skip** button on optional free-text fields
  (the `!spec.validations?.required` branch). Clicking it calls
  `onAnswer("Skip")`, sending a plain user message down the same path the choice
  pills already use (`pickChoice` → `sendMessage`). Required free-text fields are
  unchanged.
- **`prompts.ts` (`FORM_COLLECTION_PROTOCOL`)** — two wording changes: (a) the
  model now asks **every** field in schema order, optional included, before
  `review_form`, instead of jumping to review once required fields are filled;
  (b) explicit skip semantics — a skip reply means "leave blank, advance, don't
  `set_field`," and never pressure the user to fill an optional field.

## Why we did it that way

**Skip is a client affordance, not a new tool.** The `ask_field` result already
carries `validations` (`form/tools.ts`), so the client can tell an optional
field from a required one with no protocol change. The button reuses the
existing message path, so no new server tool or approval flow was needed — a
skip is just an ordinary user turn the prompt knows how to interpret.

**Both halves were necessary.** A Skip button alone wouldn't help: if the model
never asks the comment, the bubble (and its button) never renders. So the prompt
had to change to make the model present optional fields, and the client had to
change to make them skippable. Fixing one without the other leaves the field
either invisible or un-advanceable.

**Styled like "Not yet," not like an answer pill.** Skipping is *declining to
answer*, so the button uses the grey-outline secondary style of the existing
submit-decline button rather than the teal answer pills — it shouldn't read as
"one of the choices."

**Skip collapses naturally with the existing answered-state.** No extra disabled
handling: once a later turn lands, `AskFieldWidget` already collapses to its
label (`answered`/`choicesDisabled = row.index < lastInteractiveIndex`), so the
button only shows while the question is the active one — same lifecycle as the
choice pills.

## Verification

- `nx run chat:build` — green. `nx run chat:test` — 80/80 pass (incl.
  `prompts.test.ts`).
- No React component-test harness in `apps/chat`, and the change is model-driven,
  so end-to-end behaviour (rating → comment appears → Skip advances to review) is
  to be confirmed on the Amplify preview.

## Notes

- The working tree also carried unrelated, uncommitted #1125 work (conversational
  closer detection: `retrieval.ts`, `messages.ts` + tests, generated
  `routeTree.gen.ts`). Left untouched; only the two files above were committed.

## Open questions

None.
