/**
 * What a site reader may see. A page is visible only when it and every page
 * above it, by `parent_id`, are visible to that reader: the public sees
 * public pages, and a reviewer with the preview token sees preview ones too.
 * A page's Start link hides when its `start` sub-page is hidden.
 *
 * The API serves the content and decides what may be seen; rendering the
 * markdown is the site's job.
 */

import { z } from "zod";
import { Frontmatter, type PageId, type Visibility } from "./page";

/** Who is reading: the public, or a reviewer holding the preview token. */
export type Viewer = "public" | "preview";

const VISIBLE_TO: Record<Viewer, readonly Visibility[]> = {
  public: ["public"],
  preview: ["public", "preview"],
};

/** The visibilities a viewer may see. */
export function visibleTo(viewer: Viewer): readonly Visibility[] {
  return VISIBLE_TO[viewer];
}

/** Whether a viewer may see a page of this visibility. */
export function canSee(viewer: Viewer, visibility: Visibility): boolean {
  return VISIBLE_TO[viewer].includes(visibility);
}

/** A page as public resolution reads it. */
export interface ResolvablePage {
  readonly id: PageId;
  readonly url: string;
  readonly title: string;
  readonly description: string | null;
  readonly visibility: Visibility;
  readonly categoryId: string | null;
  readonly parentId: PageId | null;
  readonly formId: string | null;
  readonly bodyMarkdown: string;
  readonly frontmatter: Frontmatter;
  readonly publishedAt: Date | null;
  readonly updatedAt: Date;
}

/** A page above another, as its trail and its visibility need it. */
export interface Ancestor {
  readonly url: string;
  readonly title: string;
  readonly visibility: Visibility;
}

/** One level of the trail to a page. */
export const Breadcrumb = z.object({ name: z.string(), url: z.string() });

/** One level of the trail to a page. */
export type Breadcrumb = z.infer<typeof Breadcrumb>;

/** A page as the site reads it. */
export const PublicPage = z.object({
  url: z.string(),
  frontmatter: Frontmatter.extend({
    title: z.string(),
    description: z.string().optional(),
  }).describe(
    "The stored frontmatter, with the page's title and description " +
      "(columns of their own) put back.",
  ),
  body_markdown: z
    .string()
    .describe("The page body as written. The site sanitises and renders it."),
  form_id: z
    .string()
    .nullable()
    .describe(
      "The form a Start link with no href of its own opens, or null. " +
        "Whether the form is open is the forms API's to say.",
    ),
  hide_start_links: z
    .boolean()
    .describe(
      "True when the page's `start` sub-page is hidden from this viewer: " +
        'the site removes the Start link and counts "There are N ways…" down.',
    ),
  breadcrumbs: z
    .array(Breadcrumb)
    .describe(
      "The full trail, current page included, Home not: the category " +
        "(and its parent, for a subcategory), then the pages above this one.",
    ),
  published_at: z.iso
    .datetime()
    .nullable()
    .describe(
      "When the page first went public (seeded from landing's " +
        "`publish_date`); null until it has.",
    ),
  updated_at: z.iso
    .datetime()
    .describe(
      "The page's last save, visibility changes included: the site's " +
        '"Last updated" line.',
    ),
});

/** A page as the site reads it. */
export type PublicPage = z.infer<typeof PublicPage>;

/** What reading a url comes to. */
export type Resolution =
  | { readonly kind: "page"; readonly page: PublicPage }
  | { readonly kind: "redirect"; readonly url: string }
  | { readonly kind: "not_found" };

/** Effective visibility: a page is as hidden as anything above it. */
export function hiddenFrom(
  viewer: Viewer,
  page: ResolvablePage,
  ancestors: readonly Ancestor[],
): boolean {
  return (
    !canSee(viewer, page.visibility) ||
    ancestors.some((ancestor) => !canSee(viewer, ancestor.visibility))
  );
}

/** The page as the site reads it: its category's crumbs, then the pages above, then itself. */
export function toPublicPage(
  page: ResolvablePage,
  view: {
    readonly ancestors: readonly Ancestor[];
    readonly categoryCrumbs: readonly Breadcrumb[];
    readonly hideStartLinks: boolean;
  },
): PublicPage {
  return {
    url: page.url,
    frontmatter: {
      ...page.frontmatter,
      title: page.title,
      ...(page.description ? { description: page.description } : {}),
    },
    body_markdown: page.bodyMarkdown,
    form_id: page.formId,
    hide_start_links: view.hideStartLinks,
    breadcrumbs: [
      ...view.categoryCrumbs,
      ...view.ancestors.map((ancestor) => ({
        name: ancestor.title,
        url: ancestor.url,
      })),
      { name: page.title, url: page.url },
    ],
    published_at: page.publishedAt?.toISOString() ?? null,
    updated_at: page.updatedAt.toISOString(),
  };
}
