import { createServer, type IncomingHttpHeaders } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiFailure, createEditorApi, type SaveFields } from "./client";

let origin: string;

let status = 200;

let response = "";

const requests: { url: string; method: string; headers: IncomingHttpHeaders; body: string }[] = [];

const server = createServer(async (request, reply) => {
  let body = "";

  for await (const chunk of request) body += chunk;
  requests.push({
    url: request.url ?? "",
    method: request.method ?? "",
    headers: request.headers,
    body,
  });
  reply.writeHead(status, { "content-type": "application/json" });
  reply.end(response);
});

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Parse the Node server address union at its I/O boundary.
  if (!address || typeof address === "string") throw new Error("Test server has no TCP address");
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

const fields: SaveFields = {
  url: "/money-financial-support/calculate-severance-pay",
  category_id: null,
  title: "Calculate severance pay",
  description: null,
  visibility: "draft",
  form_id: null,
  body_markdown: "Hello",
  frontmatter: {},
};

async function failureOf<Value>(promise: Promise<Value>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiFailure) return error;
  }

  return undefined;
}

describe("editor API client", () => {
  it("saves with the page's last updated_at, as JSON", async () => {
    status = 200;
    response = JSON.stringify({ ...fields, id: "page-1" });
    const api = createEditorApi(origin);

    expect(await api.savePage("page-1", fields, "2026-10-07T12:00:00.000Z")).toMatchObject({
      id: "page-1",
    });
    expect(requests.at(-1)).toMatchObject({
      url: "/pages/page-1",
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "if-updated-at": "2026-10-07T12:00:00.000Z",
      },
    });
    expect(JSON.parse(requests.at(-1)?.body ?? "null")).toEqual(fields);
  });

  it("sends no content type with a request that has no body", async () => {
    status = 204;
    response = "";
    await createEditorApi(origin).deletePage("page-1");

    expect(requests.at(-1)).toMatchObject({ url: "/pages/page-1", method: "DELETE" });
    expect(requests.at(-1)?.headers["content-type"]).toBeUndefined();
  });

  it("unwraps list reads", async () => {
    status = 200;
    response = JSON.stringify({ categories: [{ id: "c", slug: "money" }] });

    expect(await createEditorApi(origin).taxonomy()).toEqual([{ id: "c", slug: "money" }]);
    expect(requests.at(-1)).toMatchObject({ url: "/taxonomy", method: "GET" });
  });

  it("turns refusals into failures carrying the status and any field errors", async () => {
    const api = createEditorApi(origin);
    status = 422;
    response = JSON.stringify({
      error: "validation_failed",
      errors: [{ field: "url", message: "Another page already has this url." }],
    });
    const rejected = await failureOf(api.createPage(fields));
    expect(rejected?.status).toBe(422);
    expect(rejected?.errors).toEqual([
      { field: "url", message: "Another page already has this url." },
    ]);

    for (const refused of [401, 404, 409]) {
      status = refused;
      response = JSON.stringify({ error: "refused", message: "No." });
      const failure = await failureOf(api.page("page-1"));
      expect(failure?.status).toBe(refused);
      expect(failure?.message).toBe("No.");
    }

    status = 500;
    response = "not json";
    expect(await failureOf(api.version())).toMatchObject({ status: 500, errors: [] });
  });

  it("reports an API it could not reach as status 0", async () => {
    const failure = await failureOf(createEditorApi("http://127.0.0.1:1").services());
    expect(failure?.status).toBe(0);
  });
});
