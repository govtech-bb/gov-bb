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
} from "../modules/navigation";
import {
  CategoryBlockers,
  CategoryFields,
  CategoryId,
  CategoryOrder,
  CategoryStamp,
  EditorCategory,
} from "../modules/category";
import {
  NewPage,
  PageDocument,
  PageId,
  PageContentVersion,
  SaveFields,
} from "../modules/page";
import {
  AcquirePageEditLock,
  PageEditLockStatus,
  PageEditLockToken,
  RenewPageEditLock,
} from "../modules/page-edit-lock";

/** Editing ownership is a header credential, never a URL parameter or content version. */
export const PAGE_EDIT_LOCK_HEADER = "x-page-edit-lock-token";
import { PublicPage } from "../modules/page-visibility";
import { EstateVersion } from "../services/editor-index";

/** Category writes retain timestamp preconditions; page writes use content versions. */
export const IF_UPDATED_AT = "if-updated-at";

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

const conflict = z.object({
  error: z.enum([
    "page_version_conflict",
    "page_edit_lock_required",
    "page_edit_lock_lost",
    "page_edit_lock_conflict",
  ]),
  message: z.string(),
  pageId: PageId,
});
const optionalLockHeaders = z.object({
  [PAGE_EDIT_LOCK_HEADER]: PageEditLockToken.optional(),
});
const requiredLockHeaders = z.object({
  [PAGE_EDIT_LOCK_HEADER]: PageEditLockToken,
});

const idParams = z.object({ id: PageId });

const editorSecurity = [{ editorSession: [] }];
const authErrors = { 401: error, 403: error, 503: error };
const categoryConflict = z.object({
  error: z.literal("conflict"),
  message: z.string(),
});
const categoryInUse = z.object({
  error: z.literal("category_in_use"),
  message: z.string(),
  blockers: CategoryBlockers,
});
const categoryHeaders = z.object({ "if-updated-at": CategoryStamp });
const categoryParams = z.object({ id: CategoryId });
const categoryErrors = {
  400: error,
  422: validationFailed.extend({ message: z.string() }),
  500: error,
  ...authErrors,
};
const lockResponse = {
  200: PageEditLockStatus,
  400: error,
  404: error,
  500: error,
  ...authErrors,
};

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
      "Send the reviewed numeric `version` in the body and the live edit-lock token in `X-Page-Edit-Lock-Token`. " +
      "If the stored row has moved on since, the save is refused with a 409 " +
      "rather than silently discarding whoever wrote first. Changing `url` " +
      "moves this page alone: its sub-pages keep their urls and stay beneath " +
      "it by `parent_id`, and nothing redirects from the old url.",
    tags: ["pages"],
    params: idParams,
    headers: optionalLockHeaders,
    body: SaveFields.extend({ version: PageContentVersion }),
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

  deletePage: {
    summary: "Delete a page",
    description:
      "Requires an employee session and the editor's Origin header. A page " +
      "with sub-pages is refused (422) until they are moved or deleted. " +
      "Requires the reviewed `version` query parameter and live edit-lock token header.",
    tags: ["pages"],
    params: idParams,
    headers: optionalLockHeaders,
    querystring: z.object({
      version: z
        .string()
        .regex(/^\d+$/)
        .transform(Number)
        .pipe(PageContentVersion),
    }),
    security: editorSecurity,
    response: {
      204: z.undefined(),
      400: error,
      404: error,
      409: conflict,
      422: validationFailed,
      500: error,
      ...authErrors,
    },
  },

  readPageEditLock: {
    summary: "Read page editing ownership without renewing it",
    tags: ["pages"],
    params: idParams,
    headers: optionalLockHeaders,
    security: editorSecurity,
    response: lockResponse,
  },
  acquirePageEditLock: {
    summary: "Acquire or explicitly take over an observed edit-lock generation",
    tags: ["pages"],
    params: idParams,
    headers: requiredLockHeaders,
    body: AcquirePageEditLock,
    security: editorSecurity,
    response: { ...lockResponse, 409: conflict },
  },
  renewPageEditLock: {
    summary: "Renew a live acquisition without reviving expired ownership",
    tags: ["pages"],
    params: idParams,
    headers: requiredLockHeaders,
    body: RenewPageEditLock,
    security: editorSecurity,
    response: { ...lockResponse, 409: conflict },
  },
  releasePageEditLock: {
    summary:
      "Release this acquisition, leaving a later owner's claim unchanged",
    tags: ["pages"],
    params: idParams,
    headers: requiredLockHeaders,
    security: editorSecurity,
    response: lockResponse,
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

  editorCategories: {
    summary:
      "Every shared category, including empty categories and private service counts",
    tags: ["categories"],
    security: editorSecurity,
    response: {
      200: z.object({ categories: z.array(EditorCategory) }),
      500: error,
      ...authErrors,
    },
  },
  createCategory: {
    summary: "Append a category or subcategory",
    tags: ["categories"],
    security: editorSecurity,
    body: CategoryFields,
    response: { 201: EditorCategory, ...categoryErrors },
  },
  updateCategory: {
    summary: "Edit a category using its last-read version",
    tags: ["categories"],
    security: editorSecurity,
    params: categoryParams,
    headers: categoryHeaders,
    body: CategoryFields,
    response: {
      200: EditorCategory,
      404: error,
      409: categoryConflict,
      ...categoryErrors,
    },
  },
  orderCategories: {
    summary: "Atomically reorder a complete, versioned sibling snapshot",
    tags: ["categories"],
    security: editorSecurity,
    body: CategoryOrder,
    response: {
      200: z.object({ categories: z.array(EditorCategory) }),
      409: categoryConflict,
      ...categoryErrors,
    },
  },
  deleteCategory: {
    summary: "Delete an empty, unanchored category using its last-read version",
    tags: ["categories"],
    security: editorSecurity,
    params: categoryParams,
    headers: categoryHeaders,
    response: {
      204: z.undefined(),
      400: error,
      404: error,
      409: z.union([categoryConflict, categoryInUse]),
      500: error,
      ...authErrors,
    },
  },

  version: {
    summary: "A version token for recorded page changes",
    description:
      "`change_events` currently records page writes only. Its count and " +
      "newest timestamp identify those changes without reading the pages. " +
      "Category changes do not advance this token until trigger-based events land.",
    tags: ["meta"],
    security: editorSecurity,
    response: {
      ...authErrors,
      200: EstateVersion,
      500: error,
    },
  },
} satisfies Record<string, FastifySchema>;
