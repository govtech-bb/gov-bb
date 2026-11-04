import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { createTestDb } from "./test-db";
import { migrate } from "./migrate";
import { SQL as CHANGE_HISTORY_SQL } from "./migrations/007_change_history_trigger";
import { SQL as REVISION_DISCARDED_SQL } from "./migrations/015_revision_discarded";

const PAGE = "55555555-5555-4555-8555-555555555555";
const INSERT_PAGE = `insert into content_pages (id, url, slug, title, body_markdown)
  values ('${PAGE}', '/x', 'x', 'X', '')`;
const INSERT_REVISION = `insert into page_revisions
  (page_id, fields, live_updated_at, created_by, contributors)
  values ('${PAGE}', '{}', now(), 'system', '{system}')`;

// Hold the first event uncommitted until the other writer is blocked on it.
async function overlappingWrites(
  pool: Pool,
  first: string,
  second: string,
  finishFirst: "commit" | "rollback" = "commit",
) {
  const a = await pool.connect();
  const b = await pool.connect();
  let pending: Promise<unknown> | undefined;
  try {
    await a.query("begin; set local statement_timeout = '10s'");
    await b.query("begin; set local statement_timeout = '10s'");
    const aPid = (
      await a.query<{ pid: number }>("select pg_backend_pid() as pid")
    ).rows[0]?.pid;
    const bPid = (
      await b.query<{ pid: number }>("select pg_backend_pid() as pid")
    ).rows[0]?.pid;
    await a.query(first);
    pending = b.query(second);
    // Attach a rejection handler immediately, including when the barrier fails.
    const outcome = Promise.allSettled([pending]);
    await expect
      .poll(
        async () => {
          const result = await pool.query<{ blocked: boolean }>(
            "select $1::int = any(pg_blocking_pids($2::int)) as blocked",
            [aPid, bPid],
          );
          return result.rows[0]?.blocked;
        },
        { timeout: 5000, interval: 10 },
      )
      .toBe(true);
    await a.query(finishFirst);
    expect(await outcome).toEqual([
      expect.objectContaining({ status: "fulfilled" }),
    ]);
    await b.query("commit");
  } finally {
    await a.query("rollback");
    await Promise.allSettled(pending ? [pending] : []);
    await b.query("rollback");
    a.release();
    b.release();
  }
}

