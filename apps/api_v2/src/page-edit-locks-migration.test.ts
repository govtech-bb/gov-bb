/**
 * `017_page_edit_locks` on a database that already holds content: an upgrade
 * from the current base, a replay, and a database that ran the PR branch's
 * draft `006_page_edit_locks`. Each keeps authored content, stamps and
 * history, and the version it adds is bookkeeping the history never sees.
 */

import { describe, expect, it } from "vitest";
import { migrate } from "./migrate";
import { SQL as CHANGE_HISTORY_SQL } from "./migrations/007_change_history_trigger";
import { createEmptyDb } from "./test-db";

const PAGE = "11111111-1111-4111-8111-111111111111";

/** A migrated database, then `017` forgotten, as one that last ran the current base (through `016_content_updated_at`). */
async function atCurrentBase() {
  const database = await createEmptyDb();
  const exec = (script: string) => database.pool.query(script);
  await migrate(database.db, exec);
  await exec(`
    alter table content_pages drop column version;
    drop table page_edit_locks;
    drop trigger content_pages_advance_version on content_pages;
    drop trigger page_revisions_advance_page_version on page_revisions;
    drop function advance_page_content_version();
    drop function advance_revised_page_version();
    delete from schema_migrations where name = '017_page_edit_locks';
  `);
  // The base's own history functions, which 017 replaces.
  await exec(CHANGE_HISTORY_SQL);
  const applied = await exec(
    "select name from schema_migrations order by name desc limit 1",
  );
  expect(applied.rows).toEqual([{ name: "016_content_updated_at" }]);
  return { ...database, exec };
}

const historyOf = async (
  exec: (script: string) => Promise<{ rows: unknown[] }>,
) =>
  (
    await exec(
      `select version_no, action, actor, snapshot from change_events
        where entity_id = '${PAGE}' order by version_no`,
    )
  ).rows;

