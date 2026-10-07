import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Redacted } from "../modules/redacted";
import { ROUTES } from "../openapi";
import type { ApiStore, Viewer } from "../store";

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
export function viewerOf(
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

/**
 * Serve a site read. The public's is shared-cacheable; a reviewer's is
 * `no-store`, so preview content never lands in a cache the public reads.
 */
export async function siteRead<T>(
  request: FastifyRequest,
  reply: FastifyReply,
  secret: Redacted<string> | undefined,
  read: (viewer: Viewer) => Promise<T | null>,
  missing = "Not found",
) {
  // Public and preview reads share a url, so a cache must key on the token.
  reply.header("Vary", PREVIEW_TOKEN);
  const viewer = viewerOf(request, secret);
  if (viewer === null) {
    return reply
      .header("Cache-Control", EDITOR_READ)
      .status(401)
      .send({ error: "invalid_preview_token" });
  }
  const found = await read(viewer);
  if (found === null) {
    return reply
      .header(
        "Cache-Control",
        viewer === "preview" ? EDITOR_READ : NOT_FOUND_READ,
      )
      .status(404)
      .send({ error: "not_found", message: missing });
  }
  reply.header(
    "Cache-Control",
    viewer === "preview" ? EDITOR_READ : PUBLIC_READ,
  );
  return found;
}

/** Categories, the catalog and search text: what the site navigates by. */
export function registerSiteRoutes(
  app: FastifyInstance,
  store: ApiStore,
  previewSecret: Redacted<string> | undefined,
): void {
  app.route({
    ...ROUTES.getCategories,
    handler: (request, reply) =>
      siteRead(request, reply, previewSecret, async (viewer) => ({
        categories: await store.categoryTree(viewer),
      })),
  });
  app.route<{ Params: { slug: string } }>({
    ...ROUTES.getCategory,
    handler: (request, reply) =>
      siteRead(
        request,
        reply,
        previewSecret,
        (viewer) => store.categoryListing([request.params.slug], viewer),
        `No category at /${request.params.slug}`,
      ),
  });
  app.route<{ Params: { category: string; slug: string } }>({
    ...ROUTES.getSubcategory,
    handler: (request, reply) =>
      siteRead(
        request,
        reply,
        previewSecret,
        (viewer) =>
          store.categoryListing(
            [request.params.category, request.params.slug],
            viewer,
          ),
        `No category at /${request.params.category}/${request.params.slug}`,
      ),
  });
  app.route({
    ...ROUTES.getCatalog,
    handler: (request, reply) =>
      siteRead(request, reply, previewSecret, async (viewer) => ({
        pages: await store.catalog(viewer),
      })),
  });
  app.route({
    ...ROUTES.getSearchDocuments,
    handler: (request, reply) =>
      siteRead(request, reply, previewSecret, async (viewer) => ({
        documents: await store.searchDocuments(viewer),
      })),
  });
}
