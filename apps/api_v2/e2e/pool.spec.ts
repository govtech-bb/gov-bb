/**
 * "Given Postgres drops an idle pooled connection, when it happens, then
 * api_v2 keeps serving" — #2831.
 *
 * An RDS restart, a failover or an idle reap ends a connection the pool is
 * holding. node-postgres reports that as an `error` event on the pool, and an
 * `error` event with no listener is an uncaught exception: the process exits
 * and every request after it is refused.
 *
 * `src/db.test.ts` proves the listener exists. Only a real server having a real
 * backend terminated underneath it proves the process survives the event, so
 * this kills the backends and then asks the server a question. A 200 over the
 * socket is the survival proof; a dead child refuses the connection.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  allowConnections,
  createEmployeeSession,
  createScratchDatabase,
  dropScratchDatabase,
  HAS_DATABASE,
  startServer,
  terminateBackends,
  type Server,
  type EmployeeSession,
} from "./support";

describe.skipIf(!HAS_DATABASE)(
  "api_v2 when Postgres drops a connection",
  () => {
    let server: Server;
    let database: string;
    let employee: EmployeeSession;

    beforeAll(async () => {
      database = await createScratchDatabase();
      server = await startServer({ DB_NAME: database });
      employee = await createEmployeeSession(database, server.url);
    });

    afterAll(async () => {
      await server?.stop();
      if (database) await dropScratchDatabase(database);
    });

    // A seeded page, so a 200 means a query reached Postgres and came back.
    const page = () =>
      fetch(
        `${server.url}/pages?url=/money-financial-support/calculate-severance-pay`,
      );
    const status = async () => (await page()).status;

    const drops = () =>
      server.stderr.split("idle database connection dropped").length - 1;

    /** Kills the pool's connections and waits for one drop log per backend. */
    const dropConnections = async () => {
      const before = drops();
      const terminated = await terminateBackends(database);
      expect(terminated).toBeGreaterThan(0);
      // The client's error arrives asynchronously, and the pool may hold more
      // than one idle client.
      await vi.waitFor(
        () => expect(drops(), server.stderr).toBe(before + terminated),
        {
          timeout: 5_000,
        },
      );
    };

    it("logs the drop and keeps serving", async () => {
      await dropConnections();

      expect(await status()).toBe(200);
    });

    it("answers 500 while the database is closed, then recovers", async () => {
      await allowConnections(database, false);
      // Reopened even when an assertion fails, or every test after this one
      // would fail on a closed database instead of on what it checks.
      try {
        await dropConnections();

        const response = await page();
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "internal_error" });
        const privateResponse = await fetch(`${server.url}/version`, {
          headers: { cookie: employee.cookie },
        });
        expect(privateResponse.status).toBe(503);
        expect(privateResponse.headers.get("cache-control")).toBe("no-store");
      } finally {
        await allowConnections(database, true);
      }
      expect(await status()).toBe(200);
      expect(
        (
          await fetch(`${server.url}/version`, {
            headers: { cookie: employee.cookie },
          })
        ).status,
      ).toBe(200);
    });
  },
);
