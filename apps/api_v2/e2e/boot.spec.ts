/**
 * "Given the database is unreachable, when api_v2 starts, then it fails
 * loudly with a clear message rather than starting and serving empty
 * results" — #2700.
 *
 * `src/db.test.ts` asserts the error `connect` throws. This asserts what the
 * process does with it, which is the part that matters to whoever is looking
 * at a deployment: a non-zero exit, a message naming where it looked, and
 * nothing listening. A server that boots without a database and answers with
 * empty arrays is indistinguishable, from the outside, from an estate that
 * genuinely has no content — and a health check would call it healthy.
 *
 * The unreachable-database cases need no Postgres at the address they try,
 * which port 1 reliably provides.
 */

import { Client } from "pg";
import { describe, expect, it, vi } from "vitest";
import {
  createScratchDatabase,
  DB,
  dropScratchDatabase,
  HAS_DATABASE,
  runToExit,
  startServer,
  type Server,
} from "./support";

describe.skipIf(!HAS_DATABASE)("boot migrations", () => {
  it("waits on the migration lock beyond the request pool's five-second limit", async () => {
    const database = await createScratchDatabase();
    const locker = new Client({ ...DB, database });
    let server: Server | undefined;
    await locker.connect();
    try {
      await locker.query(
        "select pg_advisory_lock(hashtext('api_v2 migrations'))",
      );
      server = await startServer(
        { DB_NAME: database },
        { waitForReady: false },
      );
      const url = server.url;
      await vi.waitFor(
        async () => {
          const { rows } =
            await locker.query(`select count(*)::int as waiting from pg_stat_activity
          where datname = current_database() and wait_event = 'advisory'`);
          expect(rows).toEqual([{ waiting: 1 }]);
        },
        { timeout: 5_000 },
      );

      await locker.query("select pg_sleep(5.5)");
      expect(server.stderr).not.toContain("api_v2 failed to start or serve");
      await locker.query(
        "select pg_advisory_unlock(hashtext('api_v2 migrations'))",
      );
      await vi.waitFor(
        async () => {
          expect((await fetch(`${url}/health/db`)).status).toBe(200);
        },
        { timeout: 5_000 },
      );
    } finally {
      await locker.end();
      await server?.stop();
      await dropScratchDatabase(database);
    }
  });
});

describe("booting without a database", () => {
  it("refuses missing auth configuration before attempting a database connection", async () => {
    const { code, output } = await runToExit({
      BETTER_AUTH_SECRET: "",
      DB_HOST: "127.0.0.1",
      DB_PORT: "1",
    });
    expect(code).toBe(1);
    expect(output).toContain("BETTER_AUTH_SECRET");
    expect(output).not.toContain("Cannot reach Postgres");
  });

  it("refuses to start with no admin, saying why", async () => {
    const { code, output } = await runToExit({
      API_V2_ADMIN_EMAILS: "",
      DB_HOST: "127.0.0.1",
      DB_PORT: "1",
    });
    expect(code).toBe(1);
    expect(output).toContain("API_V2_ADMIN_EMAILS");
    expect(output).toContain("ADR 0134");
    expect(output).not.toContain("Cannot reach Postgres");
  });

  it("does not echo supplied secret values when configuration is invalid", async () => {
    const { code, output } = await runToExit({
      BETTER_AUTH_SECRET: "do-not-print-this",
      GOOGLE_CLIENT_SECRET: "private-client-secret",
    });
    expect(code).toBe(1);
    expect(output).not.toContain("do-not-print-this");
    expect(output).not.toContain("private-client-secret");
  });

  it("exits non-zero and says where it looked", async () => {
    const { code, output } = await runToExit({
      DB_HOST: "127.0.0.1",
      DB_PORT: "1",
      DB_USERNAME: "nobody",
      DB_NAME: "nothing",
      PORT: "3119",
    });

    expect(code).toBe(1);
    expect(output).toContain("Cannot reach Postgres at 127.0.0.1:1 as nobody");
    expect(output).toContain("refusing to start");
  });

  it("never starts listening", async () => {
    const attempt = runToExit({
      DB_HOST: "127.0.0.1",
      DB_PORT: "1",
      DB_USERNAME: "nobody",
      DB_NAME: "nothing",
      PORT: "3118",
    });

    await expect(fetch("http://127.0.0.1:3118/pages")).rejects.toThrow();
    await attempt;
  });
});
