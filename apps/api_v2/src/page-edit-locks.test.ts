import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import fc from "fast-check";
import pino from "pino";
import { EmployeeId } from "./modules/auth";
import { ok } from "./modules/result";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withDefaults } from "./modules/page";
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
  TEST_EMPLOYEE,
  TEST_HEADERS,
  type TestDb,
} from "./test-db";

let database: TestDb;
let app: FastifyInstance;
let services: ReturnType<typeof createTestServices>;
const tokenHeader = "x-page-edit-lock-token";

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
  services.editing.create(aPage(overrides), TEST_EMPLOYEE).then(expectOk);
const fields = () => withDefaults(aPage());

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
    expect(expectOk(await services.editing.get(page.id))).not.toBeNull();
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
      expect(expectOk(await services.editing.get(page.id))?.title).toBe(
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
    expect(expectOk(await services.editing.get(page.id))?.version).toBe(1);
  });

  it("does not let another employee use the holder's token", async () => {
    const page = await seedPage();
    const token = randomUUID();
    await acquire(page.id, token);
    const other = await createTestApp(database.db, {
      sessions: {
        findSession: async () =>
          ok({
            id: EmployeeId.parse("another-employee"),
            name: "Other editor",
            email: "other@example.com",
          }),
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
      expect(expectOk(await services.editing.get(page.id))?.version).toBe(2);
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
        payload: { ...fields(), version: 1 },
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
    const current = expectOk(await services.editing.get(page.id));
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
    expect(expectOk(await services.editing.get(page.id))).toEqual(page);
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
          for (const title of titles) {
            await database.db
              .update(contentPages)
              .set({ title, version: 1, updatedAt: new Date(page.updated_at) })
              .where(eq(contentPages.id, page.id));
            version += 1;
            expect(expectOk(await services.editing.get(page.id))?.version).toBe(
              version,
            );
          }
        },
      ),
      { numRuns: 10 },
    );
  });
});
