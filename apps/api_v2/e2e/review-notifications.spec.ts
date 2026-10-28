/**
 * Review emails (#3267) from the built process: with REVIEW_NOTIFICATIONS=log
 * the log mailer captures each email, so a submission's reach the approvers
 * and a decision's the submitter; with it unset, nothing is sent.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AUTH_ENV,
  createEmployeeSession,
  createScratchDatabase,
  dropScratchDatabase,
  HAS_DATABASE,
  startServer,
  type Server,
} from "./support";

interface Email {
  to: string;
  subject: string;
  text: string;
}

/** The emails the log mailer wrote to the process's output. */
const emailsIn = (output: string): Email[] =>
  output
    .split("\n")
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line) as { msg?: string; email?: Email })
    .filter((entry) => entry.msg === "review email")
    .map((entry) => entry.email as Email);

/**
 * The process's output once `count` emails are in it, or once `route` has
 * been logged as completed, which a review step's emails come before. Output
 * reaches this process through a pipe, so after the HTTP response.
 */
async function settled(
  server: Server,
  until: { count: number } | { route: string },
): Promise<Email[]> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const emails = emailsIn(server.stderr);
    if (
      "count" in until
        ? emails.length >= until.count
        : server.stderr.includes(`"route":"${until.route}"`)
    )
      return emails;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    `Timed out waiting for ${JSON.stringify(until)}:\n${server.stderr}`,
  );
}

describe.skipIf(!HAS_DATABASE)("review emails over HTTP", () => {
  let server: Server;
  let database: string;
  const people = {
    editor: { email: "editor@govtech.bb", roles: ["editor"], cookie: "" },
    first: {
      email: "first-approver@govtech.bb",
      roles: ["editor", "approver"],
      cookie: "",
    },
    second: {
      email: "second-approver@govtech.bb",
      roles: ["editor", "approver"],
      cookie: "",
    },
  };
  let page: Record<string, unknown> & { id: string; updated_at: string };

  beforeAll(async () => {
    database = await createScratchDatabase();
    server = await startServer({
      DB_NAME: database,
      SEED: "false",
      REVIEW_NOTIFICATIONS: "log",
    });
    for (const person of Object.values(people))
      person.cookie = (
        await createEmployeeSession(database, server.url, person)
      ).cookie;
  });
  afterAll(async () => {
    await server?.stop();
    if (database) await dropScratchDatabase(database);
  });

  const send = async (
    as: keyof typeof people,
    method: string,
    path: string,
    { body, stamp }: { body?: object; stamp?: string } = {},
  ) => {
    const response = await fetch(server.url + path, {
      method,
      headers: {
        cookie: people[as].cookie,
        origin: AUTH_ENV.EDITOR_ORIGIN,
        ...(body ? { "content-type": "application/json" } : {}),
        ...(stamp ? { "if-updated-at": stamp } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    expect(response.status, `${method} ${path}`).toBeLessThan(300);
    return (await response.json()) as Record<string, unknown> & {
      id: string;
      updated_at: string;
    };
  };

  /** The editor saves a change to the public page and submits it. */
  const submitChange = async (title: string) => {
    const saved = await send("editor", "PUT", `/pages/${page.id}`, {
      body: { ...page, title, body_markdown: `${title} body, never emailed` },
      stamp: page.updated_at,
    });
    await send("editor", "POST", `/pages/${page.id}/revision/submit`);
    return saved;
  };

  /** The first approver publishes or rejects the waiting change. */
  const decide = async (step: "publish" | "reject") => {
    const revision = await send("first", "GET", `/pages/${page.id}/revision`);
    return send("first", "POST", `/pages/${page.id}/revision/${step}`, {
      stamp: revision.updated_at,
      ...(step === "reject" ? { body: { comment: "Check the fees." } } : {}),
    });
  };

  it("emails the approvers on submit, and the submitter on reject and publish", async () => {
    const category = await send("first", "POST", "/editor/categories", {
      body: {
        title: "Money",
        slug: "money",
        parent_id: null,
        description: null,
      },
    });
    const fields = {
      url: "/money/severance-pay",
      category_id: category.id,
      title: "Severance pay",
      body_markdown: "Live content",
      description: null,
      form_id: null,
      frontmatter: {},
    };
    const created = await send("first", "POST", "/pages", {
      body: { ...fields, visibility: "preview" },
    });
    // An approver can't make public a page they wrote, so another does.
    page = await send("second", "PUT", `/pages/${created.id}`, {
      body: { ...fields, visibility: "public" },
      stamp: created.updated_at,
    });
    const link = `${AUTH_ENV.EDITOR_ORIGIN}/services/${page.id}/${page.id}`;

    await submitChange("Get severance pay");
    const submitted = await settled(server, { count: 2 });
    expect(submitted.map(({ to }) => to).sort()).toEqual([
      people.first.email,
      people.second.email,
    ]);
    expect(submitted[0]?.subject).toBe(
      'A change to "Get severance pay" is waiting for review',
    );
    expect(submitted[0]?.text).toContain(
      `${AUTH_ENV.EDITOR_ORIGIN}/reviews/${page.id}`,
    );

    await decide("reject");
    const rejected = (await settled(server, { count: 3 })).slice(2);
    expect(rejected).toEqual([
      {
        to: people.editor.email,
        subject: 'Your change to "Get severance pay" was rejected',
        text: expect.stringContaining(link),
      },
    ]);

    // Sent again as it is, then published.
    await send("editor", "POST", `/pages/${page.id}/revision/submit`);
    await settled(server, { count: 5 });
    page = await decide("publish");
    const published = (await settled(server, { count: 6 })).slice(5);
    expect(published).toEqual([
      {
        to: people.editor.email,
        subject: 'Your change to "Get severance pay" is live',
        text: expect.stringContaining(link),
      },
    ]);

    for (const email of emailsIn(server.stderr))
      expect(email.text).not.toContain("never emailed");
  });

  it("sends nothing when the environment leaves review emails off", async () => {
    await server.stop();
    server = await startServer({ DB_NAME: database, SEED: "false" });

    await submitChange("Claim severance pay");
    await decide("reject");

    expect(
      await settled(server, { route: "/pages/:id/revision/reject" }),
    ).toEqual([]);
  });
});
