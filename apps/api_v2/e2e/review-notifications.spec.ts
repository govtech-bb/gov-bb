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
  takePageEditLease,
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
    // The last piece may be a line still arriving.
    .slice(0, -1)
    .flatMap((line) => {
      try {
        const entry = JSON.parse(line) as { msg?: string; email?: Email };
        return entry.msg === "review email" && entry.email ? [entry.email] : [];
      } catch {
        return [];
      }
    });

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
    { body, lease }: { body?: object; lease?: Record<string, string> } = {},
  ) => {
    const response = await fetch(server.url + path, {
      method,
      headers: {
        cookie: people[as].cookie,
        origin: AUTH_ENV.EDITOR_ORIGIN,
        ...(body ? { "content-type": "application/json" } : {}),
        ...lease,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    expect(response.status, `${method} ${path}`).toBeLessThan(300);
    return (await response.json()) as Record<string, unknown> & {
      id: string;
      updated_at: string;
      version: number;
    };
  };

  /** `as` saves the page under their own edit lease, at the version it carries. */
  const save = async (
    as: keyof typeof people,
    body: { id: string } & Record<string, unknown>,
  ) =>
    send(as, "PUT", `/pages/${body.id}`, {
      body,
      lease: await takePageEditLease(server.url, body.id, people[as].cookie),
    });

  /** `as` submits the page's change at the version they last read. */
  const submit = async (as: keyof typeof people) =>
    send(as, "POST", `/pages/${page.id}/revision/submit`, {
      body: {
        version: (await send(as, "GET", `/pages/${page.id}`)).version,
      },
    });

  /** The editor saves a change to the public page and submits it. */
  const submitChange = async (title: string) => {
    const current = await send("editor", "GET", `/pages/${page.id}`);
    const saved = await save("editor", {
      ...current,
      title,
      body_markdown: `${title} body, never emailed`,
    });
    await submit("editor");
    return saved;
  };

  /** The first approver publishes or rejects the waiting change. */
  const decide = async (step: "publish" | "reject") => {
    const { version } = await send("first", "GET", `/pages/${page.id}`);
    return send("first", "POST", `/pages/${page.id}/revision/${step}`, {
      body: {
        version,
        ...(step === "reject" ? { comment: "Check the fees." } : {}),
      },
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
    page = await save("second", {
      ...fields,
      id: created.id,
      version: created.version,
      visibility: "public",
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
    await submit("editor");
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
