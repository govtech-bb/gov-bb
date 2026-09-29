/**
 * "A citizen gets a 503, not a 500, when api_v2 answers 5xx or cannot be
 * reached and nothing is cached" — #2833, on the page and on the RPC.
 *
 * The 503 on a server-rendered page exists only because of the root route's
 * middleware (src/server/status.ts): Start answers SSR with the router's
 * status and ignores the one a server function set. A Start upgrade that
 * changes the middleware's result, or how the router sets the status, would
 * quietly turn the 503 back into a 500, and nothing below this suite would
 * notice. The other cases hold the middleware to its word that it replaces
 * only that 500: a healthy page is 200, a malformed document still 500, an
 * unknown url still 404.
 *
 * One server serves the whole file, and its HTTP cache lives as long as it
 * does, so every case asks for a url of its own. A url answered 200 once
 * could be served stale in place of a later 5xx.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  freePort,
  serverFnId,
  startApi,
  startServer,
  type ApiRoute,
  type LandingServer,
} from "./support";

const doc = (blocks: unknown[], fields: Record<string, unknown>) => ({
  version: 1,
  id: "doc-1",
  url: "/test",
  slug: "test-page",
  schema_name: "guide",
  document_type: "test",
  title: "A test page",
  description: null,
  is_draft: false,
  body: { version: 1, blocks, refs: {} },
  updated_at: "2026-09-22T00:00:00.000Z",
  ...fields,
});

const healthy = doc(
  [{ id: "p1", type: "paragraph", content: [{ text: "All is well." }] }],
  { url: "/healthy", title: "A healthy page" },
);
// `content` must be an array of spans. The slug is unlike the url, so
// finding it on the page means the error named it.
const malformed = doc([{ id: "p1", type: "paragraph", content: "oops" }], {
  url: "/malformed",
  slug: "a-malformed-page",
});

const byUrl = (url: string) => `/pages/by-url?url=${encodeURIComponent(url)}`;

const routes = (path: string): ApiRoute | undefined => {
  switch (path) {
    case byUrl("/healthy"):
      return { status: 200, body: healthy };
    case byUrl("/broken"):
      return { status: 500, body: { error: "internal_error" } };
    case "/pages":
      return { status: 500, body: { error: "internal_error" } };
    case byUrl("/malformed"):
      return { status: 200, body: malformed };
    case byUrl("/nowhere"):
      return { status: 404, body: { error: "not_found" } };
  }
};

let api: Awaited<ReturnType<typeof startApi>>;
let server: LandingServer;

beforeAll(async () => {
  api = await startApi(routes);
  server = await startServer({ apiUrl: api.baseUrl });
});

afterAll(async () => {
  await server?.stop();
  await api?.close();
});

async function get(target: LandingServer, path: string, init?: RequestInit) {
  const response = await fetch(`${target.url}${path}`, init);
  return { status: response.status, body: await response.text() };
}

/** What a failed status assertion shows: the server's own account. */
const said = (target: LandingServer) => `server output:\n${target.output}`;

describe("the status a citizen gets", () => {
  it("is 200 for a page api_v2 serves", async () => {
    const page = await get(server, "/healthy");

    expect(page.status, said(server)).toBe(200);
    expect(page.body).toContain("A healthy page");
  });

  it("is 503 on a server-rendered page when api_v2 answers 500", async () => {
    const page = await get(server, "/broken");

    expect(page.status, said(server)).toBe(503);
    expect(page.body).toContain("api_v2 answered 500");
  });

  it("is 503 on the server-function RPC when api_v2 answers 500", async () => {
    const rpc = await get(server, `/_serverFn/${serverFnId("listPages")}`, {
      // What a browser's RPC carries. Start's CSRF middleware refuses one
      // with no sign of its origin, and without `x-tsr-serverFn`, which
      // Start's client sets on every call, a thrown error has no response
      // to carry its status and the server answers 500.
      headers: { "Sec-Fetch-Site": "same-origin", "x-tsr-serverFn": "true" },
    });

    expect(rpc.status, said(server)).toBe(503);
  });

  it("is still 500 for a malformed document", async () => {
    const page = await get(server, "/malformed");

    expect(page.status, said(server)).toBe(500);
    expect(page.body).toContain("a-malformed-page");
  });

  it("is still 404 for a url api_v2 has no page at", async () => {
    const page = await get(server, "/nowhere");

    expect(page.status, said(server)).toBe(404);
  });

  it("is 503 when api_v2 cannot be reached", async () => {
    const unreachable = await startServer({
      apiUrl: `http://127.0.0.1:${await freePort()}`,
    });
    try {
      const page = await get(unreachable, "/anything");

      expect(page.status, said(unreachable)).toBe(503);
      expect(page.body).toContain("could not be reached");
    } finally {
      await unreachable.stop();
    }
  });
});
