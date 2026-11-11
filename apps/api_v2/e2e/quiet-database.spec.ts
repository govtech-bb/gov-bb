/**
 * "Given Postgres stops answering without closing the socket, when a request
 * waits on it, then api_v2 answers 500 within seconds and recovers once the
 * database answers again" — #2845.
 *
 * An RDS failover or a network partition does not hang up: the pool's sockets
 * stay open and nothing comes back on them. Without a limit of its own, a
 * request waits on the operating system's TCP timeout, which is minutes.
 * `pool.spec.ts` covers a database that hangs up; this one puts a proxy that
 * can go quiet between the server and Postgres, and freezes it.
 *
 * Each request carries an abort a little past the request limit, so a server
 * that hangs fails here on the abort rather than on the suite's timeout.
 */

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  AUTH_ENV,
  createScratchDatabase,
  databaseQuery,
  DB,
  dropScratchDatabase,
  HAS_DATABASE,
  startQuietProxy,
  startServer,
  type QuietProxy,
  type Server,
} from "./support";

/** Twice the 5 s request limit in `src/main.ts`. */
const BOUND_MS = 10_000;
/** node-postgres's default pool size, which the server keeps. */
const POOL_MAX = 10;
/** The lock every page write takes first (`PostgresPages.atomically`). */
const CONTENT_LOCK = "hashtext('content_pages.parent_id')";

describe.skipIf(!HAS_DATABASE)("api_v2 when Postgres goes quiet", () => {
  let server: Server;
  let database: string;
  let proxy: QuietProxy;

  beforeAll(async () => {
    database = await createScratchDatabase();
    proxy = await startQuietProxy();
    server = await startServer({
      DB_NAME: database,
      SEED: "true",
      DB_HOST: "127.0.0.1",
      DB_PORT: String(proxy.port),
      // No session lookup per request, so a write's first query is its own.
      AUTH_BYPASS: "true",
    });
  });

  afterAll(async () => {
    await server?.stop();
    await proxy?.close();
    if (database) await dropScratchDatabase(database);
  });

  const page = () =>
    fetch(
      `${server.url}/pages?url=/money-financial-support/calculate-severance-pay`,
      { signal: AbortSignal.timeout(BOUND_MS) },
    );

  let created = 0;
  const nextUrl = () => `/e2e/quiet-${++created}`;
  /** Creating a page runs in a transaction. */
  const write = (url = nextUrl(), bound = BOUND_MS) =>
    fetch(`${server.url}/pages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin: AUTH_ENV.EDITOR_ORIGIN,
      },
      body: JSON.stringify({
        url,
        title: "An e2e page",
        visibility: "draft",
        body_markdown: "Written by the e2e suite.",
      }),
      signal: AbortSignal.timeout(bound),
    });
  const writes = (count: number) =>
    Promise.all(Array.from({ length: count }, () => write()));

  /** How many of the server's connections Postgres sees matching `where`. */
  const backends = async (where: string) =>
    z.array(z.object({ n: z.number() })).parse(
      await databaseQuery(
        database,
        `select count(*)::int as n from pg_stat_activity
           where datname = current_database() and pid <> pg_backend_pid()
           and ${where}`,
      ),
    )[0]?.n;

  it("answers a read 500 while the database is quiet, then recovers", async () => {
    // A pooled connection to go quiet under.
    expect((await page()).status).toBe(200);

    proxy.freeze();
    // Thawed even when an assertion fails, or later tests would hang too.
    try {
      const response = await page();
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "internal_error" });
      expect((await fetch(`${server.url}/health`)).status).toBe(200);
    } finally {
      proxy.thaw();
    }

    await vi.waitFor(
      async () =>
        expect((await fetch(`${server.url}/health/db`)).status).toBe(200),
      { timeout: 10_000, interval: 250 },
    );
    expect((await page()).status).toBe(200);
  });

  it("answers a write 500 while the database is quiet, then recovers", async () => {
    // A pooled connection the transaction will take, rather than a new one.
    expect((await write()).status).toBe(201);

    proxy.freeze();
    try {
      const response = await write();
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "internal_error" });
    } finally {
      proxy.thaw();
    }

    await vi.waitFor(async () => expect((await write()).status).toBe(201), {
      timeout: 10_000,
      interval: 250,
    });
  });

  it("returns no connection to the pool after a timed-out transaction", async () => {
    // Fill the pool: writes queued behind a lock held here each hold a client.
    const locker = new Client({ ...DB, database });
    await locker.connect();
    let warming: Promise<Response[]>;
    try {
      await locker.query(`select pg_advisory_lock(${CONTENT_LOCK})`);
      warming = writes(POOL_MAX);
      await vi.waitFor(
        async () =>
          expect(await backends("wait_event_type = 'Lock'")).toBe(POOL_MAX),
        { timeout: 10_000, interval: 100 },
      );
    } finally {
      await locker.end();
    }
    for (const response of await warming) expect(response.status).toBe(201);

    // Every idle client's `begin` goes unanswered.
    proxy.freeze();
    try {
      for (const response of await writes(POOL_MAX))
        expect(response.status).toBe(500);
    } finally {
      proxy.thaw();
    }

    // A pool still counting those clients waits 2 s for one, then answers 500.
    expect((await page()).status).toBe(200);
    expect((await write()).status).toBe(201);
    await vi.waitFor(
      async () =>
        expect(await backends("state = 'idle in transaction'")).toBe(0),
      { timeout: 5_000, interval: 100 },
    );
  });

  it("never commits the work of a transaction that timed out", async () => {
    const abandoned = nextUrl();
    // The page's insert goes out after `begin` was answered: mid-transaction.
    proxy.freezeOn('insert into "content_pages"');
    try {
      // The request limit for the insert, and again for its rollback.
      const response = await write(abandoned, 2 * BOUND_MS);
      expect(response.status).toBe(500);
    } finally {
      proxy.thaw();
    }

    expect((await write()).status).toBe(201);
    expect(
      await databaseQuery(
        database,
        "select url from content_pages where url = $1",
        [abandoned],
      ),
    ).toEqual([]);
  });
});
