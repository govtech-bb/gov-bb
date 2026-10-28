import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { EditorApi, EstateVersion } from "./client";

// Every content read sits under "content", so one invalidation refreshes them all.

/**
 * How long something fetched ahead, such as a page preloaded as the author points at its link, counts as fresh: as
 * long as the router counts its own preloads fresh.
 */
export const PRELOAD_FRESH = 30_000;

export const servicesQuery = (api: EditorApi) =>
  queryOptions({ queryKey: ["content", "services"], queryFn: () => api.services() });

export const serviceQuery = (api: EditorApi, id: string) =>
  queryOptions({ queryKey: ["content", "service", id], queryFn: () => api.service(id) });

export const pageQuery = (api: EditorApi, id: string) =>
  queryOptions({ queryKey: ["content", "page", id], queryFn: () => api.page(id) });

/** The categories saved in the content API, which page pickers offer; the preview's edits never appear here. */
export const savedCategoriesQuery = (api: EditorApi) =>
  queryOptions({ queryKey: ["content", "saved-categories"], queryFn: () => api.savedCategories() });

/** The Categories screen's local preview, which page pickers never read. */
export const categoriesQuery = (api: EditorApi) =>
  queryOptions({ queryKey: ["content", "categories"], queryFn: () => api.categories() });

const VERSION_KEY = ["version"];

/** The estate's change token, polled; when it moves, every content read refreshes. */
export const estateVersionQuery = (api: Pick<EditorApi, "version">, client: QueryClient) =>
  queryOptions({
    queryKey: VERSION_KEY,
    queryFn: async () => {
      const previous = client.getQueryData<EstateVersion>(VERSION_KEY);
      const version = await api.version();

      if (previous && (previous.count !== version.count || previous.latest !== version.latest))
        await client.invalidateQueries({ queryKey: ["content"] });

      return version;
    },
    refetchInterval: 30_000,
  });
