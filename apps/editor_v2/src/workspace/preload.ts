import type { QueryClient } from "@tanstack/react-query";
import type { EditorApi } from "../api/client";
import {
  PRELOAD_FRESH,
  categoriesQuery,
  collectionQuery,
  collectionsQuery,
  pageQuery,
  reviewQueueQuery,
  revisionQuery,
  serviceQuery,
  servicesQuery,
} from "../api/queries";

// Ahead of a screen, a service is only fetched from the content API when the services list or an earlier visit
// shows it's there: a service drafted in this browser never is. What was fetched just now isn't fetched again, and a
// failure is left for the screen, which asks again and says so.

const inApi = (client: QueryClient, api: EditorApi, serviceId: string) =>
  !!client.getQueryData(serviceQuery(api, serviceId).queryKey) ||
  !!client.getQueryData(servicesQuery(api).queryKey)?.some((service) => service.id === serviceId);

/** Starts loading a service's pages before its screen opens, as a link to it is pointed at or followed. */
export function primeService(client: QueryClient, api: EditorApi, serviceId: string) {
  if (inApi(client, api, serviceId))
    void client.prefetchQuery({ ...serviceQuery(api, serviceId), staleTime: PRELOAD_FRESH });
}

/** Starts loading a page of a service, and the categories its settings offer, before it opens. */
export function primePage(client: QueryClient, api: EditorApi, serviceId: string, pageId: string) {
  const detail = client.getQueryData(serviceQuery(api, serviceId).queryKey);

  // A service's own page is its entry page; its other pages are known once the service is
  const page = detail
    ? detail.pages.some((item) => item.id === pageId)
    : pageId === serviceId && inApi(client, api, serviceId);

  if (!page) return;
  void client.prefetchQuery({ ...pageQuery(api, pageId), staleTime: PRELOAD_FRESH });
  void client.prefetchQuery({ ...categoriesQuery(api), staleTime: PRELOAD_FRESH });
}

/** Starts loading the categories before their screen opens. */
export function primeCategories(client: QueryClient, api: EditorApi) {
  void client.prefetchQuery({ ...categoriesQuery(api), staleTime: PRELOAD_FRESH });
}

/** Starts loading the collections before their screen opens. */
export function primeCollections(client: QueryClient, api: EditorApi) {
  void client.prefetchQuery({ ...collectionsQuery(api), staleTime: PRELOAD_FRESH });
}

/** Starts loading a collection's records before its screen opens. */
export function primeCollection(client: QueryClient, api: EditorApi, key: string) {
  void client.prefetchQuery({ ...collectionQuery(api, key), staleTime: PRELOAD_FRESH });
}

/** Starts loading the review queue before its screen opens. */
export function primeReviewQueue(client: QueryClient, api: EditorApi) {
  void client.prefetchQuery({ ...reviewQueueQuery(api), staleTime: PRELOAD_FRESH });
}

/** Starts loading a page's change before its review screen opens. */
export function primeRevision(client: QueryClient, api: EditorApi, pageId: string) {
  void client.prefetchQuery({ ...revisionQuery(api, pageId), staleTime: PRELOAD_FRESH });
}
