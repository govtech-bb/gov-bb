import { SITE_URL } from './site-url'
import {
  getCategoryTitle,
  getSubcategoryTitle,
  getPageTitle,
} from '../content/registry'
import type { ContentPage } from '../content/registry'

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

export function buildWebSiteLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: ORG_NAME,
    url: SITE_URL,
    // SearchAction drives Google's sitelinks search box, pointing at the
    // existing /search-results route.
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/search-results?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }
}

export function buildGovernmentServiceLd(page: ContentPage) {
  return {
    '@context': 'https://schema.org',
    '@type': 'GovernmentService',
    name: page.frontmatter.title,
    ...(page.frontmatter.description
      ? { description: page.frontmatter.description }
      : {}),
    provider: { '@id': ORG_ID },
    areaServed: { '@type': 'Country', name: 'Barbados' },
    url: `${SITE_URL}/${page.url}`,
  }
}

// Resolve a path segment to its display title, mirroring the visible
// `<Breadcrumbs>` component (which is client-side and can't be reused inside
// `head()`) by reusing the same registry lookups it does.
function titleForSegment(seg: string, previousSegment?: string): string {
  const subTitle = previousSegment
    ? getSubcategoryTitle(previousSegment, seg)
    : undefined
  const fallback = seg.replace(/-/g, ' ')
  return getCategoryTitle(seg) ?? subTitle ?? getPageTitle(seg) ?? fallback
}

export function buildBreadcrumbLd(page: ContentPage) {
  const segments = page.url.split('/').filter(Boolean)
  const items = [{ name: 'Home', url: SITE_URL }]
  segments.forEach((seg, i) => {
    const url = `${SITE_URL}/${segments.slice(0, i + 1).join('/')}`
    // The current page is the last segment — use its frontmatter title rather
    // than a slug lookup.
    const name =
      i === segments.length - 1
        ? page.frontmatter.title
        : titleForSegment(seg, segments[i - 1])
    items.push({ name, url })
  })
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
