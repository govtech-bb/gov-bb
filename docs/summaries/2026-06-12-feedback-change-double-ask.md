# Changing a feedback-form answer asked the question twice

Issue: [#1255](https://github.com/govtech-bb/gov-bb/issues/1255)

## Context

On the in-chat feedback form, clicking **Change** on a check-your-answers row
re-asked the field but rendered the question **twice** — the same label and the
same option pills, stacked. Reported on feedback, but the change path is shared
by every `collect` form.

## What we did

- New `apps/chat/src/lib/chat/change-field.ts` (client-safe, no server imports —
  mirrors `feedback-trigger.ts`): `CHANGE_FIELD_PREFIX` + `formatChangeRequest` /
  `parseChangeRequest`. One source of truth for the `"I'd like to change <label>"`
  string the **Change** button sends, shared by `bubble.tsx` and the server.
- New `apps/chat/src/lib/chat/form/change.ts`: `matchChangeField` resolves the
  review-row label back to its single active field, and `resetFieldForChange`
  clears the value + sets `reviewedSinceChange = false`.
- `run-turn.ts`: a new deterministic branch in the `collect` block (gated on
  `pinnedBefore === session.slug`, alongside the option-click and form-re-trigger
  branches) handles the change in code and re-presents the one field via
  `representFieldStream` — no model in the loop.
- `bubble.tsx`: `showChoices = hasChoices && !fieldSpec` — an `ask_field` widget
  now suppresses a redundant `present_choices` in the same bubble.
- `change.test.ts`: 11 cases (parser round-trip, label resolution incl. case /
  whitespace, ambiguous / unknown / show-hide → null, reset).

## Why we did it that way

Root cause was confirmed from the issue screenshot, not guessed. The two stacked
widgets were **not** two `ask_field` calls: `ChoicePills` rendered with a
`question` prop is pixel-identical to the `ask_field` widget (bold label + the
same pills). The model, handling the free-text `"I'd like to change …"` message,
emitted **both `present_choices` and `ask_field`** for the field, and `bubble.tsx`
renders those two blocks independently — so the question appeared twice under one
avatar.

That points at two defects, so we fixed both:

1. **The change action was the last model-routed form interaction.** Option
   clicks and form re-triggers were already made deterministic (#1207 / #1240 /
   #1223); the **Change** button still sent prose to the model. Taking the model
   out of the loop removes its freedom to double-emit and makes the action
   consistent with the rest of the `collect` block. We keep the changed field in
   `askedFieldIds` while clearing its value, so `nextAskableField` re-serves it as
   required-but-unanswered and the **existing** `matchPendingOption` path records
   a re-picked choice — no new recording code. (Free-text re-answers fall to the
   model's `set_field`, as on first ask.)

2. **`bubble.tsx` would render `present_choices` and `ask_field` together.** The
   render guard is defense-in-depth: it kills this class of double-render anywhere
   the model emits both, not just on Change. `ask_field` *is* the field widget; a
   co-emitted `present_choices` is always the redundant one. Confirmed the
   standalone choice-pill turns (feedback disambiguation, offer pills) never
   co-emit `ask_field`, so the guard can't suppress a legitimate pill list.

`matchChangeField` returns `null` (→ model fallthrough, same safety net as
`matchPendingOption`) when the label is unknown or ambiguous, so a label collision
degrades to today's behaviour rather than guessing.

## Open questions

None blocking. Two known, deferred:

- `matchChangeField` re-walks the contract with the same active / chat-collectable
  / not-show-hide predicate as `buildReviewItems` and `askableFields` — a third
  copy. All three agree today; worth consolidating if the predicate ever grows.
- Full model-behaviour verification (a real LLM turn no longer double-rendering)
  is only observable on the Amplify preview; the deterministic logic is unit-
  covered and `chat:build` / `chat:test` are green.
