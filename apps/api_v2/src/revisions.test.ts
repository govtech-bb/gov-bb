/**
 * Pending revisions (#3198): a save that keeps a public page public goes into
 * the page's pending revision, and citizens keep seeing the live page. A page
 * that is not public saves as it always has.
 */

import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance, InjectOptions } from "fastify";
import type { Database } from "./db";
import { UserId, type Employee } from "./modules/auth";
import { PostgresPages } from "./adapters/postgres-pages";
import { withDefaults, type PageId } from "./modules/page";
import { ok } from "./modules/result";
import { PageEditing } from "./services/page-editing";
import { categories, changeEvents, pageRevisions } from "./schema";
import { IF_UPDATED_AT } from "./routes/contracts";
import {
  aPage,
  createTestApp,
  createTestDb,
  createTestServices,
  expectOk,
  TEST_EDITOR,
  TEST_EMPLOYEE,
  TEST_HTTP_CONFIG,
} from "./test-db";

/** Signed in, but holding no role: reads stay open to them. */
const READER: Employee = {
  id: UserId.parse("reader-test"),
  email: "reader@govtech.bb",
  name: "Test employee without roles",
  roles: [],
};
const FIXTURES = [TEST_EMPLOYEE, TEST_EDITOR, READER];

let app: FastifyInstance;
let db: Database;
let close: () => Promise<void>;
let services: ReturnType<typeof createTestServices>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  services = createTestServices(db);
  await db.execute(
    sql`insert into auth_user (id, name, email, "emailVerified")
        values (${READER.id}, ${READER.name}, ${READER.email}, true)`,
  );
  app = await createTestApp(db, {
    sessions: {
      findSession: async (cookie) =>
        ok(
          FIXTURES.find((employee) =>
            cookie.reveal().endsWith(`=${employee.id}`),
          ) ?? null,
        ),
    },
  });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await close();
});

/** A browser request from the editor, signed in as `employee`. */
const as = (employee: Employee, options: InjectOptions) =>
  app.inject({
    ...options,
    headers: {
      cookie: `test-session=${employee.id}`,
      origin: TEST_HTTP_CONFIG.editorOrigin,
      ...options.headers,
    },
  });

const ENTRY = "/money-financial-support/calculate-severance-pay";

/** A page in a category, so the site lists it as well as serving it. */
const seedPage = async (overrides: Record<string, unknown> = {}) => {
  const [category] = await db
    .insert(categories)
    .values({ slug: "money-financial-support", title: "Money" })
    .onConflictDoNothing()
    .returning();
  return expectOk(
    await services.editing.create(
      aPage({
        category_id: category?.id,
        body_markdown: "Intro\n\n## Fees\n\nTen dollars",
        ...overrides,
      }),
      TEST_EMPLOYEE,
    ),
  );
};

const stored = async (id: PageId) =>
  expectOk(await new PostgresPages(db).find(id));

const save = (
  employee: Employee,
  page: { id: string; updated_at: string },
  fields: Record<string, unknown>,
) =>
  as(employee, {
    method: "PUT",
    url: `/pages/${page.id}`,
    headers: { [IF_UPDATED_AT]: page.updated_at },
    payload: withDefaults(aPage(fields)),
  });

const revisions = () => db.select().from(pageRevisions);
/** The pages' history; the trigger records the seeded category's too. */
const events = () =>
  db
    .select({ action: changeEvents.action, actor: changeEvents.actor })
    .from(changeEvents)
    .where(eq(changeEvents.entityKind, "content_page"))
    .orderBy(changeEvents.versionNo);

/** Everything the site reads, as the public sees it. */
const publicResponses = async () =>
  Promise.all(
    [
      `/pages?url=${ENTRY}`,
      "/categories",
      "/categories/money-financial-support",
      "/catalog",
      "/search/documents",
    ].map(async (url) => {
      const response = await app.inject({ url });
      return { url, status: response.statusCode, body: response.json() };
    }),
  );

