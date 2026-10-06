/**
 * The OpenAPI document, as the route schemas it is generated from.
 *
 * Written as Fastify route schemas rather than as a hand-maintained YAML
 * file, because a hand-maintained one describes what someone believed the API
 * did on the day they wrote it. These schemas are the same objects Fastify
 * validates requests and serialises responses with, so a response that stops
 * matching its documented shape stops being served in that shape — the spec
 * cannot drift from the behaviour without a test going red.
 *
 * `openapi.test.ts` compares the generated document against the committed
 * `openapi.json`, so a change to any of these is visible in the diff of a
 * pull request rather than only inside a running server.
 *
 * OpenAPI 3.0.3 rather than 3.1: `nullable: true` is the spelling
 * fast-json-stringify understands, and 3.1 replaced it with a type union.
 * Serialisation is the thing that has to be right here; the document follows
 * it.
 */

import type { FastifySchema, HTTPMethods } from "fastify";

const visibility = {
  type: "string",
  enum: ["public", "preview", "draft"],
} as const;

/** The frontmatter fields that did not become columns. */
const frontmatterProperties = {
  lede: { type: "string" },
  subcategory: { type: "string" },
  stage: { type: "string" },
  featured: { type: "boolean" },
  section: { type: "string" },
  service_type: { type: "string" },
  keywords: { type: "array", items: { type: "string" } },
  source_url: { type: "string" },
} as const;

const frontmatter = {
  type: "object",
  properties: frontmatterProperties,
  additionalProperties: false,
} as const;

const pageResponse = {
  type: "object",
  properties: {
    url: { type: "string" },
    frontmatter: {
      type: "object",
      description:
        "The stored frontmatter, with the page's title and description " +
        "(columns of their own) put back.",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        ...frontmatterProperties,
      },
      required: ["title"],
      additionalProperties: false,
    },
    body_markdown: {
      type: "string",
      description:
        "The page body as written. The site sanitises and renders it.",
    },
    form_id: {
      type: "string",
      nullable: true,
      description:
        "The form a Start link with no href of its own opens, or null.",
    },
    hide_start_links: {
      type: "boolean",
      description:
        "True when the page's `/start` sub-page or form is not public: the " +
        'site removes the Start link and counts "There are N ways…" down.',
    },
    breadcrumbs: {
      type: "array",
      description:
        "The full trail, current page included, Home not. A level of the " +
        "url with no category or page of its own has no crumb.",
      items: {
        type: "object",
        properties: { name: { type: "string" }, url: { type: "string" } },
        required: ["name", "url"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "url",
    "frontmatter",
    "body_markdown",
    "form_id",
    "hide_start_links",
    "breadcrumbs",
  ],
  additionalProperties: false,
} as const;

const pageDocument = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    url: { type: "string", description: "The site's routing key." },
    slug: { type: "string", description: "The url's last segment." },
    category_id: { type: "string", format: "uuid", nullable: true },
    title: { type: "string" },
    description: { type: "string", nullable: true },
    visibility,
    form_id: { type: "string", nullable: true },
    body_markdown: { type: "string" },
    frontmatter,
    published_at: {
      type: "string",
      format: "date-time",
      nullable: true,
      description: "When the page first went public; null until it has.",
    },
    created_at: { type: "string", format: "date-time" },
    updated_at: {
      type: "string",
      format: "date-time",
      description:
        "Millisecond precision, and exactly the value to send back in " +
        "`if-updated-at` on the next save.",
    },
  },
  required: [
    "id",
    "url",
    "slug",
    "category_id",
    "title",
    "description",
    "visibility",
    "form_id",
    "body_markdown",
    "frontmatter",
    "published_at",
    "created_at",
    "updated_at",
  ],
  additionalProperties: false,
} as const;

const serviceSummary = {
  type: "object",
  properties: {
    id: {
      type: "string",
      format: "uuid",
      description: "The entry page's id.",
    },
    url: { type: "string" },
    title: { type: "string" },
    category: {
      type: "object",
      properties: { slug: { type: "string" }, title: { type: "string" } },
      required: ["slug", "title"],
      additionalProperties: false,
    },
    visibility,
    form_id: {
      type: "string",
      nullable: true,
      description: "The entry page's form, else its `/start` page's.",
    },
    has_start_page: { type: "boolean" },
    page_count: {
      type: "integer",
      description: "The entry page plus every page below it.",
    },
    updated_at: {
      type: "string",
      format: "date-time",
      description: "The latest change across those pages.",
    },
  },
  required: [
    "id",
    "url",
    "title",
    "category",
    "visibility",
    "form_id",
    "has_start_page",
    "page_count",
    "updated_at",
  ],
  additionalProperties: false,
} as const;

/** What a write sends. The slug comes from the url. */
const pageInput = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    url: { type: "string", pattern: "^/[^?#]*[^/?#]$" },
    category_id: { type: "string", format: "uuid", nullable: true },
    title: { type: "string", minLength: 1 },
    description: { type: "string", nullable: true },
    visibility,
    form_id: { type: "string", nullable: true },
    body_markdown: { type: "string" },
    frontmatter,
  },
  required: ["url", "title", "body_markdown"],
  additionalProperties: false,
} as const;

