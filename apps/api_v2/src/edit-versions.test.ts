import { drizzle } from "drizzle-orm/node-postgres";
import { assert, describe, expect, it } from "vitest";
import { PostgresPages } from "./adapters/postgres-pages";
import { PostgresCollections } from "./adapters/postgres-collections";
import { migrate } from "./migrate";
import { SQL as CHANGE_HISTORY_SQL } from "./migrations/007_change_history_trigger";
import { SQL as COUNTERS_SQL } from "./migrations/022_change_event_counters";
import { EditVersion } from "./modules/edit-concurrency";
import { fieldsOf } from "./modules/page";
import {
  aPage,
  createTestApp,
  createTestDb,
  createTestServices,
  expectOk,
  SELF_APPROVAL,
  TEST_EDITOR,
  TEST_EMPLOYEE,
  TEST_HEADERS,
} from "./test-db";

const ROOTS = [
  "content_pages",
  "categories",
  "data_collections",
  "collection_records",
] as const;
const ROOT_FIXTURES = `
  insert into content_pages (url, slug, title, body_markdown) values ('/x', 'x', 'X', '');
  insert into categories (slug, title) values ('category', 'Category');
  insert into data_collections (key, title, record_key, schema)
    values ('contacts', 'Contacts', 'key', '{"fields":[{"key":"key","label":"Key","type":"slug"},{"key":"name","label":"Name","type":"text"}]}');
  insert into collection_records (collection_key, record_key, data)
    values ('contacts', 'first', '{"key":"first","name":"First"}');`;

// Include tuple identities to catch writes that preserve visible values but still have side effects.
const stateQuery = `select * from (select 'page' as kind, to_jsonb(p) as row, xmin::text as tuple from content_pages p
  union all select 'revision', to_jsonb(r), xmin::text from page_revisions r
  union all select 'search', to_jsonb(s), xmin::text from search_chunks s
  union all select 'history', to_jsonb(e), xmin::text from change_events e
  union all select 'counter', to_jsonb(c), xmin::text from change_event_counters c
  union all select 'category', to_jsonb(c), xmin::text from categories c
  union all select 'definition', to_jsonb(d), xmin::text from data_collections d
  union all select 'record', to_jsonb(r), xmin::text from collection_records r
  ) state order by kind, row::text`;

const storedVersion = async (
  pool: Awaited<ReturnType<typeof createTestDb>>["pool"],
  table: string,
) =>
  EditVersion.parse(
    Number((await pool.query(`select version from ${table}`)).rows[0]?.version),
  );

