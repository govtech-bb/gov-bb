import assert from "node:assert/strict";
import { test } from "node:test";
import { getDb, hasDatabase } from "./index.ts";

test("hasDatabase reflects DATABASE_URL presence", () => {
  const had = process.env.DATABASE_URL;
  try {
    delete process.env.DATABASE_URL;
    delete process.env.CHAT_DATABASE_URL;
    assert.equal(hasDatabase(), false);
    process.env.DATABASE_URL = "postgres://x";
    assert.equal(hasDatabase(), true);
  } finally {
    if (had === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = had;
  }
});

// Live connectivity — only runs when a DATABASE_URL is configured. Skips
// cleanly offline / in CI so the suite stays green without infra.
test("connects to pgvector and the vector extension is available", async (t) => {
  if (!hasDatabase()) {
    t.skip("no DATABASE_URL — skipping live connectivity check");
    return;
  }
  const db = await getDb();
  try {
    const ping = await db.$client.query("SELECT 1 AS ok");
    assert.equal(ping.rows[0].ok, 1);
    const ext = await db.$client.query(
      "SELECT 1 FROM pg_extension WHERE extname = 'vector'",
    );
    assert.equal(ext.rowCount, 1, "pgvector extension must be installed");
  } finally {
    await db.$client.end();
  }
});
