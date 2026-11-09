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

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  AUTH_ENV,
  createScratchDatabase,
  dropScratchDatabase,
  HAS_DATABASE,
  startQuietProxy,
  startServer,
  type QuietProxy,
  type Server,
} from "./support";

/** The request limit in `src/main.ts`, plus room for the rollback and the reply. */
const BOUND_MS = 12_000;

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
  /** Creating a page runs in a transaction. */
  const write = () =>
    fetch(`${server.url}/pages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin: AUTH_ENV.EDITOR_ORIGIN,
      },
      body: JSON.stringify({
        url: `/e2e/quiet-${++created}`,
        title: "An e2e page",
        visibility: "draft",
        body_markdown: "Written by the e2e suite.",
      }),
      signal: AbortSignal.timeout(BOUND_MS),
    });

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
});
