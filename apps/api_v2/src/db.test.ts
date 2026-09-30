/**
 * "Given the database is unreachable, when api_v2 starts, then it fails
 * loudly with a clear message rather than starting and serving empty
 * results" — #2700.
 *
 * Worth a test rather than trust: an API that boots without a database and
 * answers with empty arrays is indistinguishable, from the outside, from an
 * estate that genuinely has no content.
 */

import { describe, expect, it, vi } from "vitest";
import { connect, createPool } from "./db";

describe("connect", () => {
  it("refuses to start when Postgres is unreachable, and says where it looked", async () => {
    process.env.DB_HOST = "127.0.0.1";
    process.env.DB_PORT = "1";
    process.env.DB_USERNAME = "nobody";

    // A pool object that fails the way an unreachable server fails.
    const pool = {
      query: async () => {
        throw new Error("ECONNREFUSED");
      },
    } as unknown as Parameters<typeof connect>[0];

    await expect(connect(pool)).rejects.toThrow(
      /Cannot reach Postgres at 127\.0\.0\.1:1 as nobody — refusing to start/,
    );
  });
});

/*
 * #2831: Postgres drops idle pooled connections routinely — an RDS restart, a
 * failover, an idle reap. pg-pool re-emits that on the pool, and an `error`
 * event nobody listens for takes the process down. `new Pool()` is lazy, so
 * this needs no database.
 */
describe("createPool", () => {
  it("logs a dropped idle connection, with its code, instead of throwing", async () => {
    const logger = { warn: vi.fn() };
    const pool = createPool(logger);
    // What pg-pool emits for a `pg_terminate_backend`, `err.client` included.
    const error = Object.assign(
      new Error("terminating connection due to administrator command"),
      { code: "57P01", client: {} },
    );

    try {
      expect(() => pool.emit("error", error)).not.toThrow();
      // Exactly these fields: the client object must not reach the log.
      expect(logger.warn).toHaveBeenCalledWith(
        {
          code: "57P01",
          reason: "terminating connection due to administrator command",
        },
        "idle database connection dropped",
      );
    } finally {
      await pool.end();
    }
  });
});
