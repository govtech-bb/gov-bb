// Client-safe constant: the phrase the check-your-answers "Change" button
// sends to re-ask a single field by its label. Kept in its OWN module with NO
// server-only imports so the browser bundle (bubble.tsx) can import it WITHOUT
// pulling in form/session.ts — which imports `node:crypto` and throws when
// externalized into client code (mirrors feedback-trigger.ts).
//
// The server resolves the label back to a field deterministically and
// re-presents it (form/change.ts), so the change action never routes through
// the model — which otherwise emits present_choices AND ask_field for the same
// field, rendering the question twice (#1255).
export const CHANGE_FIELD_PREFIX = "I'd like to change ";

// Build the user-facing change request for a review row. Stays natural language
// so it reads as the user's own chat bubble (and so a model fallthrough, if the
// label ever fails to resolve, still gets a sensible instruction).
export function formatChangeRequest(label: string): string {
  return `${CHANGE_FIELD_PREFIX}${label}`;
}

// The field LABEL the user wants to change, or null if the message isn't a
// change request. Trimmed so trailing whitespace can't defeat the server-side
// label lookup.
export function parseChangeRequest(text: string): string | null {
  if (!text.startsWith(CHANGE_FIELD_PREFIX)) return null;
  const label = text.slice(CHANGE_FIELD_PREFIX.length).trim();
  return label.length ? label : null;
}
