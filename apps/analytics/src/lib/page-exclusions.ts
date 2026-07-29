import { TOOLS, pathMatchesPrefix } from './tools-config'

/**
 * Landing URL paths that are not content pages and must never appear on the
 * Pages tab (#2120), independent of whether Umami reported traffic for them:
 *  - system/non-content routes (sitemap, robots, error/interstitial pages);
 *  - forms-app URLs (`/forms/*`) — a different app;
 *  - form-flow `/start` pages — they belong to the form journey, not content;
 *  - the interactive-tool route prefixes — owned by the Tools tab (#2119), so
 *    they're de-duped out here (reusing the single `TOOLS` config as the source
 *    of truth rather than re-listing the prefixes).
 */
const SYSTEM_ROUTES = new Set([
  '/sitemap.xml',
  '/robots.txt',
  '/service-unavailable',
  '/javascript-required',
])

export function isExcludedPath(path: string): boolean {
  if (SYSTEM_ROUTES.has(path)) return true
  if (path.startsWith('/forms/')) return true
  if (path === '/start' || path.endsWith('/start')) return true
  return TOOLS.some((tool) => pathMatchesPrefix(path, tool.prefix))
}
