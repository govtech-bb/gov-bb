import { queryOptions, type QueryClient } from "@tanstack/react-query";
import {
  ApiFailure,
  CategoryAnswerMalformed,
  isText,
  type EditorApi,
  type EstateVersion,
} from "./client";

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

export const pageQuery = (api: EditorApi, id: string) =>
  queryOptions({ queryKey: ["content", "page", id], queryFn: () => api.page(id) });

/** The changes waiting for an approver. */
export const reviewQueueQuery = (api: Pick<EditorApi, "reviewQueue">) =>
  queryOptions({ queryKey: ["content", "review-queue"], queryFn: () => api.reviewQueue() });

/** A page's current change with what it changes against the live page; a 404 when it has none. */
export const revisionQuery = (api: Pick<EditorApi, "revision">, id: string) =>
  queryOptions({ queryKey: ["content", "revision", id], queryFn: () => api.revision(id) });

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

/**
 * The signed-in employee's roles, which decide what the editor offers them. An answer without a list of roles holds
 * none, so the editor offers less rather than more; the API enforces roles either way.
 */
export const rolesQuery = (api: Pick<EditorApi, "me">) =>
  queryOptions({
    queryKey: ["me"],
    queryFn: async (): Promise<readonly string[]> => {
      const me: unknown = await api.me();

      return me instanceof Object && "roles" in me && Array.isArray(me.roles) ? me.roles : [];
    },
  });

/** The signed-in employee's user id, which tells a change they worked on from anyone else's; null if not given. */
export const employeeIdQuery = (api: Pick<EditorApi, "me">) =>
  queryOptions({
    queryKey: ["me", "id"],
    queryFn: async (): Promise<string | null> => {
      const me: unknown = await api.me();

      return me instanceof Object && "id" in me && isText(me.id) ? me.id : null;
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

/** The data collections, with their record counts, for the Collections screen. */
export const collectionsQuery = (api: EditorApi) =>
  queryOptions({ queryKey: ["content", "collections"], queryFn: () => api.collections() });

/** One collection and its records, shared by its screen and the record dialogs over it. */
export const collectionQuery = (api: EditorApi, key: string) =>
  queryOptions({ queryKey: ["content", "collection", key], queryFn: () => api.collection(key) });
