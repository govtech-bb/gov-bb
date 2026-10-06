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

import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { migrate, readMigration } from "./migrate";
import * as schema from "./schema";
import type { Database } from "./store";

const freshDb = () => {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  return { client, db };
};

const tableNames = async (db: Database) => {
  const result: unknown = await db.execute(
    sql`select table_name from information_schema.tables
         where table_schema = 'public' order by table_name`,
  );
  const records = z.array(z.object({ table_name: z.string() }));
  const rows = z
    .union([
      records,
      z.object({ rows: records }).transform((value) => value.rows),
    ])
    .parse(result);
  return rows.map((row) => row.table_name);
};

describe("migrate", () => {
  it("creates content and authentication tables plus its own bookkeeping", async () => {
    const { client, db } = freshDb();
    const ran = await migrate(db, (script) => client.exec(script));

    expect(ran).toEqual([
      "001_init",
      "002_markdown_pages",
      "003_auth",
      "004_github_sessions",
    ]);
    expect(await tableNames(db)).toEqual([
      "auth_account",
      "auth_session",
      "auth_user",
      "auth_verification",
      "categories",
      "change_events",
      "content_pages",
      "forms",
      "schema_migrations",
    ]);
    await client.close();
  });

  it("runs a second time without error and applies nothing", async () => {
    const { client, db } = freshDb();
    await migrate(db, (script) => client.exec(script));

    const again = await migrate(db, (script) => client.exec(script));

    expect(again).toEqual([]);
    await client.close();
  });

  it("is idempotent even if the bookkeeping row is lost", async () => {
    // Exactly the revert scenario: the schema is there, the record that it
    // ran is not. The DDL itself has to tolerate being replayed.
    const { client, db } = freshDb();
    await migrate(db, (script) => client.exec(script));
    await db.execute(sql`delete from schema_migrations`);

    await expect(migrate(db, (script) => client.exec(script))).resolves.toEqual(
      ["001_init", "002_markdown_pages", "003_auth", "004_github_sessions"],
    );
    await client.close();
  });

  it("moves a database already holding block documents onto markdown", async () => {
    // A laptop that booted the block-document api_v2 has 001 applied and
    // seeded pages whose NOT NULL body the new columns cannot fill. 002
    // clears them rather than failing, and the seed refills the estate.
    const { client, db } = freshDb();
    await client.exec(readMigration("001_init"));
    await client.exec(
      `insert into content_pages (url, slug, schema_name, document_type, title, body)
       values ('/x', 'x', 'answer', 'answer', 'X',
               '{"version":1,"blocks":[],"refs":{}}'::jsonb)`,
    );
    await client.exec(
      `create table schema_migrations (name text primary key, applied_at timestamptz not null default now());
       insert into schema_migrations (name) values ('001_init');`,
    );

    await expect(migrate(db, (script) => client.exec(script))).resolves.toEqual(
      ["002_markdown_pages", "003_auth", "004_github_sessions"],
    );
    const pages = await client.query(
      "select count(*)::int as n from content_pages",
    );
    expect(pages.rows).toEqual([{ n: 0 }]);
    await client.close();
  });

  it("keeps change_events append-only", async () => {
    const { client, db } = freshDb();
    await migrate(db, (script) => client.exec(script));

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
    await client.close();
  });

  it("revokes legacy sessions while preserving users and admitted GitHub sessions", async () => {
    const { client, db } = freshDb();
    await migrate(db, (script) => client.exec(script));
    await client.exec(`
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
    expect(await migrate(db, (script) => client.exec(script))).toEqual([
      "004_github_sessions",
    ]);
    expect((await client.query("select id from auth_session")).rows).toEqual([
      { id: "member-session" },
    ]);
    expect(
      (await client.query("select count(*)::int as count from auth_user")).rows,
    ).toEqual([{ count: 2 }]);
    expect(
      (await client.query("select count(*)::int as count from auth_account"))
        .rows,
    ).toEqual([{ count: 2 }]);
    await client.close();
  });
});
