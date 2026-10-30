/**
 * "Adding a query to the `/pages` path fails the query-count test" — #3150.
 *
 * Landing asks api_v2 for every page, so an N+1 or a stray lookup on
 * `GET /pages` is landing latency. This pins how many statements one read
 * sends to Postgres, exactly, so a new one fails here rather than in p95.
 *
 * The built server is a separate process whose pool this cannot reach, so
 * the count is taken in-process: the pool `db.ts` creates, migrated and
 * seeded as `main.ts` does, behind the same app the unit suite composes.
 * Every pooled client's `query` is wrapped, which covers `pool.query` and
 * transactions alike.
 */

import type { FastifyInstance } from "fastify";
import type { Pool, PoolClient } from "pg";
import pino from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseConfig } from "../src/config";
import { connect, createPool } from "../src/db";
import { migrate } from "../src/migrate";
import { seed } from "../src/seed";
import { createTestApp } from "../src/test-db";
import {
  AUTH_ENV,
  createScratchDatabase,
  DB,
  dropScratchDatabase,
  HAS_DATABASE,
} from "./support";

describe.skipIf(!HAS_DATABASE)("api_v2 GET /pages query count", () => {
  let database: string;
  let pool: Pool;
  let app: FastifyInstance;
  let queries = 0;

  beforeAll(async () => {
    database = await createScratchDatabase();
    const config = parseConfig({
      ...AUTH_ENV,
      DB_HOST: DB.host,
      DB_PORT: String(DB.port),
      DB_USERNAME: DB.user,
      DB_PASSWORD: DB.password,
      DB_NAME: database,
    });
    if (!config.ok) throw config.error;
    const created = createPool(config.value.database, pino({ enabled: false }));
    if (!created.ok) throw created.error;
    pool = created.value;
    // Before the first connection, so every client the pool makes is counted.
    pool.on("connect", (client: PoolClient) => {
      const query = client.query.bind(client) as (
        ...args: unknown[]
      ) => unknown;
      (client as { query: unknown }).query = (...args: unknown[]) => {
        queries += 1;
        return query(...args);
      };
    });
    const connected = await connect(pool, config.value.database);
    if (!connected.ok) throw connected.error;
    const db = connected.value;
    await migrate(db, (script) => pool.query(script));
    await seed(db);
    app = await createTestApp(db);
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    if (database) await dropScratchDatabase(database);
  });

  /** The statements one public read of `url` sends, and its status. */
  const count = async (url: string) => {
    queries = 0;
    const response = await app.inject({
      method: "GET",
      url: `/pages?url=${encodeURIComponent(url)}`,
    });
    return { status: response.statusCode, queries };
  };

  // The page, its start sub-page's visibility, and the categories.
  it("reads a top-level page in 3 queries", async () => {
    expect(
      await count("/money-financial-support/calculate-severance-pay"),
    ).toEqual({ status: 200, queries: 3 });
  });

  // As above, plus its ancestors in one recursive query, not one per level.
  it("reads a nested page in 4 queries", async () => {
    expect(
      await count("/money-financial-support/calculate-severance-pay/start"),
    ).toEqual({ status: 200, queries: 4 });
  });
});
