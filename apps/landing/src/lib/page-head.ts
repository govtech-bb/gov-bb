import { SITE_URL } from './site-url'

/**
 * Open Graph + Twitter + canonical tags shared by every indexable page.
 * `title` is the full page title, `description` its summary, and `path` the
 * absolute path (leading slash) used to build the canonical and `og:url`.
 *
 * Site-wide OG defaults (og:image, og:site_name, og:locale, og:type and the
 * twitter:card/twitter:image) live in the root route, so only the per-page
 * fields are emitted here.
 */
export function seoTags(title: string, description: string, path: string) {
  const url = `${SITE_URL}${path}`
  return {
    meta: [
      { property: 'og:title', content: title },
      { name: 'twitter:title', content: title },
      ...(description
        ? [
            { property: 'og:description', content: description },
            { name: 'twitter:description', content: description },
          ]
        : []),
      { property: 'og:url', content: url },
    ],
    links: [{ rel: 'canonical', href: url }],
  }
}

/**
 * Canonical <head> meta for a route: the page title (with the shared
 * "| Government of Barbados" suffix) plus its description, an optional noindex
 * for pages gated behind the preview rollout, and — when a `path` is given for
 * an indexable page — the Open Graph/Twitter/canonical tags from `seoTags`.
 */
export function pageHead(
  title: string,
  description: string,
  opts?: { noindex?: boolean; path?: string },
) {
  const fullTitle = `${title} | Government of Barbados`
  const seo =
    opts?.path && !opts.noindex
      ? seoTags(fullTitle, description, opts.path)
      : undefined
  return {
    meta: [
      { title: fullTitle },
      { name: 'description', content: description },
      ...(opts?.noindex ? [{ name: 'robots', content: 'noindex' }] : []),
      ...(seo?.meta ?? []),
    ],
    ...(seo ? { links: seo.links } : {}),
  }
}
