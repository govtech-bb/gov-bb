import { queryOptions } from "@tanstack/react-query";
import type { EditorApi } from "./client";

// Every content read sits under "content", so one invalidation refreshes them all.

export const servicesQuery = (api: EditorApi) =>
  queryOptions({ queryKey: ["content", "services"], queryFn: () => api.services() });
