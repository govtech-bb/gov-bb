import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import pg from "pg";
import { sql } from "drizzle-orm";

// Local integration test (Tier 2): proves the chat DB self-heal works end-to-end
// against a real Postgres. Gated — runs only when CHAT_DB_IT=1, so a normal
// `npm test` / CI run never requires a database.
//
// It reproduces the PRODUCTION rotation signal faithfully: RDS rotation changes
// the password but does not kill live sessions, so the failure surfaces when the
// pool opens a *fresh* connection with the now-stale password — a real PG `28P01`.
// We trigger that by waiting past the pool's idle timeout (node-postgres default
// ~10s), which closes the warm connection; the next query must dial anew with the
// stale connection string and fail `28P01`, which `withDbAuthRetry` self-heals.
// No `pg_terminate_backend` — terminating a pooled connection would emit `57P02`
// (a test artifact, not the production signal) and an unhandled pool error.

const RUN = process.env.CHAT_DB_IT === "1";
const ADMIN_URL =
  process.env.CHAT_IT_ADMIN_URL ??
  "postgres://postgres:postgres@localhost:5432/chat";
const ROLE = "selfheal_it";
const PW_V1 = "pw_v1";
const PW_V2 = "pw_v2";
// node-postgres default idleTimeoutMillis is 10_000; wait just past it.
const IDLE_WAIT_MS = 11_000;

let admin: pg.Pool;

before(async () => {
  if (!RUN) return;
  admin = new pg.Pool({ connectionString: ADMIN_URL });
  await admin.query(`DROP ROLE IF EXISTS ${ROLE}`);
  await admin.query(`CREATE ROLE ${ROLE} LOGIN PASSWORD '${PW_V1}'`);
  await admin.query(`GRANT CONNECT ON DATABASE chat TO ${ROLE}`);
});

after(async () => {
  if (!RUN) return;
  // Gracefully close the app pool (no terminate → no pool 'error' event) so the
  // role has no live sessions when we drop it.
  try {
    const { getDb } = await import("./index.ts");
    const db = await getDb();
    await db.$client.end();
  } catch {
    // pool may already be torn down — ignore
  }
  // Remove the role's privileges (e.g. GRANT CONNECT) before dropping it, or
  // DROP ROLE fails with 2BP01 (dependent_objects_still_exist).
  await admin.query(`DROP OWNED BY ${ROLE}`).catch(() => {});
  await admin.query(`DROP ROLE IF EXISTS ${ROLE}`);
  await admin.end();
});

test(
  "self-heals after rotation: idle reconnect with stale creds -> 28P01 -> re-resolve -> reconnect",
  {
    skip: !RUN ? "set CHAT_DB_IT=1 and run docker compose up postgres" : false,
    timeout: 30_000,
  },
  async () => {
    // Force the direct CHAT_DATABASE_URL path; clear the others.
    delete process.env.DATABASE_URL;
    delete process.env.CHAT_DATABASE_CREDENTIALS_SECRET_ARN;
    delete process.env.CHAT_DATABASE_URL_SECRET_ARN;
    process.env.CHAT_DATABASE_URL = `postgres://${ROLE}:${PW_V1}@localhost:5432/chat`;

    // Import AFTER env is set so the module's lazy getDb() sees it.
    const { withDbAuthRetry } = await import("./index.ts");

    const first = await withDbAuthRetry((db) =>
      db.execute(sql`select 1 as ok`),
    );
    assert.equal(first.rows[0].ok, 1, "baseline query works on v1");

    // Rotate: change the password and point env at the new one. The existing
    // pool keeps connectionString=v1; the live session is left untouched.
    await admin.query(`ALTER ROLE ${ROLE} PASSWORD '${PW_V2}'`);
    process.env.CHAT_DATABASE_URL = `postgres://${ROLE}:${PW_V2}@localhost:5432/chat`;

    // Wait past the pool's idle timeout so the stale v1 connection closes; the
    // next query must open a fresh connection that dials with the stale v1
    // connection string and gets a real 28P01 — the production signal.
    await new Promise((r) => setTimeout(r, IDLE_WAIT_MS));

    const healed = await withDbAuthRetry((db) =>
      db.execute(sql`select 1 as ok`),
    );
    assert.equal(healed.rows[0].ok, 1, "query self-heals on the new password");
  },
);
