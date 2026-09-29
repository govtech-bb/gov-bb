import type { RenderContext } from "@govtech-bb/block-kit";

/**
 * Turns a start_link target into an href: a form id becomes a link into the
 * forms app, and a page or external target is left as it is.
 *
 * Not server-only: the page component calls it, during SSR and again on
 * hydration, with the forms URL `getPage` returned.
 */
// `apps/forms` serves a form at `/forms/$formId/` (its `routes/forms/$formId/`
// route) and v1's `StartLink` emits the same path, so a form target is
// `${FORMS_URL}/forms/<id>` and FORMS_URL keeps meaning the app origin (#2840).
export function startLinkHref(
  formsBaseUrl: string,
): NonNullable<RenderContext["resolveHref"]> {
  return (kind, target) =>
    kind === "form" ? `${formsBaseUrl}/forms/${target}` : target;
}