describe("database edit identities", () => {
  it("versions all roots, ignores timestamp-only writes, and keeps bumps out of dates and history", async () => {
    const { pool, close } = await createTestDb();
    try {
      await pool.query(ROOT_FIXTURES);
      const initial = await Promise.all(
        ROOTS.map((table) => storedVersion(pool, table)),
      );
      expect(new Set(initial).size).toBe(4);
      for (const [i, table] of ROOTS.entries()) {
        const before = (
          await pool.query(
            `select to_jsonb(t) - 'version' as row from ${table} t`,
          )
        ).rows;
        const history = (
          await pool.query("select * from change_events order by id")
        ).rows;
        await pool.query(
          `update ${table} set updated_at = updated_at + interval '1 day'`,
        );
        expect(await storedVersion(pool, table)).toBe(initial[i]);
        await pool.query(`update ${table} set version = version + 1`);
        expect(await storedVersion(pool, table)).not.toBe(initial[i]);
        expect(
          (
            await pool.query(
              `select to_jsonb(t) - 'version' as row from ${table} t`,
            )
          ).rows,
        ).toEqual(before);
        expect(
          (await pool.query("select * from change_events order by id")).rows,
        ).toEqual(history);
        const bumped = await storedVersion(pool, table);
        await pool.query(
          table === "collection_records"
            ? `update ${table} set data = '{"key":"first","name":"Changed"}'`
            : `update ${table} set title = 'Changed'`,
        );
        expect(await storedVersion(pool, table)).not.toBe(bumped);
      }
      await pool.query(
        "delete from collection_records; delete from data_collections; delete from content_pages; delete from categories",
      );
      expect(
        (
          await pool.query(
            "select count(*)::int as n from change_events where snapshot ? 'version'",
          )
        ).rows,
      ).toEqual([{ n: 0 }]);
      await pool.query(ROOT_FIXTURES);
      const recreated = await Promise.all(
        ROOTS.map((table) => storedVersion(pool, table)),
      );
      expect(recreated.every((version) => version > Math.max(...initial))).toBe(
        true,
      );
    } finally {
      await close();
    }
  });

  it("backfills populated roots without audit or date writes and replays without replacing identities", async () => {
    const { db, pool, close } = await createTestDb();
    const exec = (script: string) => pool.query(script);
    try {
      for (const table of ROOTS)
        await exec(
          `drop trigger zz_edit_version on ${table}; alter table ${table} drop column version`,
        );
      await exec(`drop sequence content_edit_version_seq;
        delete from schema_migrations where name = '023_edit_versions';
        ${CHANGE_HISTORY_SQL}
        ${COUNTERS_SQL}`);
      await exec(ROOT_FIXTURES);
      const before = (await exec(stateQuery)).rows.map(({ kind, row }) => ({
        kind,
        row,
      }));
      expect(await migrate(db, exec)).toEqual(["023_edit_versions"]);
      const after = (await exec(stateQuery)).rows.map(({ kind, row }) => {
        const { version: _version, ...content } = row;
        return { kind, row: content };
      });
      expect(after).toEqual(before);
      const versions = await Promise.all(
        ROOTS.map((table) => storedVersion(pool, table)),
      );
      expect(new Set(versions).size).toBe(4);
      const sequence = (await exec("select * from content_edit_version_seq"))
        .rows;
      const state = (await exec(stateQuery)).rows;
      await exec(
        "delete from schema_migrations where name = '023_edit_versions'",
      );
      expect(await migrate(db, exec)).toEqual(["023_edit_versions"]);
      expect((await exec(stateQuery)).rows).toEqual(state);
      expect(
        (await exec("select * from content_edit_version_seq")).rows,
      ).toEqual(sequence);
    } finally {
      await close();
    }
  });

  it("rejects experimental version columns instead of silently adopting their identities", async () => {
    const { db, pool, close } = await createTestDb();
    try {
      await pool.query(`${ROOT_FIXTURES}
        alter table content_pages alter column version drop default;
        delete from schema_migrations where name = '023_edit_versions'`);
      const before = (await pool.query(stateQuery)).rows;
      await expect(migrate(db, (script) => pool.query(script))).rejects.toThrow(
        "Edit version preflight",
      );
      expect((await pool.query(stateQuery)).rows).toEqual(before);
    } finally {
      await close();
    }
  });

  it("rolls back content but never reissues a rolled-back edit identity", async () => {
    const { pool, close } = await createTestDb();
    const tx = await pool.connect();
    try {
      await pool.query(ROOT_FIXTURES);
      const before = await storedVersion(pool, "content_pages");
      await tx.query("begin; update content_pages set title = 'Rolled back'");
      const aborted = Number(
        (await tx.query("select version from content_pages")).rows[0]?.version,
      );
      await tx.query("rollback");
      expect(await storedVersion(pool, "content_pages")).toBe(before);
      await pool.query("update content_pages set title = 'Committed'");
      expect(await storedVersion(pool, "content_pages")).toBeGreaterThan(
        aborted,
      );
    } finally {
      await tx.query("rollback");
      tx.release();
      await close();
    }
  });
});

