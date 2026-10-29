/** The runtime owns configuration, concrete dependencies, and their cleanup. */
import { once } from "node:events";
import type { FastifyInstance, FastifyRequest } from "fastify";
import pino from "pino";
import { buildApp } from "./app";
import { createBetterAuth } from "./adapters/better-auth";
import { PostgresCollections } from "./adapters/postgres-collections";
import { mailerFor } from "./adapters/mail";
import { PostgresPages } from "./adapters/postgres-pages";
import { PostgresReviewRecipients } from "./adapters/postgres-review-recipients";
import { PostgresRoles } from "./adapters/postgres-roles";
import { parseConfig } from "./config";
import { connect, createPool, ping, type DatabaseFailure } from "./db";
import { migrate } from "./migrate";
import { authBypass, registerBypassEmployee } from "./adapters/auth-bypass";
import type { AuthHandler } from "./routes/auth";
import { EditorAccess, type EmployeeGate } from "./services/editor-access";
import { EditorIndex } from "./services/editor-index";
import { CategoryEditing } from "./services/category-editing";
import { CollectionEditing } from "./services/collection-editing";
import { PageEditing } from "./services/page-editing";
import { PageResolution } from "./services/page-resolution";
import {
  NO_REVIEW_NOTIFICATIONS,
  ReviewNotifications,
} from "./services/review-notifications";
import { SiteNavigation } from "./services/site-navigation";
import { seed } from "./seed";

const logger = pino({
  redact: [
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

/** A database that cannot be configured or reached stops startup with a message safe to log. */
function refuseToStart(error: DatabaseFailure): void {
  logger.error(
    { error: error._tag, operation: error.operation },
    error.message,
  );
  process.exitCode = 1;
}

async function main(): Promise<void> {
  const parsed = parseConfig(process.env);
  if (!parsed.ok) {
    // Field names only: the supplied values may be secrets.
    logger.error(
      {
        error: parsed.error._tag,
        fields: parsed.error.fields,
        reasons: parsed.error.reasons,
      },
      parsed.error.message,
    );
    process.exitCode = 1;
    return;
  }
  const config = parsed.value;
  const created = createPool(config.database, logger);
  if (!created.ok) return refuseToStart(created.error);

  const pool = created.value;
  let app: FastifyInstance | undefined;
  // Startup checks it between steps; once listening, it is what the process waits on.
  const shutdown = new AbortController();
  const stop = () => shutdown.abort();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  let operation = "connect";

  try {
    const connected = await connect(pool, config.database);
    if (!connected.ok) return refuseToStart(connected.error);
    const db = connected.value;
    operation = "migrate";
    const ran = await migrate(db, (script) => pool.query(script));
    if (ran.length > 0) logger.info({ migrations: ran }, "applied migrations");
    if (config.seed) {
      operation = "seed";
      const counts = await seed(db);
      if (Object.values(counts).some((n) => n > 0))
        logger.info(counts, "seeded the estate");
    }
    if (shutdown.signal.aborted) return;
    operation = "auth";
    const roles = new PostgresRoles(db);
    let access: EmployeeGate;
    let auth: AuthHandler;
    if (config.authBypass) {
      logger.warn(
        "AUTH_BYPASS is on: every editor request runs as a local developer without signing in",
      );
      const registered = await registerBypassEmployee(db);
      if (!registered.ok) {
        logger.error(
          { error: registered.error._tag, reason: registered.error.reason },
          registered.error.message,
        );
        process.exitCode = 1;
        return;
      }
      ({ access, auth } = authBypass);
    } else {
      const github = await createBetterAuth(db, config.auth, logger);
      access = new EditorAccess(github, roles, config.adminEmails);
      auth = github;
    }
    operation = "http";
    const pages = new PostgresPages(db);
    const mailer = mailerFor(config.notifications, logger);
    const notifier = mailer
      ? new ReviewNotifications(
          mailer,
          new PostgresReviewRecipients(db),
          config.auth.editorOrigin,
          logger,
        )
      : NO_REVIEW_NOTIFICATIONS;
    app = await buildApp({
      resolution: new PageResolution(pages),
      navigation: new SiteNavigation(pages),
      // One local developer runs the whole review flow (ADR 0079).
      editing: new PageEditing(
        pages,
        () => new Date(),
        { allowSelfApproval: config.authBypass },
        notifier,
      ),
      index: new EditorIndex(pages),
      categories: new CategoryEditing(pages, () => new Date()),
      collections: new CollectionEditing(new PostgresCollections(db)),
      access,
      roles,
      auth,
      config: {
        apiOrigin: config.auth.apiOrigin,
        editorOrigin: config.auth.editorOrigin,
      },
      ...(config.previewSecret ? { previewSecret: config.previewSecret } : {}),
      logger,
      ready: () => ping(db),
    });
    if (shutdown.signal.aborted) return;
    // A bypassed API admits any caller, so only this machine may reach it.
    await app.listen({
      port: config.port,
      host: config.authBypass ? "127.0.0.1" : "0.0.0.0",
    });
    if (!shutdown.signal.aborted) await once(shutdown.signal, "abort");
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
    // Repeated signals during cleanup abort an aborted signal harmlessly.
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
