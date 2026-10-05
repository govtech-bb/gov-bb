/**
 * The HTTP surface, derived method for method from the store and no larger.
 *
 * #2700's note — "resist building CRUD for tables nothing reads yet" — is why
 * there is no endpoint here beyond what the block editor spike's site and
 * editor already call, and nothing at all for a table no one reads.
 *
 * Reads are public; writes are where #2701's auth will attach, which is why
 * they are registered together at the bottom rather than scattered.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import type { PageDocument } from "@govtech-bb/block-kit/document";
import { OPENAPI_DOCUMENT, SCHEMAS } from "./openapi";
import {
  ApiStore,
  ConflictError,
  NotFoundError,
  ValidationFailedError,
  type Database,
} from "./store";

/**
 * The header carrying optimistic concurrency.
 *
 * `If-Unmodified-Since` is the HTTP-native spelling, but it has one-second
 * resolution and `updated_at` is a timestamptz with microseconds — two saves
 * in the same second would compare equal and the second would silently win.
 * So the exact value travels in its own header instead.
 */
export const IF_UPDATED_AT = "if-updated-at";

/**
 * The two Cache-Control policies a successful read sends.
 *
 * `PUBLIC_READ` is what a shared cache (undici in `landing_v2`, later a CDN)
 * may hold and serve to anyone. `EDITOR_READ` is `no-cache` — revalidate on
 * every request — for anything only the editor should see: an id lookup, a
 * draft, or a record's key.
 */
// Assumption (#2702): `max-age=60, stale-while-revalidate=300,
// stale-if-error=86400`, not the issue's `max-age=0, s-maxage=60, …`. Nothing
// browser-side ever reads this response, so `max-age=0` protects no reader;
// `stale-if-error`'s one day is our own choice, since the issue gives none.
export const PUBLIC_READ =
  "public, max-age=60, stale-while-revalidate=300, stale-if-error=86400";
export const EDITOR_READ = "no-cache";

/**
 * The by-url 404's policy when drafts are not asked for (#2835).
 *
 * Ten seconds turns an unknown url from one Postgres query per hit into one
 * per ten seconds per `landing_v2` instance, at the price of a brand-new url
 * taking up to ten seconds to appear; edits to existing pages are 200s under
 * `PUBLIC_READ` and are unaffected. No `stale-while-revalidate` or
 * `stale-if-error`: a cached "no page here" must never be served stale
 * through an `api_v2` outage. Every other error response — the drafts 404,
 * the `/pages/:id` 404, the error handler's, every 500 — stays header-less.
 */
export const NOT_FOUND_READ = "public, max-age=10";

export interface AppOptions {
  db: Database;
  logger?: boolean;
  /** Bearer token writes require. Defaults to `API_V2_WRITE_TOKEN`. */
  writeToken?: string;
  /**
   * With no token, leave writes open — a local-development opt-in only.
   * Defaults to `API_V2_OPEN_WRITES === "true"`; anything else fails closed.
   */
  openWrites?: boolean;
}

/**
 * Does this request need the write token? Every write, plus the two reads
 * that expose editor-only data: drafts, and a collection's record keys.
 */
function needsWriteToken(method: string, query: unknown): boolean {
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) return true;
  const { drafts, keys } = (query ?? {}) as Record<string, unknown>;
  return drafts === "true" || keys === "true";
}

/**
 * Compare the presented bearer token in constant time. Both sides are hashed
 * first so `timingSafeEqual` always sees equal lengths and the comparison
 * leaks nothing about the token's length either.
 */
function bearerMatches(header: string | undefined, token: string): boolean {
  const presented = header?.match(/^Bearer (.+)$/)?.[1];
  if (!presented) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(presented), digest(token));
}

