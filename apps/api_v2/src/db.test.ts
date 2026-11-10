import { sql, TransactionRollbackError } from "drizzle-orm";
import pino from "pino";
import { Client } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseConfig } from "./config";
import { connect, createPool, migrationExec, ping, type Database } from "./db";
import { Redacted } from "./modules/redacted";
import type { Result } from "./modules/result";
import { createEmptyDb, TEST_SERVER } from "./test-db";

const config: DatabaseConfig = {
  host: "127.0.0.1",
  port: 1,
  user: "nobody",
  password: new Redacted("do-not-log-me"),
  database: "nothing",
  production: false,
};
function value<T, E extends Error>(result: Result<T, E>): T {
  if (!result.ok) throw result.error;
  return result.value;
}

/** The server's kind of pool, with a short request limit, on an empty database. */
async function limitedPool(queryTimeoutMs: number) {
  const test = await createEmptyDb();
  const pool = value(
    createPool(
      {
        ...TEST_SERVER,
        password: new Redacted(TEST_SERVER.password),
        database: test.name,
        production: false,
      },
      pino({ enabled: false }),
      { queryTimeoutMs },
    ),
  );
  return { test, pool };
}

describe("database setup", () => {
  it("reports an unreachable database using the explicit configuration", async () => {
    const pool = value(createPool(config, pino({ enabled: false })));
    try {
      const result = await connect(pool, config);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("Expected failed connection");
      expect(result.error.message).toContain(
        "Cannot reach Postgres at 127.0.0.1:1 as nobody — refusing to start",
      );
      expect(result.error.message).not.toContain("do-not-log-me");
    } finally {
      await pool.end();
    }
  });

  it("logs idle connection failures without exposing the attached client", async () => {
    const lines: string[] = [];
    const logger = pino(
      {},
      {
        write: (chunk) => {
          lines.push(chunk);
        },
      },
    );
    const pool = value(createPool(config, logger));
    try {
      const error = Object.assign(
        new Error("terminating connection due to administrator command"),
        {
          code: "57P01",
          client: { password: "do-not-log-me" },
        },
      );
      expect(() => pool.emit("error", error)).not.toThrow();
      const recorded: unknown = JSON.parse(lines.join(""));
      expect(recorded).toMatchObject({
        code: "57P01",
        msg: "idle database connection dropped",
      });
      expect(lines.join("")).not.toContain("do-not-log-me");
      expect(lines.join("")).not.toContain("client");
      expect(lines.join("")).not.toContain("terminating connection");
    } finally {
      await pool.end();
    }
  });

  it("verifies production TLS and rejects unreadable CA files", async () => {
    const logger = pino({ enabled: false });
    const pool = value(createPool({ ...config, production: true }, logger));
    try {
      expect(pool.options.ssl).toEqual({ rejectUnauthorized: true });
    } finally {
      await pool.end();
    }
    const result = createPool(
      { ...config, production: true, ca: "/nonexistent/api-v2-ca.pem" },
      logger,
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      await result.value.end();
      throw new Error("Expected CA failure");
    }
    expect(result.error.operation).toBe("configure");
  });

  it("limits how long a connection may take", async () => {
    const pool = value(createPool(config, pino({ enabled: false })));
    try {
      expect(pool.options.connectionTimeoutMillis).toBe(2000);
    } finally {
      await pool.end();
    }
  });

  it("keeps connections alive and limits a query only when asked", async () => {
    const logger = pino({ enabled: false });
    const unlimited = value(createPool(config, logger));
    const limited = value(createPool(config, logger, { queryTimeoutMs: 5000 }));
    try {
      for (const pool of [unlimited, limited]) {
        expect(pool.options.keepAlive).toBe(true);
        expect(pool.options.keepAliveInitialDelayMillis).toBe(10000);
      }
      expect(unlimited.options).not.toHaveProperty("query_timeout");
      expect(unlimited.options).not.toHaveProperty("statement_timeout");
      expect(limited.options.query_timeout).toBe(5000);
      expect(limited.options.statement_timeout).toBe(5000);
    } finally {
      await unlimited.end();
      await limited.end();
    }
  });

  it("reports a database that does not answer within the cap", async () => {
    const db = { execute: () => new Promise(() => {}) } as unknown as Database;
    expect(await ping(db, 10)).toBe(false);
  });

  it("lets a migration outlast the pool's query limits", async () => {
    const { test, pool } = await limitedPool(50);
    try {
      // The limits are live on this pool, so the migration passing proves the override.
      await expect(pool.query("select pg_sleep(0.2)")).rejects.toThrow();
      await expect(
        migrationExec(pool)("select pg_sleep(0.2)"),
      ).resolves.toBeDefined();
      // The pool's only connection, back to the request limit for whoever borrows it next.
      expect(pool.totalCount).toBe(1);
      const { rows } = await pool.query("show statement_timeout");
      expect(rows).toEqual([{ statement_timeout: "50ms" }]);
    } finally {
      await pool.end();
      await test.close();
    }
  });

  it("stops a timed-out request's work on the server too", async () => {
    const { test, pool } = await limitedPool(150);
    const holder = new Client({ ...TEST_SERVER, database: test.name });
    await holder.connect();
    try {
      // As reindex-search holds the content lock against editor writes.
      await holder.query("select pg_advisory_lock(2845)");
      const db = value(await connect(pool, config));
      const writes = await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          db.transaction((tx) =>
            tx.execute(sql`select pg_advisory_xact_lock(2845)`),
          ),
        ),
      );
      expect(writes.map((write) => write.status)).toEqual(
        Array(10).fill("rejected"),
      );
      // The pool has let go of all ten. Postgres must not keep waiting on
      // their behalf, or retries pile connections up past the pool's limit.
      await vi.waitFor(
        async () => {
          const { rows } = await holder.query<{ n: number }>(
            `select count(*)::int as n from pg_stat_activity
             where datname = $1 and wait_event_type = 'Lock'`,
            [test.name],
          );
          expect(rows[0]?.n).toBe(0);
        },
        { timeout: 2000 },
      );
    } finally {
      await holder.end();
      await pool.end();
      await test.close();
    }
  });

  it("keeps a refused transaction's connection and destroys a failed one's", async () => {
    const test = await createEmptyDb();
    try {
      const db = value(await connect(test.pool, config));
      await expect(db.transaction(async (tx) => tx.rollback())).rejects.toThrow(
        TransactionRollbackError,
      );
      expect(test.pool.totalCount).toBe(1);
      await expect(
        db.transaction((tx) => tx.execute(sql`select 1 / 0`)),
      ).rejects.toThrow();
      expect(test.pool.totalCount).toBe(0);
    } finally {
      await test.close();
    }
  });
});