describe("017_page_edit_locks", () => {
  it("adds version 1 to existing pages without touching their content, stamps or history, and replays", async () => {
    const { db, exec, close } = await atCurrentBase();
    try {
      await exec(`
        insert into content_pages (id, url, slug, title, body_markdown, visibility, published_at)
          values ('${PAGE}', '/authored', 'authored', 'Authored', 'Keep this', 'public', '2026-01-01T00:00:00Z');
        insert into page_revisions (page_id, status, fields, live_updated_at, created_by, contributors)
          select id, 'submitted', '{}', updated_at, 'system', '{system}' from content_pages;
      `);
      const page = async () =>
        (await exec(`select * from content_pages where id = '${PAGE}'`))
          .rows[0] as Record<string, unknown>;
      const before = await page();
      const history = await historyOf(exec);

      expect(await migrate(db, exec)).toEqual(["017_page_edit_locks"]);
      expect(await page()).toEqual({ ...before, version: 1 });
      expect(await historyOf(exec)).toEqual(history);

      await exec(
        "delete from schema_migrations where name = '017_page_edit_locks'",
      );
      await exec(
        `update content_pages set title = 'Edited' where id = '${PAGE}'`,
      );
      expect(await migrate(db, exec)).toEqual(["017_page_edit_locks"]);
      expect((await page()).version).toBe(2);
    } finally {
      await close();
    }
  });

  it("moves the version, and only the version, when a page's revision or edit lease changes", async () => {
    const { db, exec, close } = await atCurrentBase();
    try {
      await migrate(db, exec);
      await exec(`
        insert into content_pages (id, url, slug, title, body_markdown, visibility, published_at)
          values ('${PAGE}', '/p', 'p', 'P', '', 'public', now());
      `);
      const stamps = async () =>
        (
          await exec(
            `select version, updated_at, content_updated_at, published_at from content_pages where id = '${PAGE}'`,
          )
        ).rows[0] as { version: number; updated_at: Date };
      const before = await stamps();
      const history = await historyOf(exec);

      await exec(`insert into page_revisions (page_id, fields, live_updated_at, created_by, contributors)
                    select id, '{}', updated_at, 'system', '{system}' from content_pages`);
      await exec(`update page_revisions set fields = '{"title":"x"}'`);
      await exec(`delete from page_revisions`);
      // A lease taken and heartbeat is presence, not an edit.
      await exec(`insert into page_edit_locks values ('${PAGE}', 1, 'someone', 'Someone',
          '22222222-2222-4222-8222-222222222222', now(), now() + interval '2 minutes', now(), 1)`);
      await exec(
        `update page_edit_locks set activity_sequence = 2, last_activity_at = now(), lock_expires_at = now() + interval '2 minutes'`,
      );

      expect(await stamps()).toEqual({
        ...before,
        version: before.version + 3,
      });
      // Neither a draft's writes nor the version they moved are history.
      expect(await historyOf(exec)).toEqual(history);
      // Nor do they count as content when an approver makes it public.
      expect(
        (
          await exec(
            `select count(*)::int as n from change_events where snapshot ? 'version'`,
          )
        ).rows,
      ).toEqual([{ n: 0 }]);
    } finally {
      await close();
    }
  });

  it("ignores an update that tries to move a version back", async () => {
    const { db, exec, close } = await atCurrentBase();
    try {
      await migrate(db, exec);
      await exec(`
        insert into content_pages (id, url, slug, title, body_markdown) values ('${PAGE}', '/p', 'p', 'P', '');
        update content_pages set title = 'Q';
        update content_pages set version = 1;
      `);
      expect((await exec("select version from content_pages")).rows).toEqual([
        { version: 2 },
      ]);
    } finally {
      await close();
    }
  });

  it("upgrades a database that ran the draft 006_page_edit_locks, keeping versions and leases", async () => {
    const { db, exec, close } = await atCurrentBase();
    try {
      // The PR branch's draft, as a database that booted it holds it.
      await exec(`
        alter table content_pages add column version integer not null default 1;
        alter table content_pages add constraint content_pages_version_positive check (version > 0);
        create function advance_page_content_version() returns trigger language plpgsql as $$
        begin new.version := old.version + 1; return new; end; $$;
        create trigger content_pages_advance_version before update on content_pages
          for each row execute function advance_page_content_version();
        create table page_edit_locks (
          page_id uuid primary key references content_pages(id) on delete cascade,
          lock_generation integer not null check (lock_generation >= 0),
          employee_id text, holder_name text, token uuid,
          acquired_at timestamptz(3), lock_expires_at timestamptz(3),
          last_activity_at timestamptz(3), activity_sequence bigint,
          constraint page_edit_locks_complete_claim check (
            num_nonnulls(employee_id, holder_name, token, acquired_at, lock_expires_at, last_activity_at, activity_sequence) in (0, 7))
        );
        insert into schema_migrations (name) values ('006_page_edit_locks');
        insert into content_pages (id, url, slug, title, body_markdown) values ('${PAGE}', '/p', 'p', 'P', '');
        update content_pages set title = 'Q';
        insert into page_edit_locks values ('${PAGE}', 3, 'someone', 'Someone',
          '22222222-2222-4222-8222-222222222222', now(), now() + interval '2 minutes', now(), 4);
      `);

      expect(await migrate(db, exec)).toEqual(["017_page_edit_locks"]);
      expect((await exec("select version from content_pages")).rows).toEqual([
        { version: 2 },
      ]);
      expect(
        (
          await exec(
            "select lock_generation, user_id, activity_sequence from page_edit_locks",
          )
        ).rows,
      ).toEqual([
        { lock_generation: 3, user_id: "someone", activity_sequence: "4" },
      ]);
      await exec(`update content_pages set title = 'R'`);
      expect((await exec("select version from content_pages")).rows).toEqual([
        { version: 3 },
      ]);
    } finally {
      await close();
    }
  });
});
