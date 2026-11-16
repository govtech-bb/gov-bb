/**
 * What the migrations owe the server that runs them at boot: they build the
 * schema, a second run applies nothing, instances booting together take
 * turns, and a database the hand-written runner migrated is taken over
 * without being rebuilt. And what they owe `schema.ts`: it never changes
 * without one.
 *
 * The rest are the triggers of `migrations/0001_triggers.sql`, which no
 * Drizzle type describes, so only their behaviour can be checked.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Database } from "./db";
import { migrate, MIGRATIONS_FOLDER, readJournal } from "./migrate";
import * as schema from "./schema";
import { createEmptyDb } from "./test-db";

const JOURNAL = readJournal();
const ALL = JOURNAL.map((entry) => entry.tag);

/** Tables whose rows are not content, so the history does not record them. */
const UNAUDITED = new Set([
  "change_event_counters",
  "change_events",
  "search_chunks",
  "user_roles",
]);

const freshDb = async () => {
  const test = await createEmptyDb();
  const exec = (script: string) => test.pool.query(script);
  return { ...test, exec };
};

const tableNames = async (db: Database) => {
  const result = await db.execute(
    sql`select table_name from information_schema.tables
         where table_schema = 'public' order by table_name`,
  );
  return z
    .array(z.object({ table_name: z.string() }))
    .parse(result.rows)
    .map((row) => row.table_name);
};

/** What Drizzle's ledger holds: the journal time of each migration applied. */
const ledger = async (exec: (script: string) => Promise<{ rows: unknown[] }>) =>
  z
    .array(z.object({ created_at: z.coerce.number() }))
    .parse(
      (
        await exec(
          "select created_at from drizzle.__drizzle_migrations order by id",
        )
      ).rows,
    )
    .map((row) => row.created_at);