describe("change event allocation", () => {
  it.each(["commit", "rollback"] as const)(
    "serializes concurrent first events when the first writer ends with %s",
    async (finishFirst) => {
      const { pool, close } = await createTestDb();
      try {
        // No content row exists to serialize these inserts; caller numbers are ignored.
        const insert = `insert into change_events (entity_kind, entity_id, version_no, action, snapshot)
        values ('content_page', 'new-entity', 99, 'created', '{}')`;
        await overlappingWrites(pool, insert, insert, finishFirst);
        const versions = finishFirst === "commit" ? [1, 2] : [1];
        expect(
          (
            await pool.query(
              "select version_no from change_events order by version_no",
            )
          ).rows,
        ).toEqual(versions.map((version_no) => ({ version_no })));
        expect(
          (await pool.query("select last_version from change_event_counters"))
            .rows,
        ).toEqual([{ last_version: versions.length }]);
      } finally {
        await close();
      }
    },
  );

  it("rolls back existing counters and first counters with their content writes", async () => {
    const { pool, close } = await createTestDb();
    const connection = await pool.connect();
    try {
      await connection.query(INSERT_PAGE);
      await connection.query(`begin;
        update content_pages set title = 'Rolled back' where id = '${PAGE}';
        insert into categories (slug, title) values ('rollback', 'Rollback');`);
      expect(
        (
          await connection.query(
            "select last_version from change_event_counters where entity_kind = 'content_page'",
          )
        ).rows,
      ).toEqual([{ last_version: 2 }]);
      await connection.query("rollback");
      expect(
        (
          await pool.query(
            "select entity_kind, last_version from change_event_counters",
          )
        ).rows,
      ).toEqual([{ entity_kind: "content_page", last_version: 1 }]);
      expect(
        (await pool.query("select title from content_pages")).rows,
      ).toEqual([{ title: "X" }]);
      expect((await pool.query("select * from categories")).rows).toEqual([]);
      expect(
        (await pool.query("select version_no from change_events")).rows,
      ).toEqual([{ version_no: 1 }]);
      await pool.query(
        `update content_pages set title = 'Committed' where id = '${PAGE}'`,
      );
      expect(
        (
          await pool.query(
            "select version_no from change_events order by version_no",
          )
        ).rows,
      ).toEqual([{ version_no: 1 }, { version_no: 2 }]);
    } finally {
      await connection.query("rollback");
      connection.release();
      await close();
    }
  });

  it("seeds all history on upgrade, preserves snapshots, and never rewinds on replay or recreation", async () => {
    const { db, pool, close } = await createTestDb();
    const exec = (script: string) => pool.query(script);
    try {
      // Restore the pre-022 schema and trigger bodies in this disposable clone.
      await exec(`drop trigger allocate_version_no on change_events;
        drop table change_event_counters;
        delete from schema_migrations where name = '022_change_event_counters';
        ${CHANGE_HISTORY_SQL}
        ${REVISION_DISCARDED_SQL}`);
      await exec(`${INSERT_PAGE}; delete from content_pages where id = '${PAGE}';
        insert into change_events (entity_kind, entity_id, version_no, action, snapshot, snapshot_version)
          values ('category', '${PAGE}', 4, 'created', '{"title":"Old"}', null),
                 ('category', '${PAGE}', 12, 'deleted', '{"title":"Removed"}', 1),
                 ('data_collection', 'deleted-collection', 6, 'deleted', '{}', 1),
                 ('collection_record', 'deleted-record', 8, 'deleted', '{}', 1);
        select set_config('app.redacting', 'on', true);
        update change_events set snapshot = '{"redacted":true,"reason":"Privacy","by":"system"}'
          where action = 'deleted';`);
      const history = (
        await exec(
          "select * from change_events order by entity_kind, version_no",
        )
      ).rows;
      expect(await migrate(db, exec)).toEqual(["022_change_event_counters"]);
      expect(
        (
          await exec(
            "select * from change_events order by entity_kind, version_no",
          )
        ).rows,
      ).toEqual(history);
      expect(
        (
          await exec(
            "select entity_kind, last_version from change_event_counters order by entity_kind",
          )
        ).rows,
      ).toEqual([
        { entity_kind: "category", last_version: 12 },
        { entity_kind: "collection_record", last_version: 8 },
        { entity_kind: "content_page", last_version: 2 },
        { entity_kind: "data_collection", last_version: 6 },
      ]);

      // A counter ahead of retained history must survive replay, including one with no events.
      await exec(`update change_event_counters set last_version = 20 where entity_kind = 'category';
        insert into change_event_counters values ('content_page', 'counter-only', 30);
        delete from schema_migrations where name = '022_change_event_counters'`);
      expect(await migrate(db, exec)).toEqual(["022_change_event_counters"]);
      expect(
        (
          await exec(
            "select * from change_events order by entity_kind, version_no",
          )
        ).rows,
      ).toEqual(history);
      expect(
        (
          await exec(
            "select last_version from change_event_counters where entity_id = 'counter-only'",
          )
        ).rows,
      ).toEqual([{ last_version: 30 }]);
      await exec(`${INSERT_PAGE};
        insert into categories (id, slug, title) values ('${PAGE}', 'recreated', 'Recreated');`);
      expect(
        (
          await exec(
            "select entity_kind, version_no from change_events where snapshot->>'title' = 'Recreated' or (action = 'created' and version_no = 3) order by entity_kind",
          )
        ).rows,
      ).toEqual([
        { entity_kind: "category", version_no: 21 },
        { entity_kind: "content_page", version_no: 3 },
      ]);
      await exec(
        `delete from content_pages where id = '${PAGE}'; ${INSERT_PAGE}`,
      );
      expect(
        (
          await exec(
            `select last_version from change_event_counters where entity_kind = 'content_page' and entity_id = '${PAGE}'`,
          )
        ).rows,
      ).toEqual([{ last_version: 5 }]);
      expect(
        (
          await exec(`select conname from pg_constraint
        where conrelid = 'change_events'::regclass and contype = 'u'`)
        ).rows,
      ).toContainEqual({
        conname: "change_events_entity_kind_entity_id_version_no_key",
      });
    } finally {
      await close();
    }
  });

  it("commits a page update racing its revision status update", async () => {
    const { pool, close } = await createTestDb();
    try {
      await pool.query(`${INSERT_PAGE}; ${INSERT_REVISION}`);
      await overlappingWrites(
        pool,
        `update content_pages set title = 'Changed' where id = '${PAGE}'`,
        `update page_revisions set status = 'submitted' where page_id = '${PAGE}'`,
      );
      expect(
        (
          await pool.query(
            "select version_no, action from change_events order by version_no",
          )
        ).rows,
      ).toEqual([
        { version_no: 1, action: "created" },
        { version_no: 2, action: "updated" },
        { version_no: 3, action: "submitted" },
      ]);
    } finally {
      await close();
    }
  });
});
