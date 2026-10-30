import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import fc from "fast-check";
import pino from "pino";
import { ok } from "./modules/result";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withDefaults, type PageId } from "./modules/page";
import {
  categories,
  contentPages,
  changeEvents,
  searchChunks,
  pageEditLocks,
} from "./schema";
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
  type TestDb,
} from "./test-db";

let database: TestDb;
let app: FastifyInstance;
let services: ReturnType<typeof createTestServices>;
const tokenHeader = "x-page-edit-lock-token";
/** Pages whose saves go live; a public page's wait in a revision (revisions.test.ts covers those). */
const aLivePage = (overrides: Record<string, unknown> = {}) =>
  aPage({ visibility: "preview", ...overrides });

beforeEach(async () => {
  database = await createTestDb();
  services = createTestServices(database.db);
  app = await createTestApp(database.db);
});
afterEach(async () => {
  await app.close();
  await database.close();
});

const seedPage = (overrides: Record<string, unknown> = {}) =>
  services.editing.create(aLivePage(overrides), TEST_EMPLOYEE).then(expectOk);
const fields = () => withDefaults(aLivePage());

async function acquire(
  pageId: string,
  token: string,
  generation = 0,
  action = "acquire",
) {
  const response = await app.inject({
    method: "POST",
    url: `/pages/${pageId}/lock`,
    headers: { ...TEST_HEADERS, [tokenHeader]: token },
    payload: { action, expectedLockGeneration: generation },
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json();
}

describe("lease authorization", () => {
  it("cannot confirm editing authority after the editor role is revoked", async () => {
    const page = await seedPage();
    const token = randomUUID();
    await acquire(page.id, token);
    await database.db.execute(
      sql`delete from user_roles where user_id = ${TEST_EMPLOYEE.id} and role = 'editor'`,
    );
    const headers = { ...TEST_HEADERS, [tokenHeader]: token };
    const pageRead = await app.inject({ url: `/pages/${page.id}`, headers });
    expect(pageRead.statusCode).toBe(200);
    const presence = await app.inject({
      url: `/pages/${page.id}/lock`,
      headers,
    });
    expect(presence.statusCode).toBe(403);
    const renewal = await app.inject({
      method: "PUT",
      url: `/pages/${page.id}/lock`,
      headers,
      payload: { activitySequence: 1 },
    });
    expect(renewal.statusCode).toBe(403);
  });
});

describe("required content versions", () => {
  it("returns a numeric version with a created and fetched page", async () => {
    const page = await seedPage();
    const response = await app.inject({
      url: `/pages/${page.id}`,
      headers: TEST_HEADERS,
    });
    expect(response.json().version).toBe(1);
  });

  it("refuses a PUT without a version, including the old timestamp header", async () => {
    const page = await seedPage();
    const response = await app.inject({
      method: "PUT",
      url: `/pages/${page.id}`,
      headers: { ...TEST_HEADERS, "if-updated-at": page.updated_at },
      payload: fields(),
    });
    expect(response.statusCode).toBe(400);
  });

  it("refuses a DELETE without a version", async () => {
    const page = await seedPage();
    const response = await app.inject({
      method: "DELETE",
      url: `/pages/${page.id}`,
      headers: TEST_HEADERS,
    });
    expect(response.statusCode).toBe(400);
    expect(expectOk(await services.editing.open(page.id))).not.toBeNull();
  });

  it.each([0, -1, 1.5, "1", 2_147_483_648])(
    "rejects invalid JSON version %s",
    async (version) => {
      const page = await seedPage();
      const response = await app.inject({
        method: "PUT",
        url: `/pages/${page.id}`,
        headers: TEST_HEADERS,
        payload: { ...fields(), version },
      });
      expect(response.statusCode).toBe(400);
    },
  );

  it("refuses repeated DELETE version parameters", async () => {
    const page = await seedPage();
    const response = await app.inject({
      method: "DELETE",
      url: `/pages/${page.id}?version=1&version=1`,
      headers: TEST_HEADERS,
    });
    expect(response.statusCode).toBe(400);
  });

  it.each(["PUT", "DELETE"] as const)(
    "refuses an outdated version on %s before checking ownership",
    async (method) => {
      const page = await seedPage();
      await database.db
        .update(contentPages)
        .set({ title: "Another author's title" })
        .where(eq(contentPages.id, page.id));
      const response = await app.inject({
        method,
        url: `/pages/${page.id}${method === "DELETE" ? "?version=1" : ""}`,
        headers: { ...TEST_HEADERS, [tokenHeader]: randomUUID() },
        ...(method === "PUT" ? { payload: { ...fields(), version: 1 } } : {}),
      });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        error: "page_version_conflict",
        pageId: page.id,
      });
      expect(expectOk(await services.editing.open(page.id))?.title).toBe(
        "Another author's title",
      );
    },
  );

  it("invalidates the child's version when its parent's category cascades", async () => {
    const inserted = await database.db
      .insert(categories)
      .values([
        { slug: "first", title: "First" },
        { slug: "second", title: "Second" },
      ])
      .returning();
    const [first, second] = inserted;
    if (!first || !second) throw new Error("Missing test categories");
    const parent = await seedPage({ category_id: first.id });
    const child = await seedPage({
      url: "/child",
      parent_id: parent.id,
      category_id: first.id,
    });
    await database.db
      .update(contentPages)
      .set({ categoryId: second.id })
      .where(eq(contentPages.id, parent.id));
    const response = await app.inject({
      method: "DELETE",
      url: `/pages/${child.id}?version=1`,
      headers: { ...TEST_HEADERS, [tokenHeader]: randomUUID() },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("page_version_conflict");
  });
});

describe("editing-session ownership", () => {
  it("fences same-user tabs after takeover, including old release and renewal", async () => {
    const page = await seedPage();
    const firstToken = randomUUID();
    const secondToken = randomUUID();
    const first = await acquire(page.id, firstToken);
    const second = await acquire(
      page.id,
      secondToken,
      first.lockGeneration,
      "takeover",
    );
    const renewed = await app.inject({
      method: "PUT",
      url: `/pages/${page.id}/lock`,
      headers: { ...TEST_HEADERS, [tokenHeader]: firstToken },
      payload: { activitySequence: 1 },
    });
    expect(renewed.statusCode).toBe(409);
    expect(renewed.json().error).toBe("page_edit_lock_lost");
    const released = await app.inject({
      method: "DELETE",
      url: `/pages/${page.id}/lock`,
      headers: { ...TEST_HEADERS, [tokenHeader]: firstToken },
    });
    expect(released.statusCode).toBe(200);
    const status = await app.inject({
      url: `/pages/${page.id}/lock`,
      headers: { ...TEST_HEADERS, [tokenHeader]: secondToken },
    });
    expect(status.json()).toMatchObject({
      state: "held",
      ownedByCaller: true,
      lockGeneration: second.lockGeneration,
    });
    const saved = await app.inject({
      method: "PUT",
      url: `/pages/${page.id}`,
      headers: { ...TEST_HEADERS, [tokenHeader]: firstToken },
      payload: { ...fields(), version: 1 },
    });
    expect(saved.statusCode).toBe(409);
    expect(saved.json().error).toBe("page_edit_lock_lost");
  });

  it("does not let a delayed acquisition replace a subsequent released grant", async () => {
    const page = await seedPage();
    const firstToken = randomUUID();
    const secondToken = randomUUID();
    const first = await acquire(page.id, firstToken);
    await acquire(page.id, secondToken, first.lockGeneration, "takeover");
    await app.inject({
      method: "DELETE",
      url: `/pages/${page.id}/lock`,
      headers: { ...TEST_HEADERS, [tokenHeader]: secondToken },
    });
    const delayed = await app.inject({
      method: "POST",
      url: `/pages/${page.id}/lock`,
      headers: { ...TEST_HEADERS, [tokenHeader]: firstToken },
      payload: { action: "acquire", expectedLockGeneration: 0 },
    });
    expect(delayed.statusCode).toBe(409);
    expect(delayed.json().error).toBe("page_edit_lock_conflict");
  });

  it("requires ownership even when the content version is current", async () => {
    const page = await seedPage();
    for (const method of ["PUT", "DELETE"] as const) {
      const response = await app.inject({
        method,
        url: `/pages/${page.id}${method === "DELETE" ? "?version=1" : ""}`,
        headers: TEST_HEADERS,
        ...(method === "PUT" ? { payload: { ...fields(), version: 1 } } : {}),
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe("page_edit_lock_required");
    }
  });

  it("returns duplicate acquisition without extending it and never exposes credentials", async () => {
    const page = await seedPage();
    const token = randomUUID();
    const first = await acquire(page.id, token);
    const repeated = await acquire(page.id, token);
    expect(repeated).toMatchObject({
      lockGeneration: first.lockGeneration,
      lockExpiresAt: first.lockExpiresAt,
    });
    const status = await app.inject({
      url: `/pages/${page.id}/lock`,
      headers: TEST_HEADERS,
    });
    expect(status.json()).toMatchObject({
      state: "held",
      ownedByCaller: false,
      holderName: TEST_EMPLOYEE.name,
    });
    for (const secret of [token, TEST_EMPLOYEE.email, TEST_EMPLOYEE.id])
      expect(status.body).not.toContain(secret);
    expect(expectOk(await services.editing.open(page.id))?.version).toBe(1);
  });

  it("does not let another employee use the holder's token", async () => {
    const page = await seedPage();
    const token = randomUUID();
    await acquire(page.id, token);
    const other = await createTestApp(database.db, {
      sessions: {
        findSession: async () => ok(TEST_EDITOR),
      },
    });
    try {
      const response = await other.inject({
        method: "PUT",
        url: `/pages/${page.id}`,
        headers: { ...TEST_HEADERS, [tokenHeader]: token },
        payload: { ...fields(), version: 1 },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe("page_edit_lock_lost");
    } finally {
      await other.close();
    }
  });

  it("observes expiry across API instances and cannot revive the old acquisition", async () => {
    const page = await seedPage();
    const token = randomUUID();
    const first = await acquire(page.id, token);
    await database.db
      .update(pageEditLocks)
      .set({ lockExpiresAt: new Date(0) })
      .where(eq(pageEditLocks.pageId, page.id));
    const other = await createTestApp(database.db);
    try {
      const renewed = await other.inject({
        method: "PUT",
        url: `/pages/${page.id}/lock`,
        headers: { ...TEST_HEADERS, [tokenHeader]: token },
        payload: { activitySequence: 100 },
      });
      expect(renewed.statusCode).toBe(409);
      expect(renewed.json().error).toBe("page_edit_lock_lost");
      const status = await other.inject({
        url: `/pages/${page.id}/lock`,
        headers: TEST_HEADERS,
      });
      expect(status.json()).toMatchObject({
        state: "unheld",
        lockGeneration: first.lockGeneration,
      });
      const next = await acquire(page.id, randomUUID(), first.lockGeneration);
      expect(next.lockGeneration).toBe(first.lockGeneration + 1);
    } finally {
      await other.close();
    }
  });

  it("caps duplicate heartbeats at the idle deadline without a browser release", async () => {
    const page = await seedPage();
    const token = randomUUID();
    await acquire(page.id, token);
    await database.db.execute(
      sql`update page_edit_locks set last_activity_at = clock_timestamp() - interval '11 minutes 50 seconds' where page_id = ${page.id}`,
    );
    const renew = () =>
      app.inject({
        method: "PUT",
        url: `/pages/${page.id}/lock`,
        headers: { ...TEST_HEADERS, [tokenHeader]: token },
        payload: { activitySequence: 0 },
      });
    const first = (await renew()).json();
    const second = (await renew()).json();
    expect(first.state).toBe("held");
    expect(first.lockExpiresAt).toBe(first.idleExpiresAt);
    expect(second.lastActivityAt).toBe(first.lastActivityAt);
    expect(second.lockExpiresAt).toBe(first.lockExpiresAt);
    await database.db
      .update(pageEditLocks)
      .set({ lockExpiresAt: new Date(0) })
      .where(eq(pageEditLocks.pageId, page.id));
    expect((await renew()).statusCode).toBe(409);
  });

  it("allows real editing to advance activity but does not let older heartbeats move it back", async () => {
    const page = await seedPage();
    const token = randomUUID();
    await acquire(page.id, token);
    const renewed = await app.inject({
      method: "PUT",
      url: `/pages/${page.id}/lock`,
      headers: { ...TEST_HEADERS, [tokenHeader]: token },
      payload: { activitySequence: 2 },
    });
    const older = await app.inject({
      method: "PUT",
      url: `/pages/${page.id}/lock`,
      headers: { ...TEST_HEADERS, [tokenHeader]: token },
      payload: { activitySequence: 1 },
    });
    expect(older.json()).toMatchObject({
      activitySequence: 2,
      lastActivityAt: renewed.json().lastActivityAt,
    });
  });
});

describe("safe ownership diagnostics", () => {
  it("does not emit a credential carried by a database failure", async () => {
    const page = await seedPage();
    const token = randomUUID();
    const messages: string[] = [];
    const logged = await createTestApp(database.db, {
      logger: pino(
        { level: "error" },
        {
          write: (message) => {
            messages.push(message);
          },
        },
      ),
    });
    try {
      await database.pool
        .query(`create function fail_test_claim() returns trigger language plpgsql as $$ begin raise exception 'refused credential %', new.token; end $$;
        create trigger fail_test_claim before insert on page_edit_locks for each row execute function fail_test_claim();`);
      const response = await logged.inject({
        method: "POST",
        url: `/pages/${page.id}/lock`,
        headers: { ...TEST_HEADERS, [tokenHeader]: token },
        payload: { action: "acquire", expectedLockGeneration: 0 },
      });
      expect(response.statusCode).toBe(500);
      expect(messages.join("")).toContain("writePageEditLock");
      for (const secret of [token, TEST_HEADERS.cookie, TEST_EMPLOYEE.email]) {
        expect(messages.join("") + response.body).not.toContain(secret);
      }
    } finally {
      await logged.close();
    }
  });
});

describe("transaction serialization", () => {
  it("has one winner for simultaneous same-version saves across instances", async () => {
    const page = await seedPage();
    const token = randomUUID();
    await acquire(page.id, token);
    const other = await createTestApp(database.db);
    try {
      const responses = await Promise.all(
        [app, other].map((instance, index) =>
          instance.inject({
            method: "PUT",
            url: `/pages/${page.id}`,
            headers: { ...TEST_HEADERS, [tokenHeader]: token },
            payload: { ...fields(), version: 1, title: `Writer ${index}` },
          }),
        ),
      );
      expect(responses.map((response) => response.statusCode).sort()).toEqual([
        200, 409,
      ]);
      expect(expectOk(await services.editing.open(page.id))?.version).toBe(2);
      expect(await database.db.select().from(changeEvents)).toHaveLength(2);
    } finally {
      await other.close();
    }
  });

  it("serializes a save against deletion of the same reviewed version", async () => {
    const page = await seedPage();
    const token = randomUUID();
    await acquire(page.id, token);
    const responses = await Promise.all([
      app.inject({
        method: "PUT",
        url: `/pages/${page.id}`,
        headers: { ...TEST_HEADERS, [tokenHeader]: token },
        // A save that changes nothing keeps the version, so this one changes something.
        payload: { ...fields(), version: 1, title: "Saved before deletion" },
      }),
      app.inject({
        method: "DELETE",
        url: `/pages/${page.id}?version=1`,
        headers: { ...TEST_HEADERS, [tokenHeader]: token },
      }),
    ]);
    expect(
      responses.filter((response) => response.statusCode < 300),
    ).toHaveLength(1);
    expect(
      responses.filter((response) => [404, 409].includes(response.statusCode)),
    ).toHaveLength(1);
  });

  it("orders takeover with a save, then fences the displaced token even with a fresh version", async () => {
    const page = await seedPage();
    const oldToken = randomUUID();
    const first = await acquire(page.id, oldToken);
    const [saved, takeover] = await Promise.all([
      app.inject({
        method: "PUT",
        url: `/pages/${page.id}`,
        headers: { ...TEST_HEADERS, [tokenHeader]: oldToken },
        payload: { ...fields(), version: 1, title: "Old owner" },
      }),
      acquire(page.id, randomUUID(), first.lockGeneration, "takeover"),
    ]);
    expect([200, 409]).toContain(saved.statusCode);
    expect(takeover.lockGeneration).toBe(first.lockGeneration + 1);
    const current = expectOk(await services.editing.open(page.id));
    if (!current) throw new Error("Missing test page");
    const late = await app.inject({
      method: "PUT",
      url: `/pages/${page.id}`,
      headers: { ...TEST_HEADERS, [tokenHeader]: oldToken },
      payload: { ...current, title: "Late overwrite" },
    });
    expect(late.json().error).toBe("page_edit_lock_lost");
  });

  it("rolls content, version and search changes back when auditing fails", async () => {
    const page = await seedPage();
    const token = randomUUID();
    await acquire(page.id, token);
    const searchBefore = await database.db.select().from(searchChunks);
    await database.pool
      .query(`create function refuse_test_audit() returns trigger language plpgsql as $$ begin raise exception 'audit unavailable'; end $$;
      create trigger refuse_test_audit before insert on change_events for each row execute function refuse_test_audit();`);
    const response = await app.inject({
      method: "PUT",
      url: `/pages/${page.id}`,
      headers: { ...TEST_HEADERS, [tokenHeader]: token },
      payload: {
        ...fields(),
        version: 1,
        body_markdown: "Changed search text",
      },
    });
    expect(response.statusCode).toBe(500);
    expect(expectOk(await services.editing.open(page.id))).toEqual({
      ...page,
      pending_revision: null,
    });
    expect(await database.db.select().from(searchChunks)).toEqual(searchBefore);
    expect(await database.db.select().from(changeEvents)).toHaveLength(1);
  });

  it("advances versions for generated updates even with fixed timestamps and attempted counter resets", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ maxLength: 20 }), { minLength: 1, maxLength: 10 }),
        async (titles) => {
          const page = await seedPage({ url: `/generated-${randomUUID()}` });
          let version = 1;
          let previous = page.title;
          for (const title of titles) {
            await database.db
              .update(contentPages)
              .set({ title, version: 1, updatedAt: new Date(page.updated_at) })
              .where(eq(contentPages.id, page.id));
            // A write that changes nothing is not a new version (017).
            if (title !== previous) version += 1;
            previous = title;
            expect(
              expectOk(await services.editing.open(page.id))?.version,
            ).toBe(version);
          }
        },
      ),
      { numRuns: 10 },
    );
  });
});