describe("page editor versions", () => {
  it("does no writes for unchanged live, pending, submitted or rejected content", async () => {
    const { db, pool, close } = await createTestDb();
    const { editing } = createTestServices(db, SELF_APPROVAL);
    try {
      let page = expectOk(
        await editing.create(aPage({ visibility: "draft" }), TEST_EMPLOYEE),
      );
      const noOp = async () => {
        const before = (await pool.query(stateQuery)).rows;
        const sequence = (
          await pool.query("select * from content_edit_version_seq")
        ).rows;
        const saved = expectOk(
          await editing.save(
            page.id,
            fieldsOf(page),
            page.version,
            TEST_EDITOR,
          ),
        );
        expect(saved).toEqual(page);
        expect((await pool.query(stateQuery)).rows).toEqual(before);
        expect(
          (await pool.query("select * from content_edit_version_seq")).rows,
        ).toEqual(sequence);
      };
      await noOp();
      page = expectOk(
        await editing.save(
          page.id,
          { ...fieldsOf(page), visibility: "public" },
          page.version,
          TEST_EMPLOYEE,
        ),
      );
      await noOp();
      page = expectOk(
        await editing.save(
          page.id,
          { ...fieldsOf(page), title: "Pending" },
          page.version,
          TEST_EMPLOYEE,
        ),
      );
      await noOp();
      expectOk(await editing.submit(page.id, page.version, TEST_EMPLOYEE));
      const submittedPage = expectOk(await editing.open(page.id));
      assert(submittedPage);
      page = submittedPage;
      await noOp();
      expectOk(
        await editing.reject(
          page.id,
          "Needs work",
          page.version,
          TEST_EMPLOYEE,
        ),
      );
      const rejectedPage = expectOk(await editing.open(page.id));
      assert(rejectedPage);
      page = rejectedPage;
      await noOp();
      expect(page.pending_revision?.status).toBe("rejected");
    } finally {
      await close();
    }
  });

  it("invalidates the page on every revision transition and returns its final persisted version", async () => {
    const { db, pool, close } = await createTestDb();
    const { editing } = createTestServices(db, SELF_APPROVAL);
    try {
      let page = expectOk(await editing.create(aPage(), TEST_EMPLOYEE));
      let previous = page.version;
      const moved = async (version: number) => {
        expect(version).not.toBe(previous);
        expect(version).toBe(await storedVersion(pool, "content_pages"));
        previous = version;
      };
      page = expectOk(
        await editing.save(
          page.id,
          { ...fieldsOf(page), title: "Pending" },
          page.version,
          TEST_EMPLOYEE,
        ),
      );
      await moved(page.version);
      page = expectOk(
        await editing.save(
          page.id,
          { ...fieldsOf(page), title: "Edited" },
          page.version,
          TEST_EMPLOYEE,
        ),
      );
      await moved(page.version);
      let revision = expectOk(
        await editing.submit(page.id, page.version, TEST_EMPLOYEE),
      );
      await moved(revision.version);
      page = expectOk(
        await editing.save(
          page.id,
          { ...fieldsOf(page), title: "Submitted edit" },
          revision.version,
          TEST_EMPLOYEE,
        ),
      );
      await moved(page.version);
      revision = expectOk(
        await editing.reject(page.id, "Try again", page.version, TEST_EMPLOYEE),
      );
      await moved(revision.version);
      revision = expectOk(
        await editing.submit(page.id, revision.version, TEST_EMPLOYEE),
      );
      await moved(revision.version);
      expect(expectOk(await editing.revision(page.id))).toEqual(revision);
      page = expectOk(
        await editing.publish(page.id, revision.version, TEST_EMPLOYEE),
      );
      await moved(page.version);
      expect(page.pending_revision).toBeNull();
      expect(expectOk(await editing.open(page.id))).toEqual(page);
    } finally {
      await close();
    }
  });

  it("does not revive an older rejection when an approved revision matches live content", async () => {
    const { db, close } = await createTestDb();
    const { editing } = createTestServices(db, SELF_APPROVAL);
    try {
      const live = expectOk(await editing.create(aPage(), TEST_EMPLOYEE));
      const draft = expectOk(
        await editing.save(
          live.id,
          { ...fieldsOf(live), title: "Rejected" },
          live.version,
          TEST_EMPLOYEE,
        ),
      );
      const submitted = expectOk(
        await editing.submit(live.id, draft.version, TEST_EMPLOYEE),
      );
      const rejected = expectOk(
        await editing.reject(
          live.id,
          "Keep the live copy",
          submitted.version,
          TEST_EMPLOYEE,
        ),
      );
      const restored = expectOk(
        await editing.save(
          live.id,
          fieldsOf(live),
          rejected.version,
          TEST_EMPLOYEE,
        ),
      );
      const again = expectOk(
        await editing.submit(live.id, restored.version, TEST_EMPLOYEE),
      );
      const published = expectOk(
        await editing.publish(live.id, again.version, TEST_EMPLOYEE),
      );
      expect(published.pending_revision).toBeNull();
      expect(published.title).toBe(live.title);
      expect(published.version).not.toBe(again.version);
      expect(expectOk(await editing.open(live.id))).toEqual(published);
      expect(expectOk(await editing.revision(live.id))).toBeNull();
    } finally {
      await close();
    }
  });

  it.each(["draft", "submitted"])(
    "invalidates discarded %s content on unpublish",
    async (status) => {
      const { db, pool, close } = await createTestDb();
      const { editing } = createTestServices(db, SELF_APPROVAL);
      try {
        let page = expectOk(await editing.create(aPage(), TEST_EMPLOYEE));
        page = expectOk(
          await editing.save(
            page.id,
            { ...fieldsOf(page), title: "Not live" },
            page.version,
            TEST_EMPLOYEE,
          ),
        );
        if (status === "submitted")
          expectOk(await editing.submit(page.id, page.version, TEST_EMPLOYEE));
        const before = await storedVersion(pool, "content_pages");
        const hidden = expectOk(
          await editing.save(
            page.id,
            { ...fieldsOf(page), visibility: "preview" },
            before,
            TEST_EMPLOYEE,
          ),
        );
        expect(hidden.version).not.toBe(before);
        expect(hidden.version).toBe(await storedVersion(pool, "content_pages"));
        expect(hidden.pending_revision).toBeNull();
        expect(hidden.title).toBe(aPage().title);
      } finally {
        await close();
      }
    },
  );

  it("does not count a legacy snapshot's edit-version difference as authorship", async () => {
    const { db, pool, close } = await createTestDb();
    try {
      const { editing } = createTestServices(db, SELF_APPROVAL);
      const page = expectOk(
        await editing.create(aPage({ visibility: "preview" }), TEST_EMPLOYEE),
      );
      await pool.query(
        `insert into change_events (entity_kind, entity_id, action, snapshot, actor)
        select entity_kind, entity_id, 'updated', snapshot || '{"version":123}'::jsonb, $1
        from change_events where entity_kind = 'content_page' and entity_id = $2`,
        ["system", page.id],
      );
      expect(
        expectOk(await new PostgresPages(db).changedSincePublic(page.id)),
      ).toEqual([TEST_EMPLOYEE.id]);
    } finally {
      await close();
    }
  });

  it("reads page content, revision, attribution and version with one statement", async () => {
    const { db, pool, close } = await createTestDb();
    try {
      const { editing } = createTestServices(db, SELF_APPROVAL);
      let page = expectOk(await editing.create(aPage(), TEST_EMPLOYEE));
      page = expectOk(
        await editing.save(
          page.id,
          { ...fieldsOf(page), title: "Pending" },
          page.version,
          TEST_EMPLOYEE,
        ),
      );
      const queries: string[] = [];
      const pages = new PostgresPages(
        drizzle(pool, {
          logger: {
            logQuery: (query) => {
              queries.push(query);
            },
          },
        }),
      );
      const snapshot = expectOk(await pages.editorSnapshot(page.id));
      expect(queries).toHaveLength(1);
      expect(snapshot?.live.title).toBe(aPage().title);
      expect(snapshot?.revision?.fields.title).toBe("Pending");
      expect(snapshot?.version).toBe(page.version);
      expect(snapshot?.last_edited_by).toEqual(page.last_edited_by);
    } finally {
      await close();
    }
  });
});

