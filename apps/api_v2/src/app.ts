/**
 * The HTTP surface, derived method for method from the store and no larger.
 *
 * #2700's note — "resist building CRUD for tables nothing reads yet" — is why
 * there is no endpoint here that `editor_v2` or `landing_v2` does not call.
 *
 * Reads are public; writes are where #2701's auth will attach, which is why
 * they are registered together at the bottom rather than scattered.
 */

import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { PageDocument } from "@govtech-bb/block-kit/document";
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

export interface AppOptions {
  db: Database;
  logger?: boolean;
}

export function buildApp({ db, logger = false }: AppOptions): FastifyInstance {
  const app = Fastify({ logger });
  const store = new ApiStore(db);

  /*
   * `methods` is not optional here. The default allow-list is GET, HEAD and
   * POST, so every PUT and DELETE failed its preflight and reached the app as
   * a bare "TypeError: Failed to fetch" in the browser — no status, no body,
   * nothing in the server log, because the request never arrived.
   */
  app.register(cors, {
    origin: true,
    methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", IF_UPDATED_AT],
    exposedHeaders: [IF_UPDATED_AT],
  });

  /*
   * One error handler rather than try/catch per route. A 409 and a 422 are
   * both "your write did not land", but they need different words: one says
   * reload, the other names the blocks that are wrong, and the editor's error
   * summary links each one to its block. Flattening `errors` to a string is
   * what would break that.
   */
  app.setErrorHandler((error, _request, reply) => {
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

  app.get<{ Querystring: { drafts?: string } }>(
    "/pages",
    async (request) => await store.list(request.query.drafts === "true"),
  );

  /*
   * Before `/pages/:id`, or Fastify would read "by-url" as an id. The site
   * routes on `content_pages.url`, so this is the endpoint `landing_v2`
   * actually uses — the id is the editor's key, not the site's.
   */
  app.get<{ Querystring: { url?: string } }>(
    "/pages/by-url",
    async (request, reply) => {
      const url = request.query.url;
      if (!url) {
        return reply
          .status(400)
          .send({ error: "bad_request", message: "url is required" });
      }
      const doc = await store.getByUrl(url);
      if (!doc) {
        return reply
          .status(404)
          .send({ error: "not_found", message: `No page at ${url}` });
      }
      return doc;
    },
  );

  app.get<{ Params: { id: string } }>("/pages/:id", async (request, reply) => {
    const doc = await store.get(request.params.id);
    if (!doc) {
      return reply.status(404).send({
        error: "not_found",
        message: `No page with id ${request.params.id}`,
      });
    }
    return doc;
  });

  app.get("/collections", async () => await store.listCollections());

  app.get<{ Params: { key: string }; Querystring: { keys?: string } }>(
    "/collections/:key/records",
    async (request) =>
      request.query.keys === "true"
        ? await store.recordRows(request.params.key)
        : await store.records(request.params.key),
  );

  /*
   * Live updates.
   *
   * `useLiveQuery` is the one thing PGlite gave the spike that HTTP does not:
   * an author saves in one tab and the site updates in another with no
   * reload, which `e2e/live-update.spec.ts` asserts with a comment saying
   * there is no `reload()` anywhere in the test.
   *
   * `change_events` already gets a row on every save, and is append-only, so
   * "what has happened since id X" is answerable without keeping any state
   * per connection. The server polls it rather than using LISTEN/NOTIFY: a
   * poll needs no second connection held open per subscriber, and at one
   * editor and a handful of tabs the difference is not worth the machinery.
   * LISTEN/NOTIFY is the production answer and is noted as such.
   */
  app.get("/events", (request, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    reply.raw.write(": connected\n\n");

    let lastSeen = new Date();
    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      try {
        const since = await store.changesSince(lastSeen);
        if (since.length > 0) {
          lastSeen = since[since.length - 1].occurredAt;
          reply.raw.write(`event: change\ndata: ${JSON.stringify(since)}\n\n`);
        } else {
          // A comment frame keeps proxies from closing an idle stream.
          reply.raw.write(": keep-alive\n\n");
        }
      } catch (error) {
        app.log.error(error);
      }
    };

    const timer = setInterval(tick, 500);
    request.raw.on("close", () => {
      stopped = true;
      clearInterval(timer);
    });
  });

  /* ----------------------------------------------------------- writes */

  app.put<{ Params: { id: string }; Body: PageDocument }>(
    "/pages/:id",
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
    async (request, reply) =>
      reply.status(201).send(await store.create(request.body)),
  );

  app.delete<{ Params: { id: string } }>(
    "/pages/:id",
    async (request, reply) => {
      await store.delete(request.params.id);
      return reply.status(204).send();
    },
  );

  app.put<{
    Params: { key: string; recordKey: string };
    Body: { data: Record<string, unknown>; previousKey?: string };
  }>("/collections/:key/records/:recordKey", async (request, reply) => {
    await store.saveRecord(
      request.params.key,
      request.params.recordKey,
      request.body.data,
      request.body.previousKey,
    );
    return reply.status(204).send();
  });

  app.delete<{ Params: { key: string; recordKey: string } }>(
    "/collections/:key/records/:recordKey",
    async (request, reply) => {
      await store.deleteRecord(request.params.key, request.params.recordKey);
      return reply.status(204).send();
    },
  );

  return app;
}
