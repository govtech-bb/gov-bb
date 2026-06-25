# Chat beta notice + end-of-chat feedback (#1066)

## Context

The chat assistant (`apps/chat`) is a new, beta-quality feature. Issue #1066
asked for two things: a friendly "this is new" notice at the start of a chat,
and a way to collect feedback at the end that gets emailed somewhere.

## What we did

- New `chat-feedback` form recipe (`apps/api/.../recipes/chat-feedback/1.0.0.json`):
  a required 5-point experience rating + an optional comment, with an `email`
  processor using a `config.` recipient.
- Allowlisted `chat-feedback` in `apps/chat/.../form/allowlist.ts` (+ test).
- A dismissible **beta notice** banner shown once per session
  (`components/chat/beta-notice.tsx` + `betaNoticeStore` in `persistence.ts`).
- A **"Give feedback"** header button (`feedback.ts` + `index.tsx`) that sends a
  trigger phrase the form matcher pins to the recipe, starting the normal
  conversational collect → `submit_form` → email flow.

## Why we did it that way

The plan started as a bespoke `POST /api/feedback` endpoint in `apps/api` with
its own SES send + a lightweight in-chat modal. We threw that out mid-planning:
the user pointed out feedback is just a form, and the chat already collects and
submits forms. **Reusing the forms pipeline removed all new email/endpoint
code** — delivery is configured on the recipe's `email` processor instead.

Key constraints that shaped the final shape:

- **Trigger is push, not pull.** Every other form starts because the user's
  words match a form *title* (`detect.ts`). Feedback is system-initiated, and
  there's no clean way to programmatically pin a form: `sendMessage` takes only
  text, and changing `useChat`'s `body` recreates the client. Rather than plumb
  a server "start this form" signal, we exploit the matcher we already have —
  the button sends a phrase ("I would like to give feedback on the assistant")
  whose tokens overlap the recipe title (`feedback`, `assistant` are unique to
  it), so the matcher reliably pins it and nothing else can out-score it. Zero
  changes to `run-turn.ts`.
- **Anonymous, fixed-inbox recipient.** This is feedback, not a citizen
  application, so it has *no contact step* and does *not* send the user a
  confirmation — it routes to a government inbox via a `config.` recipient,
  which resolves a real address from per-environment `form_config` later and
  falls back to the safe `testing@govtech.bb` inbox in sandbox ("configurable,
  decide later"). This departs from the form-design guide's "every form collects
  email + confirms the applicant" guidance, which targets applications; the
  existing `exit-survey` recipe sets the no-contact-step precedent.
- **Beta notice avoids hydration mismatch.** It renders `null` on the server and
  first client render, then reveals in a mount effect if the session hasn't
  dismissed it — `sessionStorage` isn't readable during SSR.

## What we almost got wrong

Code review caught that the "Give feedback" button was reachable *mid-collection
of another form*. Because `pinSessionForm` won't re-pin while a form is active,
the trigger phrase would have been swallowed as a field answer and feedback
never started. Fixed client-side: the button hides whenever the latest assistant
turn ended on a visible form prompt (`ask_field`/`present_choices`/`review`/
`submit`), the same tool-call signal `shouldShowThinking` uses. It's a
heuristic (the client can't see server form-state), but it covers the realistic
cases without reintroducing the server-signal plumbing we'd deliberately avoided.

## Open questions

- **Real feedback recipient.** Deferred — sandbox uses the default test inbox; a
  production address is set via a `form_config` `mda_contact` row, no code change.
- **MDA approval.** `chat-feedback` is allowlisted citing #1066 as the trail; if
  a formal sign-off is expected before it surfaces, that's a process step.