describe("a save to a public page", () => {
  it.each([
    ["an editor", TEST_EDITOR],
    ["an approver", TEST_EMPLOYEE],
  ])(
    "by %s leaves every public response, search included, unchanged",
    async (_who, employee) => {
      const page = await seedPage();
      const before = await publicResponses();
      expect(before.every(({ status }) => status === 200)).toBe(true);

      const response = await save(employee, page, {
        category_id: page.category_id,
        title: "Severance pay",
        body_markdown: "Rewritten\n\n## Costs\n\nTwenty dollars",
      });

      expect(response.statusCode).toBe(200);
      expect(await publicResponses()).toEqual(before);
      expect(await stored(page.id)).toEqual(page);
      // A live page that did not change gets no "updated" entry (#3200).
      expect(await events()).toEqual([
        { action: "created", actor: TEST_EMPLOYEE.id },
      ]);
    },
  );

  it("leaves no gap in the page's history, though its check writes the page and rolls back", async () => {
    const page = await seedPage();
    const pending = (
      await save(TEST_EDITOR, page, { title: "Waiting" })
    ).json();
    // Taking it out of public view is the next live write.
    await save(TEST_EMPLOYEE, pending, {
      visibility: "preview",
      title: "Waiting",
    });

    const { rows } = await db.execute<{ version_no: number; action: string }>(
      sql`select version_no, action from change_events
            where entity_id = ${page.id} order by version_no`,
    );
    expect(rows).toEqual([
      { version_no: 1, action: "created" },
      { version_no: 2, action: "unpublished" },
    ]);
    // Taking it out of view changed only its visibility.
    expect((await stored(page.id))?.title).toBe(page.title);
  });

  it("returns the page as the editor now works on it, marked as waiting", async () => {
    const page = await seedPage();

    const response = await save(TEST_EDITOR, page, {
      category_id: page.category_id,
      title: "Severance pay",
    });

    const [revision] = await revisions();
    expect(response.json()).toEqual({
      ...page,
      title: "Severance pay",
      body_markdown: aPage().body_markdown,
      updated_at: revision?.updatedAt.toISOString(),
      pending_revision: { status: "draft", comment: null },
    });
    expect(response.json().updated_at > page.updated_at).toBe(true);
  });

  it("updates the one open revision, and records everyone who saved to it", async () => {
    const page = await seedPage();
    const first = (await save(TEST_EDITOR, page, { title: "First" })).json();

    const second = await save(TEST_EMPLOYEE, first, { title: "Second" });

    expect(second.statusCode).toBe(200);
    const rows = await revisions();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "draft",
      createdBy: TEST_EDITOR.id,
      contributors: [TEST_EDITOR.id, TEST_EMPLOYEE.id],
      liveUpdatedAt: new Date(page.updated_at),
      fields: { title: "Second" },
    });
  });

  it("keeps the revision's parent when the save leaves parent_id out", async () => {
    const page = await seedPage();
    const { parent_id, ...unplaced } = withDefaults(aPage({ title: "Moved" }));

    const response = await as(TEST_EDITOR, {
      method: "PUT",
      url: `/pages/${page.id}`,
      payload: unplaced,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().parent_id).toBeNull();
  });

  it("refuses a loop in the hierarchy, as a live save does", async () => {
    const parent = await seedPage();
    const child = await seedPage({
      url: `${ENTRY}/start`,
      parent_id: parent.id,
    });

    const response = await save(TEST_EDITOR, parent, { parent_id: child.id });

    expect(response.statusCode).toBe(422);
    expect(await revisions()).toEqual([]);
  });

  it("refuses what the live page would, naming the field, and changes nothing", async () => {
    const page = await seedPage();
    const other = await seedPage({ url: "/somewhere-else" });

    for (const [fields, error] of [
      [
        { parent_id: "22222222-2222-4222-8222-222222222222" },
        { field: "parent_id", message: "No page with that id." },
      ],
      [
        { url: other.url },
        { field: "url", message: "Another page already has this url." },
      ],
    ] as const) {
      const response = await save(TEST_EDITOR, page, fields);
      expect(response.statusCode).toBe(422);
      expect(response.json().errors).toEqual([error]);
    }
    expect(await stored(page.id)).toEqual(page);
    expect(await revisions()).toEqual([]);
  });
});

