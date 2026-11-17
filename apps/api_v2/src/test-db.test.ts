import { sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { adminQuery, createTestDb } from "./test-db";

// close()'s forced drop can terminate a connection pool.end() left behind (#3404).
it("survives its database being dropped under an idle connection", async () => {
  const { db, pool, name } = await createTestDb();
  await db.execute(sql`select 1`);
  const removed = new Promise((resolve) => pool.once("remove", resolve));

  await adminQuery(`drop database if exists ${name} with (force)`);
  await removed;

  expect(pool.totalCount).toBe(0);
  await pool.end();
});
