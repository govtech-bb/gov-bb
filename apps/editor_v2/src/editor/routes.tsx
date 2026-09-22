import { createRoute, type AnyRoute } from '@tanstack/react-router'
import { DocumentList } from './document-list'
import { EditorPage } from './editor-page'

/** Mounted first, so the site's splat route cannot swallow `/editor`. */
export function editorRoutes(rootRoute: AnyRoute): AnyRoute[] {
  return [
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/editor',
      component: DocumentList,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/editor/$id',
      component: EditorPage,
    }),
  ]
}