describe("migrate", () => {
  it("creates the content and authentication tables, and the system user", async () => {
    const { db, pool, exec, close } = await freshDb();
    const ran = await migrate(pool);

    expect(ran).toEqual(ALL);
    expect(await tableNames(db)).toEqual([
      "auth_account",
      "auth_session",
      "auth_user",
      "auth_verification",
      "categories",
      "change_event_counters",
      "change_events",
      "collection_records",
      "content_pages",
      "data_collections",
      "page_redirects",
      "page_revisions",
      "search_chunks",
      "user_roles",
    ]);
    expect((await exec("select id, email from auth_user")).rows).toEqual([
      { id: "system", email: "system@api-v2.invalid" },
    ]);
    expect(await ledger(exec)).toEqual(JOURNAL.map((entry) => entry.when));
    await close();
  });

  it("runs a second time without error and applies nothing", async () => {
    const { pool, close } = await freshDb();
    await migrate(pool);

    const again = await migrate(pool);

    expect(again).toEqual([]);
    await close();
  });

  it("lets instances that boot together take turns", async () => {
    const { pool, exec, close } = await freshDb();
    try {
      const runs = await Promise.all([
        migrate(pool),
        migrate(pool),
        migrate(pool),
      ]);

      expect(runs.filter((ran) => ran.length > 0)).toEqual([ALL]);
      expect(await ledger(exec)).toEqual(JOURNAL.map((entry) => entry.when));
    } finally {
      await close();
    }
  });

  it("takes over a database the hand-written runner migrated, without rebuilding it", async () => {
    const { pool, exec, close } = await freshDb();
    try {
      // As that runner left it: these tables, recorded in its own ledger.
      await migrate(pool);
      await exec(`drop schema drizzle cascade;
        create table schema_migrations (name text primary key, applied_at timestamptz not null default now());
        insert into schema_migrations (name) values ('025_page_redirects'), ('026_change_event_order');
        insert into content_pages (url, slug, title, body_markdown) values ('/kept', 'kept', 'Kept', '')`);

      expect(await migrate(pool)).toEqual([]);

      expect(await ledger(exec)).toEqual(
        JOURNAL.slice(0, 2).map((entry) => entry.when),
      );
      expect((await exec("select url from content_pages")).rows).toEqual([
        { url: "/kept" },
      ]);
      // Still there, so a rollback to that runner replays nothing.
      expect(
        (await exec("select count(*)::int as n from schema_migrations")).rows,
      ).toEqual([{ n: 2 }]);
      expect(await migrate(pool)).toEqual([]);
    } finally {
      await close();
    }
  });

  it("refuses a database the hand-written runner left part-way", async () => {
    const { pool, exec, close } = await freshDb();
    try {
      await exec(`create table schema_migrations (name text primary key, applied_at timestamptz not null default now());
        insert into schema_migrations (name) values ('025_page_redirects')`);

      await expect(migrate(pool)).rejects.toThrow(
        "stop before 026_change_event_order",
      );
      expect(
        (await exec("select to_regnamespace('drizzle') as ledger")).rows,
      ).toEqual([{ ledger: null }]);
    } finally {
      await close();
    }
  });

  it("has a migration for every change to schema.ts", async () => {
    const latest = JOURNAL.at(-1)?.tag.slice(0, 4);
    const snapshot = JSON.parse(
      readFileSync(
        join(MIGRATIONS_FOLDER, "meta", `${latest}_snapshot.json`),
        "utf8",
      ),
    );

    // The SQL `pnpm db:generate` would write. If this lists any, run it.
    expect(
      await generateMigration(
        snapshot,
        generateDrizzleJson(schema, snapshot.id),
      ),
    ).toEqual([]);
  });

  it("dates every migration after the one before it", () => {
    // Drizzle applies only what the journal dates after the newest migration
    // it has recorded. One generated on a branch and merged after a later one
    // would be skipped wherever the later one has run: generate it again.
    const times = JOURNAL.map((entry) => entry.when);
    expect(times).toEqual([...new Set(times)].sort((a, b) => a - b));
  });

  it("keeps change_events append-only", async () => {
    const { db, pool, close } = await freshDb();
    await migrate(pool);

    await db.execute(
      sql`insert into change_events (entity_kind, entity_id, version_no, action, snapshot)
          values ('content_page', 'x', 1, 'created', '{}'::jsonb)`,
    );

    // Drizzle rewraps driver errors as "Failed query: …", so the trigger's
    // own message is on the cause. Asserting on it rather than on the
    // rejection alone is what distinguishes "the trigger fired" from "the
    // SQL was wrong".
    const refused = await db
      .execute(sql`update change_events set actor = 'someone else'`)
      .then(
        () => null,
        (error: unknown) => error,
      );

    expect(refused).toBeInstanceOf(Error);
    if (!(refused instanceof Error))
      throw new Error("Expected trigger rejection");
    expect(String(refused.cause)).toMatch(/append-only/);
    await close();
  });

  it.each([false, true])(
    "refuses TRUNCATE with existing history: %s",
    async (populated) => {
      const { pool, exec, close } = await freshDb();
      try {
        await migrate(pool);
        if (populated)
          await exec(`insert into change_events (entity_kind, entity_id, version_no, action, snapshot)
            values ('content_page', 'x', 1, 'created', '{"title":"Keep this"}')`);
        const before = (await exec("select * from change_events")).rows;

        await expect(exec("truncate change_events")).rejects.toThrow(
          "change_events is append-only (attempted TRUNCATE)",
        );
        expect((await exec("select * from change_events")).rows).toEqual(
          before,
        );
      } finally {
        await close();
      }
    },
  );

  it("refuses to truncate, rewrite or delete history, and still appends", async () => {
    const { pool, exec, close } = await freshDb();
    try {
      await migrate(pool);
      await exec(`insert into change_events (entity_kind, entity_id, version_no, action, snapshot)
        values ('content_page', 'x', 1, 'created', '{}')`);
      const before = (await exec("select * from change_events")).rows;

      for (const statement of [
        "truncate change_events",
        "update change_events set snapshot = '{}'",
        "delete from change_events",
      ])
        await expect(exec(statement)).rejects.toThrow("append-only");
      expect((await exec("select * from change_events")).rows).toEqual(before);
      await exec(`insert into change_events (entity_kind, entity_id, version_no, action, snapshot)
        values ('content_page', 'x', 2, 'updated', '{}')`);
      expect((await exec("select id from change_events")).rows).toHaveLength(2);
    } finally {
      await close();
    }
  });

  it("allows a page one open revision, draft or submitted, beside its closed ones", async () => {
    const { pool, exec, close } = await freshDb();
    await migrate(pool);
    await exec(`
      insert into content_pages (id, url, slug, title, body_markdown)
        values ('11111111-1111-4111-8111-111111111111', '/p', 'p', 'P', '');
      insert into page_revisions (page_id, status, fields, live_updated_at, created_by, contributors, comment)
        select id, 'rejected', '{}', updated_at, 'a', '{a}', 'No' from content_pages;
      insert into page_revisions (page_id, status, fields, live_updated_at, created_by, contributors)
        select id, 'submitted', '{}', updated_at, 'a', '{a}' from content_pages;
    `);
    const another = (status: string) =>
      exec(`insert into page_revisions (page_id, status, fields, live_updated_at, created_by, contributors)
              select id, '${status}', '{}', updated_at, 'b', '{b}' from content_pages`);
    await expect(another("draft")).rejects.toThrow(
      /page_revisions_open_page_id_key/,
    );
    await expect(another("approved")).rejects.toThrow(
      /page_revisions_status_check/,
    );
    await expect(another("published")).resolves.toBeDefined();
    await close();
  });

  it("records a review step once, numbered after the page's history", async () => {
    const { pool, exec, close } = await freshDb();
    await migrate(pool);
    await exec(`
      insert into content_pages (id, url, slug, title, body_markdown)
        values ('11111111-1111-4111-8111-111111111111', '/p', 'p', 'P', '');
      insert into page_revisions (page_id, fields, live_updated_at, created_by, contributors)
        select id, '{}', updated_at, 'a', '{a}' from content_pages;
    `);
    await exec("update page_revisions set status = 'submitted'");

    expect(
      (
        await exec(
          "select version_no, action, actor from change_events order by version_no",
        )
      ).rows,
    ).toEqual([
      { version_no: 1, action: "created", actor: "system" },
      { version_no: 2, action: "submitted", actor: "system" },
    ]);
    await close();
  });

  it("records the history of collections and their records", async () => {
    const { pool, exec, close } = await freshDb();
    await migrate(pool);
    await exec(`
      insert into data_collections (key, title, record_key, schema)
        values ('contacts', 'Contacts', 'key', '{"fields":[]}');
      insert into collection_records (collection_key, record_key, data)
        values ('contacts', 'a', '{"key":"a"}');
    `);
    await exec(
      `update collection_records set data = '{"key":"b"}';
       delete from collection_records;`,
    );
    expect(
      (
        await exec(
          "select entity_kind, action from change_events order by entity_kind, version_no",
        )
      ).rows,
    ).toEqual([
      { entity_kind: "collection_record", action: "created" },
      { entity_kind: "collection_record", action: "updated" },
      { entity_kind: "collection_record", action: "deleted" },
      { entity_kind: "data_collection", action: "created" },
    ]);
    await expect(
      exec("delete from data_collections where key = 'contacts'"),
    ).resolves.toBeDefined();
    await close();
  });

  it("closes a revision as discarded, logged once in its page's history", async () => {
    const { pool, exec, close } = await freshDb();
    await migrate(pool);
    await exec(`
      insert into content_pages (id, url, slug, title, body_markdown)
        values ('11111111-1111-4111-8111-111111111111', '/p', 'p', 'P', '');
      insert into page_revisions (page_id, status, fields, live_updated_at, created_by, contributors)
        select id, 'submitted', '{}', updated_at, 'a', '{a}' from content_pages;
    `);
    await exec("update page_revisions set status = 'discarded'");

    expect(
      (
        await exec(
          "select version_no, action, snapshot->>'status' as status from change_events order by version_no",
        )
      ).rows,
    ).toEqual([
      { version_no: 1, action: "created", status: null },
      { version_no: 2, action: "discarded", status: "discarded" },
    ]);
    // A discarded revision is closed, so the page can start another.
    await expect(
      exec(`insert into page_revisions (page_id, fields, live_updated_at, created_by, contributors)
              select id, '{}', updated_at, 'b', '{b}' from content_pages`),
    ).resolves.toBeDefined();
    await close();
  });

  it("records the history of a redirect rule under its own id", async () => {
    const { pool, exec, close } = await freshDb();
    try {
      await migrate(pool);
      await exec(`insert into page_redirects (source_url, destination_url)
        values ('/old', '/current')`);
      const rules = (await exec("select * from page_redirects")).rows;

      await exec(`update page_redirects set destination_url = '/new';
        delete from page_redirects`);
      expect(
        (
          await exec(`select entity_kind, entity_id, version_no, action, actor
            from change_events order by version_no`)
        ).rows,
      ).toEqual(
        ["created", "updated", "deleted"].map((action, index) => ({
          entity_kind: "page_redirect",
          entity_id: rules[0].id,
          version_no: index + 1,
          action,
          actor: "system",
        })),
      );
    } finally {
      await close();
    }
  });

  it("orders audit events as they are inserted, each once and for good", async () => {
    const { pool, exec, close } = await freshDb();
    try {
      await migrate(pool);
      await exec(`insert into content_pages (url, slug, title, body_markdown)
          values ('/x', 'x', 'First', '');
        update content_pages set title = 'Second'`);
      const events = (
        await exec("select event_order from change_events order by version_no")
      ).rows.map((event) => Number(event.event_order));
      expect(events[0]).toBeGreaterThan(0);
      expect(events[1]).toBeGreaterThan(Number(events[0]));

      await expect(
        exec(`insert into change_events (entity_kind, entity_id, action, snapshot, event_order)
        select entity_kind, entity_id, action, snapshot, event_order
          from change_events limit 1`),
      ).rejects.toMatchObject({
        code: "23505",
        constraint: "change_events_event_order_unique",
      });
      await expect(
        exec("update change_events set event_order = event_order + 100"),
      ).rejects.toThrow("change_events is append-only");
    } finally {
      await close();
    }
  });

  it("records the history of every content table", async () => {
    // A content table added without `record_change` would change with no
    // history at all; this names it until its migration attaches the trigger.
    // A page's revisions record their review steps with `record_review`
    // instead; every other content table needs `record_change`.
    const { pool, exec, close } = await freshDb();
    await migrate(pool);

    const { rows } = await exec(
      `select c.relname as table from pg_class c
         where c.relnamespace = current_schema()::regnamespace
           and c.relkind = 'r'
           and not exists (
             select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
               where t.tgrelid = c.oid
                 and p.proname = case c.relname
                   when 'page_revisions' then 'record_review'
                   else 'record_change' end)
         order by 1`,
    );
    expect(
      rows
        .map((row: { table: string }) => row.table)
        .filter((table) => !UNAUDITED.has(table) && !table.startsWith("auth_")),
    ).toEqual([]);
    await close();
  });
});
