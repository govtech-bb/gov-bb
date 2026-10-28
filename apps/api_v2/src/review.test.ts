/**
 * Reviewing pending revisions (#3199): an editor submits a draft revision,
 * and an approver who neither changed nor submitted it rejects it with a
 * comment or publishes it to the live page.
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

/** An approver who has written nothing, so may decide on anyone's change. */
const APPROVER: Employee = {
  id: UserId.parse("approver-test"),
  email: "approver@govtech.bb",
  name: "Test approver",
  roles: ["approver"],
};
const FIXTURES = [TEST_EMPLOYEE, TEST_EDITOR, APPROVER];

let app: FastifyInstance;
let db: Database;
let close: () => Promise<void>;
let services: ReturnType<typeof createTestServices>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  services = createTestServices(db);
  await db.execute(
    sql`insert into auth_user (id, name, email, "emailVerified")
        values (${APPROVER.id}, ${APPROVER.name}, ${APPROVER.email}, true)`,
  );
  await db.execute(
    sql`insert into user_roles (user_id, role) values (${APPROVER.id}, 'approver')`,
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

/** A public page in a category, so the site lists it as well as serving it. */
const seedPage = async (overrides: Record<string, unknown> = {}) => {
  const [category] = await db
    .insert(categories)
    .values({ slug: "money-financial-support", title: "Money" })
    .onConflictDoNothing()
    .returning();
  const categoryId =
    category?.id ??
    (await db.select().from(categories))[0]?.id ??
    expect.unreachable();
  return expectOk(
    await services.editing.create(
      aPage({
        category_id: categoryId,
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
  page: { id: string; updated_at: string; category_id?: string | null },
  fields: Record<string, unknown>,
) =>
  as(employee, {
    method: "PUT",
    url: `/pages/${page.id}`,
    headers: { [IF_UPDATED_AT]: page.updated_at },
    payload: withDefaults(aPage({ category_id: page.category_id, ...fields })),
  });

/** The page's current revision's version, as an approver who has just read it holds it. */
const currentVersion = async (pageId: string) =>
  (await as(APPROVER, { url: `/pages/${pageId}/revision` })).json()
    .updated_at as string | undefined;

/**
 * A review step on a page's revision. A decision sends the version just read
 * unless the test names one; `null` sends none.
 */
const review = async (
  employee: Employee,
  pageId: string,
  step: "submit" | "reject" | "publish",
  options: { version?: string | null; comment?: string } = {},
) => {
  const version =
    options.version === undefined && step !== "submit"
      ? await currentVersion(pageId)
      : options.version;
  return as(employee, {
    method: "POST",
    url: `/pages/${pageId}/revision/${step}`,
    headers: version ? { [IF_UPDATED_AT]: version } : {},
    ...(step === "reject"
      ? { payload: { comment: options.comment ?? "Check the fees." } }
      : {}),
  });
};

/** A public page with a draft revision by the editor, and the revision's version. */
const drafted = async (fields: Record<string, unknown> = {}) => {
  const page = await seedPage();
  const response = await save(TEST_EDITOR, page, {
    title: "Severance pay",
    body_markdown: "Rewritten\n\n## Costs\n\nTwenty dollars",
    ...fields,
  });
  expect(response.statusCode).toBe(200);
  return { page, version: response.json().updated_at as string };
};

/** As `drafted`, and submitted for review by the editor. */
const submitted = async (fields: Record<string, unknown> = {}) => {
  const draft = await drafted(fields);
  expect((await review(TEST_EDITOR, draft.page.id, "submit")).statusCode).toBe(
    200,
  );
  return draft;
};

const revisions = () =>
  db.select().from(pageRevisions).orderBy(pageRevisions.createdAt);
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

describe("submitting a revision", () => {
  it("records the submitter and returns what the revision changes", async () => {
    const { page, version } = await drafted();

    const response = await review(TEST_EDITOR, page.id, "submit", { version });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "submitted",
      submitted_by: TEST_EDITOR.id,
      decided_by: null,
      updated_at: version,
      changes: [
        { field: "title", live: page.title, proposed: "Severance pay" },
        {
          field: "body_markdown",
          live: page.body_markdown,
          proposed: "Rewritten\n\n## Costs\n\nTwenty dollars",
        },
      ],
    });
    const opened = await as(TEST_EDITOR, { url: `/pages/${page.id}` });
    expect(opened.json()).toMatchObject({
      updated_at: version,
      pending_revision: { status: "submitted", comment: null },
    });
  });

  it("404s when the page has no draft, and 409s when it is already submitted", async () => {
    const { page: waiting } = await submitted();
    const page = await seedPage({ url: "/money-financial-support/other" });
    const none = await review(TEST_EDITOR, page.id, "submit");
    expect(none.statusCode).toBe(404);
    expect(none.json().error).toBe("not_found");

    const again = await review(TEST_EDITOR, waiting.id, "submit");
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({
      error: "under_review",
      message: "This change is already waiting for review.",
    });
  });
});

describe("an editor", () => {
  it("can submit a revision but can't publish or reject it", async () => {
    const { page } = await submitted();
    const before = await publicResponses();

    for (const step of ["publish", "reject"] as const) {
      const response = await review(TEST_EDITOR, page.id, step);
      expect(response.statusCode, step).toBe(403);
      expect(response.json(), step).toEqual({
        error: "forbidden",
        message: "You need the approver role to do this.",
      });
    }
    expect(await publicResponses()).toEqual(before);
    expect((await revisions())[0]?.status).toBe("submitted");
  });
});

describe("publishing a revision", () => {
  it("writes it to the live page, so the site, search and navigation show it", async () => {
    const { page, version } = await submitted();
    const before = await publicResponses();

    const response = await review(APPROVER, page.id, "publish", { version });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      title: "Severance pay",
      pending_revision: null,
    });
    expect(response.json().updated_at > version).toBe(true);
    const site = await app.inject({ url: `/pages?url=${ENTRY}` });
    expect(site.json()).toMatchObject({
      frontmatter: { title: "Severance pay" },
      body_markdown: "Rewritten\n\n## Costs\n\nTwenty dollars",
    });
    const after = await publicResponses();
    expect(after).not.toEqual(before);
    expect(JSON.stringify(after[2]?.body)).toContain("Severance pay");
    expect(JSON.stringify(after[3]?.body)).toContain("Severance pay");
    expect(JSON.stringify(after[4]?.body)).toContain("Twenty dollars");
    expect(JSON.stringify(after[4]?.body)).not.toContain("Ten dollars");
    expect(await events()).toEqual([
      { action: "created", actor: TEST_EMPLOYEE.id },
      { action: "submitted", actor: TEST_EDITOR.id },
      { action: "approved", actor: APPROVER.id },
      { action: "updated", actor: APPROVER.id },
    ]);
    const [revision] = await revisions();
    expect(revision).toMatchObject({
      status: "published",
      submittedBy: TEST_EDITOR.id,
      decidedBy: APPROVER.id,
    });
    expect(revision?.decidedAt?.toISOString()).toBe(response.json().updated_at);
    expect(
      (await as(TEST_EDITOR, { url: `/pages/${page.id}/revision` })).statusCode,
    ).toBe(404);
  });

  it("lets the next save start a new draft over the published page", async () => {
    const { page } = await submitted();
    const published = (await review(APPROVER, page.id, "publish")).json();

    const response = await save(TEST_EDITOR, published, { title: "Again" });

    expect(response.statusCode).toBe(200);
    expect(response.json().pending_revision).toEqual({
      status: "draft",
      comment: null,
    });
    expect((await revisions()).map(({ status }) => status)).toEqual([
      "published",
      "draft",
    ]);
  });

  it("404s with nothing waiting, and 409s for a draft not yet submitted", async () => {
    const { page: drafty } = await drafted();
    const page = await seedPage({ url: "/money-financial-support/other" });
    expect(
      (
        await review(APPROVER, page.id, "publish", {
          version: page.updated_at,
        })
      ).statusCode,
    ).toBe(404);

    const response = await review(APPROVER, drafty.id, "publish");
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("not_submitted");
  });
});

describe("rejecting a revision", () => {
  it("keeps the comment and the rejecter, and leaves the live page unchanged", async () => {
    const { page, version } = await submitted();
    const before = await publicResponses();

    const response = await review(APPROVER, page.id, "reject", {
      version,
      comment: "  The fee is wrong.  ",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "rejected",
      comment: "The fee is wrong.",
      decided_by: APPROVER.id,
    });
    // Rejecting moves the version, so an editor holding the old one reloads.
    const rejected = response.json().updated_at;
    expect(rejected > version).toBe(true);
    expect(await publicResponses()).toEqual(before);
    expect(await stored(page.id)).toEqual(page);
    expect(await events()).toEqual([
      { action: "created", actor: TEST_EMPLOYEE.id },
      { action: "submitted", actor: TEST_EDITOR.id },
      { action: "rejected", actor: APPROVER.id },
    ]);
    const opened = await as(TEST_EDITOR, { url: `/pages/${page.id}` });
    expect(opened.json()).toMatchObject({
      title: "Severance pay",
      updated_at: rejected,
      pending_revision: { status: "rejected", comment: "The fee is wrong." },
    });
  });

  it("refuses a save from a tab opened before the rejection, so it sees why", async () => {
    const { page, version } = await submitted();
    await review(APPROVER, page.id, "reject");

    const stale = await save(
      TEST_EDITOR,
      { ...page, updated_at: version },
      { title: "Unaware" },
    );

    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toBe("conflict");
    expect((await revisions()).map(({ status }) => status)).toEqual([
      "rejected",
    ]);
  });

  it("keeps the rejected revision when the next save starts a new draft from it", async () => {
    const { page } = await submitted();
    const version = (await review(APPROVER, page.id, "reject")).json()
      .updated_at as string;

    const response = await save(
      TEST_EMPLOYEE,
      { ...page, updated_at: version },
      { title: "Fixed" },
    );

    expect(response.statusCode).toBe(200);
    expect(response.json().pending_revision).toEqual({
      status: "draft",
      comment: null,
    });
    expect(response.json().updated_at > version).toBe(true);
    const rows = await revisions();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      status: "rejected",
      comment: "Check the fees.",
      fields: { title: "Severance pay" },
    });
    // It started from the rejected content, so its contributors carry over.
    expect(rows[1]).toMatchObject({
      status: "draft",
      createdBy: TEST_EMPLOYEE.id,
      contributors: [TEST_EDITOR.id, TEST_EMPLOYEE.id],
      fields: { title: "Fixed" },
    });
  });

  it("stops showing the rejection once the live page changes, and its content never goes live", async () => {
    const { page } = await submitted();
    const version = (await review(APPROVER, page.id, "reject")).json()
      .updated_at as string;

    // The editor sends the working copy, the rejected content, with the new visibility.
    const unpublished = await save(
      TEST_EMPLOYEE,
      { ...page, updated_at: version },
      {
        title: "Severance pay",
        body_markdown: "Rewritten\n\n## Costs\n\nTwenty dollars",
        visibility: "preview",
      },
    );

    expect(unpublished.statusCode).toBe(200);
    expect(unpublished.json().pending_revision).toBeNull();
    expect(await stored(page.id)).toEqual({
      ...page,
      visibility: "preview",
      updated_at: unpublished.json().updated_at,
    });
    expect(
      (await as(TEST_EDITOR, { url: `/pages/${page.id}/revision` })).statusCode,
    ).toBe(404);
    expect((await revisions())[0]?.status).toBe("rejected");
  });

  it("can't put rejected content live by taking the page out of view and back", async () => {
    const { page } = await submitted();
    const rejected = (await review(APPROVER, page.id, "reject")).json();
    const proposed = {
      title: "Severance pay",
      body_markdown: "Rewritten\n\n## Costs\n\nTwenty dollars",
    };

    const hidden = await save(
      TEST_EMPLOYEE,
      { ...page, updated_at: rejected.updated_at },
      { ...proposed, visibility: "preview" },
    );
    const shown = await save(TEST_EMPLOYEE, hidden.json(), {
      title: hidden.json().title,
      body_markdown: hidden.json().body_markdown,
      visibility: "public",
    });

    expect(shown.statusCode).toBe(200);
    expect(await stored(page.id)).toMatchObject({
      title: page.title,
      body_markdown: page.body_markdown,
      visibility: "public",
    });
    const site = await app.inject({ url: `/pages?url=${ENTRY}` });
    expect(site.json().body_markdown).toBe(page.body_markdown);
  });

  it("can be submitted again as it is, keeping the rejection and its comment", async () => {
    const { page } = await submitted();
    const rejected = (await review(APPROVER, page.id, "reject")).json();

    const response = await review(TEST_EDITOR, page.id, "submit", {
      version: rejected.updated_at,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "submitted",
      submitted_by: TEST_EDITOR.id,
      comment: null,
      fields: rejected.fields,
      contributors: rejected.contributors,
    });
    expect(response.json().updated_at).toBe(rejected.updated_at);
    const rows = await revisions();
    expect(rows.map(({ status, comment }) => ({ status, comment }))).toEqual([
      { status: "rejected", comment: "Check the fees." },
      { status: "submitted", comment: null },
    ]);
    const published = await review(APPROVER, page.id, "publish", {
      version: response.json().updated_at,
    });
    expect(published.statusCode).toBe(200);
  });

  it.each([
    ["is empty", "   "],
    ["is too long", "x".repeat(2001)],
  ])("refuses a comment that %s", async (_why, comment) => {
    const { page } = await submitted();

    const response = await review(APPROVER, page.id, "reject", { comment });

    expect(response.statusCode).toBe(400);
    expect((await revisions())[0]?.status).toBe("submitted");
  });
});

