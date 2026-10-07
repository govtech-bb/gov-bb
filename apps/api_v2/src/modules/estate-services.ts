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

/** A page of a service, as the editor opens it. */
export const ServicePage = z.object({
  id: PageId,
  parent_id: PageId.nullable(),
  role: z.enum(["entry", "start", "supporting"]),
  url: z.string(),
  slug: z.string(),
  title: z.string(),
  visibility: Visibility,
  form_id: z.string().nullable(),
  updated_at: z.iso.datetime(),
});

/** A page of a service, as the editor opens it. */
export type ServicePage = z.infer<typeof ServicePage>;

/** A service as the editor opens it: its summary and every page in it. */
export const ServiceDetail = z.object({
  service: ServiceSummary,
  pages: z
    .array(ServicePage)
    .describe("The entry page, then each page before the pages below it."),
});

/** A service as the editor opens it. */
export type ServiceDetail = z.infer<typeof ServiceDetail>;

const isStartOf = (page: IndexedPage, entry: IndexedPage) =>
  page.parentId === entry.id && page.slug === "start";

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
      const start = members.find((page) => isStartOf(page, entry));
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

/** The service whose entry page this is, with every page below it; null for any other page. */
export function serviceAt(
  pages: readonly IndexedPage[],
  id: PageId,
): ServiceDetail | null {
  const entry = pages.find((page) => page.id === id);
  const service = groupServices(pages).find((summary) => summary.id === id);
  // Walking down from a page with no parent cannot meet a loop.
  if (!entry || entry.parentId !== null || !service) return null;
  const below = (parent: IndexedPage): IndexedPage[] =>
    pages
      .filter((page) => page.parentId === parent.id)
      .sort((a, b) => a.title.localeCompare(b.title))
      .flatMap((page) => [page, ...below(page)]);
  return {
    service,
    pages: [entry, ...below(entry)].map((page) => ({
      id: page.id,
      parent_id: page.parentId,
      role:
        page === entry
          ? "entry"
          : isStartOf(page, entry)
            ? "start"
            : "supporting",
      url: page.url,
      slug: page.slug,
      title: page.title,
      visibility: page.visibility,
      form_id: page.formId,
      updated_at: page.updatedAt.toISOString(),
    })),
  };
}
