# Chat feedback: pin the banner link by form id, not title tokens

## Context

Issue #1206. The notice banner's inline "Give feedback" link calls
`sendMessage(FEEDBACK_TRIGGER_PHRASE)` (`index.tsx`). That phrase travels as an
ordinary chat message, and the server pinned the form in `pinSessionForm`
(`form/routing.ts`) via `matchFormsFromText` (`form/detect.ts`), which scores
**title-token overlap**. `chat-feedback` only won because "feedback" and
"assistant" happen to be unique among form titles today — and on a score tie the
matcher's `formId.length` tie-break decides. A future recipe whose title carried
either token could out-score or tie-and-steal the banner match, silently routing
the link to the wrong form. The only test guarding this checked the phrase
against the *current* title, not the form catalogue, so nothing would fail when
a colliding title was added.

## What we did

Added an explicit-id short-circuit in `pinSessionForm`, placed immediately after
the `if (session.slug && session.status !== "submitted") return;` guard and
before the token matcher: when `lastUserText(messages) === FEEDBACK_TRIGGER_PHRASE`,
pin `chat-feedback` by id via `pinForm`, set `feedbackOffered = true`, and
return. The matcher is never consulted for the banner phrase, so title
uniqueness stops mattering.

- The phrase text is unchanged — it renders as the user's own chat bubble, so it
  stays natural language. The comment in `feedback-trigger.ts` was updated to
  state pinning is now by id.
- New `routing.test.ts` test sends the phrase with a stubbed matcher returning a
  *colliding* form and asserts pin-by-id, `feedbackOffered`, and matcher-never-
  consulted (`called === 0`).
- Removed the now-obsolete title-overlap test in `feedback.test.ts`; kept a
  slimmed assertion that the phrase is a statement, not a question.

## Why we did it that way

- **Reused the chat-message channel rather than adding a structured client→server
  signal.** A request-level flag would touch the request contract and the
  optimistic-bubble rendering for no behavioural gain. Matching the exact phrase
  gives id-level determinism with no new plumbing.
- **Kept the phrase as a natural-language statement.** It must stay readable (it
  is the user's visible message) and must remain a statement so `offerOnly`
  (which keys off `isInfoQuestion`, `run-turn.ts`) stays false and the turn
  enters `collect-feedback` rather than offer-only. That invariant is now the
  *only* contract the phrase carries, and the kept test guards it.
- **Placement after the active-form early return preserves prior behaviour.** The
  old matcher path was also downstream of that return, so clicking the banner
  mid-form was already a no-op; the short-circuit does not change that. It also
  sits below the zero-value feedback-pin block (#1202) and the submitted-form
  reset/park, all of which still run first.

## What this is not

- Not a new convention or decision record. "Pin manual-start forms by id" is
  already the existing pattern (`pinFeedbackForm`); this just extends it to the
  banner path. No principle that future work must respect was established.

## Open questions

- None blocking. Model-/UI-facing behaviour is verifiable on the Amplify preview;
  `chat:build` + `chat:test` (175/175) are the local gates and the short-circuit
  is deterministic and unit-tested.
