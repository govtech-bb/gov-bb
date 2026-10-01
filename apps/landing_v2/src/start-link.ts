/**
 * Turns a start link into an href: an authored href is used as it is, and a
 * link api_v2 stamped with a form id becomes a link into the forms app.
 * Undefined when it is neither, so the button is left out rather than
 * pointing nowhere.
 *
 * Not server-only: the page component calls it, during SSR and again on
 * hydration, with the forms URL `getPage` returned.
 */
// Assumption (#2702): 9 — `${FORMS_URL}/${formId}`, exactly that shape.
export function startLinkHref(
  formsBaseUrl: string,
  href: string | undefined,
  formId: string | undefined,
): string | undefined {
  return href ?? (formId ? `${formsBaseUrl}/${formId}` : undefined);
}
