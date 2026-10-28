/**
 * Review emails (#3267): a submission tells the approvers, and a decision
 * tells the submitter, after the step commits and without failing it.
 */

import { sql } from "drizzle-orm";
import type { FastifyInstance, InjectOptions } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mailerFor } from "./adapters/mail";
import { PostgresReviewRecipients } from "./adapters/postgres-review-recipients";
import { parseConfig } from "./config";
import type { Database } from "./db";
import { UserId, type Employee } from "./modules/auth";
import { ContentStoreUnavailable, withDefaults } from "./modules/page";
import { err, ok } from "./modules/result";
import { IF_UPDATED_AT } from "./routes/contracts";
import { categories } from "./schema";
import {
  ReviewNotifications,
  reviewEmail,
  type Email,
  type Mailer,
  type ReviewNotifier,
} from "./services/review-notifications";
import {
  aPage,
  createTestApp,
  createTestDb,
  createTestServices,
  expectOk,
  SELF_APPROVAL,
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
const EDITOR = TEST_HTTP_CONFIG.editorOrigin;
/** The page body a change proposes, which no email may carry. */
const BODY = "Rewritten\n\n## Costs\n\nTwenty dollars, paid at the counter";

let db: Database;
let close: () => Promise<void>;
let app: FastifyInstance;
let sent: Email[];
let mailer: Mailer;
const log = { error: vi.fn() };

/** The app, with review emails going to `mailer` through the real recipient lookups. */
const start = async (notifier?: ReviewNotifier) => {
  app = await createTestApp(db, {
    sessions: {
      findSession: async (cookie) =>
        ok(
          FIXTURES.find((employee) =>
            cookie.reveal().endsWith(`=${employee.id}`),
          ) ?? null,
        ),
    },
    notifier:
      notifier ??
      new ReviewNotifications(
        mailer,
        new PostgresReviewRecipients(db),
        EDITOR,
        log,
      ),
  });
  await app.ready();
};

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  sent = [];
  mailer = { send: async (email) => void sent.push(email) };
  log.error.mockClear();
  await db.execute(
    sql`insert into auth_user (id, name, email, "emailVerified")
        values (${APPROVER.id}, ${APPROVER.name}, ${APPROVER.email}, true)`,
  );
  await db.execute(
    sql`insert into user_roles (user_id, role) values (${APPROVER.id}, 'approver')`,
  );
});

afterEach(async () => {
  await app?.close();
  await close();
});

const as = (employee: Employee, options: InjectOptions) =>
  app.inject({
    ...options,
    headers: {
      cookie: `test-session=${employee.id}`,
      origin: EDITOR,
      ...options.headers,
    },
  });

/** A public page in a category; under `parent_id` when given. */
const seedPage = async (overrides: Record<string, unknown> = {}) => {
  await db
    .insert(categories)
    .values({ slug: "money-financial-support", title: "Money" })
    .onConflictDoNothing();
  const [category] = await db.select().from(categories);
  return expectOk(
    await createTestServices(db, SELF_APPROVAL).editing.create(
      aPage({ category_id: category?.id, ...overrides }),
      TEST_EMPLOYEE,
    ),
  );
};

/** `employee` saves a change to the page and submits it. */
const submit = async (
  employee: Employee,
  page: { id: string; updated_at: string; category_id: string | null },
  fields: Record<string, unknown> = {},
) => {
  const saved = await as(employee, {
    method: "PUT",
    url: `/pages/${page.id}`,
    headers: { [IF_UPDATED_AT]: page.updated_at },
    payload: withDefaults(
      aPage({
        category_id: page.category_id,
        title: "Severance pay",
        body_markdown: BODY,
        ...fields,
      }),
    ),
  });
  expect(saved.statusCode).toBe(200);
  return as(employee, {
    method: "POST",
    url: `/pages/${page.id}/revision/submit`,
  });
};

/** An approver publishes or rejects the change waiting on the page. */
const decide = async (pageId: string, step: "publish" | "reject") => {
  const version = (
    await as(APPROVER, { url: `/pages/${pageId}/revision` })
  ).json().updated_at as string;
  return as(APPROVER, {
    method: "POST",
    url: `/pages/${pageId}/revision/${step}`,
    headers: { [IF_UPDATED_AT]: version },
    ...(step === "reject" ? { payload: { comment: "Check the fees." } } : {}),
  });
};

