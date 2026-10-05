/**
 * Turns a start link into an href: an authored href is used as it is, and a
 * link api_v2 stamped with a form id becomes a link into the forms app.
 * Undefined when it is neither, so the button is left out rather than
 * pointing nowhere.
 *
 * Not server-only: the page component calls it, during SSR and again on
 * hydration, with the forms URL `getPage` returned.
 */
// `apps/forms` serves a form at `/forms/$formId/` (its `routes/forms/$formId/`
// route) and v1's `StartLink` emits the same path, so a form target is
// `${FORMS_URL}/forms/<id>` and FORMS_URL keeps meaning the app origin (#2840).
export function startLinkHref(
  formsBaseUrl: string,
  href: string | undefined,
  formId: string | undefined,
): string | undefined {
  return href ?? (formId ? `${formsBaseUrl}/forms/${formId}` : undefined);
}
