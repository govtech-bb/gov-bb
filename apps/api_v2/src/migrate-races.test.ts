import { describe, expect, it } from "vitest";
import { migrate } from "./migrate";
import { createTestDb } from "./test-db";

describe("concurrent migration runners", () => {
  it("does not replay cached 023 after another runner installed 024", async () => {
    const { db, pool, close } = await createTestDb();
    const exec = (script: string) => pool.query(script);
    let release = () => {};
    let announce = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const paused = new Promise<void>((resolve) => {
      announce = resolve;
    });
    let stale: Promise<string[]> | undefined;
    let afterStale022: unknown;
    try {
      await exec(
        `delete from schema_migrations where name in ('023_change_event_counters', '024_edit_versions')`,
      );
      stale = migrate(db, async (script) => {
        if (script.includes("allocate_change_event_version()")) {
          announce();
          await gate;
          const result = await exec(script);
          afterStale022 = (
            await exec(
              "select pg_get_functiondef('record_change()'::regprocedure) as body",
            )
          ).rows;
          await exec("update content_pages set version = version + 1");
          return result;
        }
        return exec(script);
      });
      await paused;
      await migrate(db, exec);
      const definition = (
        await exec(
          "select pg_get_functiondef('record_change()'::regprocedure) as body",
        )
      ).rows;
      await exec(
        `insert into content_pages (url, slug, title, body_markdown) values ('/x', 'x', 'X', '')`,
      );
      release();
      await stale;
      expect(afterStale022).toEqual(definition);
      expect(
        (
          await exec(
            "select action, snapshot ? 'version' as leaked from change_events",
          )
        ).rows,
      ).toEqual([{ action: "created", leaked: false }]);
    } finally {
      release();
      if (stale) await Promise.allSettled([stale]);
      await close();
    }
  });
});
