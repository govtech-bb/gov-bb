import type { FastifyInstance, InjectOptions } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditorPage, fieldsOf } from "./modules/page";
import { ok } from "./modules/result";
import {
  aPage,
  createTestApp,
  createTestDb,
  SELF_APPROVAL,
  TEST_EDITOR,
  TEST_EMPLOYEE,
  TEST_HEADERS,
  type TestDb,
} from "./test-db";

let test: TestDb;
let app: FastifyInstance;
beforeEach(async () => {
  test = await createTestDb();
  app = await createTestApp(test.db, {
    ...SELF_APPROVAL,
    sessions: {
      findSession: async (cookie) =>
        ok(
          cookie.reveal().endsWith(`=${TEST_EDITOR.id}`)
            ? TEST_EDITOR
            : TEST_EMPLOYEE,
        ),
    },
  });
});
afterEach(async () => {
  await app.close();
  await test.close();
});
const request = (options: InjectOptions) =>
  app.inject({ ...options, headers: { ...TEST_HEADERS, ...options.headers } });
const createPage = async (
  visibility: "draft" | "public" = "draft",
  id?: string,
) => {
  const response = await request({
    method: "POST",
    url: "/pages",
    payload: aPage({ visibility, ...(id ? { id } : {}) }),
  });
  expect(response.statusCode, response.body).toBe(201);
  return EditorPage.parse(response.json());
};
const savePage = (page: EditorPage, title: string, actor = TEST_EMPLOYEE) =>
  request({
    method: "PUT",
    url: `/pages/${page.id}`,
    headers: { cookie: `test-session=${actor.id}` },
    payload: {
      ...fieldsOf(page),
      title,
      body_markdown: title,
      expected_version: page.version,
    },
  });

// xmin catches a write even if it restores the same visible values.
const state = async () =>
  (
    await test.pool.query(`select * from (
  select 'page' as kind, to_jsonb(p) as row, xmin::text as tuple from content_pages p
  union all select 'revision', to_jsonb(r), xmin::text from page_revisions r
  union all select 'search', to_jsonb(s), xmin::text from search_chunks s
  union all select 'history', to_jsonb(e), xmin::text from change_events e
  union all select 'counter', to_jsonb(c), xmin::text from change_event_counters c
  union all select 'category', to_jsonb(c), xmin::text from categories c
  union all select 'definition', to_jsonb(d), xmin::text from data_collections d
  union all select 'record', to_jsonb(r), xmin::text from collection_records r
) state order by kind, row::text`)
  ).rows;

// Queue real HTTP transactions in a known order behind the existing content lock.
async function race(
  first: () => PromiseLike<unknown>,
  second: () => PromiseLike<unknown>,
) {
  const gate = await test.pool.connect();
  const pending: Promise<unknown>[] = [];
  try {
    await gate.query(
      "begin; select pg_advisory_xact_lock(hashtext('content_pages.parent_id'))",
    );
    for (const send of [first, second]) {
      pending.push(Promise.resolve(send()));
      await expect
        .poll(
          async () =>
            (
              await test.pool.query(`select count(*)::int as n from pg_locks
        where locktype = 'advisory' and not granted
        and database = (select oid from pg_database where datname = current_database())`)
            ).rows[0]?.n,
          { timeout: 5000, interval: 10 },
        )
        .toBe(pending.length);
    }
    await gate.query("commit");
    await Promise.all(pending);
  } finally {
    await gate.query("rollback");
    gate.release();
    await Promise.allSettled(pending);
  }
}

