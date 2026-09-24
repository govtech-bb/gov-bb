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

import type { FastifySchema } from "fastify";

/** A block document's body. Deliberately open — `block-kit` owns its shape. */
const body = {
  type: "object",
  description:
    "The block document: `{version, blocks, refs}`. Validated against " +
    "block-kit's rules on write, and passed through untouched on read.",
  properties: {
    version: { type: "integer" },
    blocks: {
      type: "array",
      items: { type: "object", additionalProperties: true },
    },
    refs: { type: "object", additionalProperties: true },
  },
  required: ["version", "blocks", "refs"],
  additionalProperties: true,
} as const;

const pageDocument = {
  type: "object",
  properties: {
    version: { type: "integer" },
    id: { type: "string", format: "uuid" },
    url: { type: "string", description: "The site's routing key." },
    slug: { type: "string" },
    schema_name: {
      type: "string",
      enum: ["answer", "guide", "transaction", "finder", "calendar"],
    },
    document_type: { type: "string" },
    title: { type: "string" },
    description: { type: "string", nullable: true },
    is_draft: { type: "boolean" },
    body,
    updated_at: {
      type: "string",
      format: "date-time",
      description:
        "Millisecond precision, and exactly the value to send back in " +
        "`if-updated-at` on the next save.",
    },
  },
  required: [
    "version",
    "id",
    "url",
    "slug",
    "schema_name",
    "document_type",
    "title",
    "is_draft",
    "body",
    "updated_at",
  ],
  additionalProperties: false,
} as const;

const documentSummary = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    url: { type: "string" },
    title: { type: "string" },
    schema_name: {
      type: "string",
      enum: ["answer", "guide", "transaction", "finder", "calendar"],
    },
    document_type: { type: "string" },
    updated_at: { type: "string", format: "date-time" },
  },
  required: [
    "id",
    "url",
    "title",
    "schema_name",
    "document_type",
    "updated_at",
  ],
  additionalProperties: false,
} as const;

const collectionDefinition = {
  type: "object",
  properties: {
    key: { type: "string" },
    title: { type: "string" },
    record_key: {
      type: "string",
      description: "Which field of a record identifies it.",
    },
    schema: { type: "object", additionalProperties: true },
  },
  required: ["key", "title", "record_key", "schema"],
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

/**
 * 422 carries the errors per block, not a flattened message: each one names
 * the block it came from so an editor can link its error summary to the block
 * that caused it. Documenting the shape is what stops that being flattened by
 * a well-meaning refactor.
 */
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
          rule: { type: "integer" },
          blockId: { type: "string", nullable: true },
          message: { type: "string" },
        },
        required: ["message"],
        additionalProperties: true,
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

export const SCHEMAS = {
  listPages: {
    summary: "List page summaries",
    description:
      "Published pages, ordered by url. Drafts are excluded unless asked " +
      "for, so an unauthenticated caller cannot read unpublished content by " +
      "accident.",
    tags: ["pages"],
    querystring: {
      type: "object",
      properties: {
        drafts: {
          type: "string",
          enum: ["true", "false"],
          description: "`true` includes drafts.",
        },
      },
      additionalProperties: false,
    },
    response: {
      200: { type: "array", items: documentSummary },
    },
  },

  getPageByUrl: {
    summary: "Get a page by its url",
    description:
      "The site's routing key. `landing_v2` resolves a request path with " +
      "this; the id is the editor's key, not the site's.",
    tags: ["pages"],
    querystring: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
      additionalProperties: false,
    },
    response: { 200: pageDocument, 400: error, 404: error },
  },

  getPage: {
    summary: "Get a page by id",
    tags: ["pages"],
    params: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    response: { 200: pageDocument, 404: error },
  },

  createPage: {
    summary: "Create a page",
    description: "Writes are unauthenticated until #2701 lands.",
    tags: ["pages"],
    body: { type: "object", additionalProperties: true },
    response: { 201: pageDocument, 422: validationFailed },
  },

  savePage: {
    summary: "Save a page",
    description:
      "Send the `updated_at` you last read in the `if-updated-at` header. " +
      "If the stored row has moved on since, the save is refused with a 409 " +
      "rather than silently discarding whoever wrote first.",
    tags: ["pages"],
    params: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
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
    body: { type: "object", additionalProperties: true },
    response: {
      200: pageDocument,
      404: error,
      409: conflict,
      422: validationFailed,
    },
  },

  deletePage: {
    summary: "Delete a page",
    tags: ["pages"],
    params: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    response: { 204: { type: "null" } },
  },

  listCollections: {
    summary: "List collection definitions",
    tags: ["collections"],
    response: { 200: { type: "array", items: collectionDefinition } },
  },

  listRecords: {
    summary: "List a collection's records",
    description:
      "Published records only. `?keys=true` returns each record's key " +
      "alongside its data, which is what editing needs and rendering does " +
      "not.",
    tags: ["collections"],
    params: {
      type: "object",
      properties: { key: { type: "string" } },
      required: ["key"],
    },
    querystring: {
      type: "object",
      properties: { keys: { type: "string", enum: ["true", "false"] } },
      additionalProperties: false,
    },
    response: {
      200: {
        type: "array",
        items: { type: "object", additionalProperties: true },
      },
    },
  },

  saveRecord: {
    summary: "Create or replace a record",
    tags: ["collections"],
    params: {
      type: "object",
      properties: { key: { type: "string" }, recordKey: { type: "string" } },
      required: ["key", "recordKey"],
    },
    body: {
      type: "object",
      properties: {
        data: { type: "object", additionalProperties: true },
        previousKey: {
          type: "string",
          description:
            "Set when the record's key itself changed, so the old row goes " +
            "rather than being left behind as a duplicate.",
        },
      },
      required: ["data"],
      additionalProperties: false,
    },
    response: { 204: { type: "null" } },
  },

  deleteRecord: {
    summary: "Delete a record",
    tags: ["collections"],
    params: {
      type: "object",
      properties: { key: { type: "string" }, recordKey: { type: "string" } },
      required: ["key", "recordKey"],
    },
    response: { 204: { type: "null" } },
  },

  version: {
    summary: "A version token for the whole estate",
    description:
      "`change_events` is append-only and gets a row on every write, so its " +
      "count and newest timestamp identify the state of everything without " +
      "reading any of it. Clients poll this and refetch only when it moves.",
    tags: ["meta"],
    response: {
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

export const OPENAPI_DOCUMENT = {
  openapi: "3.0.3",
  info: {
    title: "api_v2",
    description:
      "The content API for the content-as-data spike (#2700). Reads are " +
      "public; writes are unauthenticated until #2701 lands and must not be " +
      "reachable from anywhere but a laptop until then.",
    version: "0.0.0",
  },
  tags: [
    { name: "pages", description: "Content pages, stored as block documents" },
    { name: "collections", description: "Structured data behind a page" },
    { name: "meta", description: "Freshness" },
  ],
};
