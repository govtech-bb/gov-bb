// Client-safe constant: the phrase the notice banner's inline "feedback" link
// sends to start the chat-feedback form. pinSessionForm matches this EXACT
// string and pins chat-feedback by explicit form id (NOT via the title-token
// matcher), so the banner can never be hijacked by a future recipe whose title
// contains "feedback"/"assistant" (#1206). Kept in its OWN module with NO
// server-only imports so the browser bundle (index.tsx) can import it WITHOUT
// pulling in form/session.ts — which imports `node:crypto` and throws when
// externalized into client code. The server-side feedback helpers (feedback.ts)
// re-export this for one source of truth.
//
// Rendered as the user's own chat bubble, so it stays natural language. A
// first-person STATEMENT (not a question, so run-turn's isInfoQuestion treats it
// as apply-intent and enters collect-feedback rather than offer-only).
export const FEEDBACK_TRIGGER_PHRASE =
  "I would like to give feedback on the assistant";
