import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, test, vi } from "vitest";
import { createEditorApi } from "./client";
import { pageLinkTargetsQuery } from "./page-link-targets";

const stamp = "2026-10-07T12:00:00.000Z";

const category = {
  id: "11111111-1111-4111-8111-111111111111",
  parent_id: null,
  title: "Family",
  slug: "family",
  description: null,
  url: "/family",
  position: 0,
  services: 1,
  reserved_route: false,
  updated_at: stamp,
};

afterEach(() => vi.unstubAllGlobals());

test("reads the complete authenticated page paths, categories and home without service fanout", async () => {
  const fetch = vi.fn(async (url: string) => {
    if (url.endsWith("/editor/page-paths"))
      return Response.json(["/family/birth-certificate", "/unrelated/fees", "/terms-conditions"]);

    if (url.endsWith("/editor/categories")) return Response.json({ categories: [category] });

    throw new Error(`Unexpected link check request: ${url}`);
  });

  vi.stubGlobal("fetch", fetch);
  const api = createEditorApi("https://api.example.com");
  const client = new QueryClient();

  const paths = await client.fetchQuery(
    pageLinkTargetsQuery(api, ["/missing", "/terms-conditions"]),
  );

  expect(paths).toEqual([
    "/",
    "/family/birth-certificate",
    "/unrelated/fees",
    "/terms-conditions",
    "/family",
  ]);
  expect(paths).not.toContain("/missing");
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenCalledWith(
    "https://api.example.com/editor/page-paths",
    expect.objectContaining({ credentials: "include", cache: "no-store" }),
  );
  client.clear();
});

test.each(["/editor/page-paths", "/editor/categories"])(
  "a failed %s lookup is not reported as missing pages",
  async (endpoint) => {
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.endsWith(endpoint))
        return Response.json({ error: "internal_error" }, { status: 500 });

      return Response.json(url.endsWith("/editor/page-paths") ? [] : { categories: [] });
    });
    const api = createEditorApi("https://api.example.com");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const query = pageLinkTargetsQuery(api, ["/missing"]);

    await expect(client.fetchQuery(query)).rejects.toMatchObject({ status: 500 });
    expect(client.getQueryData(query.queryKey)).toBeUndefined();
    client.clear();
  },
);

test("link target queries share an invalidatable content cache and wait until there are links", () => {
  const api = createEditorApi("https://api.example.com");
  const empty = pageLinkTargetsQuery(api, []);
  const first = pageLinkTargetsQuery(api, ["/first"]);
  const second = pageLinkTargetsQuery(api, ["/second"]);

  expect(empty.enabled).toBe(false);
  expect(first.enabled).toBe(true);
  expect(first.queryKey).toEqual(second.queryKey);
  expect(first.queryKey[0]).toBe("content");
});
