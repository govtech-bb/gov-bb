import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { ApiFailure, CategoryAnswerMalformed, type EditorApi, type EstateVersion } from "./client";

// Every content read sits under "content", so one invalidation refreshes them all.

/**
 * How long something fetched ahead, such as a page preloaded as the author points at its link, counts as fresh: as
 * long as the router counts its own preloads fresh.
 */
export const PRELOAD_FRESH = 30_000;

/**
 * Whether a failed content read is asked again: up to three times, except for a refusal or a malformed category list,
 * which answer the same way however often they're asked.
 */
export const retryContentRead = (failures: number, error: Error) =>
  failures < 3 &&
  !(error instanceof ApiFailure && error.status >= 400 && error.status < 500) &&
  !(error instanceof CategoryAnswerMalformed);

export const servicesQuery = (api: EditorApi) =>
  queryOptions({ queryKey: ["content", "services"], queryFn: () => api.services() });

export const serviceQuery = (api: EditorApi, id: string) =>
  queryOptions({ queryKey: ["content", "service", id], queryFn: () => api.service(id) });

/** Only the query adapter turns a typed page-read failure into TanStack Query rejection. */
export const pageQuery = (api: EditorApi, id: string) =>
  queryOptions({
    queryKey: ["content", "page", id],
    queryFn: async () => {
      const result = await api.page(id);

      if (result.ok) return result.value;
      const failure = result.error;

      const status =
        failure.kind === "signed-out"
          ? 401
          : failure.kind === "forbidden"
            ? 403
            : failure.kind === "missing"
              ? 404
              : failure.kind === "invalid"
                ? 400
                : 0;

      throw new ApiFailure(status, failure.kind === "invalid" ? failure.errors : []);
    },
  });

/**
 * The one shared category list for Categories, Services filters, page settings and Create service. A failed read
 * is thrown here, where React Query keeps it as the query's error for the screen to show.
 */
export const categoriesQuery = (api: EditorApi) =>
  queryOptions({
    queryKey: ["content", "categories"],
    queryFn: async () => {
      const listed = await api.categories();

      if (!listed.ok) throw listed.error;

      return listed.value;
    },
  });

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
