/**
 * Request and response contracts for every route, in Zod.
 *
 * Fastify validates requests and serialises responses with these objects, and
 * the OpenAPI document is generated from them, so the spec cannot drift from
 * the behaviour: `openapi.test.ts` snapshots the result into `openapi.json`.
 */

import type { FastifySchema } from "fastify";
import { z } from "zod";

const visibility = z.enum(["public", "preview", "draft"]);

/** The frontmatter fields that did not become columns. */
const frontmatterFields = {
  lede: z.string().optional(),
  stage: z.string().optional(),
  featured: z.boolean().optional(),
  section: z.string().optional(),
  service_type: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  source_url: z.string().optional(),
};

const frontmatter = z.object(frontmatterFields);

const publicPage = z.object({
  url: z.string(),
  frontmatter: z
    .object({
      title: z.string(),
      description: z.string().optional(),
      ...frontmatterFields,
    })
    .describe(
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
    .array(z.object({ name: z.string(), url: z.string() }))
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

const pageDocument = z.object({
  id: z.guid(),
  url: z.string().describe("The site's routing key."),
  slug: z.string().describe("The url's last segment."),
  category_id: z.guid().nullable(),
  parent_id: z
    .guid()
    .nullable()
    .describe(
      "The page this one sits beneath, in the same category; null for a " +
        "page at the root of its category, which is what the category lists.",
    ),
  title: z.string(),
  description: z.string().nullable(),
  visibility,
  form_id: z.string().nullable(),
  body_markdown: z.string(),
  frontmatter,
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

const serviceSummary = z.object({
  id: z.guid().describe("The entry page's id."),
  url: z.string(),
  title: z.string(),
  category: z.object({ slug: z.string(), title: z.string() }),
  visibility,
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

/** What a write sends. The slug comes from the url. */
const pageInput = z.object({
  id: z.guid().optional(),
  url: z.string().regex(/^\/[^?#]*[^/?#]$/),
  category_id: z.guid().nullable().optional(),
  parent_id: z.guid().nullable().optional(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  visibility: visibility.optional(),
  form_id: z.string().nullable().optional(),
  body_markdown: z.string(),
  frontmatter: frontmatter.optional(),
});

const categoryRef = z.object({
  slug: z.string(),
  url: z.string().describe("`/<category>`, or `/<category>/<subcategory>`."),
  title: z.string(),
  description: z.string().nullable(),
});

const pageSummary = z.object({
  url: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  digital: z
    .boolean()
    .describe("It has a form, or its frontmatter says it is digital."),
});

const categoryTree = z.object({
  categories: z.array(
    categoryRef.extend({ subcategories: z.array(categoryRef) }),
  ),
});

const categoryListing = z.object({
  category: categoryRef,
  parent: categoryRef
    .nullable()
    .describe("The category this is a subcategory of, or null."),
  subcategories: z
    .array(categoryRef)
    .describe("Those with something to list, in order."),
  pages: z
    .array(pageSummary)
    .describe("The pages at the category's root, A to Z."),
});

const catalog = z.object({
  pages: z.array(pageSummary.extend({ stage: z.string().nullable() })),
});

const searchDocuments = z.object({
  documents: z.array(
    pageSummary.extend({
      keywords: z.array(z.string()),
      chunks: z
        .array(z.object({ heading: z.string().nullable(), body: z.string() }))
        .describe(
          "The body as plain text, split at its headings, in order. " +
            "Joined with spaces (heading, then body, skipping empties) " +
            "they are the whole body's text.",
        ),
    }),
  ),
});

/** No credentials, or the preview token. */
const previewSecurity: Array<Record<string, string[]>> = [
  {},
  { previewToken: [] },
];

/** Site reads: the public's view, or a reviewer's with the preview token. */
const siteRead = {
  headers: z.object({
    "x-preview-token": z
      .string()
      .optional()
      .describe(
        "The site's PREVIEW_SECRET. With it, `preview` content is served " +
          "too, uncached (`no-store`); a wrong one is a 401.",
      ),
  }),
  security: previewSecurity,
};

const error = z.looseObject({
  error: z.string(),
  message: z.string().optional(),
});

const validationFailed = z.looseObject({
  error: z.literal("validation_failed"),
  message: z.string().optional(),
  errors: z.array(z.object({ field: z.string(), message: z.string() })),
});

const conflict = z.looseObject({
  error: z.literal("conflict"),
  message: z.string(),
  documentId: z.guid(),
});

const idParams = z.object({ id: z.string() });

const editorSecurity = [{ editorSession: [] }];
const authErrors = { 401: error, 403: error, 503: error };

/** Request and response contracts shared by serving and documentation. */
export const SCHEMAS = {
  getPageByUrl: {
    summary: "Get a public page by its url",
    description:
      "The site's read. A page is served only when it and every page above " +
      "it (by `parent_id`) are visible: public, or preview too with the " +
      "preview token. `hide_start_links` is set when the page's `start` " +
      "sub-page is not. A bare `/<slug>` with no page of its own redirects " +
      "(301) to the one visible page with that slug.",
    tags: ["pages"],
    ...siteRead,
    querystring: z.object({ url: z.string().min(1) }),
    response: {
      200: publicPage,
      301: z.object({ redirect: z.string() }),
      400: error,
      401: error,
      404: error,
    },
  },

  getCategories: {
    summary: "The categories the site lists",
    description:
      "In order, each with its subcategories. A category is listed when it " +
      "or one of its subcategories has a visible page at its root.",
    tags: ["categories"],
    ...siteRead,
    response: { 200: categoryTree, 401: error },
  },

  getCategory: {
    summary: "A category and what it lists",
    description:
      "Its subcategories and the visible pages at its root. 404 when it " +
      "lists nothing.",
    tags: ["categories"],
    ...siteRead,
    params: z.object({ slug: z.string() }),
    response: { 200: categoryListing, 401: error, 404: error },
  },

  getSubcategory: {
    summary: "A subcategory and what it lists",
    tags: ["categories"],
    ...siteRead,
    params: z.object({ category: z.string(), slug: z.string() }),
    response: { 200: categoryListing, 401: error, 404: error },
  },

  getCatalog: {
    summary: "Every visible page",
    description:
      "Sub-pages included, `start` steps not, A to Z: for the sitemap and " +
      "service lists.",
    tags: ["pages"],
    ...siteRead,
    response: { 200: catalog, 401: error },
  },

  getSearchDocuments: {
    summary: "What search indexes",
    description:
      "Every page the catalog lists, with its keywords and its body as " +
      "plain-text chunks.",
    tags: ["search"],
    ...siteRead,
    response: { 200: searchDocuments, 401: error },
  },

  getPage: {
    summary: "Get a page by id",
    description: "The editor's read: any visibility, markdown included.",
    tags: ["pages"],
    params: idParams,
    security: editorSecurity,
    response: { 200: pageDocument, 404: error, ...authErrors },
  },

  createPage: {
    summary: "Create a page",
    description: "Requires an employee session and the editor's Origin header.",
    tags: ["pages"],
    body: pageInput,
    security: editorSecurity,
    response: { 201: pageDocument, 422: validationFailed, ...authErrors },
  },

  savePage: {
    summary: "Save a page",
    description:
      "Requires an employee session and the editor's Origin header. " +
      "Send the `updated_at` you last read in the `if-updated-at` header. " +
      "If the stored row has moved on since, the save is refused with a 409 " +
      "rather than silently discarding whoever wrote first.",
    tags: ["pages"],
    params: idParams,
    headers: z.object({
      "if-updated-at": z
        .string()
        .optional()
        .describe(
          "The `updated_at` this client last read. Omit to accept " +
            "whatever is stored.",
        ),
    }),
    body: pageInput,
    security: editorSecurity,
    response: {
      200: pageDocument,
      404: error,
      409: conflict,
      422: validationFailed,
      ...authErrors,
    },
  },

  deletePage: {
    summary: "Delete a page",
    description:
      "Requires an employee session and the editor's Origin header. A page " +
      "with sub-pages is refused (422) until they are moved or deleted.",
    tags: ["pages"],
    params: idParams,
    security: editorSecurity,
    response: { 204: z.undefined(), 422: validationFailed, ...authErrors },
  },

  listServices: {
    summary: "List services",
    description:
      "The editor's index, ordered by title. A categorised page at the root " +
      "of its category is an entry, and every page beneath it by " +
      "`parent_id` belongs to it.",
    tags: ["pages"],
    security: editorSecurity,
    response: { 200: z.array(serviceSummary), ...authErrors },
  },

  version: {
    summary: "A version token for the whole estate",
    description:
      "`change_events` is append-only and gets a row on every write, so its " +
      "count and newest timestamp identify the state of everything without " +
      "reading any of it. Clients poll this and refetch only when it moves.",
    tags: ["meta"],
    security: editorSecurity,
    response: {
      ...authErrors,
      200: z.object({ count: z.int(), latest: z.string().nullable() }),
    },
  },
} satisfies Record<string, FastifySchema>;
