import { createServer } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AUTH_ENV,
  DB,
  HAS_DATABASE,
  createScratchDatabase,
  databaseQuery,
  dropScratchDatabase,
  runToExit,
  startServer,
} from "./support";

describe.skipIf(!HAS_DATABASE)("process resource ownership", () => {
  let database: string;
  beforeAll(async () => {
    database = await createScratchDatabase();
  });
  afterAll(async () => {
    if (database) await dropScratchDatabase(database);
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    it(`drains HTTP and releases Postgres on ${signal}`, async () => {
      const server = await startServer({ DB_NAME: database, SEED: "false" });
      try {
        expect(await server.stop(signal)).toBe(0);
      } finally {
        await server.stop();
      }
      const remaining = await databaseQuery(
        database,
        "select count(*)::int as count from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()",
      );
      expect(remaining).toEqual([{ count: 0 }]);
      await expect(fetch(`${server.url}/openapi.json`)).rejects.toThrow();
    });
  }

  it("releases its database pool when the HTTP port cannot be acquired", async () => {
    const listener = createServer();
    await new Promise<void>((resolve) =>
      listener.listen(0, "0.0.0.0", resolve),
    );
    const address = listener.address();
    if (!address || typeof address === "string")
      throw new Error("Expected a TCP listener");
    try {
      const result = await runToExit({
        ...AUTH_ENV,
        DB_HOST: DB.host,
        DB_PORT: String(DB.port),
        DB_USERNAME: DB.user,
        DB_PASSWORD: DB.password,
        DB_NAME: database,
        SEED: "false",
        PORT: String(address.port),
        BETTER_AUTH_URL: `http://127.0.0.1:${address.port}`,
      });
      expect(result.code, result.output).toBe(1);
      expect(result.output).toContain("EADDRINUSE");
      const rows = await databaseQuery(
        database,
        "select count(*)::int as count from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()",
      );
      expect(z.array(z.object({ count: z.number() })).parse(rows)).toEqual([
        { count: 0 },
      ]);
    } finally {
      await new Promise<void>((resolve, reject) =>
        listener.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