const error = {
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
  },
  required: ["error"],
  additionalProperties: true,
} as const;

const validationFailed = {
  type: "object",
  properties: {
    error: { type: "string", enum: ["validation_failed"] },
    message: { type: "string" },
    errors: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: { type: "string" },
          message: { type: "string" },
        },
        required: ["field", "message"],
        additionalProperties: false,
      },
    },
  },
  required: ["error", "errors"],
  additionalProperties: true,
} as const;

const conflict = {
  type: "object",
  properties: {
    error: { type: "string", enum: ["conflict"] },
    message: { type: "string" },
    documentId: { type: "string", format: "uuid" },
  },
  required: ["error", "message", "documentId"],
  additionalProperties: true,
} as const;

const idParams = {
  type: "object",
  properties: { id: { type: "string" } },
  required: ["id"],
} as const;

const editorSecurity = [{ editorSession: [] }];
const authErrors = { 401: error, 403: error, 503: error };

/** Request and response contracts shared by serving and documentation. */
export const SCHEMAS = {
  getPageByUrl: {
    summary: "Get a public page by its url",
    description:
      "The site's read. A page is served only when it and every page above " +
      "it in the url are public; a `/start` page also needs its form to be " +
      "public. `hide_start_links` is set when the page's `/start` sub-page " +
      "or form is not public. A bare `/<slug>` with no " +
      "page of its own redirects (301) to the one public page with that " +
      "slug.",
    tags: ["pages"],
    querystring: {
      type: "object",
      properties: { url: { type: "string", minLength: 1 } },
      required: ["url"],
      additionalProperties: false,
    },
    response: {
      200: pageResponse,
      301: {
        type: "object",
        properties: { redirect: { type: "string" } },
        required: ["redirect"],
        additionalProperties: false,
      },
      400: error,
      404: error,
    },
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
    headers: {
      type: "object",
      properties: {
        "if-updated-at": {
          type: "string",
          description:
            "The `updated_at` this client last read. Omit to accept " +
            "whatever is stored.",
        },
      },
    },
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
    description: "Requires an employee session and the editor's Origin header.",
    tags: ["pages"],
    params: idParams,
    security: editorSecurity,
    response: { 204: { type: "null" }, ...authErrors },
  },

  listServices: {
    summary: "List services",
    description:
      "The editor's index, ordered by title. The schema has no service, so " +
      "one is read from the urls: a categorised page with no page above it " +
      "is an entry, and every page below it belongs to it.",
    tags: ["pages"],
    security: editorSecurity,
    response: {
      200: { type: "array", items: serviceSummary },
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
      200: {
        type: "object",
        properties: {
          count: { type: "integer" },
          latest: { type: "string", nullable: true },
        },
        required: ["count", "latest"],
        additionalProperties: false,
      },
    },
  },
} satisfies Record<string, FastifySchema>;

/** Route identity is shared without constructing a database or auth bypass. */
export const ROUTES = {
  getPageByUrl: { method: "GET", url: "/pages", schema: SCHEMAS.getPageByUrl },
  getPage: { method: "GET", url: "/pages/:id", schema: SCHEMAS.getPage },
  createPage: { method: "POST", url: "/pages", schema: SCHEMAS.createPage },
  savePage: { method: "PUT", url: "/pages/:id", schema: SCHEMAS.savePage },
  deletePage: {
    method: "DELETE",
    url: "/pages/:id",
    schema: SCHEMAS.deletePage,
  },
  listServices: {
    method: "GET",
    url: "/services",
    schema: SCHEMAS.listServices,
  },
  version: { method: "GET", url: "/version", schema: SCHEMAS.version },
  auth: {
    method: ["GET", "POST"],
    url: "/api/auth/*",
    schema: {
      summary: "GitHub sign-in and session protocol",
      description:
        "Better Auth owns the endpoints under this prefix. Responses are never cached.",
      tags: ["auth"],
    },
  },
} satisfies Record<
  string,
  { method: HTTPMethods | HTTPMethods[]; url: string; schema: FastifySchema }
>;

/** OpenAPI metadata and the employee-session security scheme. */
export const OPENAPI_DOCUMENT = {
  openapi: "3.0.3",
  info: {
    title: "api_v2",
    description:
      "Public markdown content and employee-authenticated editor operations. " +
      "Editor reads, writes, and the version token require a GitHub-authenticated govtech-bb organization member session.",
    version: "0.0.0",
  },
  tags: [
    { name: "pages", description: "Content pages, stored as markdown" },
    { name: "meta", description: "Freshness" },
    {
      name: "auth",
      description: "GitHub organization member sign-in and sessions",
    },
  ],
  components: {
    securitySchemes: {
      editorSession: {
        type: "apiKey" as const,
        in: "cookie" as const,
        name: "better-auth.session_token",
        description:
          "HTTP-only employee session cookie; Secure-prefixed in production.",
      },
    },
  },
};
