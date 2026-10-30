import { queryOptions } from "@tanstack/react-query";
import type { EditorApi } from "./client";

/** All internal page link targets, including standalone pages; a failed listing is never an empty list. */
export const pageLinkTargetsQuery = (
  api: Pick<EditorApi, "pagePaths" | "categories">,
  paths: readonly string[],
) =>
  queryOptions({
    queryKey: ["content", "page-link-targets"],
    enabled: paths.length > 0,
    queryFn: async () => {
      const [pages, categories] = await Promise.all([api.pagePaths(), api.categories()]);

      if (!categories.ok) throw categories.error;

      return [...new Set(["/", ...pages, ...categories.value.map((category) => category.url)])].map(
        (path) => new URL(path, "https://www.gov.bb").pathname.replace(/\/+$/, "") || "/",
      );
    },
  });
