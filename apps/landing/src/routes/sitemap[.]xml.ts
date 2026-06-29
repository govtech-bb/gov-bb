import { createFileRoute } from '@tanstack/react-router'
import { buildSitemapXml, collectSitemapEntries } from '../lib/sitemap'
import { SITE_URL } from '../lib/site-url'

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: () =>
        new Response(buildSitemapXml(collectSitemapEntries(), SITE_URL), {
          headers: { 'content-type': 'application/xml; charset=utf-8' },
        }),
    },
  },
})