describe("the page's history (#3200)", () => {
  it("records each review step by the one who took it, the rejection with its comment", async () => {
    const { page } = await submitted();
    const rejected = (
      await review(APPROVER, page.id, "reject", {
        comment: "The fee is wrong.",
      })
    ).json();
    await review(TEST_EDITOR, page.id, "submit", {
      version: rejected.updated_at,
    });
    expect((await review(APPROVER, page.id, "publish")).statusCode).toBe(200);

    const history = await db
      .select({
        versionNo: changeEvents.versionNo,
        action: changeEvents.action,
        actor: changeEvents.actor,
        status: sql`${changeEvents.snapshot}->>'status'`,
        submittedBy: sql`${changeEvents.snapshot}->>'submitted_by'`,
        decidedBy: sql`${changeEvents.snapshot}->>'decided_by'`,
        comment: sql`${changeEvents.snapshot}->>'comment'`,
      })
      .from(changeEvents)
      .where(eq(changeEvents.entityId, page.id))
      .orderBy(changeEvents.versionNo);

    // The draft save is not a step; the page's numbering has no gaps.
    const step = (
      versionNo: number,
      action: string,
      actor: string,
      revision: Record<string, string | null> = {},
    ) => ({
      versionNo,
      action,
      actor,
      status: null,
      submittedBy: null,
      decidedBy: null,
      comment: null,
      ...revision,
    });
    expect(history).toEqual([
      step(1, "created", TEST_EMPLOYEE.id),
      step(2, "submitted", TEST_EDITOR.id, {
        status: "submitted",
        submittedBy: TEST_EDITOR.id,
      }),
      step(3, "rejected", APPROVER.id, {
        status: "rejected",
        submittedBy: TEST_EDITOR.id,
        decidedBy: APPROVER.id,
        comment: "The fee is wrong.",
      }),
      step(4, "submitted", TEST_EDITOR.id, {
        status: "submitted",
        submittedBy: TEST_EDITOR.id,
      }),
      step(5, "approved", APPROVER.id, {
        status: "published",
        submittedBy: TEST_EDITOR.id,
        decidedBy: APPROVER.id,
      }),
      // The live write the approval let through.
      step(6, "updated", APPROVER.id),
    ]);
  });
});

