// THE chat form policy — the single config for what the chatbot may surface
// and how. One entry per approved form:
//
//   "collect" — the chat fills the form inline (ask_field/set_field/submit).
//   "handoff" — the chat only ever hands the user the form link.
//
// A form with NO entry is invisible to the chat: it still lives on the forms
// API and the forms app, and the chat answers general questions about the
// service from retrieved context — it just never offers, collects, or links
// the form (the unapproved-form disclosure handles that honestly).
//
// This replaces the old three-list setup (allowlist + HANDOFF_FORM_IDS +
// ALWAYS_HANDOFF_FORM_IDS in schema.ts), where an exclusion entry without a
// matching allowlist entry was silently dead.
//
// TO APPROVE A NEW FORM FOR THE CHAT:
//   1. Add its form_id (the recipe folder name under
//      apps/api/src/forms/form-definitions/recipes/<form_id>/) with a mode.
//   2. Open a PR — the review IS the approval audit trail (cite the sign-off).
//   3. Merge + deploy. The chat starts surfacing it on the next turn.
// To pull a form back, remove its line.
//
// "handoff" is a hard floor, not the only guard: a "collect" form is STILL
// handed off when its live contract carries a file field, a required
// repeatable, or requiresPayment (see needsHandoff in schema.ts) — so a
// recipe republish can't silently open inline collection (#965).
export type ChatFormMode = "collect" | "handoff";

export const CHAT_FORM_POLICY: ReadonlyMap<string, ChatFormMode> = new Map([
  // Certificates: paid services. NOTE the latest recipes (birth 1.6.0, death
  // 1.5.0, marriage 1.6.0) no longer carry a payment processor, so the
  // requiresPayment heuristic is inert for all three — this entry is the only
  // thing keeping them link-only (#916 / #917 / #918, regression class #965).
  ["get-birth-certificate", "handoff"],
  ["get-death-certificate", "handoff"],
  ["get-marriage-certificate", "handoff"],
  // Link-only by approval scope. The old "document upload" rationale
  // (#921 / #928) doesn't match the published recipes — no version carries a
  // file field. Revisit if MDA approves inline collection.
  ["apply-for-conductor-licence", "handoff"],
  ["sell-goods-services-beach-park", "handoff"],
  // Collects bank account details — never inline in chat (#966 / #931).
  ["get-a-primary-school-textbook-grant", "handoff"],
  // Inline collection approved.
  ["project-protege-mentor", "collect"],
  ["sports-training-programme-form-schema", "collect"],
  ["jobstart-plus-programme", "collect"],
  ["post-office-redirection-individual", "collect"],
  ["post-office-redirection-deceased", "collect"],
  ["post-office-redirection-business", "collect"],
  // Started by the offer_feedback tool or the notice-banner link (#1066).
  ["chat-feedback", "collect"],
  // Published but NOT chat-approved (the old dead HANDOFF_FORM_IDS entries —
  // they were excluded without ever being allowlisted, so they never fired).
  // Uncomment with a mode to approve; the PR review is the audit trail.
  //   duties-performed-exam-claim
  //   school-uniform-grant-barbados
  //   smart-stream-vendor-registration
  //   textbook-grant-application  (near-duplicate of
  //     get-a-primary-school-textbook-grant — reconcile before approving)
]);

export function isSurfaceableForm(formId: string): boolean {
  return CHAT_FORM_POLICY.has(formId);
}

// The policy says link-only, regardless of what the live contract looks like.
export function isForcedHandoff(formId: string): boolean {
  return CHAT_FORM_POLICY.get(formId) === "handoff";
}
