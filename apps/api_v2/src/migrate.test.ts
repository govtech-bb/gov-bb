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
import type { Database } from "./db";
import { createEmptyDb } from "./test-db";

const ALL = [
  "001_init",
  "002_markdown_pages",
  "003_auth",
  "004_github_sessions",
  "005_hierarchy_and_search",
];

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
      "schema_migrations",
      "search_chunks",
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
      (await exec("select count(*)::int as count from auth_user")).rows,
    ).toEqual([{ count: 2 }]);
    expect(
      (await exec("select count(*)::int as count from auth_account")).rows,
    ).toEqual([{ count: 2 }]);
    await close();
  });
});
