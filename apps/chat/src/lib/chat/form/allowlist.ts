// Forms the chatbot is allowed to SURFACE — i.e. match, offer, collect inline,
// or hand off to. This is a deliberate approval gate, NOT the full catalogue:
// every form still lives on the forms API (apps/api/.../recipes/<form_id>/) and
// the forms app, but the chatbot only assists with the ones listed here until
// each has MDA approval.
//
// TO APPROVE A NEW FORM FOR THE CHAT:
//   1. Add its form_id below (the form_id is the recipe folder name under
//      apps/api/src/forms/form-definitions/recipes/<form_id>/).
//   2. Open a PR — the review IS the approval audit trail (cite the sign-off).
//   3. Merge + deploy. The chat starts surfacing it on the next turn.
// To pull a form back, remove its line.
//
// Anything NOT in this set: the chat will still answer general questions from
// retrieved context, but will never offer the form, collect its fields, or hand
// off to it. Enforced centrally in getFormIndex() (form/defs.ts), which both the
// title matcher (detect.ts) and the RAG-handoff validator (getFormSlugs) flow
// through — so this is the single point that caps what the chat can surface.
export const SURFACEABLE_FORM_IDS: ReadonlySet<string> = new Set([
  "get-birth-certificate", // Get a copy of a birth certificate
  "get-death-certificate", // Get a copy of a death certificate
  "get-marriage-certificate", // Get a copy of a marriage certificate
  "project-protege-mentor", // Apply to be a Project Protégé mentor
  "sports-training-programme-form-schema", // Register for a YDP Community Sports Training programme
  "jobstart-plus-programme", // Apply to the Job Start Plus programme
  "apply-for-conductor-licence", // Apply for conductor licence
  "get-a-primary-school-textbook-grant", // Get a Primary School Textbook Grant
  "post-office-redirection-individual", // Redirect my personal mail
  "post-office-redirection-deceased", // Tell the Post Office someone has died
  "post-office-redirection-business", // Redirect my business mail
  "sell-goods-services-beach-park", // Apply for a licence to sell goods/services at a beach or park
  "chat-feedback", // Give feedback on the assistant (issue #1066 — started by the offer_feedback tool or the notice-banner "Give feedback" link)
]);

export function isSurfaceableForm(formId: string): boolean {
  return SURFACEABLE_FORM_IDS.has(formId);
}