describe("self-approval (ADR 0079)", () => {
  it.each(["publish", "reject"] as const)(
    "refuses to let the submitter %s it",
    async (step) => {
      const { page } = await drafted();
      // An approver can submit an editor's draft, and then can't decide on it.
      await review(TEST_EMPLOYEE, page.id, "submit");

      const response = await review(TEST_EMPLOYEE, page.id, step);

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: "forbidden",
        message:
          "You can't approve or reject a change you made or submitted. Ask another approver.",
      });
      expect((await revisions())[0]?.status).toBe("submitted");
      expect(await stored(page.id)).toEqual(page);
    },
  );

  it.each(["publish", "reject"] as const)(
    "refuses to let a contributor %s it",
    async (step) => {
      const { page, version } = await drafted();
      await save(
        TEST_EMPLOYEE,
        { ...page, updated_at: version },
        { title: "Approver's edit" },
      );
      await review(TEST_EDITOR, page.id, "submit");

      const response = await review(TEST_EMPLOYEE, page.id, step);

      expect(response.statusCode).toBe(403);
      expect((await revisions())[0]?.status).toBe("submitted");
      expect(await stored(page.id)).toEqual(page);
    },
  );

  it("is allowed under AUTH_BYPASS, for one local developer", async () => {
    const page = await seedPage();
    const bypassed = new PageEditing(new PostgresPages(db), () => new Date(), {
      allowSelfApproval: true,
    });
    const fields = withDefaults(
      aPage({ category_id: page.category_id, title: "Mine" }),
    );
    expectOk(await bypassed.save(page.id, fields, null, TEST_EMPLOYEE));
    const submitted = expectOk(
      await bypassed.submit(page.id, null, TEST_EMPLOYEE),
    );

    const published = await bypassed.publish(
      page.id,
      new Date(submitted.updated_at),
      TEST_EMPLOYEE,
    );

    expect(expectOk(published).title).toBe("Mine");
    expect((await stored(page.id))?.title).toBe("Mine");
  });
});

