/**
 * Request and response contracts for every route, in Zod.
 *
 * Fastify validates requests and serialises responses with these objects, and
 * the OpenAPI document is generated from them, so the spec cannot drift from
 * the behaviour: `openapi.test.ts` snapshots the result into `openapi.json`.
 */

import type { FastifySchema } from "fastify";
import { z } from "zod";
import { ServiceDetail, ServiceSummary } from "../modules/estate-services";
import {
  CatalogEntry,
  CategoryListing,
  CategoryNode,
  SearchDocument,
  TaxonomyEntry,
} from "../modules/navigation";
import { NewPage, PageDocument, PageId, SaveFields } from "../modules/page";
import { PageSnapshot, PageVersion } from "../modules/page-history";
import { PublicPage } from "../modules/page-visibility";
import { EstateVersion } from "../services/editor-index";

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

const idParams = z.object({ id: PageId });

/** The `updated_at` a client last read, so a write over changes it never saw is refused. */
const ifUpdatedAt = z.object({
  "if-updated-at": z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .optional()
    .describe(
      "The `updated_at` this client last read. Omit to accept " +
        "whatever is stored.",
    ),
});

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
    querystring: z.object({ url: z.string().min(1).max(512) }),
    response: {
      200: PublicPage,
      301: z.object({ redirect: z.string() }),
      400: error,
      401: error,
      404: error,
      500: error,
    },
  },

  getCategories: {
    summary: "The categories the site lists",
    description:
      "In order, each with its subcategories. A category is listed when it " +
      "or one of its subcategories has a visible page at its root.",
    tags: ["categories"],
    ...siteRead,
    response: {
      200: z.object({ categories: z.array(CategoryNode) }),
      401: error,
      500: error,
    },
  },

  getCategory: {
    summary: "A category and what it lists",
    description:
      "Its subcategories and the visible pages at its root. 404 when it " +
      "lists nothing.",
    tags: ["categories"],
    ...siteRead,
    params: z.object({ slug: z.string() }),
    response: {
      200: CategoryListing,
      401: error,
      404: error,
      500: error,
    },
  },

  getSubcategory: {
    summary: "A subcategory and what it lists",
    tags: ["categories"],
    ...siteRead,
    params: z.object({ category: z.string(), slug: z.string() }),
    response: {
      200: CategoryListing,
      401: error,
      404: error,
      500: error,
    },
  },

  getCatalog: {
    summary: "Every visible page",
    description:
      "Sub-pages included, `start` steps not, A to Z: for the sitemap and " +
      "service lists.",
    tags: ["pages"],
    ...siteRead,
    response: {
      200: z.object({ pages: z.array(CatalogEntry) }),
      401: error,
      500: error,
    },
  },

  getSearchDocuments: {
    summary: "What search indexes",
    description:
      "Every page the catalog lists, with its keywords and its body as " +
      "plain-text chunks.",
    tags: ["search"],
    ...siteRead,
    response: {
      200: z.object({ documents: z.array(SearchDocument) }),
      401: error,
      500: error,
    },
  },

  getPage: {
    summary: "Get a page by id",
    description: "The editor's read: any visibility, markdown included.",
    tags: ["pages"],
    params: idParams,
    security: editorSecurity,
    response: {
      200: PageDocument,
      400: error,
      404: error,
      500: error,
      ...authErrors,
    },
  },

  createPage: {
    summary: "Create a page",
    description: "Requires an employee session and the editor's Origin header.",
    tags: ["pages"],
    body: NewPage,
    security: editorSecurity,
    response: {
      201: PageDocument,
      422: validationFailed,
      500: error,
      ...authErrors,
    },
  },

  savePage: {
    summary: "Save a page",
    description:
      "Requires an employee session and the editor's Origin header. " +
      "Send every field: a save replaces the page and defaults none, except " +
      "that leaving `parent_id` out keeps the page's parent. " +
      "Send the `updated_at` you last read in the `if-updated-at` header. " +
      "If the stored row has moved on since, the save is refused with a 409 " +
      "rather than silently discarding whoever wrote first. Changing `url` " +
      "moves this page alone: its sub-pages keep their urls and stay beneath " +
      "it by `parent_id`, and nothing redirects from the old url.",
    tags: ["pages"],
    params: idParams,
    headers: ifUpdatedAt,
    body: SaveFields,
    security: editorSecurity,
    response: {
      200: PageDocument,
      400: error,
      404: error,
      409: conflict,
      422: validationFailed,
      500: error,
      ...authErrors,
    },
  },

  getPageHistory: {
    summary: "A page's history",
    description:
      "Newest first: each change's version, what it did, who made it and " +
      "when. A deleted page's history stays readable; 404 for a page that " +
      "never existed.",
    tags: ["pages"],
    params: idParams,
    security: editorSecurity,
    response: {
      200: z.object({ versions: z.array(PageVersion) }),
      400: error,
      404: error,
      500: error,
      ...authErrors,
    },
  },

  getPageVersion: {
    summary: "A page as one change left it",
    description:
      "To restore it, save its fields over the page with the page's current " +
      "`updated_at` in `if-updated-at`; a deleted page comes back through " +
      "`POST /pages` with its `id`. 404 when there is no such version, or it " +
      "was recorded in a shape the API no longer reads.",
    tags: ["pages"],
    params: idParams.extend({
      version: z.coerce.number().int().positive().max(2_147_483_647),
    }),
    security: editorSecurity,
    response: {
      200: PageSnapshot,
      400: error,
      404: error,
      500: error,
      ...authErrors,
    },
  },

  deletePage: {
    summary: "Delete a page",
    description:
      "Requires an employee session and the editor's Origin header. Send " +
      "the `updated_at` you last read in the `if-updated-at` header: a page " +
      "saved since is refused with a 409 rather than deleted unseen. A page " +
      "with sub-pages is refused (422) until they are moved or deleted.",
    tags: ["pages"],
    params: idParams,
    headers: ifUpdatedAt,
    security: editorSecurity,
    response: {
      204: z.undefined(),
      400: error,
      409: conflict,
      422: validationFailed,
      500: error,
      ...authErrors,
    },
  },

  listServices: {
    summary: "List services",
    description:
      "The editor's index, ordered by title. A categorised page at the root " +
      "of its category is an entry, and every page beneath it by " +
      "`parent_id` belongs to it.",
    tags: ["pages"],
    security: editorSecurity,
    response: { 200: z.array(ServiceSummary), 500: error, ...authErrors },
  },

  getService: {
    summary: "Open a service",
    description:
      "Its entry page and every page below it by `parent_id`, each before " +
      "the pages below it. 404 when the page is not a service's entry.",
    tags: ["pages"],
    params: idParams,
    security: editorSecurity,
    response: {
      200: ServiceDetail,
      400: error,
      404: error,
      500: error,
      ...authErrors,
    },
  },

  getTaxonomy: {
    summary: "Every category a page can be filed under",
    description:
      "Each category with its id, followed by its subcategories, whether or " +
      "not it lists anything yet: what a page's `category_id` can name.",
    tags: ["categories"],
    security: editorSecurity,
    response: {
      200: z.object({ categories: z.array(TaxonomyEntry) }),
      500: error,
      ...authErrors,
    },
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
      200: EstateVersion,
      500: error,
    },
  },
} satisfies Record<string, FastifySchema>;
