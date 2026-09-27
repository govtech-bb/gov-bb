import { RenderDocument, type PageDocument } from "@govtech-bb/block-kit";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Dispatcher } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApiClient, createCachingDispatcher } from "./api";
import { ApiUnavailableError, loadPage, startLinkHref } from "./pages";

const doc = (blocks: unknown[], refs: Record<string, unknown> = {}) => ({
  version: 1,
  id: "doc-1",
  url: "/test",
  slug: "test-page",
  schema_name: "guide",
  document_type: "test",
  title: "A test page",
  description: null,
  is_draft: false,
  body: { version: 1, blocks, refs },
  updated_at: "2026-09-22T00:00:00.000Z",
});

type Route = { status: number; body?: unknown; hold?: Promise<void> };

/** A throwaway api_v2 answering from a table of path → response. */
async function startApi(routes: (path: string) => Route | undefined) {
  const server: Server = createServer(async (req, res) => {
    const route = routes(req.url ?? "") ?? { status: 404 };
    await route.hold;
    res.statusCode = route.status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(route.body ?? { error: route.status }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const close = () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return { baseUrl: `http://127.0.0.1:${port}`, close };
}

let dispatcher: Dispatcher;
let close: (() => Promise<void>) | undefined;

beforeEach(() => {
  dispatcher = createCachingDispatcher();
});

afterEach(async () => {
  await dispatcher.destroy();
  await close?.();
  close = undefined;
});

const byUrl = (url: string) => `/pages/by-url?url=${encodeURIComponent(url)}`;

describe("loadPage", () => {
  it("throws an error naming the slug and the field when a page is malformed", async () => {
    const malformed = doc([{ id: "p1", type: "paragraph", content: "oops" }]);
    const api = await startApi((path) =>
      path === byUrl("/test") ? { status: 200, body: malformed } : undefined,
    );
    close = api.close;
    const client = createApiClient(api.baseUrl, dispatcher);

    await expect(loadPage("/test", client)).rejects.toThrow(
      /"test-page".*body\.blocks\.0\.content/,
    );
  });

  it("returns null for a url api_v2 has no page at", async () => {
    const api = await startApi(() => undefined);
    close = api.close;
    const client = createApiClient(api.baseUrl, dispatcher);

    expect(await loadPage("/nowhere", client)).toBeNull();
  });

  it("throws an error naming api_v2 when it cannot be reached", async () => {
    const api = await startApi(() => undefined);
    await api.close();
    const client = createApiClient(api.baseUrl, dispatcher);

    const failure = loadPage("/test", client);
    await expect(failure).rejects.toBeInstanceOf(ApiUnavailableError);
    await expect(failure).rejects.toThrow(/api_v2/);
  });

  // The database down behind a running api_v2: it answers 500, and with
  // nothing cached there is no stale copy to serve instead.
  it("throws an error naming api_v2 and the status when it answers 5xx", async () => {
    const api = await startApi((path) =>
      path === byUrl("/test")
        ? { status: 500, body: { error: "internal_error" } }
        : undefined,
    );
    close = api.close;
    const client = createApiClient(api.baseUrl, dispatcher);

    const failure = loadPage("/test", client);
    // The class the server functions answer 503 for, as for a refused
    // connection.
    await expect(failure).rejects.toBeInstanceOf(ApiUnavailableError);
    await expect(failure).rejects.toThrow(/api_v2 answered 500/);
  });

  it("fetches the records of every collection the page reads, in parallel", async () => {
    const page = doc(
      [
        {
          id: "c1",
          type: "contact",
          title: "Contact us",
          description: [],
          collection: "offices",
          record: "hq",
          fields: [],
        },
      ],
      { r1: { kind: "record", collection: "people", record: "p1" } },
    );
    // Neither records request is answered until both have arrived, so a
    // loader that fetched them one after the other would never finish.
    let arrivals = 0;
    let bothArrived!: () => void;
    const both = new Promise<void>((resolve) => (bothArrived = resolve));
    const records = (body: unknown): Route => {
      if (++arrivals === 2) bothArrived();
      return { status: 200, body, hold: both };
    };
    const api = await startApi((path) => {
      if (path === byUrl("/test")) return { status: 200, body: page };
      if (path === "/collections/offices/records")
        return records([{ slug: "hq" }]);
      if (path === "/collections/people/records")
        return records([{ slug: "p1" }]);
    });
    close = api.close;
    const client = createApiClient(api.baseUrl, dispatcher);

    const loaded = await loadPage("/test", client);

    expect(loaded?.doc.slug).toBe("test-page");
    expect(loaded?.data).toEqual({
      offices: [{ slug: "hq" }],
      people: [{ slug: "p1" }],
    });
  });
});

describe("startLinkHref", () => {
  it("resolves a form start link to ${FORMS_URL}/<id>", () => {
    const html = renderToStaticMarkup(
      createElement(RenderDocument, {
        doc: doc([
          {
            id: "s1",
            type: "start_link",
            label: "Start now",
            target_kind: "form",
            target: "apply-for-a-permit",
          },
        ]) as PageDocument,
        data: {},
        resolveHref: startLinkHref("https://forms.example"),
      }),
    );

    expect(html).toContain('href="https://forms.example/apply-for-a-permit"');
  });

  it("leaves page and external targets as they are", () => {
    const resolve = startLinkHref("https://forms.example");

    expect(resolve("page", "/a/page")).toBe("/a/page");
    expect(resolve("external", "https://gov.bb")).toBe("https://gov.bb");
  });
});