describe("a revision that went stale while it waited", () => {
  /** Publishing is refused naming `field`, and nothing changes. */
  const refusedNaming = async (
    pageId: PageId,
    field: string,
    message: string,
  ) => {
    const before = {
      page: await stored(pageId),
      revisions: await revisions(),
      events: await events(),
      site: await publicResponses(),
    };

    const response = await review(APPROVER, pageId, "publish");

    expect(response.statusCode).toBe(422);
    expect(response.json().errors).toEqual([{ field, message }]);
    expect({
      page: await stored(pageId),
      revisions: await revisions(),
      events: await events(),
      site: await publicResponses(),
    }).toEqual(before);
  };

  it("is refused when its parent has been deleted", async () => {
    const parent = await seedPage({ url: "/money-financial-support/parent" });
    const { page } = await submitted({ parent_id: parent.id });
    await as(TEST_EMPLOYEE, { method: "DELETE", url: `/pages/${parent.id}` });

    await refusedNaming(page.id, "parent_id", "No page with that id.");
  });

  it("is refused when another page has taken its url", async () => {
    const { page } = await submitted({ url: "/money-financial-support/new" });
    await seedPage({ url: "/money-financial-support/new" });

    await refusedNaming(page.id, "url", "Another page already has this url.");
  });

  it("is refused when its parent has moved to another category", async () => {
    const parent = await seedPage({
      url: "/money-financial-support/parent",
      visibility: "preview",
    });
    const { page } = await submitted({ parent_id: parent.id });
    const [work] = await db
      .insert(categories)
      .values({ slug: "work-employment", title: "Work" })
      .returning();
    expect(
      (
        await save(TEST_EMPLOYEE, parent, {
          url: parent.url,
          visibility: "preview",
          category_id: work?.id,
        })
      ).statusCode,
    ).toBe(200);

    await refusedNaming(
      page.id,
      "parent_id",
      "A sub-page must be in the same category as its parent page.",
    );
  });
});

