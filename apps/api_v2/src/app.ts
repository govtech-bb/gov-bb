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

import { createHash } from "node:crypto";
import Fastify, {
  type FastifyBaseLogger,
  type FastifyError,
  type FastifyInstance,
} from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import { OPENAPI_DOCUMENT, SCHEMAS } from "./openapi";
import {
  ApiStore,
  ConflictError,
  NotFoundError,
  ValidationFailedError,
  type Database,
  type PageInput,
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
 * every request — for anything only the editor should see: an id lookup.
 */
// Assumption (#2702): `max-age=60, stale-while-revalidate=300,
// stale-if-error=86400`, not the issue's `max-age=0, s-maxage=60, …`. Nothing
// browser-side ever reads this response, so `max-age=0` protects no reader;
// `stale-if-error`'s one day is our own choice, since the issue gives none.
export const PUBLIC_READ =
  "public, max-age=60, stale-while-revalidate=300, stale-if-error=86400";
export const EDITOR_READ = "no-cache";

/**
 * The policy on `GET /pages?url=`'s 404 (#2835).
 *
 * Ten seconds turns an unknown url from one Postgres query per hit into one
 * per ten seconds per `landing_v2` instance, at the price of a brand-new url
 * taking up to ten seconds to appear; edits to existing pages are 200s under
 * `PUBLIC_READ` and are unaffected. No `stale-while-revalidate` or
 * `stale-if-error`: a cached "no page here" must never be served stale
 * through an `api_v2` outage. Every other error response — the `/pages/:id`
 * 404, the error handler's, every 500 — stays header-less.
 */
export const NOT_FOUND_READ = "public, max-age=10";

export interface AppOptions {
  db: Database;
  /** `main.ts`'s logger, shared with the pool. Unset, the app logs nothing. */
  logger?: FastifyBaseLogger;
}

export async function buildApp({
  db,
  logger,
}: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ loggerInstance: logger });
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
    allowedHeaders: ["Content-Type", IF_UPDATED_AT, "If-None-Match"],
    exposedHeaders: [IF_UPDATED_AT, "ETag"],
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
   * revalidation is a 304 with no body rather than the whole page again. It
   * also means a page that already has data can render it immediately and
   * check freshness afterwards, which is what removes the "Loading…" state
   * from a revisit.
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
   * reload, the other names the fields that are wrong, and the editor's error
   * summary links each one to its field. Flattening `errors` to a string is
   * what would break that.
   */
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    /*
     * Fastify's own request validation, which the route schemas turn on: a
     * missing or empty `url`, a page with no title. It arrives
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

  /*
   * The site's read, by `content_pages.url`. Everything that decides whether
   * a citizen may see the page — its visibility, its ancestors', its form's
   * — is decided here, so the site renders whatever comes back and a 404 is
   * the only thing a hidden page ever looks like from outside. A redirect is
   * as public as the page it points at, so it is cached like one.
   */
  app.get<{ Querystring: { url: string } }>(
    "/pages",
    { schema: SCHEMAS.getPageByUrl },
    async (request, reply) => {
      // `url` is required and non-empty by the route schema, so a missing
      // one is a 400 from Fastify before this runs.
      const { url } = request.query;
      const resolved = await store.resolve(url);
      if (resolved.kind === "not_found") {
        reply.header("Cache-Control", NOT_FOUND_READ);
        return reply
          .status(404)
          .send({ error: "not_found", message: `No page at ${url}` });
      }
      reply.header("Cache-Control", PUBLIC_READ);
      if (resolved.kind === "redirect") {
        return reply
          .status(301)
          .header("Location", resolved.url)
          .send({ redirect: resolved.url });
      }
      return resolved.page;
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

  app.put<{ Params: { id: string }; Body: PageInput }>(
    "/pages/:id",
    { schema: SCHEMAS.savePage },
    async (request, reply) => {
      const header = request.headers[IF_UPDATED_AT];
      const ifUpdatedAt = Array.isArray(header) ? header[0] : (header ?? null);
      const saved = await store.save(
        request.params.id,
        request.body,
        ifUpdatedAt || null,
      );
      return reply.status(200).send(saved);
    },
  );

  app.post<{ Body: PageInput }>(
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

  return app;
}
