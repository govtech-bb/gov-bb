/**
 * Classification of an email processor's `recipientField`.
 *
 * A `recipientField` string is resolved at send time into an actual address.
 * How it resolves depends on its shape — these are the reserved forms, checked
 * in this order:
 *
 * - **literal** — contains "@". Used verbatim (e.g. "testing@govtech.bb").
 * - **contact** — starts with {@link CONTACT_DETAILS_PREFIX}. Resolved from the
 *   form's service-contract `contactDetails` (e.g. a public department email).
 * - **config** — starts with {@link CONFIG_RECIPIENT_PREFIX}. Resolved from the
 *   per-environment `form_config` → `mda_contact` directory in the database
 *   (the private MDA notification address), falling back to a default test
 *   inbox when no row exists. This keeps sensitive production addresses out of
 *   the committed recipe and lets sandbox resolve a safe default.
 * - **submitted** — anything else ("stepId.fieldId"). Read from the submitted
 *   answer values.
 *
 * The reserved `config.` token (e.g. `config.mdaEmail`) mirrors the existing
 * `contactDetails.` convention. A step literally named "config" or
 * "contactDetails" is therefore shadowed — see FORM-CREATION-GUIDE.md.
 */
export type RecipientKind = "literal" | "contact" | "config" | "submitted";

/** Prefix marking a recipient resolved from the contract's contactDetails. */
export const CONTACT_DETAILS_PREFIX = "contactDetails.";

/** Prefix marking a recipient resolved from per-environment `form_config`. */
export const CONFIG_RECIPIENT_PREFIX = "config.";

/**
 * Classifies a `recipientField` into the kind that determines how it resolves.
 * Literal is checked first: neither prefix contains "@", so an address is
 * always unambiguous.
 */
export function classifyRecipientField(recipientField: string): RecipientKind {
  if (recipientField.includes("@")) return "literal";
  if (recipientField.startsWith(CONTACT_DETAILS_PREFIX)) return "contact";
  if (recipientField.startsWith(CONFIG_RECIPIENT_PREFIX)) return "config";
  return "submitted";
}