describe("a rejected revision submitted again", () => {
  /** E drafts it (plus `contributor`, if any), `submitter` submits it, APPROVER rejects it, `resubmitter` sends it back. */
  const resubmitted = async (
    submitter: Employee,
    resubmitter: Employee,
    contributor?: Employee,
  ) => {
    const { page, version } = await drafted();
    if (contributor)
      await save(
        contributor,
        { ...page, updated_at: version },
        { title: "Severance pay", body_markdown: "Contributed" },
      );
    await review(submitter, page.id, "submit");
    await review(APPROVER, page.id, "reject");
    const again = await review(resubmitter, page.id, "submit", {
      version: await currentVersion(page.id),
    });
    expect(again.statusCode).toBe(200);
    return page;
  };

  /** Publishing and rejecting are both refused to `employee`, and nothing changes. */
  const refusedTo = async (employee: Employee, pageId: PageId) => {
    const before = { page: await stored(pageId), revisions: await revisions() };
    for (const step of ["publish", "reject"] as const) {
      const response = await review(employee, pageId, step);
      expect(response.statusCode, step).toBe(403);
      expect(response.json().message, step).toMatch(/you made or submitted/);
    }
    expect({
      page: await stored(pageId),
      revisions: await revisions(),
    }).toEqual(before);
  };

  it("is refused to a contributor", async () => {
    const page = await resubmitted(TEST_EDITOR, TEST_EDITOR, TEST_EMPLOYEE);

    await refusedTo(TEST_EMPLOYEE, page.id);
  });

  it("is refused to whoever submitted it again", async () => {
    const page = await resubmitted(TEST_EDITOR, TEST_EMPLOYEE);

    await refusedTo(TEST_EMPLOYEE, page.id);
  });

  it("is refused to whoever submitted the rejected round, though someone else submitted it again", async () => {
    // Approver S submits E's draft; A2 rejects it; E sends it back unchanged.
    const page = await resubmitted(TEST_EMPLOYEE, TEST_EDITOR);
    expect((await revisions()).at(-1)).toMatchObject({
      status: "submitted",
      submittedBy: TEST_EDITOR.id,
      contributors: [TEST_EDITOR.id, TEST_EMPLOYEE.id],
    });

    await refusedTo(TEST_EMPLOYEE, page.id);
    // Someone who neither changed nor submitted any round of it can.
    expect((await review(APPROVER, page.id, "publish")).statusCode).toBe(200);
  });
});

