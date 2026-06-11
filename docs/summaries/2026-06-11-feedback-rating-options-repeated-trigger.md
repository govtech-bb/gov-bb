# Feedback rating options vanish on a repeated trigger

## Context

A user reported that repeatedly sending "I would like to give feedback on the
assistant" (without first picking a rating) caused the experience-rating
**options to stop appearing**. The assistant kept re-prompting in prose
("please select one of the options above for how your experience was") while no
option pills were rendered. Issue #1207.

## What we did

- Gated the `askedFieldIds` skip in `nextAskableField` (`apps/chat/src/lib/chat/form/schema.ts`)
  on `!isRequired(field)`, so a **required** field that was presented but never
  answered is re-served instead of skipped.
- Added a `nextAskableField` unit test covering required-re-serve, advance-once-answered,
  and optional-still-skipped (`apps/chat/src/lib/chat/form/schema.test.ts`).
- Commit `b97054af`.

## Why we did it that way

The root cause was that `ask_field` adds a field to `session.askedFieldIds` the
moment it *presents* it (`tools.ts`), and `nextAskableField` skipped anything in
that set — regardless of whether it was answered. On a repeat trigger,
`pinSessionForm` early-returns (form still pinned, not submitted), so the session
isn't reset; `experience-rating` stays in `askedFieldIds`; the argument-less
`ask_field` then skips it and its options never re-render.

`askedFieldIds` was only ever meant to let the cursor advance past **optional**
fields the user chose to leave blank — its own doc comment says so. So the fix
is to honour that intent: the skip applies to optional fields only. This also
tightens `review_form`/`submit_form`, which gate on the same cursor, so they can
no longer advance past a required field that was merely shown.

The plan going in expected to need a new `isRequiredGivenValues` helper in
`values.ts` (wrapping `relaxOptionalIf`) to avoid re-asking an escape-toggle-relaxed
required field forever — the National-ID/passport `optionalIf` pattern. On
reading the code, that turned out unnecessary: `askableFields` already folds an
escape-relaxed empty field out of the stream *before* the cursor's asked-check
runs (`schema.ts:152`), and `findEscapeToggle` only ever relaxes via a show-hide
toggle. So the plain `isRequired` flag is safe — the relaxed field simply isn't
yielded while its escape is open. One-line change, no `values.ts` touch.

We chose this cursor-level fix over a routing-level one (resetting the session on
a repeated trigger): the cursor was the actual defect, the fix is general (any
"show me that again" works, not just the feedback phrase), and it leaves the
`routing.ts:48` early-return — which deliberately protects a partially-filled
form from being reset — untouched.

## Open questions

none
