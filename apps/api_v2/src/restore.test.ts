/**
 * Restoring a version from a page's history (#3231, ADR 0080): a new change
 * from the page as it stands to that version's fields, never a rewind.
 */

import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance, InjectOptions } from "fastify";
import type { Database } from "./db";
import type { Employee } from "./modules/auth";
import { withDefaults } from "./modules/page";
import { restorableFields, VersionNotRestorable } from "./modules/page-history";
import { ok } from "./modules/result";
import { IF_UPDATED_AT } from "./routes/contracts";
import {
  aPage,
  createTestApp,
  createTestDb,
  createTestServices,
  SELF_APPROVAL,
  expectOk,
  TEST_EDITOR,
  TEST_EMPLOYEE,
  TEST_HTTP_CONFIG,
} from "./test-db";

const FIXTURES = [TEST_EMPLOYEE, TEST_EDITOR];

let app: FastifyInstance;
let db: Database;
let close: () => Promise<void>;
let services: ReturnType<typeof createTestServices>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  services = createTestServices(db, SELF_APPROVAL);
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

type Page = { id: string; updated_at: string; visibility: string };

const create = async (overrides: Record<string, unknown> = {}) =>
  expectOk(
    await services.editing.create(aPage(overrides), TEST_EMPLOYEE),
  ) as Page;

const save = async (page: Page, fields: Record<string, unknown>) =>
  (
    await as(TEST_EMPLOYEE, {
      method: "PUT",
      url: `/pages/${page.id}`,
      headers: { [IF_UPDATED_AT]: page.updated_at },
      payload: withDefaults(aPage({ visibility: page.visibility, ...fields })),
    })
  ).json() as Page;

const restore = (
  employee: Employee,
  page: Page,
  version: number,
  read: string | null = page.updated_at,
) =>
  as(employee, {
    method: "POST",
    url: `/pages/${page.id}/history/${version}/restore`,
    headers: read === null ? {} : { [IF_UPDATED_AT]: read },
  });

const history = async (page: Page) =>
  (await as(TEST_EMPLOYEE, { url: `/pages/${page.id}/history` })).json()
    .entries as Array<{
    version_no: number;
    action: string;
    actor: string;
    changed: string[];
    restored_from: number | null;
  }>;

