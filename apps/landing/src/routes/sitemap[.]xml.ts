import { createFileRoute } from '@tanstack/react-router'
import { buildSitemapXml, collectSitemapEntries } from '../lib/sitemap'
import { fetchCategoryTree } from '../lib/api-v2-categories'
import { apiV2Base } from '../lib/api-v2-page'
import { fetchApiV2Catalog } from '../lib/api-v2-site'
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
        const [statuses, categoryTree, apiV2Urls] = await Promise.all([
          getServiceStatuses(),
          fetchCategoryTree(apiV2Base()),
          fetchApiV2Catalog(apiV2Base()),
        ])

        const overlay = deriveVisibilityOverlay(statuses)

        return new Response(
          buildSitemapXml(
            collectSitemapEntries(overlay, categoryTree, apiV2Urls),
            SITE_URL,
          ),
          { headers: { 'content-type': 'application/xml; charset=utf-8' } },
        )
      },
    },
  },
})
