import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Database } from "./db";
import { migrate } from "./migrate";
import { createTestDb } from "./test-db";

const EVENT = "11111111-1111-4111-8111-111111111111";
const NOTICE = { redacted: true, reason: "incident-42", by: "operator-test" };
const APPEND_ONLY = {
  cause: expect.objectContaining({
    message: expect.stringContaining("change_events is append-only"),
  }),
};

async function historyDb() {
  const test = await createTestDb();
  await test.db.execute(sql`insert into change_events
    (id, entity_kind, entity_id, version_no, action, snapshot)
    values (${EVENT}, 'content_page', 'page-test', 1, 'created',
      '{"body_markdown":"Private fixture"}')`);
  return test;
}

const replaceSnapshot = (snapshot: unknown) =>
  sql`update change_events set snapshot = ${JSON.stringify(snapshot)}::jsonb
    where id = ${EVENT}`;

const redact = (db: Database, statement: ReturnType<typeof sql>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.redacting', 'on', true)`);
    await tx.execute(statement);
  });

const eventRows = async (db: Database) =>
  (await db.execute(sql`select * from change_events`)).rows;

describe("change_events redaction", () => {
  it("replaces only the snapshot and keeps the removal notice immutable after replay", async () => {
    const { db, pool, close } = await historyDb();
    try {
      const before = await eventRows(db);
      await redact(db, replaceSnapshot(NOTICE));
      const expected = before.map((event) => ({ ...event, snapshot: NOTICE }));
      await db.execute(
        sql`delete from schema_migrations where name = '019_change_events_redaction'`,
      );
      expect(await migrate(db, (script) => pool.query(script))).toEqual([
        "019_change_events_redaction",
      ]);
      expect(await eventRows(db)).toEqual(expected);
      await expect(
        redact(db, replaceSnapshot({ ...NOTICE, by: "someone-else" })),
      ).rejects.toMatchObject(APPEND_ONLY);
      await expect(
        redact(db, sql`delete from change_events where id = ${EVENT}`),
      ).rejects.toMatchObject(APPEND_ONLY);
      expect(await eventRows(db)).toEqual(expected);
    } finally {
      await close();
    }
  });

  it("requires the flag even for a valid removal notice", async () => {
    const { db, close } = await historyDb();
    try {
      const before = await eventRows(db);
      await expect(db.execute(replaceSnapshot(NOTICE))).rejects.toMatchObject(
        APPEND_ONLY,
      );
      expect(await eventRows(db)).toEqual(before);
    } finally {
      await close();
    }
  });

  it.each([
    null,
    [],
    "not an object",
    { body_markdown: "Replacement content" },
    { ...NOTICE, redacted: false },
    { ...NOTICE, redacted: "true" },
    { redacted: true, by: "operator-test" },
    { redacted: true, reason: "incident-42" },
    { ...NOTICE, reason: "" },
    { ...NOTICE, reason: "\t\n " },
    { ...NOTICE, reason: 42 },
    { ...NOTICE, by: " " },
    { ...NOTICE, by: false },
    { ...NOTICE, body_markdown: "Content must not survive" },
  ])("refuses a malformed removal notice: %j", async (snapshot) => {
    const { db, close } = await historyDb();
    try {
      const before = await eventRows(db);
      await expect(redact(db, replaceSnapshot(snapshot))).rejects.toMatchObject(
        APPEND_ONLY,
      );
      expect(await eventRows(db)).toEqual(before);
    } finally {
      await close();
    }
  });

  it.each([
    "id = '22222222-2222-4222-8222-222222222222'",
    "entity_kind = 'category'",
    "entity_id = 'another-page'",
    "version_no = 2",
    "action = 'deleted'",
    "actor = 'employee-test'",
    "occurred_at = occurred_at + interval '1 second'",
    "snapshot_version = 2",
  ])("refuses to change metadata during redaction: %s", async (change) => {
    const { db, close } = await historyDb();
    try {
      // Also proves that metadata added by another migration is protected.
      await db.execute(sql`alter table change_events
        add column if not exists snapshot_version integer default 1`);
      const before = await eventRows(db);
      await expect(
        redact(
          db,
          sql`update change_events
          set snapshot = ${JSON.stringify(NOTICE)}::jsonb, ${sql.raw(change)}
          where id = ${EVENT}`,
        ),
      ).rejects.toMatchObject(APPEND_ONLY);
      expect(await eventRows(db)).toEqual(before);
    } finally {
      await close();
    }
  });

  it("rolls back a redaction and forgets the flag after rollback and commit", async () => {
    const { db, pool, close } = await historyDb();
    const client = await pool.connect();
    try {
      const before = await eventRows(db);
      for (const end of ["rollback", "commit"]) {
        await client.query("begin");
        await client.query("select set_config('app.redacting', 'on', true)");
        await client.query(
          "update change_events set snapshot = $1 where id = $2",
          [NOTICE, EVENT],
        );
        await client.query(end);
        expect(
          (
            await client.query(
              "select current_setting('app.redacting', true) as flag",
            )
          ).rows[0].flag,
        ).not.toBe("on");
        if (end === "rollback") expect(await eventRows(db)).toEqual(before);
      }
      await client.query(`insert into change_events
        (entity_kind, entity_id, version_no, action, snapshot)
        values ('content_page', 'page-test', 2, 'updated', '{}')`);
      await expect(
        client.query(
          "update change_events set snapshot = $1 where version_no = 2",
          [NOTICE],
        ),
      ).rejects.toThrow("append-only");
    } finally {
      client.release();
      await close();
    }
  });
});
