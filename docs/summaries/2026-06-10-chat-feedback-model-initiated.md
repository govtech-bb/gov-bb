# Chat feedback: model-initiated offer + notice bubble

## Context

A follow-up to the merged #1066 feedback feature. Two pieces of that first cut
didn't land well in review with the team: the beta notice was an "ugly" banner,
and the "Give feedback" button sitting next to "Start again" felt clunky. The
ask: make the notice a small chat bubble, and instead of a button, have the
assistant ask for feedback at a natural point in the conversation — with the
improvement comment typed in the normal chat input.

## What we did

- Beta notice is now a small static `NoticeBubble` chat row above the welcome
  (no banner, no dismiss, no sessionStorage). Always shown.
- Removed the "Give feedback" header button and its trigger-phrase mechanism.
- The assistant now offers feedback itself via a new no-arg `offer_feedback`
  tool, bound only on no-form turns until used once per session
  (`feedbackOffered` flag on `FormSession`). Its handler pins the existing
  `chat-feedback` form (`pinFeedbackForm`), so the normal collect → choices →
  typed comment → `submit_form` → email flow runs unchanged. Prompt guidance
  (`FEEDBACK_OFFER_GUIDANCE`) tells the model when to offer.

## Why we did it that way

- **Reuse over rebuild.** Feedback stays a form (the `chat-feedback` recipe +
  its email processor), so there's still no bespoke endpoint or SES code — we
  only changed the *trigger*. The user explicitly chose "closest to the existing
  form-conversation structure" over a free-text `submit_feedback` tool, so the
  rating stays a real form field and the comment is collected the normal way.
- **The model can't pin a form on its own**, and `sendMessage` can't carry a
  per-turn signal (changing `useChat`'s `body` recreates the client). A tool the
  model calls is the clean way to let it initiate the form server-side without
  the matcher. The offer turn is necessarily prose-only (form tools bind once a
  form is pinned), so rating choices appear on the *next* turn — the intended
  "model asks → you answer → it records" rhythm.
- **Terminal-session fix (from review).** The feedback form is pinned
  programmatically, so unlike normal forms it can never be re-matched from
  conversation text. Left alone, a submitted feedback session would stay pinned
  in collect mode forever (and, because collected forms skip retrieval, silently
  ungrounded). `pinSessionForm` now clears the feedback form once submitted —
  scoped to feedback only, so other forms' pre-existing lifecycle is untouched.
  Other review fixes: don't offer on fraud/bribery-framed turns; treat
  `offer_feedback` as a stop signal for the thinking indicator; type the bind
  predicate against `FormResolution["kind"]`.

## What we almost got wrong

- First plan ordering would have rewritten `feedback.ts` before `index.tsx`
  stopped importing its old exports — every intermediate build would have
  failed. Caught in plan self-review; reordered so the UI cleanup lands first.
- Execution started as full per-task subagent review (implementer + spec +
  quality, with re-review loops). That was too slow for small mechanical tasks;
  switched to implementing directly with one consolidated branch review at the
  end. Captured as a standing preference in memory.

## Open questions

- None blocking. Known, accepted limitation: if a user ignores the offer and
  asks a new question, the pinned feedback form can linger for that turn
  (general form-system behaviour); the prompt tells the model to keep helping
  rather than force feedback.
