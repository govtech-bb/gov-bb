import { createRoute, type AnyRoute } from '@tanstack/react-router'
import { SiteIndex } from './index-page'
import { SitePageFromLocation } from './page'

/**
 * The site's route tree, mounted by `apps/editor_v2`'s Vite dev server.
 *
 * IndexedDB is scoped per origin, so the editor and the site have to be the
 * same origin or they cannot see each other's database. Two route trees,
 * one server: `/editor/*` is the editor and everything else is here.
 *
 * A splat route rather than one route per URL — the routing key is
 * `content_pages.url`, so adding a page in the editor makes it reachable
 * without touching this file.
 */
export function siteRoutes(rootRoute: AnyRoute): AnyRoute[] {
  return [
    createRoute({ getParentRoute: () => rootRoute, path: '/', component: SiteIndex }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '$',
      component: SitePageFromLocation,
    }),
  ]
}
