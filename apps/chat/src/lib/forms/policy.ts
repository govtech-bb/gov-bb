// The chat form policy — the single config for which forms the assistant may
// act on, and how:
//
//   "collect" — the chat may fill the form inline (the ask/set/submit tools).
//   "handoff" — the chat only ever hands the user the form's start-page link.
//
// A form with NO entry is invisible to the chat: it still lives on the forms
// API, and the chat answers general questions about the service from retrieved
// context — it just never offers, collects, or links the form. The honest
// "exists but not chat-enabled" vs "no such form" distinction is drawn against
// the live forms index (defs.ts), not here.
//
// Rollout is gated with feature flags, not a blanket constant. Adding a form is
// a one-line entry — the PR review is the approval audit trail.
export type ChatFormMode = "collect" | "handoff";

export const CHAT_FORM_POLICY: ReadonlyMap<string, ChatFormMode> = new Map([
  // Certificates — paid services, link-only.
  ["get-birth-certificate", "handoff"],
  ["get-death-certificate", "handoff"],
  ["get-marriage-certificate", "handoff"],
  // Link-only by approval scope.
  ["apply-for-conductor-licence", "handoff"],
  ["sell-goods-services-beach-park", "handoff"],
  // Collects bank details — never inline.
  ["get-a-primary-school-textbook-grant", "handoff"],
  // Inline collection approved.
  ["project-protege-mentor", "collect"],
  ["jobstart-plus-programme", "collect"],
  ["post-office-redirection-individual", "collect"],
  ["post-office-redirection-deceased", "collect"],
  ["post-office-redirection-business", "collect"],
  // The assistant's own feedback form (the feedback feature).
  ["chat-feedback", "collect"],
]);

// Is this form approved for the chat to act on at all?
export function isSurfaceableForm(formId: string): boolean {
  return CHAT_FORM_POLICY.has(formId);
}

// The approved mode, or undefined when the form isn't chat-approved.
export function formMode(formId: string): ChatFormMode | undefined {
  return CHAT_FORM_POLICY.get(formId);
}
