/** The runtime owns configuration, concrete dependencies, and their cleanup. */
import type { FastifyInstance, FastifyRequest } from "fastify";
import pino from "pino";
import { buildApp } from "./app";
import { createBetterAuth } from "./adapters/better-auth";
import { parseConfig } from "./config";
import { connect, createPool } from "./db";
import { migrate } from "./migrate";
import { authBypass } from "./services/auth-bypass";
import { EditorAccess } from "./services/editor-access";
import { seed } from "./seed";
import { ApiStore } from "./store";

async function main(): Promise<void> {
  const parsed = parseConfig(process.env);
  if (!parsed.ok) {
    console.error(parsed.error.message);
    process.exitCode = 1;
    return;
  }
  const config = parsed.value;
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
    if (ran.length > 0) console.log(`api_v2: applied ${ran.join(", ")}`);
    if (config.seed) {
      operation = "seed";
      const counts = await seed(db);
      if (counts.documents + counts.categories + counts.forms > 0) {
        console.log(
          `api_v2: seeded ${counts.documents} pages, ${counts.categories} categories, ${counts.forms} forms`,
        );
      }
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
    app = await buildApp({
      store: new ApiStore(db),
      access: betterAuth ? new EditorAccess(betterAuth) : authBypass.access,
      auth: betterAuth ?? authBypass.auth,
      config: config.auth,
      logger,
    });
    if (stopping) return;
    await app.listen({ port: config.port, host: "0.0.0.0" });
    console.log(`api_v2 listening on ${config.port}`);
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
  console.error("api_v2 could not finish resource cleanup.");
  process.exitCode = 1;
});
