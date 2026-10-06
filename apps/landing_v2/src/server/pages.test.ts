import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Dispatcher } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApiClient, createCachingDispatcher } from "./api";
import { ApiUnavailableError, loadPage } from "./pages";

const aPage = (overrides: Record<string, unknown> = {}) => ({
  url: "/test",
  frontmatter: { title: "A test page" },
  body_markdown: "Hello",
  form_id: null,
  hide_start_links: false,
  breadcrumbs: [{ name: "A test page", url: "/test" }],
  ...overrides,
});

const ENTRY_MARKDOWN = [
  "There are 2 ways to apply. You can:",
  "",
  "- apply online: <a data-start-link>Start now</a>",
  "- apply by post",
].join("\n");

type Route = {
  status: number;
  body?: unknown;
  hold?: Promise<void>;
  location?: string;
};

/** A throwaway api_v2 answering from a table of path → response. */
async function startApi(routes: (path: string) => Route | undefined) {
  const server: Server = createServer(async (req, res) => {
    const route = routes(req.url ?? "") ?? { status: 404 };
    await route.hold;
    res.statusCode = route.status;
    res.setHeader("content-type", "application/json");
    if (route.location) res.setHeader("location", route.location);
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

const byUrl = (url: string) => `/pages?url=${encodeURIComponent(url)}`;

describe("loadPage", () => {
  it("returns the page api_v2 served", async () => {
    const api = await startApi((path) =>
      path === byUrl("/test") ? { status: 200, body: aPage() } : undefined,
    );
    close = api.close;
    const client = createApiClient(api.baseUrl, dispatcher);

    expect(await loadPage("/test", client)).toEqual({
      kind: "page",
      page: {
        url: "/test",
        frontmatter: { title: "A test page" },
        hast: {
          type: "root",
          children: [
            {
              type: "element",
              tagName: "p",
              properties: {},
              children: [{ type: "text", value: "Hello" }],
            },
          ],
        },
        breadcrumbs: [{ name: "A test page", url: "/test" }],
      },
    });
  });

  it("sanitises the markdown's raw HTML before it renders", async () => {
    const api = await startApi(() => ({
      status: 200,
      body: aPage({
        body_markdown: '<script>alert(1)</script>\n\n<p onclick="x()">Hi</p>',
      }),
    }));
    close = api.close;
    const client = createApiClient(api.baseUrl, dispatcher);

    const tree = JSON.stringify(await loadPage("/test", client));

    expect(tree).not.toContain("script");
    expect(tree).not.toContain("onclick");
    expect(tree).toContain("Hi");
  });

  it("stamps the Start link with the form api_v2 names", async () => {
    const api = await startApi(() => ({
      status: 200,
      body: aPage({ body_markdown: ENTRY_MARKDOWN, form_id: "severance" }),
    }));
    close = api.close;
    const client = createApiClient(api.baseUrl, dispatcher);

    const tree = JSON.stringify(await loadPage("/test", client));

    expect(tree).toContain('"dataFormId":"severance"');
    expect(tree).toContain("There are 2 ways to apply.");
  });

  it("removes the Start link, and counts the ways down, when api_v2 says to", async () => {
    const api = await startApi(() => ({
      status: 200,
      body: aPage({
        body_markdown: ENTRY_MARKDOWN,
        form_id: "severance",
        hide_start_links: true,
      }),
    }));
    close = api.close;
    const client = createApiClient(api.baseUrl, dispatcher);

    const tree = JSON.stringify(await loadPage("/test", client));

    expect(tree).not.toContain("dataStartLink");
    expect(tree).toContain("There is 1 way to apply.");
    expect(tree).toContain("apply by post");
  });

  it("hands back a redirect to the canonical url rather than following it", async () => {
    // Followed, the site path would be requested from api_v2 and 404.
    const api = await startApi((path) =>
      path === byUrl("/test")
        ? { status: 301, body: { redirect: "/a/test" }, location: "/a/test" }
        : undefined,
    );
    close = api.close;
    const client = createApiClient(api.baseUrl, dispatcher);

    expect(await loadPage("/test", client)).toEqual({
      kind: "redirect",
      url: "/a/test",
    });
  });

  it("throws an error naming the url and the field when a page is malformed", async () => {
    const api = await startApi((path) =>
      path === byUrl("/test")
        ? { status: 200, body: aPage({ body_markdown: 42 }) }
        : undefined,
    );
    close = api.close;
    const client = createApiClient(api.baseUrl, dispatcher);

    await expect(loadPage("/test", client)).rejects.toThrow(
      /"\/test".*body_markdown/,
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
});
