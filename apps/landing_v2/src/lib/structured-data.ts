import type { PageResponse } from '@govtech-bb/landing-v2-contract'
import { SITE_URL } from './site-url'

/**
 * schema.org JSON-LD builders for the landing site (#1643). Each returns a
 * plain object serialised into a `<script type="application/ld+json">` via the
 * TanStack `head()` `scripts` entry — site-wide ones in `__root.tsx`, per-page
 * ones in the `$.tsx` service-page branch (public pages only).
 *
 * Absolute URLs come from `SITE_URL`. The Organization carries a stable `@id`
 * so WebSite/GovernmentService can reference it as the same entity rather than
 * repeating the object.
 */

const ORG_NAME = 'Government of Barbados'
const ORG_ID = `${SITE_URL}/#organization`

/**
 * Serialise a JSON-LD object for a `<script>` body. The router injects script
 * children as raw HTML, so `<` is escaped (`<`, still valid JSON) — a
 * `</script>` in a title or crumb name cannot close the tag.
 */
export function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

export function buildOrganizationLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORG_ID,
    name: ORG_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/images/coat-of-arms.png`,
  }
}

export function buildGovernmentServiceLd({
  title,
  description,
  url,
}: {
  title: string
  description?: string
  url: string
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'GovernmentService',
    name: title,
    ...(description ? { description } : {}),
    provider: { '@id': ORG_ID },
    areaServed: { '@type': 'Country', name: 'Barbados' },
    url: `${SITE_URL}/${url}`,
  }
}

export function buildBreadcrumbLd(breadcrumbs: PageResponse['breadcrumbs']) {
  const items = [
    { name: 'Home', url: SITE_URL },
    ...breadcrumbs.map((crumb) => ({
      name: crumb.name,
      url: `${SITE_URL}/${crumb.url}`,
    })),
  ]
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  }
}