describe("HTTP edit preconditions", () => {
  it.each(["draft", "public"] as const)(
    "allows only one overlapping save from a %s baseline, with no loser effects",
    async (visibility) => {
      const page = await createPage(visibility);
      const search = (
        await test.pool.query("select * from search_chunks order by id")
      ).rows;
      await race(
        async () => {
          const winner = await savePage(page, "Winner", TEST_EDITOR);
          expect(winner.statusCode, winner.body).toBe(200);
          expect(winner.json().version).not.toBe(page.version);
        },
        async () => {
          const loser = await savePage(page, "Loser");
          expect(loser.statusCode, loser.body).toBe(409);
          expect(loser.json().error).toBe("version_conflict");
        },
      );
      const current = (await request({ url: `/pages/${page.id}` })).json();
      expect(current.title).toBe("Winner");
      const history = (
        await test.pool.query(
          "select action, actor from change_events order by version_no",
        )
      ).rows;
      expect(history).toEqual([
        { action: "created", actor: TEST_EMPLOYEE.id },
        ...(visibility === "draft"
          ? [{ action: "updated", actor: TEST_EDITOR.id }]
          : []),
      ]);
      const revisions = (
        await test.pool.query("select contributors, fields from page_revisions")
      ).rows;
      if (visibility === "public") {
        expect(revisions).toEqual([
          {
            contributors: [TEST_EDITOR.id],
            fields: expect.objectContaining({ title: "Winner" }),
          },
        ]);
        expect(
          (await test.pool.query("select * from search_chunks order by id"))
            .rows,
        ).toEqual(search);
      } else {
        expect(revisions).toEqual([]);
        expect(
          (
            await test.pool.query(
              "select body from search_chunks order by ordinal",
            )
          ).rows,
        ).toEqual([{ body: "Winner" }]);
      }
      const before = await state();
      const identical = await savePage(page, "Winner");
      expect(identical.statusCode).toBe(409);
      expect(identical.json().error).toBe("version_conflict");
      expect(await state()).toEqual(before);
    },
  );

  it.each([true, false])(
    "serializes save versus publish from the same review baseline (save first=%s)",
    async (saveFirst) => {
      const live = await createPage("public");
      const pending = EditorPage.parse(
        (await savePage(live, "Reviewed", TEST_EDITOR)).json(),
      );
      const submitted = await request({
        method: "POST",
        url: `/pages/${live.id}/revision/submit`,
        payload: { expected_version: pending.version },
      });
      expect(submitted.statusCode).toBe(200);
      const baseline = EditorPage.parse(
        (await request({ url: `/pages/${live.id}` })).json(),
      );
      const save = () =>
        savePage(baseline, "Changed while publishing", TEST_EDITOR);
      const publish = () =>
        request({
          method: "POST",
          url: `/pages/${live.id}/revision/publish`,
          payload: { expected_version: baseline.version },
        });
      const actions = saveFirst ? [save, publish] : [publish, save];
      await race(
        async () => {
          const response = await actions[0]!();
          expect(response.statusCode, response.body).toBe(200);
        },
        async () => {
          const response = await actions[1]!();
          expect(response.statusCode, response.body).toBe(409);
          expect(response.json().error).toBe("version_conflict");
        },
      );
      const rows = (await test.pool.query("select title from content_pages"))
        .rows;
      expect(rows).toEqual([{ title: saveFirst ? live.title : "Reviewed" }]);
      expect(
        (await test.pool.query("select status from page_revisions")).rows,
      ).toEqual([{ status: saveFirst ? "submitted" : "published" }]);
      const current = (await request({ url: `/pages/${live.id}` })).json();
      expect(current.title).toBe(
        saveFirst ? "Changed while publishing" : "Reviewed",
      );
    },
  );

  it("rejects old review baselines even when content and updated_at did not change", async () => {
    const page = await createPage("public");
    const draft = EditorPage.parse((await savePage(page, "Pending")).json());
    const submitted = await request({
      method: "POST",
      url: `/pages/${page.id}/revision/submit`,
      payload: { expected_version: draft.version },
    });
    expect(submitted.statusCode).toBe(200);
    expect(submitted.json().updated_at).toBe(draft.updated_at);
    expect(submitted.json().version).not.toBe(draft.version);
    const before = await state();
    for (const step of ["submit", "reject", "publish"]) {
      const response = await request({
        method: "POST",
        url: `/pages/${page.id}/revision/${step}`,
        payload: {
          expected_version: draft.version,
          ...(step === "reject" ? { comment: "Old view" } : {}),
        },
      });
      expect(response.statusCode, response.body).toBe(409);
      expect(response.json().error).toBe("version_conflict");
    }
    expect(await state()).toEqual(before);
    const again = await request({
      method: "POST",
      url: `/pages/${page.id}/revision/submit`,
      payload: { expected_version: submitted.json().version },
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe("under_review");
    expect(await state()).toEqual(before);
  });

  it("does not delete a recreated page with the old identity", async () => {
    const page = await createPage();
    const url = `/pages/${page.id}?expected_version=${page.version}`;
    expect((await request({ method: "DELETE", url })).statusCode).toBe(204);
    expect((await request({ method: "DELETE", url })).statusCode).toBe(404);
    const replacement = await createPage("draft", page.id);
    expect(replacement.version).not.toBe(page.version);
    const before = await state();
    const stale = await request({ method: "DELETE", url });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toBe("version_conflict");
    expect(await state()).toEqual(before);
  });

  it("rejects missing, malformed and unsafe baselines on every mutation without writes", async () => {
    const page = await createPage();
    const category = (
      await request({
        method: "POST",
        url: "/editor/categories",
        payload: {
          title: "Category",
          slug: "category",
          parent_id: null,
          description: null,
        },
      })
    ).json();
    await test.pool.query(
      `insert into data_collections (key, title, record_key, schema) values ('contacts', 'Contacts', 'key', '{"fields":[{"key":"key","label":"Key","type":"slug"}]}')`,
    );
    const definition = (await request({ url: "/collections" })).json()
      .collections[0];
    const record = (
      await request({
        method: "POST",
        url: "/collections/contacts/records/one",
        payload: { data: {}, expected_collection_version: definition.version },
      })
    ).json();
    const before = await state();
    for (const version of [
      undefined,
      null,
      "1",
      0,
      -1,
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      const bodies: InjectOptions[] = [
        {
          method: "PUT",
          url: `/pages/${page.id}`,
          payload: { ...fieldsOf(page), expected_version: version },
        },
        ...["submit", "publish", "reject"].map((step) => ({
          method: "POST" as const,
          url: `/pages/${page.id}/revision/${step}`,
          payload: {
            expected_version: version,
            ...(step === "reject" ? { comment: "Review" } : {}),
          },
        })),
        {
          method: "PUT",
          url: `/editor/categories/${category.id}`,
          payload: {
            title: "Category",
            slug: "category",
            parent_id: null,
            description: null,
            expected_version: version,
          },
        },
        {
          method: "POST",
          url: "/collections/contacts/records/two",
          payload: { data: {}, expected_collection_version: version },
        },
        {
          method: "PUT",
          url: "/collections/contacts/records/one",
          payload: {
            data: {},
            expected_version: version,
            expected_collection_version: definition.version,
          },
        },
        {
          method: "PUT",
          url: "/collections/contacts/records/one",
          payload: {
            data: {},
            expected_version: record.version,
            expected_collection_version: version,
          },
        },
      ];
      for (const options of bodies) {
        const response = await request(options);
        expect(response.statusCode, `${options.url}: ${response.body}`).toBe(
          400,
        );
      }
    }
    for (const suffix of [
      "",
      "?expected_version=0",
      "?expected_version=-1",
      "?expected_version=1.5",
      "?expected_version=9007199254740992",
      "?expected_version=1e2",
      "?expected_version=1&expected_version=2",
    ]) {
      for (const path of [
        `/pages/${page.id}`,
        `/editor/categories/${category.id}`,
        "/collections/contacts/records/one",
      ]) {
        const response = await request({
          method: "DELETE",
          url: path + suffix,
        });
        expect(response.statusCode, response.body).toBe(400);
      }
    }
    const malformed = await request({
      method: "POST",
      url: `/pages/${page.id}/revision/submit`,
      headers: { "content-type": "application/json" },
      payload: "{",
    });
    expect(malformed.statusCode).toBe(400);
    expect(await state()).toEqual(before);
  });

  it("checks record create and update against the displayed definition, and delete against the record only", async () => {
    await test.pool.query(
      `insert into data_collections (key, title, record_key, schema) values ('contacts', 'Contacts', 'key', '{"fields":[{"key":"key","label":"Key","type":"slug"}]}')`,
    );
    const definition = (await request({ url: "/collections" })).json()
      .collections[0];
    const url = "/collections/contacts/records/one";
    const record = (
      await request({
        method: "POST",
        url,
        payload: { data: {}, expected_collection_version: definition.version },
      })
    ).json();
    await test.pool.query(
      "update data_collections set title = 'Changed definition'",
    );
    const before = await state();
    for (const options of [
      {
        method: "POST" as const,
        url: "/collections/contacts/records/two",
        payload: { data: {}, expected_collection_version: definition.version },
      },
      {
        method: "PUT" as const,
        url,
        payload: {
          data: {},
          expected_version: record.version,
          expected_collection_version: definition.version,
        },
      },
    ]) {
      const response = await request(options);
      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe("version_conflict");
    }
    expect(await state()).toEqual(before);
    const current = (await request({ url })).json();
    expect(current.collection.version).not.toBe(definition.version);
    expect(current.record.version).toBe(record.version);
    const noOp = await request({
      method: "PUT",
      url,
      payload: {
        data: {},
        expected_version: record.version,
        expected_collection_version: current.collection.version,
      },
    });
    expect(noOp.statusCode).toBe(200);
    expect(noOp.json()).toEqual(current);
    expect(await state()).toEqual(before);
    expect(
      (
        await request({
          method: "DELETE",
          url: `${url}?expected_version=${record.version}`,
        })
      ).statusCode,
    ).toBe(204);
    const replacement = (
      await request({
        method: "POST",
        url,
        payload: {
          data: {},
          expected_collection_version: current.collection.version,
        },
      })
    ).json();
    expect(replacement.version).not.toBe(record.version);
    const recreated = await state();
    const stale = await request({
      method: "DELETE",
      url: `${url}?expected_version=${record.version}`,
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toBe("version_conflict");
    expect(await state()).toEqual(recreated);
  });
});