describe("a revision that moves a public page with sub-pages to another category", () => {
  it("leaves the sub-pages' live rows and every public response unchanged", async () => {
    const parent = await seedPage();
    const child = await seedPage({
      url: `${ENTRY}/start`,
      parent_id: parent.id,
    });
    const [work] = await db
      .insert(categories)
      .values({ slug: "work-employment", title: "Work" })
      .returning();
    const before = await publicResponses();

    // Storage checks the move by trying it, sub-pages cascading, and rolling back.
    const response = await save(TEST_EDITOR, parent, {
      category_id: work?.id,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().category_id).toBe(work?.id);
    expect(await stored(child.id)).toEqual(child);
    expect(await stored(parent.id)).toEqual(parent);
    expect(await publicResponses()).toEqual(before);
  });
});

describe("a page that has never been public", () => {
  it.each(["preview", "draft"] as const)(
    "as %s saves as it always has: live, indexed and audited, with no revision",
    async (visibility) => {
      const page = await seedPage({ visibility });

      const response = await save(TEST_EDITOR, page, {
        visibility,
        title: "Severance pay",
        body_markdown: "Rewritten\n\n## Costs\n\nTwenty dollars",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().pending_revision).toBeNull();
      expect(await stored(page.id)).toEqual({
        ...response.json(),
        pending_revision: undefined,
      });
      expect((await stored(page.id))?.title).toBe("Severance pay");
      expect(await revisions()).toEqual([]);
      expect(await events()).toEqual([
        { action: "created", actor: TEST_EMPLOYEE.id },
        { action: "updated", actor: TEST_EDITOR.id },
      ]);
      const chunks = await db.execute<{ heading: string | null }>(
        sql`select heading from search_chunks order by ordinal`,
      );
      expect(chunks.rows).toEqual([{ heading: null }, { heading: "Costs" }]);
    },
  );
});

describe("reading the pending revision", () => {
  it("is open to every signed-in employee, and 404s when there is none", async () => {
    const page = await seedPage();
    const none = await as(READER, { url: `/pages/${page.id}/revision` });
    expect(none.statusCode).toBe(404);
    expect(none.json().error).toBe("not_found");

    await save(TEST_EDITOR, page, { title: "Severance pay" });

    const response = await as(READER, { url: `/pages/${page.id}/revision` });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toMatchObject({
      page_id: page.id,
      status: "draft",
      fields: { title: "Severance pay", visibility: "public" },
      live_updated_at: page.updated_at,
      created_by: TEST_EDITOR.id,
      contributors: [TEST_EDITOR.id],
    });
    const opened = await as(READER, { url: `/pages/${page.id}` });
    expect(opened.json()).toMatchObject({
      title: "Severance pay",
      updated_at: response.json().updated_at,
      pending_revision: { status: "draft" },
    });
  });

  it("needs a session", async () => {
    const page = await seedPage();
    const response = await app.inject({ url: `/pages/${page.id}/revision` });
    expect(response.statusCode).toBe(401);
  });
});

describe("a stale save to a public page", () => {
  it("409s against the revision's version, and leaves the revision as it was", async () => {
    const page = await seedPage();
    // Both opened the live page; the editor saved first.
    await save(TEST_EDITOR, page, { title: "First writer wins" });
    const [before] = await revisions();

    const response = await save(TEST_EMPLOYEE, page, {
      title: "Second writer clobbers",
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: "conflict",
      documentId: page.id,
    });
    expect(await revisions()).toEqual([before]);
  });

  it("accepts the version it just handed out, twice in a row", async () => {
    let current = await seedPage();
    for (const title of ["First edit", "Second edit"]) {
      const response = await save(TEST_EDITOR, current, { title });
      expect(response.statusCode).toBe(200);
      current = response.json();
    }
    expect((await stored(current.id))?.title).toBe(aPage().title);
  });
});

describe("changing a public page's visibility", () => {
  it("is refused to a non-approver, and the revision is unchanged", async () => {
    const page = await seedPage();
    const pending = (
      await save(TEST_EDITOR, page, { title: "Waiting" })
    ).json();
    const [before] = await revisions();

    const response = await save(TEST_EDITOR, pending, {
      visibility: "preview",
    });

    expect(response.statusCode).toBe(403);
    expect(await stored(page.id)).toEqual(page);
    expect(await revisions()).toEqual([before]);
  });

  it("by an approver taking it out of public view changes only its visibility, and discards the draft", async () => {
    const page = await seedPage();
    const pending = (
      await save(TEST_EDITOR, page, { title: "Waiting" })
    ).json();

    // The working copy, plus an edit of the approver's own: neither goes live.
    const response = await save(TEST_EMPLOYEE, pending, {
      visibility: "preview",
      title: "Waiting",
      body_markdown: "Slipped in with the unpublish",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      title: page.title,
      body_markdown: page.body_markdown,
      visibility: "preview",
      pending_revision: null,
    });
    expect(await stored(page.id)).toEqual({
      ...page,
      visibility: "preview",
      updated_at: response.json().updated_at,
    });
    expect(await revisions()).toEqual([]);
    expect((await app.inject({ url: `/pages?url=${ENTRY}` })).statusCode).toBe(
      404,
    );
    expect((await events()).at(-1)).toEqual({
      action: "unpublished",
      actor: TEST_EMPLOYEE.id,
    });
  });
});

describe("deleting a page", () => {
  it("deletes its pending revision with it", async () => {
    const page = await seedPage();
    await save(TEST_EDITOR, page, { title: "Waiting" });

    const response = await as(TEST_EMPLOYEE, {
      method: "DELETE",
      url: `/pages/${page.id}`,
    });

    expect(response.statusCode).toBe(204);
    expect(await revisions()).toEqual([]);
  });
});

describe("an approver taking a page out of public view", () => {
  it("moves its version past a revision that ran ahead of the clock, so a client holding that one conflicts", async () => {
    const page = await seedPage();
    // A clock behind the page's own version
    const editing = new PageEditing(
      new PostgresPages(db),
      () => new Date(Date.parse(page.updated_at) - 60_000),
      { allowSelfApproval: false },
    );
    const fields = (overrides: Record<string, unknown>) =>
      withDefaults(aPage({ category_id: page.category_id, ...overrides }));
    const pending = expectOk(
      await editing.save(
        page.id,
        fields({ title: "Waiting" }),
        new Date(page.updated_at),
        TEST_EDITOR,
      ),
    );
    expect(Date.parse(pending.updated_at)).toBe(
      Date.parse(page.updated_at) + 1,
    );

    expectOk(
      await editing.save(
        page.id,
        fields({ title: "Waiting", visibility: "preview" }),
        new Date(pending.updated_at),
        TEST_EMPLOYEE,
      ),
    );
    const stale = await editing.save(
      page.id,
      fields({ title: "Stale", visibility: "preview" }),
      new Date(pending.updated_at),
      TEST_EDITOR,
    );

    expect(stale.ok ? null : stale.error._tag).toBe("PageConflict");
    // Taking it out of view kept the live content.
    expect((await stored(page.id))?.title).toBe(page.title);
  });
});
