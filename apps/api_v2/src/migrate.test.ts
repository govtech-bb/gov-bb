/**
 * The migration's own acceptance criteria from #2700: it produces the schema,
 * and it survives being run twice.
 *
 * The second one is not hypothetical. A revert never runs a migration's
 * `down()`, so the column stays while the migrations-table row vanishes, and
 * re-landing a bare `ADD COLUMN` then crash-loops the service on boot with
 * 42701. That happened here on 2026-07-28. Idempotence is the cheap
 * insurance, and this test is what keeps it true.
 */

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { migrate } from "./migrate";
import { SQL as INIT_SQL } from "./migrations/001_init";
import { SQL as MARKDOWN_PAGES_SQL } from "./migrations/002_markdown_pages";
import { SQL as AUTH_SQL } from "./migrations/003_auth";
import { SQL as GITHUB_SESSIONS_SQL } from "./migrations/004_github_sessions";
import { SQL as HIERARCHY_SQL } from "./migrations/005_hierarchy_and_search";
import { SQL as UNPUBLISHED_SQL } from "./migrations/006_change_action_unpublished";
import { SQL as DEFAULT_EDITOR_SQL } from "./migrations/009_default_editor_role";
import type { Database } from "./db";
import { createEmptyDb } from "./test-db";

const ALL = [
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
];

