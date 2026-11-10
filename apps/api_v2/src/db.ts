import { readFileSync } from "node:fs";
import { sql, TransactionRollbackError } from "drizzle-orm";
import { drizzle, type NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { Pool, type QueryConfig } from "pg";
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

/**
 * Construct the shared pool from parsed settings, preserving verified
 * production TLS. `queryTimeoutMs` fails a query the database has gone quiet
 * on (a failover or partition keeps the socket open) instead of waiting
 * minutes for TCP to notice; without it a query may run as long as it needs.
 * Postgres gets the same limit (`statement_timeout`): a backend waiting on a
 * lock doesn't notice its client has gone, so without it every timed-out
 * query would keep a connection open after the pool has replaced it.
 */
export function createPool(
  config: AppConfig["database"],
  logger: Pick<Logger, "warn">,
  { queryTimeoutMs }: { queryTimeoutMs?: number } = {},
): Result<Pool, DatabaseFailure> {
  try {
    const pool = new Pool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password.reveal(),
      database: config.database,
      ssl: sslConfig(config),
      connectionTimeoutMillis: 2000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
      ...(queryTimeoutMs === undefined
        ? {}
        : { query_timeout: queryTimeoutMs, statement_timeout: queryTimeoutMs }),
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
  const db = drizzle(pool);
  // drizzle-orm (0.45, node-postgres session.js) releases a transaction's
  // client without an error even after a query on it timed out, so the pool
  // lends out a connection still inside the abandoned transaction; and when
  // `begin` itself fails it never releases the client, which the pool then
  // counts for good. So transactions borrow the client here and destroy it
  // unless they finished cleanly; Postgres rolls back whatever it held.
  const transaction: typeof db.transaction = async (work, config) => {
    const client = await pool.connect();
    try {
      const result = await drizzle(client).transaction(work, config);
      client.release();
      return result;
    } catch (error) {
      // A refusal's rollback has run, so its connection is clean.
      client.release(!(error instanceof TransactionRollbackError));
      throw error;
    }
  };
  return ok(Object.assign(db, { transaction }));
}

/** A boot migration's own limit, in place of the pool's request one. */
const MIGRATION_TIMEOUT_MS = 10 * 60_000;
/** pg honours a per-query `query_timeout` that @types/pg's QueryConfig omits. */
type TimedQuery = QueryConfig & { query_timeout: number };

/**
 * Runs a migration script on the pool. A migration may outlast the request
 * limits, so it raises both: pg reads a per-query 0 as "use the pool's", so the
 * client's is a large value rather than none, and `set local` holds the
 * server's only for the script's own implicit transaction, so the pooled
 * connection keeps the request limit afterwards.
 */
export const migrationExec = (pool: Pool) => (script: string) => {
  const query: TimedQuery = {
    text: `set local statement_timeout = ${MIGRATION_TIMEOUT_MS};\n${script}`,
    query_timeout: MIGRATION_TIMEOUT_MS,
  };
  return pool.query(query);
};

/** Whether the database answers within the cap; `/health/db` reports it. */
export async function ping(db: Database, timeoutMs = 2000): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("ping timed out")), timeoutMs);
  });
  try {
    await Promise.race([db.execute(sql`select 1`), timeout]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
