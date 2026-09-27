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
