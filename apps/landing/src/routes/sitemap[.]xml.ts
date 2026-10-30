import { createFileRoute } from '@tanstack/react-router'
import { buildSitemapXml, collectSitemapEntries } from '../lib/sitemap'
import { fetchCategoryTree } from '../lib/api-v2-categories'
import { apiV2Base, landingToken } from '../lib/api-v2-page'
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
        const [statuses, categoryTree] = await Promise.all([
          getServiceStatuses(),
          fetchCategoryTree(apiV2Base(), fetch, landingToken()),
        ])

        const overlay = deriveVisibilityOverlay(statuses)

        return new Response(
          buildSitemapXml(
            collectSitemapEntries(overlay, categoryTree),
            SITE_URL,
          ),
          { headers: { 'content-type': 'application/xml; charset=utf-8' } },
        )
      },
    },
  },
})
