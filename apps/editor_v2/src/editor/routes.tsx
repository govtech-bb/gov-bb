import { createRoute, type AnyRoute } from "@tanstack/react-router";
import { CollectionEditor } from "./collection-editor";
import { EditorPage } from "./editor-page";
import { ServiceItems } from "./service-items";
import { ServiceList } from "./service-list";

/**
 * Mounted first, so the site's splat route cannot swallow `/editor`.
 *
 * Static paths are declared before `/editor/$id` so `/editor/collections`
 * resolves to the collection list rather than being read as a document id.
 */
export function editorRoutes(rootRoute: AnyRoute): AnyRoute[] {
  return [
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/editor",
      component: ServiceList,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/editor/service/$category/$service",
      component: ServiceItems,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/editor/collections/$key",
      component: CollectionEditor,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/editor/$id",
      component: EditorPage,
    }),
  ];
}
