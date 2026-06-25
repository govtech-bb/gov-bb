import { createFileRoute } from '@tanstack/react-router'
import { buildRobotsTxt } from '../lib/robots'
import { SITE_URL } from '../lib/site-url'

// Build-time flag (per environment): only production enables indexing.
const ALLOW_INDEXING = import.meta.env.VITE_ALLOW_INDEXING === 'true'

export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: () =>
        new Response(buildRobotsTxt(ALLOW_INDEXING, SITE_URL), {
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        }),
    },
  },
})