describe("a decision without the version reviewed", () => {
  it.each(["publish", "reject"] as const)(
    "is refused to %s with a 428, and nothing changes",
    async (step) => {
      const { page } = await submitted();
      const before = await revisions();

      const response = await review(APPROVER, page.id, step, {
        version: null,
      });

      expect(response.statusCode).toBe(428);
      expect(response.json()).toMatchObject({
        error: "precondition_required",
      });
      expect(await revisions()).toEqual(before);
      expect(await stored(page.id)).toEqual(page);
    },
  );
});

describe("an approver acting on a revision replaced since they read it", () => {
  it("409s, rather than publishing the replacement unseen", async () => {
    // A1 reads R1; A2 rejects it; the editor saves R2 and submits it.
    const { page } = await submitted();
    const read = await currentVersion(page.id);
    const rejected = (
      await review(TEST_EMPLOYEE, page.id, "reject", { version: read })
    ).json();
    await save(
      TEST_EDITOR,
      { ...page, updated_at: rejected.updated_at },
      { title: "R2" },
    );
    await review(TEST_EDITOR, page.id, "submit");

    const response = await review(APPROVER, page.id, "publish", {
      version: read,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("conflict");
    expect(await stored(page.id)).toEqual(page);
    expect((await revisions()).at(-1)?.status).toBe("submitted");
  });
});

describe("a revision changed after the approver read it", () => {
  it.each(["publish", "reject"] as const)(
    "409s to %s, and nothing changes",
    async (step) => {
      const { page, version: reviewed } = await drafted();
      // The editor saves again after the approver read the draft.
      const resaved = await save(
        TEST_EDITOR,
        { ...page, updated_at: reviewed },
        { title: "Changed after review" },
      );
      await review(TEST_EDITOR, page.id, "submit");
      const before = await revisions();

      const response = await review(APPROVER, page.id, step, {
        version: reviewed,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        error: "conflict",
        documentId: page.id,
      });
      expect(await revisions()).toEqual(before);
      expect(await stored(page.id)).toEqual(page);
      expect(resaved.json().updated_at > reviewed).toBe(true);
    },
  );
});

describe("saving a page whose revision is waiting for review (#3203)", () => {
  it("updates that revision in place: it stays submitted, and the saver joins its contributors", async () => {
    const { page, version } = await submitted();
    const [before] = await revisions();

    const response = await save(
      TEST_EMPLOYEE,
      { ...page, updated_at: version },
      { title: "One more thing" },
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      title: "One more thing",
      pending_revision: { status: "submitted", comment: null },
    });
    expect(response.json().updated_at > version).toBe(true);
    const after = await revisions();
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({
      id: before?.id,
      status: "submitted",
      submittedBy: TEST_EDITOR.id,
      createdBy: TEST_EDITOR.id,
      contributors: [TEST_EDITOR.id, TEST_EMPLOYEE.id],
      fields: { title: "One more thing" },
    });
    // Saving to it is not a review step, and the live page is unchanged.
    expect(await events()).toEqual([
      { action: "created", actor: TEST_EMPLOYEE.id },
      { action: "submitted", actor: TEST_EDITOR.id },
    ]);
    expect(await stored(page.id)).toEqual(page);
  });

  it("is refused when the revision has moved on since the editor read it", async () => {
    const { page, version } = await submitted();
    await save(TEST_EDITOR, { ...page, updated_at: version }, { title: "1" });
    const before = await revisions();

    const response = await save(
      TEST_EDITOR,
      { ...page, updated_at: version },
      { title: "Lost?" },
    );

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("conflict");
    expect(await revisions()).toEqual(before);
  });

  it("is refused with a 428 without the version the editor read, and nothing changes", async () => {
    const { page } = await submitted();
    const before = await revisions();

    const response = await as(TEST_EDITOR, {
      method: "PUT",
      url: `/pages/${page.id}`,
      payload: withDefaults(
        aPage({ category_id: page.category_id, title: "Blind save" }),
      ),
    });

    expect(response.statusCode).toBe(428);
    expect(response.json()).toEqual({
      error: "precondition_required",
      message:
        "This change is waiting for review. Send the updated_at you last read in the if-updated-at header.",
    });
    expect(await revisions()).toEqual(before);
  });

  it.each(["publish", "reject"] as const)(
    "409s an approver who would %s the version they read before it, and nothing changes",
    async (step) => {
      const { page, version: read } = await submitted();
      await save(
        TEST_EDITOR,
        { ...page, updated_at: read },
        { title: "Changed while waiting" },
      );
      const before = await revisions();

      const response = await review(APPROVER, page.id, step, {
        version: read,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe("conflict");
      expect(await revisions()).toEqual(before);
      expect(await stored(page.id)).toEqual(page);
    },
  );

  it("lets an approver publish the latest version once they have loaded it", async () => {
    const { page, version } = await submitted();
    await save(
      TEST_EDITOR,
      { ...page, updated_at: version },
      { title: "Changed while waiting" },
    );

    const response = await review(APPROVER, page.id, "publish");

    expect(response.statusCode).toBe(200);
    expect((await stored(page.id))?.title).toBe("Changed while waiting");
  });

  it.each(["publish", "reject"] as const)(
    "refuses to let an approver who saved to it %s it",
    async (step) => {
      const { page, version } = await submitted();
      // An approver who also edits, saving after the editor submitted.
      await save(
        TEST_EMPLOYEE,
        { ...page, updated_at: version },
        { title: "Approver's fix" },
      );

      const response = await review(TEST_EMPLOYEE, page.id, step);

      expect(response.statusCode).toBe(403);
      expect(response.json().message).toMatch(/you made or submitted/);
      expect((await revisions())[0]?.status).toBe("submitted");
    },
  );
});

describe("unpublishing a page whose revision is waiting for review (#3203)", () => {
  it("changes only its visibility, and discards the revision, recording that in its history", async () => {
    const { page, version } = await submitted();

    const response = await save(
      TEST_EMPLOYEE,
      { ...page, updated_at: version },
      {
        visibility: "preview",
        title: "Severance pay",
        body_markdown: "Rewritten\n\n## Costs\n\nTwenty dollars",
      },
    );

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
    expect(await revisions()).toMatchObject([
      {
        status: "discarded",
        submittedBy: TEST_EDITOR.id,
        decidedBy: TEST_EMPLOYEE.id,
      },
    ]);
    expect(
      (await as(TEST_EDITOR, { url: `/pages/${page.id}/revision` })).statusCode,
    ).toBe(404);
    expect((await app.inject({ url: `/pages?url=${ENTRY}` })).statusCode).toBe(
      404,
    );
    expect(await events()).toEqual([
      { action: "created", actor: TEST_EMPLOYEE.id },
      { action: "submitted", actor: TEST_EDITOR.id },
      { action: "discarded", actor: TEST_EMPLOYEE.id },
      { action: "unpublished", actor: TEST_EMPLOYEE.id },
    ]);
  });

  it("can't put the discarded content live by making the page public again", async () => {
    const { page, version } = await submitted();
    const hidden = (
      await save(
        TEST_EMPLOYEE,
        { ...page, updated_at: version },
        { visibility: "preview" },
      )
    ).json();

    // Sent with only the visibility changed, as the editor sends it.
    const shown = await save(TEST_EMPLOYEE, hidden, {
      title: hidden.title,
      body_markdown: hidden.body_markdown,
    });

    expect(shown.statusCode).toBe(200);
    expect(shown.json()).toMatchObject({
      title: page.title,
      body_markdown: page.body_markdown,
      visibility: "public",
      pending_revision: null,
    });
    const site = await app.inject({ url: `/pages?url=${ENTRY}` });
    expect(site.statusCode).toBe(200);
    expect(JSON.stringify(site.json())).not.toContain("Twenty dollars");
    expect((await stored(page.id))?.body_markdown).not.toContain(
      "Twenty dollars",
    );
    expect(
      (await as(TEST_EDITOR, { url: `/pages/${page.id}/revision` })).statusCode,
    ).toBe(404);
    expect((await revisions()).map(({ status }) => status)).toEqual([
      "discarded",
    ]);
  });

  it("is refused to an editor, and the revision still waits", async () => {
    const { page, version } = await submitted();

    const response = await save(
      TEST_EDITOR,
      { ...page, updated_at: version },
      { visibility: "preview" },
    );

    expect(response.statusCode).toBe(403);
    expect(await stored(page.id)).toEqual(page);
    expect((await revisions())[0]?.status).toBe("submitted");
  });
});

describe("the revision's changes", () => {
  it("list only the fields that differ from the live page", async () => {
    const { page } = await drafted({
      title: aPage().title,
      body_markdown: "Intro\n\n## Fees\n\nTen dollars",
      frontmatter: { lede: "New lede" },
    });

    const response = await as(TEST_EDITOR, {
      url: `/pages/${page.id}/revision`,
    });

    expect(response.json().changes).toEqual([
      { field: "frontmatter", live: {}, proposed: { lede: "New lede" } },
    ]);
  });
});
