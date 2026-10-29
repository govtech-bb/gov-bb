import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  createTestDb,
  TEST_HEADERS,
  type TestDb,
} from "./test-db";

let app: FastifyInstance;
let database: TestDb;

beforeEach(async () => {
  database = await createTestDb();
  app = await createTestApp(database.db, { allowSelfApproval: true });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await database.close();
});

const source =
  '::::actions\n:::action{form="birth-certificate"}\nStart now\n:::\n:::action{href="/guidance" variant="secondary"}\nRead guidance\n:::\n::::';

const page = (body_markdown: string, visibility = "public") => ({
  url: "/services/test",
  title: "Test service",
  body_markdown,
  visibility,
});

describe("Markdown page publication", () => {
  it("validates directives between leading body rules instead of treating them as frontmatter", async () => {
    const body = '---\n\n:::action{href="javascript:run()"}\nRun\n:::\n\n---';
    const response = await app.inject({
      method: "POST",
      url: "/pages",
      headers: TEST_HEADERS,
      payload: page(body),
    });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      errors: [
        {
          field: "body_markdown",
          message: expect.stringContaining("Line 3, column 1:"),
        },
      ],
    });
    expect(
      (await app.inject({ url: "/pages?url=/services/test" })).statusCode,
    ).toBe(404);
  });

  it("stores and serves the dialect without rewriting the source", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/pages",
      headers: TEST_HEADERS,
      payload: page(source),
    });
    expect(created.statusCode).toBe(201);
    const response = await app.inject({ url: "/pages?url=/services/test" });
    expect(response.statusCode).toBe(200);
    expect(response.json().body_markdown).toBe(source);
  });

  it.each(["public", "preview"])(
    "rejects invalid %s content with a located field error",
    async (visibility) => {
      const invalid = 'Intro\n\n:::action{href="javascript:run()"}\nRun\n:::';
      const response = await app.inject({
        method: "POST",
        url: "/pages",
        headers: TEST_HEADERS,
        payload: page(invalid, visibility),
      });
      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({
        error: "validation_failed",
        errors: [
          {
            field: "body_markdown",
            message: expect.stringContaining("Line 3, column 1:"),
          },
        ],
      });
      expect(
        (await app.inject({ url: "/pages?url=/services/test" })).statusCode,
      ).toBe(404);
    },
  );

  it("retains incomplete drafts and leaves them unchanged when publication fails", async () => {
    const invalid = ":::details[Help]\nUnclosed content";
    const created = await app.inject({
      method: "POST",
      url: "/pages",
      headers: TEST_HEADERS,
      payload: page(invalid, "draft"),
    });
    expect(created.statusCode).toBe(201);
    const draft = created.json();
    const rejected = await app.inject({
      method: "PUT",
      url: `/pages/${draft.id}`,
      headers: TEST_HEADERS,
      payload: { ...draft, visibility: "public" },
    });
    expect(rejected.statusCode).toBe(422);
    const stored = await app.inject({
      url: `/pages/${draft.id}`,
      headers: TEST_HEADERS,
    });
    expect(stored.json()).toMatchObject({
      body_markdown: invalid,
      visibility: "draft",
      updated_at: draft.updated_at,
      published_at: null,
    });
  });

  it("preserves legacy HTML and start markers on public writes", async () => {
    const legacy =
      '<a data-start-link>Start now</a>\n\n<div class="legacy">Existing content.</div>';
    const created = await app.inject({
      method: "POST",
      url: "/pages",
      headers: TEST_HEADERS,
      payload: page(legacy),
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().body_markdown).toBe(legacy);
  });
});
