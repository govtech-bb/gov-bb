import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { createTestDb } from "./test-db";

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

  it("never rewinds an entity's numbering, through deletion, recreation or a counter ahead of its history", async () => {
    const { pool, close } = await createTestDb();
    const exec = (script: string) => pool.query(script);
    const numbered = async () =>
      (
        await exec(
          "select version_no, action from change_events order by version_no",
        )
      ).rows;
    try {
      await exec(
        `${INSERT_PAGE}; delete from content_pages where id = '${PAGE}'; ${INSERT_PAGE}`,
      );
      expect(await numbered()).toEqual([
        { version_no: 1, action: "created" },
        { version_no: 2, action: "deleted" },
        { version_no: 3, action: "created" },
      ]);

      // As after a redaction or an import: the counter is past the events kept.
      await exec(`update change_event_counters set last_version = 20;
        update content_pages set title = 'Later' where id = '${PAGE}'`);
      expect((await numbered()).at(-1)).toEqual({
        version_no: 21,
        action: "updated",
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
