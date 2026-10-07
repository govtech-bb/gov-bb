/**
 * The estate grouped into services: a categorised page at the root of its
 * category is an entry, and every page beneath it by `parent_id` (its `start`
 * step, supporting pages) belongs to it. Uncategorised root pages such as
 * `/terms-conditions` are not services.
 */

import { z } from "zod";
import { PageId, Visibility } from "./page";

/** A page as the service index groups it. */
export interface IndexedPage {
  readonly id: PageId;
  readonly parentId: PageId | null;
  readonly slug: string;
  readonly url: string;
  readonly title: string;
  readonly visibility: Visibility;
  readonly formId: string | null;
  readonly updatedAt: Date;
  readonly category: { readonly slug: string; readonly title: string } | null;
}

/** A service as the editor's list shows it: its entry page and the pages below. */
export const ServiceSummary = z.object({
  id: PageId.describe("The entry page's id."),
  url: z.string(),
  title: z.string(),
  category: z.object({ slug: z.string(), title: z.string() }),
  visibility: Visibility,
  form_id: z
    .string()
    .nullable()
    .describe("The entry page's form, else its `/start` page's."),
  has_start_page: z.boolean(),
  page_count: z.int().describe("The entry page plus every page below it."),
  updated_at: z.iso
    .datetime()
    .describe("The latest change across those pages."),
});

/** A service as the editor's list shows it. */
export type ServiceSummary = z.infer<typeof ServiceSummary>;

/** Group pages into services by `parent_id`, ordered by title. */
export function groupServices(pages: readonly IndexedPage[]): ServiceSummary[] {
  // ponytail: groups the whole estate in memory; move to SQL or page it past a few thousand pages.
  const byId = new Map(pages.map((page) => [page.id, page]));
  const rootOf = (page: IndexedPage) => {
    const seen = new Set<string>();
    let current = page;
    while (current.parentId && !seen.has(current.id)) {
      seen.add(current.id);
      current = byId.get(current.parentId) ?? current;
    }
    return current;
  };
  const groups = new Map<PageId, IndexedPage[]>();
  for (const page of pages) {
    const root = rootOf(page).id;
    groups.set(root, [...(groups.get(root) ?? []), page]);
  }

  return [...groups]
    .flatMap(([rootId, members]) => {
      const entry = byId.get(rootId);
      if (!entry?.category) return [];
      const start = members.find(
        (page) => page.parentId === entry.id && page.slug === "start",
      );
      return [
        {
          id: entry.id,
          url: entry.url,
          title: entry.title,
          category: entry.category,
          visibility: entry.visibility,
          form_id: entry.formId ?? start?.formId ?? null,
          has_start_page: start !== undefined,
          page_count: members.length,
          updated_at: new Date(
            Math.max(...members.map((page) => page.updatedAt.getTime())),
          ).toISOString(),
        },
      ];
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}