describe("private collection and category versions", () => {
  it("does no writes on normalized category and record no-ops", async () => {
    const { db, pool, close } = await createTestDb();
    try {
      await pool.query(ROOT_FIXTURES);
      const { categories, collections } = createTestServices(db);
      const [category] = expectOk(await categories.list());
      const record = expectOk(await collections.detail("contacts", "first"));
      assert(category);
      assert(record);
      const before = (await pool.query(stateQuery)).rows;
      const savedCategory = expectOk(
        await categories.update(
          category.id,
          {
            title: category.title,
            slug: category.slug,
            parent_id: category.parent_id,
            description: "  ",
          },
          category.version,
          TEST_EDITOR,
        ),
      );
      expect(savedCategory).toEqual(category);
      expectOk(
        await categories.reorder(
          {
            parent_id: null,
            ordered_ids: [category.id],
            expected: [{ id: category.id, version: category.version }],
          },
          TEST_EDITOR,
        ),
      );
      const savedRecord = expectOk(
        await collections.save(
          "contacts",
          "first",
          { key: "first", name: " First " },
          record.record.version,
          record.collection.version,
          TEST_EDITOR,
        ),
      );
      expect(savedRecord).toEqual(record);
      expect((await pool.query(stateQuery)).rows).toEqual(before);
    } finally {
      await close();
    }
  });

  it("returns one-statement private detail and keeps all public projections and ETags version-free", async () => {
    const { db, pool, close } = await createTestDb();
    const app = await createTestApp(db, SELF_APPROVAL);
    try {
      await pool.query(ROOT_FIXTURES);
      const privateRead = await app.inject({
        url: "/collections/contacts/records/first",
        headers: TEST_HEADERS,
      });
      expect(privateRead.statusCode).toBe(200);
      const envelope = privateRead.json();
      expect(EditVersion.safeParse(envelope.collection.version).success).toBe(
        true,
      );
      expect(EditVersion.safeParse(envelope.record.version).success).toBe(true);
      expect(
        (await app.inject({ url: "/collections/contacts/records/first" }))
          .statusCode,
      ).toBe(401);
      expect(
        (
          await app.inject({
            url: "/collections/contacts/records/missing",
            headers: TEST_HEADERS,
          })
        ).statusCode,
      ).toBe(404);
      const summaries = await app.inject({
        url: "/collections",
        headers: TEST_HEADERS,
      });
      expect(summaries.json().collections[0].version).toBe(
        envelope.collection.version,
      );
      const queries: string[] = [];
      const storage = new PostgresCollections(
        drizzle(pool, {
          logger: {
            logQuery: (query) => {
              queries.push(query);
            },
          },
        }),
      );
      expect(
        expectOk(await storage.recordEnvelope("contacts", "first")),
      ).toEqual(envelope);
      expect(queries).toHaveLength(1);
      const first = await app.inject({ url: "/collections/contacts/records" });
      expect(first.body).not.toContain('"version"');
      await pool.query(
        "update data_collections set version = version + 1; update collection_records set version = version + 1",
      );
      const again = await app.inject({ url: "/collections/contacts/records" });
      expect(again.body).toBe(first.body);
      expect(again.headers.etag).toBe(first.headers.etag);
      await pool.query(
        `update content_pages set visibility = 'public', category_id = (select id from categories)`,
      );
      const publicPage = await app.inject({ url: "/pages?url=/x" });
      const publicCategories = await app.inject({ url: "/categories" });
      expect(publicPage.statusCode).toBe(200);
      expect(publicPage.body).not.toContain('"version"');
      expect(publicCategories.body).toContain("Category");
      expect(publicCategories.body).not.toContain('"version"');
      await pool.query(
        "update content_pages set version = version + 1; update categories set version = version + 1",
      );
      const samePage = await app.inject({ url: "/pages?url=/x" });
      const sameCategories = await app.inject({ url: "/categories" });
      expect(samePage.body).toBe(publicPage.body);
      expect(samePage.headers.etag).toBe(publicPage.headers.etag);
      expect(sameCategories.body).toBe(publicCategories.body);
      expect(sameCategories.headers.etag).toBe(publicCategories.headers.etag);
    } finally {
      await app.close();
      await close();
    }
  });

  it("waits for the definition before validating a record save", async () => {
    const { db, pool, close } = await createTestDb();
    const gate = await pool.connect();
    let saving:
      | ReturnType<ReturnType<typeof createTestServices>["collections"]["save"]>
      | undefined;
    try {
      await pool.query(ROOT_FIXTURES);
      const baseline = expectOk(
        await createTestServices(db).collections.detail("contacts", "first"),
      );
      assert(baseline);
      await gate.query("begin; set local statement_timeout = '10s'");
      const pid = (await gate.query("select pg_backend_pid() as pid")).rows[0]
        ?.pid;
      await gate.query(
        `update data_collections set schema = '{"fields":[{"key":"key","label":"Key","type":"slug"}]}' where key = 'contacts'`,
      );
      saving = createTestServices(db).collections.save(
        "contacts",
        "first",
        { name: "Under old definition" },
        baseline.record.version,
        baseline.collection.version,
        TEST_EMPLOYEE,
      );
      await expect
        .poll(
          async () => {
            const blocked = await pool.query(
              "select count(*)::int as n from pg_stat_activity where $1::int = any(pg_blocking_pids(pid))",
              [pid],
            );
            return blocked.rows[0]?.n;
          },
          { timeout: 5000, interval: 10 },
        )
        .toBe(1);
      // The waiting save has not locked the dependent row before the definition.
      await gate.query("select id from collection_records for update nowait");
      await gate.query("commit");
      const result = await saving;
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error._tag).toBe("RecordConflict");
      expect(
        (await pool.query("select data from collection_records")).rows,
      ).toEqual([{ data: { key: "first", name: "First" } }]);
    } finally {
      await gate.query("rollback");
      gate.release();
      if (saving) await saving;
      await close();
    }
  });
});
