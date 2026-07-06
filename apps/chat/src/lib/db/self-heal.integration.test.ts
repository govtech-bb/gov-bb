import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import pg from "pg";

// Local integration test (Tier 2): proves the chat DB self-heal works end-to-end
// against a real Postgres. Gated — runs only when CHAT_DB_IT=1, so a normal
// `npm test` / CI run never requires a database.
//
// It exercises the load-bearing assumption getDb() relies on: a pg.Pool built
// with `password` as a function re-invokes that function for each NEW physical
// connection (verified in pg 8.22 client.js `_getPassword` + pg-pool
// `newClient`). So after an RDS master-password rotation, an in-flight container
// picks up the new password on its next connection — no redeploy, no pool
// teardown, no retry wrapper. The rotation signal is reproduced faithfully:
// ALTER ROLE changes the password but leaves live sessions untouched; we force
// a fresh connection (low idle timeout, max:1) so the next query must dial anew
// with the now-current password. If pg ever stopped re-resolving the password
// per connection, the post-rotation query would fail PG `28P01` and this test
// would catch it.

const RUN = process.env.CHAT_DB_IT === "1";
const ADMIN_URL =
  process.env.CHAT_IT_ADMIN_URL ??
  "postgres://postgres:postgres@localhost:5432/chat";
const ROLE = "selfheal_it";
const PW_V1 = "pw_v1";
const PW_V2 = "pw_v2";

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
  // Remove the role's privileges (e.g. GRANT CONNECT) before dropping it, or
  // DROP ROLE fails with 2BP01 (dependent_objects_still_exist).
  await admin.query(`DROP OWNED BY ${ROLE}`).catch(() => {});
  await admin.query(`DROP ROLE IF EXISTS ${ROLE}`);
  await admin.end();
});

test(
  "password-as-function self-heals after rotation: new connection re-resolves creds",
  {
    skip: !RUN ? "set CHAT_DB_IT=1 and run docker compose up postgres" : false,
    timeout: 30_000,
  },
  async () => {
    let currentPw = PW_V1;
    const app = new pg.Pool({
      host: "localhost",
      port: 5432,
      database: "chat",
      user: ROLE,
      // The mechanism under test: pg calls this per new physical connection.
      password: async () => currentPw,
      max: 1,
      idleTimeoutMillis: 300,
    });
    try {
      const first = await app.query("select 1 as ok");
      assert.equal(first.rows[0].ok, 1, "baseline query works on v1");

      // Rotate: change the password and point the resolver at the new one. The
      // existing idle connection still holds v1; Postgres leaves it untouched.
      await admin.query(`ALTER ROLE ${ROLE} PASSWORD '${PW_V2}'`);
      currentPw = PW_V2;

      // Wait past the idle timeout so the v1 connection is reaped; the next
      // query must open a fresh connection, which re-invokes password() -> v2.
      await new Promise((r) => setTimeout(r, 600));

      const healed = await app.query("select 1 as ok");
      assert.equal(
        healed.rows[0].ok,
        1,
        "query self-heals on the new password",
      );
    } finally {
      await app.end();
    }
  },
);
