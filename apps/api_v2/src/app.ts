import { createHash } from "node:crypto";
import Fastify, {
  LogController,
  type FastifyBaseLogger,
  type FastifyError,
  type FastifyInstance,
} from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import { OPENAPI_DOCUMENT } from "./openapi";
import type { Redacted } from "./modules/redacted";
import { registerAuthRoutes, type AuthHandler } from "./routes/auth";
import { IF_UPDATED_AT, registerPageRoutes } from "./routes/pages";
import { EDITOR_READ, registerSiteRoutes } from "./routes/site";
import type { EditorAccess } from "./services/editor-access";
import {
  ConflictError,
  NotFoundError,
  ValidationFailedError,
  type ApiStore,
} from "./store";

export { IF_UPDATED_AT } from "./routes/pages";
export { EDITOR_READ, NOT_FOUND_READ, PUBLIC_READ } from "./routes/site";

/** A Scalar reference page over the generated spec. */
const DOCS_HTML = `<!doctype html>
<html>
  <head>
    <title>api_v2</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script id="api-reference" data-url="/docs/openapi.json"></script>
    <script
      src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.73.0/dist/browser/standalone.js"
      integrity="sha384-OKyMdsDX84ypSZEhVun8YElXk5c2GQaH3EXPOc6ItmVcLDUAvKHYwvDLvAgsqVtB"
      crossorigin="anonymous"
    ></script>
  </body>
</html>`;

/** HTTP dependencies are constructed once by the process composition root. */
export interface AppOptions {
  store: ApiStore;
  access: Pick<EditorAccess, "requireEmployee">;
  auth: AuthHandler;
  config: { apiOrigin: string; editorOrigin: string };
  /** The site's preview token; without it, preview reads are refused. */
  previewSecret?: Redacted<string>;
  /** The root logger shared with database and authentication adapters. */
  logger?: FastifyBaseLogger;
}

/** Construct HTTP transport around explicit application capabilities. */
export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { logger, config } = options;
  const app = Fastify({
    logController: new LogController({ disableRequestLogging: true }),
    ...(logger ? { loggerInstance: logger } : {}),
  });
  app.addHook("onResponse", async (request, reply) => {
    request.log.info(
      {
        method: request.method,
        route: request.routeOptions.url,
        statusCode: reply.statusCode,
      },
      "request completed",
    );
  });
  await app.register(cors, {
    origin: (origin, callback) =>
      callback(null, !origin || origin === config.editorOrigin),
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", IF_UPDATED_AT, "If-None-Match"],
    exposedHeaders: [IF_UPDATED_AT, "ETag"],
  });
  // Swagger must load before routes so its onRoute hook sees their schemas.
  await app.register(swagger, { openapi: OPENAPI_DOCUMENT });
  app.get("/docs/openapi.json", { schema: { hide: true } }, async () =>
    app.swagger(),
  );
  app.get("/docs", { schema: { hide: true } }, async (_request, reply) =>
    reply.type("text/html; charset=utf-8").send(DOCS_HTML),
  );

  app.addHook("onSend", async (request, reply, payload) => {
    if (reply.getHeader("Cache-Control") === EDITOR_READ) {
      reply.removeHeader("ETag");
      return payload;
    }
    if (
      request.method !== "GET" ||
      typeof payload !== "string" ||
      reply.statusCode !== 200
    )
      return payload;
    const etag = `"${createHash("sha1").update(payload).digest("base64url")}"`;
    reply.header("ETag", etag);
    if (!reply.hasHeader("Cache-Control"))
      reply.header("Cache-Control", "no-cache");
    if (request.headers["if-none-match"] === etag) {
      reply.code(304);
      return "";
    }
    return payload;
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation)
      return reply
        .status(400)
        .send({ error: "bad_request", message: error.message });
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
    if (error instanceof NotFoundError)
      return reply
        .status(404)
        .send({ error: "not_found", message: error.message });
    // Database errors can contain SQL parameters, and auth errors can contain tokens.
    request.log.error({ failure: "internal_error" }, "request failed");
    return reply.status(500).send({ error: "internal_error" });
  });

  registerAuthRoutes(app, options.auth, config.apiOrigin);
  await registerPageRoutes(
    app,
    options.store,
    options.access,
    config.editorOrigin,
    options.previewSecret,
  );
  registerSiteRoutes(app, options.store, options.previewSecret);
  return app;
}
