/** The category events carry when no service page links the form. */
const FALLBACK_CATEGORY = "uncategorised";

/** formId → category slug, from each form contract the API served (#3250). */
const categories = new Map<string, string>();

/** Record the category the API contract carried for a form, if any. */
export function rememberFormCategory(
  formId: string,
  category: string | undefined,
): void {
  if (category) categories.set(formId, category);
}

/** The category slug for a form id (legacy-parity event payloads need it). */
export function formCategory(formId: string): string {
  return categories.get(formId) ?? FALLBACK_CATEGORY;
}
