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

// Regression test for the chat-staging-unconfigured bug. The Vite `define`
// block in vite.config.ts substitutes references to `process.env.X` at build
// time, and `pick()` falls back to `""` for any env var not present in the
// build environment. When a deploy env (e.g. chat-staging) sets only
// CHAT_DATABASE_URL_SECRET_ARN but NOT the credentials-path vars, Vite bakes
// the missing ones as literal empty strings — and `??` (nullish coalescing)
// does NOT skip empty strings, so the fallback chain in `hasDatabase()`
// short-circuits at the first empty bake and returns false, even though the
// URL_SECRET_ARN is set.
test("hasDatabase: empty-baked CREDENTIALS_SECRET_ARN does not block URL_SECRET_ARN", () => {
  const saved = {
    DATABASE_URL: process.env.DATABASE_URL,
    CHAT_DATABASE_URL: process.env.CHAT_DATABASE_URL,
    CHAT_DATABASE_CREDENTIALS_SECRET_ARN:
      process.env.CHAT_DATABASE_CREDENTIALS_SECRET_ARN,
    CHAT_DATABASE_URL_SECRET_ARN: process.env.CHAT_DATABASE_URL_SECRET_ARN,
  };
  try {
    delete process.env.DATABASE_URL;
    delete process.env.CHAT_DATABASE_URL;
    // Simulate Vite baking a missing env var as a literal empty string.
    process.env.CHAT_DATABASE_CREDENTIALS_SECRET_ARN = "";
    process.env.CHAT_DATABASE_URL_SECRET_ARN =
      "arn:aws:secretsmanager:ca-central-1:000000000000:secret:test/db-url";
    assert.equal(hasDatabase(), true);
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
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