/** Tables whose rows are not content, so the history does not record them. */
const UNAUDITED = new Set([
  "change_events",
  "schema_migrations",
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

describe("migrate", () => {
  it("creates content and authentication tables plus its own bookkeeping", async () => {
    const { db, exec, close } = await freshDb();
    const ran = await migrate(db, exec);

    expect(ran).toEqual(ALL);
    expect(await tableNames(db)).toEqual([
      "auth_account",
      "auth_session",
      "auth_user",
      "auth_verification",
      "categories",
      "change_events",
      "content_pages",
      "page_revisions",
      "schema_migrations",
      "search_chunks",
      "user_roles",
    ]);
    await close();
  });

  it("runs a second time without error and applies nothing", async () => {
    const { db, exec, close } = await freshDb();
    await migrate(db, exec);

    const again = await migrate(db, exec);

    expect(again).toEqual([]);
    await close();
  });

  it("is idempotent even if the bookkeeping row is lost", async () => {
    // Exactly the revert scenario: the schema is there, the record that it
    // ran is not. The DDL itself has to tolerate being replayed.
    const { db, exec, close } = await freshDb();
    await migrate(db, exec);
    await db.execute(sql`delete from schema_migrations`);

    await expect(migrate(db, exec)).resolves.toEqual(ALL);
    await close();
  });

  it("moves a database already holding block documents onto markdown", async () => {
    // A laptop that booted the block-document api_v2 has 001 applied and
    // seeded pages whose NOT NULL body the new columns cannot fill. 002
    // clears them rather than failing, and the seed refills the estate.
    const { db, exec, close } = await freshDb();
    await exec(INIT_SQL);
    await exec(
      `insert into content_pages (url, slug, schema_name, document_type, title, body)
       values ('/x', 'x', 'answer', 'answer', 'X',
               '{"version":1,"blocks":[],"refs":{}}'::jsonb)`,
    );
    await exec(
      `create table schema_migrations (name text primary key, applied_at timestamptz not null default now());
       insert into schema_migrations (name) values ('001_init');`,
    );

    await expect(migrate(db, exec)).resolves.toEqual([
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
    ]);
    const pages = await exec("select count(*)::int as n from content_pages");
    expect(pages.rows).toEqual([{ n: 0 }]);
    await close();
  });

  it("clears the unstructured seed corpus the first time 005 runs, and only then", async () => {
    // Pages seeded before the hierarchy have no parent, so every /start step
    // would list as a service. 005 clears them and the seed refills them.
    const { db, exec, close } = await freshDb();
    for (const script of [
      INIT_SQL,
      MARKDOWN_PAGES_SQL,
      AUTH_SQL,
      GITHUB_SESSIONS_SQL,
    ])
      await exec(script);
    await exec(
      `create table schema_migrations (name text primary key, applied_at timestamptz not null default now());
       insert into schema_migrations (name) values ('001_init'), ('002_markdown_pages'), ('003_auth'), ('004_github_sessions');
       insert into categories (slug, title) values ('c', 'C');
       insert into content_pages (url, slug, title, body_markdown) values ('/c/x', 'x', 'X', '');`,
    );

    await expect(migrate(db, exec)).resolves.toEqual([
      "005_hierarchy_and_search",
      "006_change_action_unpublished",
      "007_change_history_trigger",
      "008_user_roles",
      "009_default_editor_role",
      "010_page_revisions",
      "011_revision_review",
      "012_change_action_review",
      "013_review_history_trigger",
    ]);
    await exec(
      `insert into categories (slug, title) values ('c', 'C');
       insert into content_pages (url, slug, title, body_markdown) values ('/c/x', 'x', 'X', '');
       delete from schema_migrations where name = '005_hierarchy_and_search';`,
    );
    await migrate(db, exec);

    const counts = await exec(
      "select (select count(*)::int from content_pages) as pages, (select count(*)::int from categories) as categories",
    );
    expect(counts.rows).toEqual([{ pages: 1, categories: 1 }]);
    await close();
  });

  it("keeps change_events append-only", async () => {
    const { db, exec, close } = await freshDb();
    await migrate(db, exec);

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

  it("revokes legacy sessions while preserving users and admitted GitHub sessions", async () => {
    const { db, exec, close } = await freshDb();
    await migrate(db, exec);
    await exec(`
      delete from schema_migrations where name = '004_github_sessions';
      insert into auth_user (id, name, email, "emailVerified") values
        ('legacy', 'Legacy user', 'employee@govtech.bb', true),
        ('member', 'GitHub member', 'member@example.com', true);
      insert into auth_account (id, "accountId", "providerId", "userId", "updatedAt") values
        ('google-account', 'google-id', 'google', 'legacy', now()),
        ('github-account', 'github-id', 'github', 'member', now());
      insert into auth_session (id, token, "userId", "expiresAt", "updatedAt") values
        ('legacy-session', 'old-token', 'legacy', now() + interval '1 hour', now()),
        ('member-session', 'new-token', 'member', now() + interval '1 hour', now());
    `);
    expect(await migrate(db, exec)).toEqual(["004_github_sessions"]);
    expect((await exec("select id from auth_session")).rows).toEqual([
      { id: "member-session" },
    ]);
    expect(
      (
        await exec(
          "select count(*)::int as count from auth_user where id <> 'system'",
        )
      ).rows,
    ).toEqual([{ count: 2 }]);
    expect(
      (await exec("select count(*)::int as count from auth_account")).rows,
    ).toEqual([{ count: 2 }]);
    await close();
  });

  it("makes everyone who has signed in an editor, once, so a revocation sticks", async () => {
    const { db, exec, close } = await freshDb();
    await migrate(db, exec);
    await exec(`
      delete from schema_migrations where name = '009_default_editor_role';
      insert into auth_user (id, name, email, "emailVerified") values
        ('editor', 'Editor already', 'editor@govtech.bb', true),
        ('approver', 'Approver only', 'approver@govtech.bb', true),
        ('nobody', 'No role yet', 'nobody@govtech.bb', true);
      insert into user_roles (user_id, role, granted_by) values
        ('editor', 'editor', 'admin'),
        ('approver', 'approver', 'admin');
    `);
    const editors = async () =>
      (
        await exec(
          "select user_id, granted_by from user_roles where role = 'editor' order by user_id",
        )
      ).rows;

    expect(await migrate(db, exec)).toEqual(["009_default_editor_role"]);
    expect(await editors()).toEqual([
      { user_id: "approver", granted_by: null },
      { user_id: "editor", granted_by: "admin" },
      { user_id: "nobody", granted_by: null },
    ]);

    await exec("delete from user_roles where user_id = 'nobody'");
    expect(await migrate(db, exec)).toEqual([]);
    expect(await editors()).toEqual([
      { user_id: "approver", granted_by: null },
      { user_id: "editor", granted_by: "admin" },
    ]);
    await close();
  });

  it("does not give a revoked editor role back when 009 is replayed", async () => {
    const { db, exec, close } = await freshDb();
    await migrate(db, exec);
    await exec(`
      insert into auth_user (id, name, email, "emailVerified") values
        ('revoked', 'Revoked editor', 'revoked@govtech.bb', true);
    `);

    await exec(DEFAULT_EDITOR_SQL);

    expect(
      (await exec("select user_id from user_roles where user_id = 'revoked'"))
        .rows,
    ).toEqual([]);
    await close();
  });

  it("keeps revisions, and one open revision a page, draft or submitted, when 010 and 011 are replayed", async () => {
    const { db, exec, close } = await freshDb();
    await migrate(db, exec);
    await exec(`
      insert into content_pages (id, url, slug, title, body_markdown)
        values ('11111111-1111-4111-8111-111111111111', '/p', 'p', 'P', '');
      insert into page_revisions (page_id, status, fields, live_updated_at, created_by, contributors, comment)
        select id, 'rejected', '{}', updated_at, 'a', '{a}', 'No' from content_pages;
      insert into page_revisions (page_id, status, fields, live_updated_at, created_by, contributors)
        select id, 'submitted', '{}', updated_at, 'a', '{a}' from content_pages;
      delete from schema_migrations where name in ('010_page_revisions', '011_revision_review');
    `);

    expect(await migrate(db, exec)).toEqual([
      "010_page_revisions",
      "011_revision_review",
    ]);
    expect(
      (await exec("select status, comment from page_revisions order by status"))
        .rows,
    ).toEqual([
      { status: "rejected", comment: "No" },
      { status: "submitted", comment: null },
    ]);
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

  it("records a review step once, numbered after the page's history, when 012 and 013 are replayed", async () => {
    const { db, exec, close } = await freshDb();
    await migrate(db, exec);
    await exec(`
      insert into content_pages (id, url, slug, title, body_markdown)
        values ('11111111-1111-4111-8111-111111111111', '/p', 'p', 'P', '');
      insert into page_revisions (page_id, fields, live_updated_at, created_by, contributors)
        select id, '{}', updated_at, 'a', '{a}' from content_pages;
      delete from schema_migrations
        where name in ('012_change_action_review', '013_review_history_trigger');
    `);

    expect(await migrate(db, exec)).toEqual([
      "012_change_action_review",
      "013_review_history_trigger",
    ]);
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

  it("hands history written before the trigger to system, and replays", async () => {
    const { db, exec, close } = await freshDb();
    for (const script of [
      INIT_SQL,
      MARKDOWN_PAGES_SQL,
      AUTH_SQL,
      GITHUB_SESSIONS_SQL,
      HIERARCHY_SQL,
      UNPUBLISHED_SQL,
    ])
      await exec(script);
    await exec(
      `create table schema_migrations (name text primary key, applied_at timestamptz not null default now());
       insert into schema_migrations (name) select unnest(array[${ALL.slice(
         0,
         6,
       )
         .map((name) => `'${name}'`)
         .join(", ")}]);
       insert into auth_user (id, name, email, "emailVerified")
         values ('editor', 'Editor', 'editor@govtech.bb', true);
       insert into change_events (entity_kind, entity_id, version_no, action, snapshot, actor)
         values ('content_page', 'a', 1, 'created', '{}', 'spike'),
                ('content_page', 'a', 2, 'updated', '{}', 'seed'),
                ('content_page', 'a', 3, 'updated', '{}', 'import:abc force: why'),
                ('content_page', 'a', 4, 'updated', '{}', 'editor');`,
    );

    expect(await migrate(db, exec)).toEqual(ALL.slice(6));
    await db.execute(
      sql`delete from schema_migrations where name = '007_change_history_trigger'`,
    );
    expect(await migrate(db, exec)).toEqual(["007_change_history_trigger"]);

    const { rows } = await exec(
      "select actor from change_events order by version_no",
    );
    expect(rows).toEqual([
      { actor: "system" },
      { actor: "system" },
      { actor: "system" },
      { actor: "editor" },
    ]);
    const orphans = await exec(
      `select count(*)::int as n from change_events
         where actor not in (select id from auth_user)`,
    );
    expect(orphans.rows).toEqual([{ n: 0 }]);
    expect(
      (await exec("select email from auth_user where id = 'system'")).rows,
    ).toEqual([{ email: "system@api-v2.invalid" }]);
    await close();
  });

  it("records the history of every content table", async () => {
    // A content table added without `record_change` would change with no
    // history at all; this names it until its migration attaches the trigger.
    // A page's revisions record their review steps with `record_review`
    // instead; every other content table needs `record_change`.
    const { db, exec, close } = await freshDb();
    await migrate(db, exec);

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
