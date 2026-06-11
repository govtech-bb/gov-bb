/**
 * Canonical <head> meta for a route: the page title (with the shared
 * "| Government of Barbados" suffix) plus its description, and an optional
 * noindex for pages gated behind the preview rollout.
 */
export function pageHead(
  title: string,
  description: string,
  opts?: { noindex?: boolean },
) {
  return {
    meta: [
      { title: `${title} | Government of Barbados` },
      { name: 'description', content: description },
      ...(opts?.noindex ? [{ name: 'robots', content: 'noindex' }] : []),
    ],
  }
}