describe("who hears of a review step", () => {
  beforeEach(() => start());

  it("tells every approver but the submitter that a change waits for review", async () => {
    const page = await seedPage();

    expect((await submit(TEST_EDITOR, page)).statusCode).toBe(200);

    expect(sent.map(({ to }) => to).sort()).toEqual(
      [APPROVER.email, TEST_EMPLOYEE.email].sort(),
    );
    expect(sent[0]).toMatchObject({
      subject: 'A change to "Severance pay" is waiting for review',
      text: expect.stringContaining(`${EDITOR}/reviews/${page.id}`),
    });
  });

  it("leaves out a submitter who is also an approver", async () => {
    const page = await seedPage();

    expect((await submit(TEST_EMPLOYEE, page)).statusCode).toBe(200);

    expect(sent.map(({ to }) => to)).toEqual([APPROVER.email]);
  });

  it("leaves out an approver who changed it, since they can't decide on it", async () => {
    const page = await seedPage();
    const saved = await as(TEST_EMPLOYEE, {
      method: "PUT",
      url: `/pages/${page.id}`,
      headers: { [IF_UPDATED_AT]: page.updated_at },
      payload: withDefaults(
        aPage({ category_id: page.category_id, title: "Severance pay" }),
      ),
    });
    expect(saved.statusCode).toBe(200);

    const submitted = await as(TEST_EDITOR, {
      method: "POST",
      url: `/pages/${page.id}/revision/submit`,
    });

    expect(submitted.statusCode).toBe(200);
    expect(sent.map(({ to }) => to)).toEqual([APPROVER.email]);
  });

  it("links a page in no service to its review screen, or the services list", async () => {
    const page = await seedPage({
      url: "/terms-conditions",
      category_id: null,
    });
    await submit(TEST_EDITOR, page, { url: page.url, category_id: null });
    sent = [];
    await decide(page.id, "reject");
    // Sent again as it is, then published.
    await as(TEST_EDITOR, {
      method: "POST",
      url: `/pages/${page.id}/revision/submit`,
    });
    await decide(page.id, "publish");

    const links = sent
      .filter(({ to }) => to === TEST_EDITOR.email)
      .map(({ text }) => text.split("\n").at(-1));
    expect(links).toEqual([
      `${EDITOR}/reviews/${page.id}`,
      `${EDITOR}/services`,
    ]);
  });

  it("tells the submitter their change was published, linking to the page in its service", async () => {
    const entry = await seedPage();
    const child = await seedPage({
      url: "/money-financial-support/calculate-severance-pay/start",
      parent_id: entry.id,
    });
    await submit(TEST_EDITOR, child, {
      url: child.url,
      parent_id: entry.id,
    });
    sent = [];

    expect((await decide(child.id, "publish")).statusCode).toBe(200);

    expect(sent).toEqual([
      {
        to: TEST_EDITOR.email,
        subject: 'Your change to "Severance pay" is live',
        text: expect.stringContaining(
          `${EDITOR}/services/${entry.id}/${child.id}`,
        ),
      },
    ]);
  });

  it("tells the submitter their change was rejected", async () => {
    const page = await seedPage();
    await submit(TEST_EDITOR, page);
    sent = [];

    expect((await decide(page.id, "reject")).statusCode).toBe(200);

    expect(sent).toEqual([
      {
        to: TEST_EDITOR.email,
        subject: 'Your change to "Severance pay" was rejected',
        text: expect.stringContaining(
          `${EDITOR}/services/${page.id}/${page.id}`,
        ),
      },
    ]);
  });

  it("sends nothing for a refused step", async () => {
    const page = await seedPage();
    await submit(TEST_EDITOR, page);
    sent = [];

    // The submitter can't decide on their own change.
    const own = await as(TEST_EDITOR, {
      method: "POST",
      url: `/pages/${page.id}/revision/reject`,
      payload: { comment: "No" },
    });

    expect(own.statusCode).toBe(403);
    expect(sent).toEqual([]);
  });

  it("carries the title and a link, never the page's content", async () => {
    const page = await seedPage();
    await submit(TEST_EDITOR, page);
    await decide(page.id, "reject");

    expect(sent.length).toBeGreaterThan(0);
    for (const email of sent)
      for (const part of ["Twenty dollars", "Costs", page.body_markdown])
        expect(`${email.subject}\n${email.text}`).not.toContain(part);
  });
});

describe("a failed email", () => {
  it("leaves the step done and logs the failure without the address", async () => {
    mailer = {
      send: async () => {
        throw new Error("SES refused approver@govtech.bb");
      },
    };
    await start();
    const page = await seedPage();

    const response = await submit(TEST_EDITOR, page);

    expect(response.statusCode).toBe(200);
    const revision = await as(APPROVER, { url: `/pages/${page.id}/revision` });
    expect(revision.json()).toMatchObject({ status: "submitted" });
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ failure: "send_failed", event: "submitted" }),
      "review email not sent",
    );
    expect(JSON.stringify(log.error.mock.calls)).not.toContain("@govtech.bb");
  });

  it("leaves the step done when the recipients can't be read", async () => {
    await start(
      new ReviewNotifications(
        mailer,
        {
          approvers: async () =>
            err(new ContentStoreUnavailable("approvers", new Error("lost"))),
          emailOf: async () => ok(null),
          serviceOf: async (pageId) => ok(pageId),
        },
        EDITOR,
        log,
      ),
    );
    const page = await seedPage();

    expect((await submit(TEST_EDITOR, page)).statusCode).toBe(200);
    expect(sent).toEqual([]);
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ failure: "recipients_unavailable" }),
      "review email not sent",
    );
  });
});

describe("with review emails off", () => {
  // main.ts composes no notifier at all when there is no mailer.
  it("is off unless an environment turns it on, and then has no mailer", () => {
    const config = parseConfig({
      BETTER_AUTH_URL: "http://localhost:3020",
      EDITOR_ORIGIN: "http://localhost:3000",
      BETTER_AUTH_SECRET: "test-only-secret-with-at-least-32-characters",
      GITHUB_CLIENT_ID: "test-client",
      GITHUB_CLIENT_SECRET: "test-client-secret",
      API_V2_ADMIN_EMAILS: "admin@govtech.bb",
    });
    if (!config.ok) throw config.error;

    expect(config.value.notifications).toEqual({ transport: "off" });
    expect(
      mailerFor(config.value.notifications, { info: vi.fn() }),
    ).toBeUndefined();
  });
});

describe("the email's words", () => {
  it("puts a title on one line", () => {
    expect(
      reviewEmail(
        {
          kind: "submitted",
          pageId: "p" as never,
          title: "Pay\n  severance",
          submittedBy: "u",
        },
        "https://editor.example/reviews/p",
      ).subject,
    ).toBe('A change to "Pay severance" is waiting for review');
  });
});