describe("POST /pages/:id/history/:version/restore", () => {
  it("brings an earlier version back as a new reverted entry, keeping every entry before it", async () => {
    const created = await create({ visibility: "draft" });
    const renamed = await save(created, { title: "Renamed" });
    const rewritten = await save(renamed, {
      title: "Renamed",
      body_markdown: "New body",
    });

    const response = await restore(TEST_EDITOR, rewritten, 1);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      title: aPage().title,
      body_markdown: aPage().body_markdown,
      visibility: "draft",
    });
    expect(
      (await history(created)).map(
        ({ version_no, action, actor, changed, restored_from }) => ({
          version_no,
          action,
          actor,
          changed,
          restored_from,
        }),
      ),
    ).toEqual([
      {
        version_no: 4,
        action: "reverted",
        actor: TEST_EDITOR.id,
        changed: ["title", "body_markdown"],
        restored_from: 1,
      },
      {
        version_no: 3,
        action: "updated",
        actor: TEST_EMPLOYEE.id,
        changed: ["body_markdown"],
        restored_from: null,
      },
      {
        version_no: 2,
        action: "updated",
        actor: TEST_EMPLOYEE.id,
        changed: ["title"],
        restored_from: null,
      },
      {
        version_no: 1,
        action: "created",
        actor: TEST_EMPLOYEE.id,
        changed: [],
        restored_from: null,
      },
    ]);
  });

  it("keeps the page's current visibility", async () => {
    const created = await create({ visibility: "draft" });
    const previewed = await save(created, { visibility: "preview" });
    const renamed = await save(previewed, {
      visibility: "preview",
      title: "Renamed",
    });

    const response = await restore(TEST_EDITOR, renamed, 1);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      title: aPage().title,
      visibility: "preview",
    });
  });

  it("puts a public page's restore into its pending revision, leaving the live page as it is", async () => {
    const created = await create({ visibility: "draft" });
    const renamed = await save(created, { title: "Renamed" });
    // Made public by the fixtures' services, which allow self-approval.
    const live = expectOk(
      await services.editing.save(
        renamed.id,
        withDefaults(aPage({ title: "Renamed" })),
        new Date(renamed.updated_at),
        TEST_EMPLOYEE,
      ),
    ) as Page;
    const before = await history(created);

    const response = await restore(TEST_EDITOR, live, 1);

    expect(response.statusCode).toBe(200);
    const revision = (
      await as(TEST_EDITOR, { url: `/pages/${live.id}/revision` })
    ).json();
    expect(revision).toMatchObject({
      status: "draft",
      changes: [{ field: "title", live: "Renamed", proposed: aPage().title }],
    });
    expect(await history(created)).toEqual(before);
  });

  it("is refused without the version the editor read, or once the page has moved on", async () => {
    const created = await create({ visibility: "draft" });
    const renamed = await save(created, { title: "Renamed" });

    expect((await restore(TEST_EDITOR, renamed, 1, null)).statusCode).toBe(428);
    const stale = await restore(TEST_EDITOR, created, 1);
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ error: "conflict" });
    expect(await history(created)).toHaveLength(2);
  });

  it("404s a version the page's history doesn't have", async () => {
    const created = await create({ visibility: "draft" });

    const response = await restore(TEST_EDITOR, created, 9);

    expect(response.statusCode).toBe(404);
  });

  it("refuses a review step, which holds a revision rather than the page", async () => {
    const live = await create({ visibility: "public" });
    await save(live, { title: "Renamed" });
    await as(TEST_EDITOR, {
      method: "POST",
      url: `/pages/${live.id}/revision/submit`,
    });
    const submitted = (await history(live))[0];
    expect(submitted?.action).toBe("submitted");
    const current = (
      await as(TEST_EDITOR, { url: `/pages/${live.id}` })
    ).json() as Page;

    const response = await restore(
      TEST_EDITOR,
      current,
      submitted?.version_no ?? 0,
    );

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: "not_restorable" });
  });

  it("counts a restore as the restorer's change, so they can't then make the page public themselves", async () => {
    // Written and edited by the system, so only the restore is the approver's.
    const id = "66666666-6666-4666-8666-666666666666";
    await db.execute(
      sql`insert into content_pages (id, url, slug, title, visibility, body_markdown)
          values (${id}, '/restored', 'restored', 'First', 'preview', 'Body')`,
    );
    await db.execute(
      sql`update content_pages set title = 'Second' where id = ${id}`,
    );
    const page = (
      await as(TEST_EMPLOYEE, { url: `/pages/${id}` })
    ).json() as Page;
    const restored = (await restore(TEST_EMPLOYEE, page, 1)).json() as Page;

    const response = await as(TEST_EMPLOYEE, {
      method: "PUT",
      url: `/pages/${id}`,
      headers: { [IF_UPDATED_AT]: restored.updated_at },
      payload: { ...restored, visibility: "public" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("refuses a deletion, though a page created again with the same id keeps it in its history", async () => {
    const id = "77777777-7777-4777-8777-777777777777";
    await create({ id, visibility: "draft" });
    expectOk(await services.editing.delete(id, TEST_EMPLOYEE));
    const again = await create({ id, visibility: "draft" });
    expect((await history(again)).map(({ action }) => action)).toEqual([
      "created",
      "deleted",
      "created",
    ]);

    const response = await restore(TEST_EDITOR, again, 2);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: "not_restorable",
      message: "Version 2 is the page's deletion.",
    });
  });

  it("refuses a redacted entry for its redaction, not for its shape", async () => {
    const created = await create({ visibility: "draft" });
    const renamed = await save(created, { title: "Renamed" });
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.redacting', 'on', true)`);
      await tx.execute(sql`update change_events
        set snapshot = '{"redacted":true,"reason":"incident-42","by":"operator-test"}'
        where entity_id = ${created.id} and version_no = 1`);
    });

    const response = await restore(TEST_EDITOR, renamed, 1);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: "not_restorable",
      message: "Version 1 was removed from the history.",
    });
  });

  it("refuses an employee without the editor role", async () => {
    const created = await create({ visibility: "draft" });
    await db.execute(
      sql`delete from user_roles where user_id = ${TEST_EDITOR.id}`,
    );

    const response = await restore(TEST_EDITOR, created, 1);

    expect(response.statusCode).toBe(403);
  });
});

describe("the change history trigger during a restore", () => {
  it("marks only the restored page's update as reverted", async () => {
    const restored = await create({ visibility: "draft", url: "/a" });
    const other = await create({ visibility: "draft", url: "/b" });

    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.restored_page', ${restored.id}, true),
                   set_config('app.restored_from', '1', true)`,
      );
      await tx.execute(
        sql`update content_pages set title = 'Changed'
              where id in (${restored.id}, ${other.id})`,
      );
    });

    const latest = async (page: Page) => (await history(page))[0];
    expect(await latest(restored)).toMatchObject({
      action: "reverted",
      restored_from: 1,
    });
    expect(await latest(other)).toMatchObject({
      action: "updated",
      restored_from: null,
    });
  });
});

describe("restorableFields", () => {
  it("refuses a snapshot recorded before the page's current fields", () => {
    const { frontmatter: _, ...older } = withDefaults(aPage());

    const refused = restorableFields({
      versionNo: 3,
      action: "updated",
      snapshot: older,
    });

    expect(refused).toBeInstanceOf(VersionNotRestorable);
    expect((refused as VersionNotRestorable).message).toBe(
      "Version 3 was recorded in an older format that can't be restored.",
    );
  });
});
