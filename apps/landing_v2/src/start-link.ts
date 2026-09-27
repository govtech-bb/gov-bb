import type { RenderContext } from "@govtech-bb/block-kit";

/**
 * Turns a start_link target into an href: a form id becomes a link into the
 * forms app, and a page or external target is left as it is.
 *
 * Not server-only: the page component calls it, during SSR and again on
 * hydration, with the forms URL `getPage` returned.
 */
// Assumption (#2702): 9 — `${FORMS_URL}/${target}`, exactly that shape.
export function startLinkHref(
  formsBaseUrl: string,
): NonNullable<RenderContext["resolveHref"]> {
  return (kind, target) =>
    kind === "form" ? `${formsBaseUrl}/${target}` : target;
}
