import { describe, expect, it } from "vitest";
import { SQL as INIT_SQL } from "./migrations/001_init";
import { SQL as MARKDOWN_SQL } from "./migrations/002_markdown_pages";
import { SQL as AUTH_SQL } from "./migrations/003_auth";
import { SQL as GITHUB_SQL } from "./migrations/004_github_sessions";
import { SQL as HIERARCHY_SQL } from "./migrations/005_hierarchy_and_search";
import { SQL as EDIT_LOCKS_SQL } from "./migrations/006_page_edit_locks";
import { createEmptyDb } from "./test-db";

describe("page edit-lock migration", () => {
  it("preserves authored content and timestamps on upgrade, then preserves versions on replay", async () => {
    const database = await createEmptyDb();
    try {
      for (const script of [
        INIT_SQL,
        MARKDOWN_SQL,
        AUTH_SQL,
        GITHUB_SQL,
        HIERARCHY_SQL,
      ])
        await database.pool.query(script);
      const inserted = await database.pool
        .query(`insert into content_pages (url, slug, title, body_markdown, published_at)
        values ('/authored', 'authored', 'Authored page', 'Retain this exact Markdown', '2026-01-01T00:00:00Z') returning *`);
      const before = inserted.rows[0];
      await database.pool.query(EDIT_LOCKS_SQL);
      const upgraded = await database.pool.query(
        "select * from content_pages where url = '/authored'",
      );
      expect(upgraded.rows).toEqual([{ ...before, version: 1 }]);
      await database.pool.query(
        "update content_pages set title = 'Later edit' where url = '/authored'",
      );
      await database.pool.query(EDIT_LOCKS_SQL);
      const replayed = await database.pool.query(
        "select * from content_pages where url = '/authored'",
      );
      expect(replayed.rows).toEqual([
        { ...before, title: "Later edit", version: 2 },
      ]);
      await database.pool.query(
        "update content_pages set title = 'Third edit' where url = '/authored'",
      );
      expect(
        (await database.pool.query("select version from content_pages")).rows,
      ).toEqual([{ version: 3 }]);
    } finally {
      await database.close();
    }
  });
});
