import { createHash } from "node:crypto";
import Fastify, {
  LogController,
  type FastifyBaseLogger,
  type FastifyError,
  type FastifyInstance,
} from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { OPENAPI_DOCUMENT } from "./openapi";
import type { Redacted } from "./modules/redacted";
import { authRoutes, type AuthHandler } from "./routes/auth";
import { editorRoutes, IF_UPDATED_AT } from "./routes/pages";
import { EDITOR_READ } from "./routes/responses";
import { siteRoutes } from "./routes/site";
import type { EditorAccess } from "./services/editor-access";
import type { EditorIndex } from "./services/editor-index";
import type { PageEditing } from "./services/page-editing";
import type { PageResolution } from "./services/page-resolution";
import type { SiteNavigation } from "./services/site-navigation";

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

/**
 * HTTP dependencies, constructed once by the process composition root. Each
 * route plugin receives exactly the ones it uses as its options; nothing is
 * decorated onto the Fastify instance.
 */
export interface AppOptions {
  readonly resolution: PageResolution;
  readonly navigation: SiteNavigation;
  readonly editing: PageEditing;
  readonly index: EditorIndex;
  readonly access: Pick<EditorAccess, "requireEmployee">;
  readonly auth: AuthHandler;
  readonly config: {
    readonly apiOrigin: string;
    readonly editorOrigin: string;
  };
  /** The site's preview token; without it, preview reads are refused. */
  readonly previewSecret?: Redacted<string>;
  /** The root logger shared with database and authentication adapters. */
  readonly logger?: FastifyBaseLogger;
}

/** Construct HTTP transport around explicit application capabilities. */
export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { logger, config } = options;
  const app = Fastify({
    logController: new LogController({ disableRequestLogging: true }),
    ...(logger ? { loggerInstance: logger } : {}),
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
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
  await app.register(swagger, {
    openapi: OPENAPI_DOCUMENT,
    transform: jsonSchemaTransform,
  });
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
    // Database errors can contain SQL parameters, and auth errors can contain tokens.
    request.log.error({ failure: "internal_error" }, "request failed");
    return reply.status(500).send({ error: "internal_error" });
  });

  await app.register(siteRoutes, {
    resolution: options.resolution,
    navigation: options.navigation,
    previewSecret: options.previewSecret,
  });
  await app.register(editorRoutes, {
    editing: options.editing,
    index: options.index,
    access: options.access,
    editorOrigin: config.editorOrigin,
  });
  await app.register(authRoutes, {
    auth: options.auth,
    apiOrigin: config.apiOrigin,
  });
  return app;
}
