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
import { EmployeeView, Role } from "../modules/auth";
import {
  EditorPage,
  NewPage,
  PageId,
  RevisionComment,
  RevisionView,
  SaveFields,
} from "../modules/page";
import {
  CategoryBlockers,
  CategoryFields,
  CategoryId,
  CategoryOrder,
  CategoryStamp,
  EditorCategory,
} from "../modules/category";
import { PublicPage } from "../modules/page-visibility";
import { EstateVersion } from "../services/editor-index";

/** The editor sends the exact millisecond timestamp from its last read. */
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

const conflict = z.looseObject({
  error: z.literal("conflict"),
  message: z.string(),
  documentId: z.guid(),
});

/** A review step refused because the revision is not in the state it needs. */
const revisionState = z.object({
  error: z.enum(["under_review", "not_submitted"]),
  message: z.string(),
});

const idParams = z.object({ id: PageId });

/** The version a write was made against; a 409 when it has moved on. */
const ifUpdatedAt = (read: string) =>
  z.object({
    "if-updated-at": z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value))
      .optional()
      .describe(
        `The \`updated_at\` this client last read${read}. Omit to accept ` +
          "whatever is stored.",
      ),
  });

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
const roleParams = z.object({ id: z.string().min(1), role: Role });

const categoryHeaders = z.object({ "if-updated-at": CategoryStamp });
const categoryParams = z.object({ id: CategoryId });
const categoryErrors = {
  400: error,
  422: validationFailed.extend({ message: z.string() }),
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
    description:
      "The editor's read: any visibility, markdown included. A public page " +
      "with a pending revision is read with the revision laid over it.",
    tags: ["pages"],
    params: idParams,
    security: editorSecurity,
    response: {
      200: EditorPage,
      400: error,
      404: error,
      500: error,
      ...authErrors,
    },
  },

  createPage: {
    summary: "Create a page",
    description:
      "Requires an employee session, the editor's Origin header and the " +
      "editor role (403 otherwise). " +
      "Creating a page as `public` needs the approver role (403 otherwise).",
    tags: ["pages"],
    body: NewPage,
    security: editorSecurity,
    response: {
      201: EditorPage,
      422: validationFailed,
      500: error,
      ...authErrors,
    },
  },

  savePage: {
    summary: "Save a page",
    description:
      "Requires an employee session, the editor's Origin header and the " +
      "editor role (403 otherwise). " +
      "Send every field: a save replaces the page and defaults none, except " +
      "that leaving `parent_id` out keeps the page's parent. " +
      "Send the `updated_at` you last read in the `if-updated-at` header. " +
      "If the stored row, or the page's pending revision, has moved on since, " +
      "the save is refused with a 409 rather than silently discarding " +
      "whoever wrote first. Changing `url` " +
      "moves this page alone: its sub-pages keep their urls and stay beneath " +
      "it by `parent_id`, and nothing redirects from the old url. " +
      "Changing `visibility` needs the approver role (403 otherwise). " +
      "A save that keeps a `public` page public, whoever sends it, goes into " +
      "the page's pending revision: citizens keep seeing the live page until " +
      "an approver publishes it. An approver's save that takes a `public` " +
      "page out of public view writes the whole page and closes its pending " +
      "revision. Returns the page as the editor now works on it. " +
      "A save to a page whose revision is waiting for review is refused " +
      "(409 `under_review`) until an approver publishes or rejects it.",
    tags: ["pages"],
    params: idParams,
    headers: ifUpdatedAt(""),
    body: SaveFields,
    security: editorSecurity,
    response: {
      200: EditorPage,
      400: error,
      404: error,
      409: z.union([conflict, revisionState]),
      422: validationFailed,
      500: error,
      ...authErrors,
    },
  },

  getRevision: {
    summary: "Get a page's pending revision",
    description:
      "The change to a `public` page that is waiting for an approver: a " +
      "draft, or one submitted for review. A rejected one is returned " +
      "until a save starts a new draft, or the live page changes. " +
      "`changes` lists the fields it changes against the live page. 404 " +
      "when the page has none.",
    tags: ["pages"],
    params: idParams,
    security: editorSecurity,
    response: {
      200: RevisionView,
      400: error,
      404: error,
      500: error,
      ...authErrors,
    },
  },

  submitRevision: {
    summary: "Submit a page's draft revision for review",
    description:
      "Needs the editor role (403 otherwise). Records the submitter, who " +
      "may not then approve it. 404 when the page has no draft revision; " +
      "409 `under_review` when it is already submitted, or `conflict` when " +
      "the draft has been saved since `if-updated-at`. Saving the page is " +
      "refused while it waits.",
    tags: ["pages"],
    params: idParams,
    headers: ifUpdatedAt(" for the revision"),
    security: editorSecurity,
    response: {
      200: RevisionView,
      400: error,
      404: error,
      409: z.union([conflict, revisionState]),
      500: error,
      ...authErrors,
    },
  },

  rejectRevision: {
    summary: "Reject a submitted revision with a comment",
    description:
      "Needs the approver role, and the approver must not have changed or " +
      "submitted the revision (403 otherwise). The live page is unchanged; " +
      "the revision is kept with the comment, and the next save starts a " +
      "new draft from it. 404 when nothing is waiting for review; 409 " +
      "`not_submitted` for a draft, or `conflict` when the revision has " +
      "been saved since `if-updated-at`.",
    tags: ["pages"],
    params: idParams,
    headers: ifUpdatedAt(" for the revision"),
    body: z.object({
      comment: RevisionComment.describe("Why, for the editor."),
    }),
    security: editorSecurity,
    response: {
      200: RevisionView,
      400: error,
      404: error,
      409: z.union([conflict, revisionState]),
      500: error,
      ...authErrors,
    },
  },

  publishRevision: {
    summary: "Approve a submitted revision and publish it",
    description:
      "Needs the approver role, and the approver must not have changed or " +
      "submitted the revision (403 otherwise). Writes the revision to the " +
      "live page as a save would, re-indexes it and records the approver " +
      "in `change_events`, all in one transaction. A revision that has gone " +
      "stale while it waited (its parent or category gone, or its url " +
      "taken) is refused with a 422 naming the field, and nothing changes. " +
      "404 when nothing is waiting for review; 409 `not_submitted` for a " +
      "draft, or `conflict` when the revision has been saved since " +
      "`if-updated-at`. Returns the page as it now stands.",
    tags: ["pages"],
    params: idParams,
    headers: ifUpdatedAt(" for the revision"),
    security: editorSecurity,
    response: {
      200: EditorPage,
      400: error,
      404: error,
      409: z.union([conflict, revisionState]),
      422: validationFailed,
      500: error,
      ...authErrors,
    },
  },

  deletePage: {
    summary: "Delete a page",
    description:
      "Requires an employee session, the editor's Origin header and the " +
      "editor role (403 otherwise). A page with sub-pages is refused (422) " +
      "until they are moved or deleted. " +
      "Deleting a `public` page needs the approver role (403 otherwise). " +
      "Its pending revision goes with it.",
    tags: ["pages"],
    params: idParams,
    security: editorSecurity,
    response: {
      204: z.undefined(),
      400: error,
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
    description: "Needs the editor role (403 otherwise).",
    tags: ["categories"],
    security: editorSecurity,
    body: CategoryFields,
    response: { 201: EditorCategory, ...categoryErrors },
  },
  updateCategory: {
    summary: "Edit a category using its last-read version",
    description: "Needs the editor role (403 otherwise).",
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
    description: "Needs the editor role (403 otherwise).",
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
    description: "Needs the editor role (403 otherwise).",
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

  me: {
    summary: "The signed-in employee and their roles",
    tags: ["auth"],
    security: editorSecurity,
    response: { 200: EmployeeView, ...authErrors },
  },

  listEmployees: {
    summary: "Everyone who has signed in, with their roles",
    description: "Needs the admin role (403 otherwise).",
    tags: ["admin"],
    security: editorSecurity,
    response: {
      200: z.object({ employees: z.array(EmployeeView) }),
      500: error,
      ...authErrors,
    },
  },
  grantRole: {
    summary: "Grant an employee a role",
    description:
      "Needs the admin role (403 otherwise). Records the admin as the " +
      "grantor; a role already held is left as it was. 404 for someone " +
      "who has never signed in.",
    tags: ["admin"],
    security: editorSecurity,
    params: roleParams,
    response: {
      204: z.undefined(),
      400: error,
      404: error,
      500: error,
      ...authErrors,
    },
  },
  revokeRole: {
    summary: "Revoke an employee's role",
    description:
      "Needs the admin role (403 otherwise). It applies to their next " +
      "request. A role they do not hold is not an error.",
    tags: ["admin"],
    security: editorSecurity,
    params: roleParams,
    response: { 204: z.undefined(), 400: error, 500: error, ...authErrors },
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
