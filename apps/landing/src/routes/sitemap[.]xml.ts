import { createFileRoute } from '@tanstack/react-router'
import { buildSitemapXml, collectSitemapEntries } from '../lib/sitemap'
import {
  deriveVisibilityOverlay,
  getServiceStatuses,
} from '../lib/service-status'
import { SITE_URL } from '../lib/site-url'

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      // The sitemap is the public crawl surface, so it honours the runtime
      // service_status overlay: a `disabled` service drops out, an `enabled`
      // one is included.
      GET: async () => {
        const overlay = deriveVisibilityOverlay(await getServiceStatuses())
        return new Response(
          buildSitemapXml(collectSitemapEntries(overlay), SITE_URL),
          { headers: { 'content-type': 'application/xml; charset=utf-8' } },
        )
      },
    },
  },
})
