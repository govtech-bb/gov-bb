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
