import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { EditorApi, EstateVersion } from "./client";

// Every content read sits under "content", so one invalidation refreshes them all.

export const servicesQuery = (api: EditorApi) =>
  queryOptions({ queryKey: ["content", "services"], queryFn: () => api.services() });

export const serviceQuery = (api: EditorApi, id: string) =>
  queryOptions({ queryKey: ["content", "service", id], queryFn: () => api.service(id) });

export const pageQuery = (api: EditorApi, id: string) =>
  queryOptions({ queryKey: ["content", "page", id], queryFn: () => api.page(id) });

export const taxonomyQuery = (api: EditorApi) =>
  queryOptions({ queryKey: ["content", "taxonomy"], queryFn: () => api.taxonomy() });

const VERSION_KEY = ["version"];

/** The estate's change token, polled; when it moves, every content read refreshes. */
export const versionQuery = (api: Pick<EditorApi, "version">, client: QueryClient) =>
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
