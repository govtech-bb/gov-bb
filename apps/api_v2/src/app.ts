import { STATUS_CODES } from "node:http";
import Fastify, {
  LogController,
  type FastifyBaseLogger,
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
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
import { siteRoutes } from "./routes/site";
import type { EmployeeGate } from "./services/editor-access";
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
  readonly access: EmployeeGate;
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

/**
 * Fastify's request log, minus the incoming line and the url: its query can
 * carry OAuth codes, so a request is identified by its route pattern.
 */
class RequestLog extends LogController {
  override incomingRequest(): void {}

  override requestCompleted(
    _error: Error | null | undefined,
    request: FastifyRequest,
    reply: FastifyReply,
  ): void {
    request.log.info(
      {
        method: request.method,
        route: request.routeOptions.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
      },
      "request completed",
    );
  }
}

/** Construct HTTP transport around explicit application capabilities. */
export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { logger, config } = options;
  const app = Fastify({
    logController: new RequestLog(),
    ...(logger ? { loggerInstance: logger } : {}),
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(cors, {
    origin: (origin, callback) =>
      callback(null, !origin || origin === config.editorOrigin),
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", IF_UPDATED_AT, "If-None-Match"],
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

  app.setErrorHandler((error: FastifyError, request, reply) => {
    // Fastify's own refusals (invalid JSON, wrong content type, too large,
    // schema validation) carry their 4xx status; only failures are 500s.
    const status = error.statusCode ?? 500;
    if (status < 500)
      return reply.status(status).send({
        error: (STATUS_CODES[status] ?? "error")
          .toLowerCase()
          .replaceAll(" ", "_"),
        message: error.message,
      });
    // The message can carry SQL parameters or tokens, so only the code is logged.
    request.log.error(
      { failure: "internal_error", code: error.code },
      "request failed",
    );
    return reply.status(500).send({ error: "internal_error" });
  });
  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      error: "not_found",
      message: `No route for ${request.method} ${request.url.split("?")[0]}`,
    }),
  );

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
