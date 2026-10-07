/**
 * A content page: what it is, what the editor may send, and the rules every
 * layer shares about its url, its place in the hierarchy and its publication.
 */

import { z } from "zod";

/** Who may see a page, in the database enum's order. */
export const VISIBILITIES = ["public", "preview", "draft"] as const;

/** Parses who may see a page. */
export const Visibility = z.enum(VISIBILITIES);

/** Who may see a page. */
export type Visibility = z.infer<typeof Visibility>;

/**
 * What is left of a page's frontmatter once the fields with columns of their
 * own are taken out: title, description, category, visibility and form_id
 * are columns so filters need no JSON lookup, and are not repeated here.
 */
export const Frontmatter = z.object({
  lede: z.string().optional(),
  stage: z.string().optional(),
  featured: z.boolean().optional(),
  section: z.string().optional(),
  service_type: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  source_url: z.string().optional(),
});

/** The frontmatter fields that did not become columns. */
export type Frontmatter = z.infer<typeof Frontmatter>;

/** Parses a content page's id, a UUID. */
export const PageId = z.guid().brand<"PageId">();

/** A parsed content page id. */
export type PageId = z.infer<typeof PageId>;

/** Parses a page's url: a path with no trailing slash, query or fragment. */
export const PageUrl = z
  .string()
  .max(512)
  .regex(/^\/[^?#]*[^/?#]$/)
  .refine(
    (url) => (segmentsOf(url).at(-1) ?? "").length <= 200,
    "The url's last segment, its slug, can be at most 200 characters.",
  )
  .describe("The site's routing key.");

/** Parses every field of a page its author sets. */
export const PageFields = z.object({
  url: PageUrl,
  category_id: z.guid().nullable(),
  parent_id: PageId.nullable().describe(
    "The page this one sits beneath, in the same category; null for a " +
      "page at the root of its category, which is what the category lists.",
  ),
  title: z.string().min(1).max(300),
  description: z.string().nullable(),
  visibility: Visibility,
  form_id: z.string().max(100).nullable(),
  body_markdown: z.string(),
  frontmatter: Frontmatter,
});

/** Every field of a page its author sets. */
export type PageFields = z.infer<typeof PageFields>;

/** Parses what a write sends: url, title and body, an optional id, and other fields that default when left out. */
export const NewPage = PageFields.partial({
  category_id: true,
  parent_id: true,
  description: true,
  visibility: true,
  form_id: true,
  frontmatter: true,
}).extend({ id: PageId.optional() });

/** A page as the editor sends it. The slug is derived from the url, never sent. */
export type NewPage = z.infer<typeof NewPage>;

/** A page as the editor reads it: its fields, plus what storage records. */
export const PageDocument = PageFields.extend({
  id: PageId,
  slug: z.string().describe("The url's last segment."),
  published_at: z.iso
    .datetime()
    .nullable()
    .describe("When the page first went public; null until it has."),
  created_at: z.iso.datetime(),
  updated_at: z.iso
    .datetime()
    .describe(
      "Millisecond precision, and exactly the value to send back in " +
        "`if-updated-at` on the next save.",
    ),
});

/** A page as the editor reads it. */
export type PageDocument = z.infer<typeof PageDocument>;

/**
 * Parses what a save sends: every field, since a save replaces the page and
 * defaults none, except `parent_id`. Leaving that out keeps the page's parent,
 * so a client that does not know about the hierarchy cannot detach a
 * sub-page, and so publish it, by omission.
 */
export const SaveFields = PageFields.partial({ parent_id: true });

/** What a save sends. */
export type SaveFields = z.infer<typeof SaveFields>;

/** A page's stored values, as a write sets them. */
export interface PageValues {
  readonly url: string;
  readonly slug: string;
  readonly categoryId: string | null;
  readonly parentId: PageId | null;
  readonly title: string;
  readonly description: string | null;
  readonly visibility: Visibility;
  readonly formId: string | null;
  readonly bodyMarkdown: string;
  readonly frontmatter: Frontmatter;
}

/** A url's path segments: `/a/b` → `["a", "b"]`. */
export function segmentsOf(url: string): string[] {
  return url.split("/").filter(Boolean);
}

/** The slug a bare `/<slug>` url names, or null for a url of more levels. */
export function bareSlugOf(url: string): string | null {
  const segments = segmentsOf(url);
  return segments.length === 1 ? (segments[0] ?? null) : null;
}

/** A page's fields with what a write left out filled in: an unfiled, formless draft at its category's root. */
export function withDefaults(page: NewPage): PageFields {
  return {
    url: page.url,
    category_id: page.category_id ?? null,
    parent_id: page.parent_id ?? null,
    title: page.title,
    description: page.description ?? null,
    visibility: page.visibility ?? "draft",
    form_id: page.form_id ?? null,
    body_markdown: page.body_markdown,
    frontmatter: page.frontmatter ?? {},
  };
}

/** A page's fields as storage keeps them, the slug derived from the url. */
export function pageValues(fields: PageFields): PageValues {
  return {
    url: fields.url,
    slug: segmentsOf(fields.url).at(-1) ?? "",
    categoryId: fields.category_id,
    parentId: fields.parent_id,
    title: fields.title,
    description: fields.description,
    visibility: fields.visibility,
    formId: fields.form_id,
    bodyMarkdown: fields.body_markdown,
    frontmatter: fields.frontmatter,
  };
}

/** A sub-page that names no category takes its parent's. */
export function placedUnder(
  fields: PageFields,
  parentCategoryId: string | null,
): PageFields {
  return fields.parent_id !== null && fields.category_id === null
    ? { ...fields, category_id: parentCategoryId }
    : fields;
}

/** A page cannot sit beneath itself, directly or further down. */
export function cycleOf(
  id: PageId,
  parentId: PageId,
  ancestorIds: readonly string[],
): PageRejected | null {
  return parentId === id || ancestorIds.includes(id)
    ? new PageRejected([
        { field: "parent_id", message: "A page cannot be its own sub-page." },
      ])
    : null;
}

/** What creating a page writes: published now if it starts public. */
export function creationOf(
  id: PageId | undefined,
  fields: PageFields,
  now: Date,
) {
  return {
    id,
    values: pageValues(fields),
    publishedAt: fields.visibility === "public" ? now : null,
  };
}

/**
 * What saving `fields` over the stored page writes. The version moves
 * strictly forward, so two saves in one millisecond still differ, and
 * publication is stamped the first time the page goes public and never moves
 * after that.
 */
export function revisionOf(
  current: PageDocument,
  fields: PageFields,
  now: Date,
) {
  const updatedAt = new Date(
    Math.max(now.getTime(), Date.parse(current.updated_at) + 1),
  );
  const publishedAt =
    current.published_at !== null
      ? new Date(current.published_at)
      : fields.visibility === "public"
        ? updatedAt
        : null;
  return {
    values: pageValues(fields),
    updatedAt,
    publishedAt,
    action:
      current.published_at === null && publishedAt !== null
        ? ("published" as const)
        : ("updated" as const),
  };
}

/** One field a write cannot have as sent. */
export interface FieldError {
  readonly field: string;
  readonly message: string;
}

/** A write the rules or the database refused: an unknown category or parent, a taken url, a loop. */
export class PageRejected extends Error {
  /** Stable protocol-projection discriminator. */
  readonly _tag = "PageRejected" as const;
  /** The refused fields, each with what the editor can do about it. */
  constructor(readonly errors: readonly FieldError[]) {
    super(`${errors.length} validation error(s)`);
  }
}

/** A save named a page that does not exist. */
export class PageNotFound extends Error {
  /** Stable protocol-projection discriminator. */
  readonly _tag = "PageNotFound" as const;
  /** The id that matched nothing. */
  constructor(readonly id: PageId) {
    super(`No document with id ${id}`);
  }
}

/** A save lost to a write its caller had not read. */
export class PageConflict extends Error {
  /** Stable protocol-projection discriminator. */
  readonly _tag = "PageConflict" as const;
  /** The page that changed underneath the caller. */
  constructor(readonly documentId: PageId) {
    super(
      "This page was changed somewhere else since you opened it. Reload to see the current version.",
    );
  }
}

/** Content storage could not complete an operation. The cause can carry SQL parameters, so it is never logged or sent. */
export class ContentStoreUnavailable extends Error {
  /** Stable protocol-projection discriminator. */
  readonly _tag = "ContentStoreUnavailable" as const;
  /** The storage operation that failed, safe to log. */
  constructor(
    readonly operation: string,
    cause: unknown,
  ) {
    super(`Content storage failed during ${operation}.`, { cause });
  }
}
