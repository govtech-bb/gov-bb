import { readFileSync } from "node:fs";
import { drizzle, type NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import type { Logger } from "pino";
import type { AppConfig } from "./config";
import { err, ok, type Result } from "./modules/result";

/** The node-postgres drizzle handle: the pool's, or a transaction's within it. */
export type Database = PgDatabase<
  NodePgQueryResultHKT,
  Record<string, unknown>
>;

/** A failed database setup operation, safe to report without driver details. */
export class DatabaseFailure extends Error {
  /** Stable startup failure category. */
  readonly _tag = "DatabaseFailure" as const;
  /** Operation safe to include in startup diagnostics. */
  readonly operation: "configure" | "connect";

  /** Retain only startup context safe to report or serialize. */
  constructor(operation: DatabaseFailure["operation"], message: string) {
    super(message);
    this.operation = operation;
  }
}

function sslConfig(config: AppConfig["database"]) {
  if (!config.production) return false;
  if (!config.ca) return { rejectUnauthorized: true };
  return {
    rejectUnauthorized: true,
    ca: config.ca.includes("BEGIN CERTIFICATE")
      ? config.ca
      : readFileSync(config.ca, "utf8"),
  };
}

/** Construct the shared pool from parsed settings, preserving verified production TLS. */
export function createPool(
  config: AppConfig["database"],
  logger: Pick<Logger, "warn">,
): Result<Pool, DatabaseFailure> {
  try {
    const pool = new Pool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password.reveal(),
      database: config.database,
      ssl: sslConfig(config),
    });
    // This text is an operational alarm marker. The driver error carries its
    // client, so forwarding the whole error would expose connection credentials.
    pool.on("error", (error) => {
      logger.warn(
        {
          code:
            "code" in error && typeof error.code === "string"
              ? error.code
              : undefined,
        },
        "idle database connection dropped",
      );
    });
    return ok(pool);
  } catch {
    return err(
      new DatabaseFailure("configure", "Cannot configure Postgres connection."),
    );
  }
}

/** Verify the shared pool before constructing adapters or accepting requests. */
export async function connect(
  pool: Pool,
  config: AppConfig["database"],
): Promise<Result<Database, DatabaseFailure>> {
  try {
    await pool.query("select 1");
  } catch {
    return err(
      new DatabaseFailure(
        "connect",
        `Cannot reach Postgres at ${config.host}:${config.port} as ${config.user} — refusing to start. ` +
          "Set DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD and DB_NAME.",
      ),
    );
  }
  return ok(drizzle(pool));
}
