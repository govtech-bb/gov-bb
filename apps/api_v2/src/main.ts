/** The runtime owns configuration, concrete dependencies, and their cleanup. */
import type { FastifyInstance, FastifyRequest } from "fastify";
import pino from "pino";
import { buildApp } from "./app";
import { createBetterAuth } from "./adapters/better-auth";
import { PostgresPages } from "./adapters/postgres-pages";
import { parseConfig } from "./config";
import { connect, createPool } from "./db";
import { migrate } from "./migrate";
import { authBypass } from "./adapters/auth-bypass";
import { EditorAccess } from "./services/editor-access";
import { EditorIndex } from "./services/editor-index";
import { PageEditing } from "./services/page-editing";
import { PageResolution } from "./services/page-resolution";
import { SiteNavigation } from "./services/site-navigation";
import { seed } from "./seed";

const logger = pino({
  redact: [
    "req.headers.cookie",
    "req.headers.authorization",
    "res.headers['set-cookie']",
    "password",
    "*.password",
    "*.accessToken",
    "*.refreshToken",
    "*.idToken",
  ],
  serializers: {
    // OAuth callback codes and state live in the query string, never the log.
    req: (request: FastifyRequest) => ({
      id: request.id,
      method: request.method,
      url: request.url.split("?")[0],
      remoteAddress: request.ip,
    }),
  },
});

async function main(): Promise<void> {
  const parsed = parseConfig(process.env);
  if (!parsed.ok) {
    // Field names only: the supplied values may be secrets.
    logger.error(
      { error: parsed.error._tag, fields: parsed.error.fields },
      parsed.error.message,
    );
    process.exitCode = 1;
    return;
  }
  const config = parsed.value;
  const created = createPool(config.database, logger);
  if (!created.ok) {
    logger.error(
      { error: created.error._tag, operation: created.error.operation },
      created.error.message,
    );
    process.exitCode = 1;
    return;
  }

  const pool = created.value;
  let app: FastifyInstance | undefined;
  let stopping = false;
  let finish: (() => void) | undefined;
  const stopped = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const stop = () => {
    stopping = true;
    finish?.();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  let operation = "connect";

  try {
    const connected = await connect(pool, config.database);
    if (!connected.ok) {
      logger.error(
        { error: connected.error._tag, operation: connected.error.operation },
        connected.error.message,
      );
      process.exitCode = 1;
      return;
    }
    const db = connected.value;
    operation = "migrate";
    const ran = await migrate(db, (script) => pool.query(script));
    if (ran.length > 0) logger.info({ migrations: ran }, "applied migrations");
    if (config.seed) {
      operation = "seed";
      const counts = await seed(db);
      if (counts.documents + counts.categories > 0)
        logger.info(counts, "seeded the estate");
    }
    if (stopping) return;
    operation = "auth";
    const betterAuth = config.authBypass
      ? undefined
      : await createBetterAuth(pool, config.auth, logger);
    if (!betterAuth)
      logger.warn(
        "AUTH_BYPASS is on: every editor request runs as a local developer without signing in",
      );
    operation = "http";
    const pages = new PostgresPages(db);
    app = await buildApp({
      resolution: new PageResolution(pages),
      navigation: new SiteNavigation(pages),
      editing: new PageEditing(pages, () => new Date()),
      index: new EditorIndex(pages),
      access: betterAuth ? new EditorAccess(betterAuth) : authBypass.access,
      auth: betterAuth ?? authBypass.auth,
      config: {
        apiOrigin: config.auth.apiOrigin,
        editorOrigin: config.auth.editorOrigin,
      },
      ...(config.previewSecret ? { previewSecret: config.previewSecret } : {}),
      logger,
    });
    if (stopping) return;
    await app.listen({ port: config.port, host: "0.0.0.0" });
    await stopped;
  } catch (error) {
    const code =
      error instanceof Error &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : undefined;
    logger.error({ operation, code }, "api_v2 failed to start or serve");
    process.exitCode = 1;
  } finally {
    // In-flight requests may still need the pool until Fastify has closed.
    // Repeated signals during cleanup resolve the same promise harmlessly.
    try {
      try {
        await app?.close();
      } finally {
        await pool.end();
      }
    } finally {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
    }
  }
}

main().catch(() => {
  logger.error("api_v2 could not finish resource cleanup.");
  process.exitCode = 1;
});
