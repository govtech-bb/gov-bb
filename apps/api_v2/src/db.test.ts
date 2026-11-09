import { sql, TransactionRollbackError } from "drizzle-orm";
import pino from "pino";
import { describe, expect, it } from "vitest";
import type { DatabaseConfig } from "./config";
import { connect, createPool, ping, type Database } from "./db";
import { Redacted } from "./modules/redacted";
import type { Result } from "./modules/result";
import { createEmptyDb } from "./test-db";

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
      expect(limited.options.query_timeout).toBe(5000);
    } finally {
      await unlimited.end();
      await limited.end();
    }
  });

  it("reports a database that does not answer within the cap", async () => {
    const db = { execute: () => new Promise(() => {}) } as unknown as Database;
    expect(await ping(db, 10)).toBe(false);
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