describe("pending revisions and review under exclusive editing", () => {
  /** An app whose every request is `employee`'s; roles come from the database. */
  const appAs = (employee: typeof TEST_EMPLOYEE) =>
    createTestApp(database.db, {
      sessions: { findSession: async () => ok(employee) },
    });
  const save = (
    instance: FastifyInstance,
    pageId: string,
    token: string,
    version: number,
    title: string,
  ) =>
    instance.inject({
      method: "PUT",
      url: `/pages/${pageId}`,
      headers: { ...TEST_HEADERS, [tokenHeader]: token },
      payload: { ...withDefaults(aPage({ title })), version },
    });
  const review = (
    instance: FastifyInstance,
    pageId: string,
    step: "submit" | "reject" | "publish",
    payload: Record<string, unknown>,
  ) =>
    instance.inject({
      method: "POST",
      url: `/pages/${pageId}/revision/${step}`,
      headers: TEST_HEADERS,
      payload,
    });
  /** A public page, made public as AUTH_BYPASS would, so its saves go into a revision. */
  const seedPublicPage = () =>
    createTestServices(database.db, SELF_APPROVAL)
      .editing.create(aPage(), TEST_EMPLOYEE)
      .then(expectOk);
  const stored = async (id: PageId) =>
    (
      await database.db
        .select()
        .from(contentPages)
        .where(eq(contentPages.id, id))
    )[0];
  const pageEvents = async () =>
    (
      await database.db
        .select({ action: changeEvents.action, actor: changeEvents.actor })
        .from(changeEvents)
        .where(eq(changeEvents.entityKind, "content_page"))
        .orderBy(changeEvents.versionNo)
    ).map(({ action, actor }) => `${action}:${actor}`);

  it("lets one of two same-version saves of a public page's revision win, across instances", async () => {
    const page = await seedPublicPage();
    const token = randomUUID();
    await acquire(page.id, token);
    const other = await createTestApp(database.db);
    try {
      const responses = await Promise.all(
        [app, other].map((instance, index) =>
          save(instance, page.id, token, page.version, `Writer ${index}`),
        ),
      );
      expect(responses.map(({ statusCode }) => statusCode).sort()).toEqual([
        200, 409,
      ]);
      const lost = responses.find(({ statusCode }) => statusCode === 409);
      expect(lost?.json().error).toBe("page_version_conflict");
      const won = responses.find(({ statusCode }) => statusCode === 200);
      const opened = expectOk(await services.editing.open(page.id));
      expect(opened).toMatchObject({
        title: won?.json().title,
        version: won?.json().version,
        pending_revision: { status: "draft" },
      });
      // The live page is untouched, and a draft's save is not history.
      expect((await stored(page.id))?.title).toBe(page.title);
      expect((await stored(page.id))?.updatedAt.toISOString()).toBe(
        page.updated_at,
      );
      expect(await pageEvents()).toEqual([`created:${TEST_EMPLOYEE.id}`]);
    } finally {
      await other.close();
    }
  });

  it("lets an approver publish while an editor holds the lease, then refuses the editor's stale save by version", async () => {
    const page = await seedPublicPage();
    const editor = await appAs(TEST_EDITOR);
    try {
      const token = randomUUID();
      const acquired = await editor.inject({
        method: "POST",
        url: `/pages/${page.id}/lock`,
        headers: { ...TEST_HEADERS, [tokenHeader]: token },
        payload: { action: "acquire", expectedLockGeneration: 0 },
      });
      expect(acquired.statusCode).toBe(200);
      const drafted = await save(editor, page.id, token, page.version, "Draft");
      expect(drafted.statusCode).toBe(200);
      const submitted = await review(editor, page.id, "submit", {
        version: drafted.json().version,
      });
      expect(submitted.statusCode).toBe(200);
      expect(submitted.json().version).toBeGreaterThan(drafted.json().version);

      // TEST_EMPLOYEE neither wrote nor submitted it, and holds no lease.
      const published = await review(app, page.id, "publish", {
        version: submitted.json().version,
      });

      expect(published.statusCode).toBe(200);
      expect(published.json()).toMatchObject({
        title: "Draft",
        pending_revision: null,
        version: (await stored(page.id))?.version,
      });
      const lease = await editor.inject({
        url: `/pages/${page.id}/lock`,
        headers: { ...TEST_HEADERS, [tokenHeader]: token },
      });
      expect(lease.json()).toMatchObject({
        state: "held",
        ownedByCaller: true,
      });
      const stale = await save(
        editor,
        page.id,
        token,
        submitted.json().version,
        "Over the approval",
      );
      expect(stale.statusCode).toBe(409);
      expect(stale.json().error).toBe("page_version_conflict");
      expect((await stored(page.id))?.title).toBe("Draft");
    } finally {
      await editor.close();
    }
  });

  it.each(["reject", "publish"] as const)(
    "refuses to %s a version the approver read before a later save, changing nothing",
    async (step) => {
      const page = await seedPublicPage();
      const editor = await appAs(TEST_EDITOR);
      try {
        const token = randomUUID();
        await editor.inject({
          method: "POST",
          url: `/pages/${page.id}/lock`,
          headers: { ...TEST_HEADERS, [tokenHeader]: token },
          payload: { action: "acquire", expectedLockGeneration: 0 },
        });
        const drafted = await save(editor, page.id, token, page.version, "R1");
        const submitted = await review(editor, page.id, "submit", {
          version: drafted.json().version,
        });
        const read = submitted.json().version;
        const resaved = await save(editor, page.id, token, read, "R2");
        expect(resaved.statusCode).toBe(200);
        const before = await stored(page.id);

        const response = await review(app, page.id, step, {
          version: read,
          comment: "Too late",
        });

        expect(response.statusCode).toBe(409);
        expect(response.json()).toMatchObject({
          error: "page_version_conflict",
          pageId: page.id,
        });
        expect(await stored(page.id)).toEqual(before);
        expect(
          expectOk(await services.editing.open(page.id))?.pending_revision,
        ).toEqual({ status: "submitted", comment: null });
      } finally {
        await editor.close();
      }
    },
  );

  it.each([
    ["missing", {}],
    ["zero", { version: 0 }],
    ["a string", { version: "1" }],
    ["a timestamp", { version: "2026-01-01T00:00:00.000Z" }],
  ])("400s a review step whose version is %s", async (_why, payload) => {
    const page = await seedPublicPage();
    for (const step of ["submit", "reject", "publish"] as const) {
      const response = await review(app, page.id, step, {
        ...payload,
        comment: "Why",
      });
      expect(response.statusCode, step).toBe(400);
    }
  });

  it("refuses a decision to an editor without the approver role, with a current version", async () => {
    const page = await seedPublicPage();
    const editor = await appAs(TEST_EDITOR);
    try {
      for (const step of ["reject", "publish"] as const) {
        const response = await review(editor, page.id, step, {
          version: page.version,
          comment: "No",
        });
        expect(response.statusCode, step).toBe(403);
      }
    } finally {
      await editor.close();
    }
  });

  it("keeps lease activity out of the page's content, stamps, version and history", async () => {
    const page = await seedPage();
    const before = await stored(page.id);
    const events = await database.db.select().from(changeEvents);
    const token = randomUUID();
    const first = await acquire(page.id, token);
    await app.inject({
      method: "PUT",
      url: `/pages/${page.id}/lock`,
      headers: { ...TEST_HEADERS, [tokenHeader]: token },
      payload: { activitySequence: 1 },
    });
    await acquire(page.id, randomUUID(), first.lockGeneration, "takeover");
    await app.inject({
      method: "DELETE",
      url: `/pages/${page.id}/lock`,
      headers: { ...TEST_HEADERS, [tokenHeader]: token },
    });

    expect(await stored(page.id)).toEqual(before);
    expect(await database.db.select().from(changeEvents)).toEqual(events);
  });
});
