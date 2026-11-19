import { QueryClient } from '@tanstack/react-query'

/**
 * The one server-side cache of api_v2's site-wide lists. It lives outside
 * api-v2-site.ts because TanStack Start copies a module that defines server
 * functions into the extracted handler, so a cache declared there would be
 * two caches in the production build: one for direct reads (the sitemap),
 * one for server-function reads (/services) (#3461).
 */
export const siteCache = new QueryClient()
