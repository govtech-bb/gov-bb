import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Viewer } from "../modules/page-visibility";
import type { Redacted } from "../modules/redacted";
import type { PageResolution } from "../services/page-resolution";
import type { CollectionEditing } from "../services/collection-editing";
import type { SiteNavigation } from "../services/site-navigation";
import { publicCategoryRoutes } from "./categories";
import { publicCollectionRoutes } from "./collections";
import { SCHEMAS } from "./contracts";
import {
  EDITOR_READ,
  PUBLIC_READ,
  SITE_VERSION_READ,
  siteNotFoundCache,
  siteReadCache,
  storageFailed,
} from "./responses";

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

/** Whether an `If-None-Match` list names this entity tag, compared weakly as RFC 9110 asks. */
function matches(ifNoneMatch: string | undefined, etag: string): boolean {
  return (ifNoneMatch ?? "")
    .split(",")
    .map((tag) => tag.trim().replace(/^W\//, ""))
    .some((tag) => tag === "*" || tag === etag);
}

/** What the site reads: pages by url, categories, collections, the catalog and search text. */
export const siteRoutes: FastifyPluginAsyncZod<{
  resolution: PageResolution;
  navigation: SiteNavigation;
  collections: CollectionEditing;
  previewSecret: Redacted<string> | undefined;
}> = async (site, { resolution, navigation, collections, previewSecret }) => {
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
  // Only what a shared cache may keep is worth validating by ETag.
  site.addHook("onSend", async (request, reply, payload) => {
    if (
      reply.statusCode !== 200 ||
      typeof payload !== "string" ||
      reply.getHeader("Cache-Control") !== PUBLIC_READ
    )
      return payload;
    const etag = `"${createHash("sha1").update(payload).digest("base64url")}"`;
    reply.header("ETag", etag);
    if (!matches(request.headers["if-none-match"], etag)) return payload;
    reply.code(304);
    return null;
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
      const resolved = await resolution.resolve(url, viewer);
      if (!resolved.ok)
        return reply
          .status(500)
          .send(storageFailed(request.log, resolved.error));
      const outcome = resolved.value;
      if (outcome.kind === "not_found") {
        return reply
          .header("Cache-Control", siteNotFoundCache(viewer))
          .status(404)
          .send({ error: "not_found", message: `No page at ${url}` });
      }
      reply.header("Cache-Control", siteReadCache(viewer));
      if (outcome.kind === "redirect")
        return reply
          .status(301)
          .header("Location", outcome.url)
          .send({ redirect: outcome.url });
      return outcome.page;
    },
  });

  await site.register(publicCategoryRoutes, { navigation, viewerFor });
  await site.register(publicCollectionRoutes, { collections, viewerFor });

  site.route({
    method: "GET",
    url: "/site-version",
    schema: SCHEMAS.getSiteVersion,
    handler: async (request, reply) => {
      const version = await navigation.version();
      if (!version.ok)
        return reply
          .status(500)
          .send(storageFailed(request.log, version.error));
      reply.header("Cache-Control", SITE_VERSION_READ);
      return { version: version.value };
    },
  });

  site.route({
    method: "GET",
    url: "/catalog",
    schema: SCHEMAS.getCatalog,
    handler: async (request, reply) => {
      const viewer = viewerFor(request);
      const pages = await navigation.catalog(viewer);
      if (!pages.ok)
        return reply.status(500).send(storageFailed(request.log, pages.error));
      reply.header("Cache-Control", siteReadCache(viewer));
      return { pages: pages.value };
    },
  });

  site.route({
    method: "GET",
    url: "/search/documents",
    schema: SCHEMAS.getSearchDocuments,
    handler: async (request, reply) => {
      const viewer = viewerFor(request);
      const documents = await navigation.searchDocuments(viewer);
      if (!documents.ok)
        return reply
          .status(500)
          .send(storageFailed(request.log, documents.error));
      reply.header("Cache-Control", siteReadCache(viewer));
      return { documents: documents.value };
    },
  });
};
