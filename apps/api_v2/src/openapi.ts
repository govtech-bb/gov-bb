/**
 * Document-level OpenAPI metadata. The operations come from the route schemas
 * themselves (`routes/contracts.ts`), the same Zod objects Fastify validates
 * requests and serialises responses with.
 *
 * OpenAPI 3.0.3, for which the Zod transform spells a nullable field
 * `nullable: true`.
 */

/** OpenAPI metadata and the employee-session security scheme. */
export const OPENAPI_DOCUMENT = {
  openapi: "3.0.3",
  info: {
    title: "api_v2",
    description:
      "Public markdown content, categories and search text, and " +
      "employee-authenticated editor operations. " +
      "Editor reads, writes, and the version token require a GitHub-authenticated govtech-bb organization member session.",
    version: "0.0.0",
  },
  tags: [
    { name: "pages", description: "Content pages, stored as markdown" },
    {
      name: "categories",
      description: "The categories and subcategories the site lists",
    },
    { name: "search", description: "The text search indexes" },
    { name: "meta", description: "Freshness" },
    {
      name: "auth",
      description: "GitHub organization member sign-in and sessions",
    },
  ],
  components: {
    securitySchemes: {
      previewToken: {
        type: "apiKey" as const,
        in: "header" as const,
        name: "x-preview-token",
        description:
          "The site's PREVIEW_SECRET, sent server to server. Optional on " +
          "site reads; with it, `preview` content is served too.",
      },
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
