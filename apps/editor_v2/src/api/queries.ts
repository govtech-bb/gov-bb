import { queryOptions } from "@tanstack/react-query";
import type { EditorApi } from "./client";

// Every content read sits under "content", so one invalidation refreshes them all.

export const servicesQuery = (api: EditorApi) =>
  queryOptions({ queryKey: ["content", "services"], queryFn: () => api.services() });

export const serviceQuery = (api: EditorApi, id: string) =>
  queryOptions({ queryKey: ["content", "service", id], queryFn: () => api.service(id) });

export const pageQuery = (api: EditorApi, id: string) =>
  queryOptions({ queryKey: ["content", "page", id], queryFn: () => api.page(id) });

export const taxonomyQuery = (api: EditorApi) =>
  queryOptions({ queryKey: ["content", "taxonomy"], queryFn: () => api.taxonomy() });
