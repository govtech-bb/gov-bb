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
const LEGACY_MIGRATIONS = [
  "001_init",
  "002_markdown_pages",
  "003_auth",
  "004_github_sessions",
  "005_hierarchy_and_search",
  "006_change_action_unpublished",
  "007_change_history_trigger",
  "008_user_roles",
  "009_default_editor_role",
  "010_page_revisions",
  "011_revision_review",
  "012_change_action_review",
  "013_review_history_trigger",
  "014_data_collections",
  "015_revision_discarded",
  "016_content_updated_at",
  "017_change_events_no_truncate",
  "018_snapshot_version",
  "019_change_events_redaction",
  "020_google_sessions",
  "021_github_accounts",
  "022_restored_from",
  "023_change_event_counters",
  "024_edit_versions",
  "025_page_redirects",
  "026_change_event_order",
];

/** Tables whose rows are not content, so the history does not record them. */
const UNAUDITED = new Set([
  "change_event_counters",
  "change_events",
  "schema_migrations",
  "search_chunks",
  "user_roles",
  "waiting_roles",
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
      "schema_migrations",
      "search_chunks",
      "user_roles",
      "waiting_roles",
    ]);
    expect((await exec("select id, email from auth_user")).rows).toEqual([
      { id: "system", email: "system@api-v2.invalid" },
    ]);
    expect(await ledger(exec)).toEqual(JOURNAL.map((entry) => entry.when));
    await close();
  });

  it("marks legacy migrations as applied on a fresh database, so a rollback cannot replay them", async () => {
    const { pool, exec, close } = await freshDb();
    try {
      await migrate(pool);

      expect(
        (
          await exec("select name from schema_migrations order by name")
        ).rows.map((row) => row.name),
      ).toEqual(LEGACY_MIGRATIONS);
    } finally {
      await close();
    }
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

  it("takes over a legacy database and applies only later migrations", async () => {
    const { pool, exec, close } = await freshDb();
    try {
      // Only these two migrations describe the legacy schema.
      for (const tag of ["0000_baseline", "0001_triggers"])
        await exec(readFileSync(join(MIGRATIONS_FOLDER, `${tag}.sql`), "utf8"));
      await exec(
        "create table schema_migrations (name text primary key, applied_at timestamptz not null default now())",
      );
      await pool.query(
        "insert into schema_migrations (name) select unnest($1::text[])",
        [LEGACY_MIGRATIONS],
      );
      await exec(`insert into content_pages (url, slug, title, body_markdown)
        values ('/kept', 'kept', 'Kept', '')`);
      const history = (await exec("select * from change_events")).rows;
      const legacyLedger = (
        await exec("select * from schema_migrations order by name")
      ).rows;

      expect(await migrate(pool)).toEqual(ALL.slice(2));

      expect(await ledger(exec)).toEqual(JOURNAL.map((entry) => entry.when));
      expect((await exec("select url from content_pages")).rows).toEqual([
        { url: "/kept" },
      ]);
      expect((await exec("select * from change_events")).rows).toEqual(history);
      expect(
        (await exec("select * from schema_migrations order by name")).rows,
      ).toEqual(legacyLedger);
      expect(await migrate(pool)).toEqual([]);
    } finally {
      await close();
    }
  });

  it("rolls back the pending batch and releases the lock when a later migration fails", async () => {
    const { db, pool, exec, close } = await freshDb();
    try {
      await exec(`create function record_change() returns trigger
        language plpgsql as 'begin return null; end;'`);

      await expect(migrate(pool)).rejects.toMatchObject({
        cause: { code: "42723" },
      });
      expect(await tableNames(db)).toEqual([]);
      expect(await ledger(exec)).toEqual([]);
      expect(
        (await exec("select to_regtype('change_action') as enum")).rows,
      ).toEqual([{ enum: null }]);
      expect(
        (
          await exec(`select count(*)::int as held from pg_locks
          where locktype = 'advisory'
            and database = (select oid from pg_database where datname = current_database())`)
        ).rows,
      ).toEqual([{ held: 0 }]);

      await exec("drop function record_change()");
      expect(await migrate(pool)).toEqual(ALL);
      expect(await ledger(exec)).toEqual(JOURNAL.map((entry) => entry.when));
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

  it("refuses an unapplied migration older than the database head, even when the journal is sorted", async () => {
    const { pool, exec, close } = await freshDb();
    try {
      await migrate(pool);
      // The ledger shape of a migration merged before an already-applied entry.
      await exec(`delete from drizzle.__drizzle_migrations
        where created_at = (select min(created_at) from drizzle.__drizzle_migrations)`);
      const before = await ledger(exec);

      await expect(migrate(pool)).rejects.toMatchObject({
        code: "MIGRATION_JOURNAL_GAP",
        message: expect.stringContaining("0000_baseline"),
      });
      expect(await ledger(exec)).toEqual(before);
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

    const instruction =
      "Schema drift check failed. Run `pnpm db:generate` in apps/api_v2.";
    const migration = await generateMigration(
      snapshot,
      generateDrizzleJson(schema, snapshot.id),
    ).catch((cause: unknown) => {
      throw new Error(instruction, { cause });
    });
    expect(migration, instruction).toEqual([]);
  });

  it("dates every migration after the one before it", () => {
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
