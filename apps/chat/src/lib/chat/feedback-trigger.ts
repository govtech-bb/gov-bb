// Client-safe constant: the phrase the notice banner's inline "feedback" link
// sends to start the chat-feedback form (the title matcher pins it). Kept in its
// OWN module with NO server-only imports so the browser bundle (index.tsx) can
// import it WITHOUT pulling in form/session.ts — which imports `node:crypto` and
// throws when externalized into client code. The server-side feedback helpers
// (feedback.ts) re-export this for one source of truth.
//
// A first-person STATEMENT (not a question, so run-turn's isInfoQuestion treats
// it as apply-intent and starts collecting) containing the chat-feedback recipe
// title's distinctive tokens ("feedback", "assistant").
export const FEEDBACK_TRIGGER_PHRASE =
  "I would like to give feedback on the assistant";