export async function buildApp({
  db,
  logger = false,
  writeToken = process.env.API_V2_WRITE_TOKEN || undefined,
  openWrites = process.env.API_V2_OPEN_WRITES === "true",
}: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger });
  const store = new ApiStore(db);

  /*
   * `methods` is not optional here. The default allow-list is GET, HEAD and
   * POST, so every PUT and DELETE failed its preflight and reached the app as
   * a bare "TypeError: Failed to fetch" in the browser — no status, no body,
   * nothing in the server log, because the request never arrived.
   *
   * The origin allow-list is not optional either, and for a sharper reason.
   * Writes are unauthenticated until #2701 lands, so reflecting any origin
   * would mean any page a developer happens to visit could preflight a
   * DELETE at their running instance and empty the estate — no phishing, no
   * credentials, just a fetch from a tab they left open. Widening `methods`
   * to include PUT and DELETE is what turned that from theoretical into
   * reachable, so the two changes belong together.
   *
   * `CORS_ORIGINS` is a comma-separated list. The default covers only
   * `editor_v2`'s dev servers, because that is the only browser app that
   * calls `api_v2` directly — `landing_v2` is server-rendered, so every
   * fetch it makes happens on its own server and never meets CORS at all.
   */
  // Assumption (#2702): landing_v2 never makes a cross-origin call once
  // every fetch is server-side, so :3030 and :3093 came out of the default;
  // writes are still unauthenticated (#2701).
  const allowedOrigins = (
    process.env.CORS_ORIGINS ??
    [
      "http://localhost:3010", // editor_v2
      "http://localhost:3011",
      "http://localhost:3092", // editor_v2 under Playwright
    ].join(",")
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  await app.register(cors, {
    // A request with no Origin header is not a browser cross-origin request —
    // curl, a health check, the tests — so it is allowed through rather than
    // rejected. The rule is about which *sites* may drive this API.
    origin: (origin, callback) =>
      callback(null, !origin || allowedOrigins.includes(origin)),
    methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      IF_UPDATED_AT,
      "If-None-Match",
    ],
    exposedHeaders: [IF_UPDATED_AT, "ETag"],
  });

  /*
   * The interim write gate, until #2701's real auth lands. With
   * `API_V2_WRITE_TOKEN` set, writes and editor-only reads need it as a bearer
   * token. Without one they are refused, unless `API_V2_OPEN_WRITES=true`
   * opts a laptop out. Failing closed by default is the point: it does not
   * depend on `NODE_ENV`, which a container can easily leave unset.
   */
  if (!writeToken) {
    app.log.warn(
      openWrites
        ? "API_V2_OPEN_WRITES is set: writes are unauthenticated"
        : "API_V2_WRITE_TOKEN is not set: refusing every write",
    );
  }
  app.addHook("onRequest", async (request, reply) => {
    if (!needsWriteToken(request.method, request.query)) return;
    if (!writeToken && openWrites) return;
    if (
      writeToken &&
      bearerMatches(request.headers.authorization, writeToken)
    ) {
      return;
    }
    return reply.status(401).send({
      error: "unauthorized",
      message: "This request needs a valid write token.",
    });
  });

  /*
   * The OpenAPI document is generated from the schemas the routes are already
   * validated and serialised with, so it describes what the server does
   * rather than what someone remembered it did. `openapi.test.ts` holds the
   * committed copy to the generated one.
   */
  /*
   * Awaited, not queued. `@fastify/swagger` collects routes through an
   * `onRoute` hook, and `register` defers loading until `ready()` — so a
   * plugin that is registered but not yet loaded when the routes are declared
   * sees none of them and generates a document with an empty `paths`. That
   * failure is silent: the server starts, `/openapi.json` answers 200, and
   * the spec simply describes nothing. Awaiting here is what makes the plugin
   * live before the first `app.get` below.
   */
  await app.register(swagger, { openapi: OPENAPI_DOCUMENT });

  app.get("/openapi.json", { schema: { hide: true } }, async () =>
    app.swagger(),
  );

  /*
   * ETags on every read.
   *
   * The client caches what it has and revalidates; with an ETag that
   * revalidation is a 304 with no body rather than the collection's 163
   * records again. It also means a page that already has data can render it
   * immediately and check freshness afterwards, which is what removes the
   * "Loading…" state from a revisit.
   */
  app.addHook("onSend", async (request, reply, payload) => {
    if (request.method !== "GET" || typeof payload !== "string") return payload;
    if (reply.statusCode !== 200) return payload;
    if (reply.getHeader("Cache-Control") === "no-store") return payload;

    const etag = `"${createHash("sha1").update(payload).digest("base64url")}"`;
    reply.header("ETag", etag);
    // A route that already set PUBLIC_READ or EDITOR_READ keeps it; this is
    // only the fallback for a route that didn't set a policy of its own.
    if (!reply.hasHeader("Cache-Control")) {
      reply.header("Cache-Control", "no-cache");
    }

    if (request.headers["if-none-match"] === etag) {
      reply.code(304);
      return "";
    }
    return payload;
  });

  /*
   * One error handler rather than try/catch per route. A 409 and a 422 are
   * both "your write did not land", but they need different words: one says
   * reload, the other names the blocks that are wrong, and the editor's error
   * summary links each one to its block. Flattening `errors` to a string is
   * what would break that.
   */
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    /*
     * Fastify's own request validation, which the route schemas turn on: a
     * missing `url`, a `drafts` that is not "true" or "false". It arrives
     * here as an ordinary error, so without this it would be reported as a
     * 500 — the server blaming itself for a request it correctly refused.
     */
    if (error.validation) {
      return reply
        .status(400)
        .send({ error: "bad_request", message: error.message });
    }
    if (error instanceof ValidationFailedError) {
      return reply.status(422).send({
        error: "validation_failed",
        message: error.message,
        errors: error.errors,
      });
    }
    if (error instanceof ConflictError) {
      return reply.status(409).send({
        error: "conflict",
        message: error.message,
        documentId: error.documentId,
      });
    }
    if (error instanceof NotFoundError) {
      return reply
        .status(404)
        .send({ error: "not_found", message: error.message });
    }
    app.log.error(error);
    return reply.status(500).send({ error: "internal_error" });
  });

  /* ------------------------------------------------------------ reads */

  // Assumption (#2702): which of PUBLIC_READ/EDITOR_READ each route below
  // sends is the plan's own split — publicly-cacheable pages and records vs.
  // anything only the editor reads (an id lookup, a draft, a record's key).

  app.get<{ Querystring: { drafts?: string } }>(
    "/pages",
    { schema: SCHEMAS.listPages },
    async (request, reply) => {
      const drafts = request.query.drafts === "true";
      const pages = await store.list(drafts);
      reply.header("Cache-Control", drafts ? EDITOR_READ : PUBLIC_READ);
      return pages;
    },
  );

  /*
   * Before `/pages/:id`, or Fastify would read "by-url" as an id. The site
   * routes on `content_pages.url`, so this is the endpoint `landing_v2`
   * actually uses — the id is the editor's key, not the site's.
   */
  app.get<{ Querystring: { url?: string; drafts?: string } }>(
    "/pages/by-url",
    { schema: SCHEMAS.getPageByUrl },
    async (request, reply) => {
      // `url` is required by the route schema, so a missing one is a 400 from
      // Fastify before this runs.
      const url = request.query.url as string;
      const drafts = request.query.drafts === "true";
      const doc = await store.getByUrl(url, drafts);
      if (!doc) {
        if (!drafts) reply.header("Cache-Control", NOT_FOUND_READ);
        return reply
          .status(404)
          .send({ error: "not_found", message: `No page at ${url}` });
      }
      reply.header("Cache-Control", drafts ? EDITOR_READ : PUBLIC_READ);
      return doc;
    },
  );

  app.get<{ Params: { id: string } }>(
    "/pages/:id",
    { schema: SCHEMAS.getPage },
    async (request, reply) => {
      const doc = await store.get(request.params.id);
      if (!doc) {
        return reply.status(404).send({
          error: "not_found",
          message: `No page with id ${request.params.id}`,
        });
      }
      reply.header("Cache-Control", EDITOR_READ);
      return doc;
    },
  );

  app.get(
    "/collections",
    { schema: SCHEMAS.listCollections },
    async (_request, reply) => {
      const collections = await store.listCollections();
      reply.header("Cache-Control", EDITOR_READ);
      return collections;
    },
  );

  app.get<{ Params: { key: string }; Querystring: { keys?: string } }>(
    "/collections/:key/records",
    { schema: SCHEMAS.listRecords },
    async (request, reply) => {
      const keys = request.query.keys === "true";
      const records = keys
        ? await store.recordRows(request.params.key)
        : await store.records(request.params.key);
      reply.header("Cache-Control", keys ? EDITOR_READ : PUBLIC_READ);
      return records;
    },
  );

  /*
   * Live updates, as a version token rather than a held-open stream.
   *
   * This was Server-Sent Events, and SSE was the wrong shape. Each tab held
   * one connection open forever, and a browser allows about six per origin —
   * so the seventh tab's requests queued behind them and never ran. The page
   * sat on "Loading…" indefinitely while the server looked perfectly healthy,
   * because nothing had failed; the requests had simply never been sent.
   *
   * A token that clients poll costs one short request every few seconds and
   * holds nothing. `change_events` is append-only, so its count and its
   * latest timestamp are a cheap and honest version of the whole estate.
   */
  app.get("/version", { schema: SCHEMAS.version }, async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    return await store.version();
  });

  /* ----------------------------------------------------------- writes */

  app.put<{ Params: { id: string }; Body: PageDocument }>(
    "/pages/:id",
    { schema: SCHEMAS.savePage },
    async (request, reply) => {
      const doc = { ...request.body, id: request.params.id };
      const header = request.headers[IF_UPDATED_AT];
      const ifUpdatedAt = Array.isArray(header) ? header[0] : (header ?? null);
      const saved = await store.save(doc, ifUpdatedAt || null);
      return reply.status(200).send(saved);
    },
  );

  app.post<{ Body: Omit<PageDocument, "updated_at"> }>(
    "/pages",
    { schema: SCHEMAS.createPage },
    async (request, reply) =>
      reply.status(201).send(await store.create(request.body)),
  );

  app.delete<{ Params: { id: string } }>(
    "/pages/:id",
    { schema: SCHEMAS.deletePage },
    async (request, reply) => {
      await store.delete(request.params.id);
      return reply.status(204).send();
    },
  );

  app.put<{
    Params: { key: string; recordKey: string };
    Body: { data: Record<string, unknown>; previousKey?: string };
  }>(
    "/collections/:key/records/:recordKey",
    { schema: SCHEMAS.saveRecord },
    async (request, reply) => {
      await store.saveRecord(
        request.params.key,
        request.params.recordKey,
        request.body.data,
        request.body.previousKey,
      );
      return reply.status(204).send();
    },
  );

  app.delete<{ Params: { key: string; recordKey: string } }>(
    "/collections/:key/records/:recordKey",
    { schema: SCHEMAS.deleteRecord },
    async (request, reply) => {
      await store.deleteRecord(request.params.key, request.params.recordKey);
      return reply.status(204).send();
    },
  );

  return app;
}
