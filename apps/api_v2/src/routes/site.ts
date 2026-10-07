import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Redacted } from "../modules/redacted";
import type { ApiStore, Viewer } from "../store";
import { SCHEMAS } from "./contracts";

/** Public content may be shared by the site and its caches. */
export const PUBLIC_READ =
  "public, max-age=60, stale-while-revalidate=300, stale-if-error=86400";
/** Authenticated responses must never enter a browser or shared cache. */
export const EDITOR_READ = "no-store";
/** A short negative cache keeps missing public URLs inexpensive. */
export const NOT_FOUND_READ = "public, max-age=10";

/** Landing's server sends its PREVIEW_SECRET here for a reviewer's read. */
export const PREVIEW_TOKEN = "x-preview-token";

/**
 * Who a site read is for. No token is the public; the right token is a
 * reviewer; a wrong one, or any token when no secret is configured, is
 * refused (null) rather than quietly served as public, so a misconfigured
 * secret shows up at once.
 */
function viewerOf(
  request: FastifyRequest,
  secret: Redacted<string> | undefined,
): Viewer | null {
  const header = request.headers[PREVIEW_TOKEN];
  const token = Array.isArray(header) ? header[0] : header;
  if (token === undefined) return "public";
  if (!secret) return null;
  // Hashing first gives equal lengths, which timingSafeEqual requires.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(token), digest(secret.reveal()))
    ? "preview"
    : null;
}

/** The public's reads are shared-cacheable; a reviewer's are never stored. */
const found = (viewer: Viewer) =>
  viewer === "preview" ? EDITOR_READ : PUBLIC_READ;
const missing = (viewer: Viewer) =>
  viewer === "preview" ? EDITOR_READ : NOT_FOUND_READ;

/** What the site reads: pages by url, categories, the catalog and search text. */
export const siteRoutes: FastifyPluginAsyncZod<{
  store: Pick<
    ApiStore,
    | "resolve"
    | "categoryTree"
    | "categoryListing"
    | "catalog"
    | "searchDocuments"
  >;
  previewSecret: Redacted<string> | undefined;
}> = async (site, { store, previewSecret }) => {
  site.decorateRequest("viewer", null);
  site.addHook("onRequest", async (request, reply) => {
    // Public and preview reads share a url, so a cache must key on the token.
    // Appended, not set: CORS has already added `Origin`.
    const vary = reply.getHeader("Vary");
    reply.header(
      "Vary",
      vary ? `${String(vary)}, ${PREVIEW_TOKEN}` : PREVIEW_TOKEN,
    );
    const viewer = viewerOf(request, previewSecret);
    if (viewer === null) {
      return reply
        .header("Cache-Control", EDITOR_READ)
        .status(401)
        .send({ error: "invalid_preview_token" });
    }
    request.setDecorator("viewer", viewer);
  });

  /** The viewer the onRequest hook admitted; every site route runs after it. */
  const viewerFor = (request: FastifyRequest): Viewer => {
    const viewer = request.getDecorator<Viewer | null>("viewer");
    if (!viewer) throw new Error("Site route ran without a viewer");
    return viewer;
  };

  site.route({
    method: "GET",
    url: "/pages",
    schema: SCHEMAS.getPageByUrl,
    handler: async (request, reply) => {
      const viewer = viewerFor(request);
      const { url } = request.query;
      const resolved = await store.resolve(url, viewer);
      if (resolved.kind === "not_found") {
        return reply
          .header("Cache-Control", missing(viewer))
          .status(404)
          .send({ error: "not_found", message: `No page at ${url}` });
      }
      reply.header("Cache-Control", found(viewer));
      if (resolved.kind === "redirect")
        return reply
          .status(301)
          .header("Location", resolved.url)
          .send({ redirect: resolved.url });
      return resolved.page;
    },
  });

  site.route({
    method: "GET",
    url: "/categories",
    schema: SCHEMAS.getCategories,
    handler: async (request, reply) => {
      const viewer = viewerFor(request);
      const categories = await store.categoryTree(viewer);
      reply.header("Cache-Control", found(viewer));
      return { categories };
    },
  });

  site.route({
    method: "GET",
    url: "/categories/:slug",
    schema: SCHEMAS.getCategory,
    handler: async (request, reply) => {
      const viewer = viewerFor(request);
      const { slug } = request.params;
      const listing = await store.categoryListing([slug], viewer);
      if (listing === null) {
        return reply
          .header("Cache-Control", missing(viewer))
          .status(404)
          .send({ error: "not_found", message: `No category at /${slug}` });
      }
      reply.header("Cache-Control", found(viewer));
      return listing;
    },
  });

  site.route({
    method: "GET",
    url: "/categories/:category/:slug",
    schema: SCHEMAS.getSubcategory,
    handler: async (request, reply) => {
      const viewer = viewerFor(request);
      const { category, slug } = request.params;
      const listing = await store.categoryListing([category, slug], viewer);
      if (listing === null) {
        return reply
          .header("Cache-Control", missing(viewer))
          .status(404)
          .send({
            error: "not_found",
            message: `No category at /${category}/${slug}`,
          });
      }
      reply.header("Cache-Control", found(viewer));
      return listing;
    },
  });

  site.route({
    method: "GET",
    url: "/catalog",
    schema: SCHEMAS.getCatalog,
    handler: async (request, reply) => {
      const viewer = viewerFor(request);
      const pages = await store.catalog(viewer);
      reply.header("Cache-Control", found(viewer));
      return { pages };
    },
  });

  site.route({
    method: "GET",
    url: "/search/documents",
    schema: SCHEMAS.getSearchDocuments,
    handler: async (request, reply) => {
      const viewer = viewerFor(request);
      const documents = await store.searchDocuments(viewer);
      reply.header("Cache-Control", found(viewer));
      return { documents };
    },
  });
};
