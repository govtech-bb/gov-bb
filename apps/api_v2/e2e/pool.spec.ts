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
  createScratchDatabase,
  dropScratchDatabase,
  HAS_DATABASE,
  startServer,
  terminateBackends,
  type Server,
} from "./support";

describe.skipIf(!HAS_DATABASE)(
  "api_v2 when Postgres drops a connection",
  () => {
    let server: Server;
    let database: string;

    beforeAll(async () => {
      database = await createScratchDatabase();
      server = await startServer({ DB_NAME: database });
    });

    afterAll(async () => {
      await server?.stop();
      if (database) await dropScratchDatabase(database);
    });

    const status = async () => (await fetch(`${server.url}/pages`)).status;

    const drops = () =>
      server.stderr.split("idle database connection dropped").length - 1;

    /** Kills the pool's connections and waits for one drop log per backend. */
    const dropConnections = async () => {
      const before = drops();
      const terminated = await terminateBackends(database);
      expect(terminated).toBeGreaterThan(0);
      // The client's error arrives asynchronously, and the pool may hold more
      // than one idle client.
      await vi.waitFor(() => expect(drops()).toBe(before + terminated), {
        timeout: 5_000,
      });
    };

    it("logs the drop and keeps serving", async () => {
      await dropConnections();

      expect(await status()).toBe(200);
    });

    it("answers 500 while the database is closed, then recovers", async () => {
      await allowConnections(database, false);
      await dropConnections();

      const response = await fetch(`${server.url}/pages`);
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "internal_error" });

      await allowConnections(database, true);
      expect(await status()).toBe(200);
    });
  },
);
