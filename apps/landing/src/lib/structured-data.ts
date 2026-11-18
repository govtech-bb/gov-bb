import { SITE_URL } from './site-url'
import {
  getCategoryTitle,
  getSubcategoryTitle,
  getPageTitle,
} from '../content/registry'
import type { ContentPage } from '../content/registry'
import { breadcrumbPaths } from './breadcrumb-hierarchy'

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

/**
 * JSON-LD as the text of an inline `<script>`. The router renders a script's
 * `children` as raw HTML, and page and category names are editor-typed, so
 * `<`, `>`, `&` and the JS line separators are written as `\uXXXX` JSON
 * escapes; the parsed JSON is unchanged.
 */
export function ldJsonScriptText(
  ld:
    | ReturnType<typeof buildGovernmentServiceLd>
    | ReturnType<typeof buildBreadcrumbLd>,
): string {
  return JSON.stringify(ld).replace(
    /[<>&\u2028\u2029]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
  )
}

const ORG_NAME = 'Government of Barbados'
const ORG_ID = `${SITE_URL}/#organization`

export function buildOrganizationLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORG_ID,
    name: ORG_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/images/govbb-crest.svg`,
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

/**
 * The page's BreadcrumbList. `trail` is the one the visible breadcrumbs show
 * in api_v2 mode (current page last, Home left out), so the two always agree;
 * without it the trail is rebuilt from the static registry as before.
 */
export function buildBreadcrumbLd(
  page: ContentPage,
  trail?: ReadonlyArray<{ name: string; url: string }>,
) {
  const paths = trail ? [] : breadcrumbPaths(page.url)

  const items = [
    { name: 'Home', url: SITE_URL },
    ...(trail ?? []).map((crumb) => ({
      name: crumb.name,
      url: `${SITE_URL}${crumb.url}`,
    })),
  ]

  paths.forEach((path, i) => {
    const segments = path.split('/')
    const segment = segments.at(-1) ?? ''
    const url = `${SITE_URL}/${path}`
    // The current page is the last segment - use its frontmatter title rather
    // than a slug lookup.
    const name =
      i === paths.length - 1
        ? page.frontmatter.title
        : titleForSegment(segment, segments.at(-2))
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
