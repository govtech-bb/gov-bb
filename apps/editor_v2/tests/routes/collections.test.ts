/** @vitest-environment jsdom */
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { afterEach, expect, test, vi } from "vitest";
import { createEditorApi } from "../../src/api/client";
import { collectionQuery, collectionsQuery } from "../../src/api/queries";
import type { EditorAuth } from "../../src/auth/session";
import { parseCollectionSearch } from "../../src/workspace/collections";
import { routeTree } from "../../src/routeTree.gen";

const signedIn: EditorAuth = {
  session: async () => ({
    ok: true,
    value: { email: "author@govtech.bb", expiresAt: Date.now() + 60 * 60 * 1000 },
  }),
  signIn: async (_origin, returnTo) => ({ ok: true, value: returnTo }),
  signOut: async () => ({ ok: true, value: undefined }),
};

const collection = {
  key: "contacts",
  title: "Ministries and departments",
  record_key: "key",
  schema: { fields: [{ key: "key", label: "Key", type: "slug" }] },
  schema_version: 1,
  updated_at: "2026-10-26T12:00:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

const open = async (path: string) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const { pathname } = new URL(input instanceof Request ? input.url : input);

      if (pathname === "/collections")
        return Response.json({ collections: [{ ...collection, record_count: 0 }] });

      if (pathname === "/collections/contacts/records")
        return Response.json({ collection, records: [] });

      return Response.json([]);
    }),
  );

  const api = createEditorApi("https://api.example.test");
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { auth: signedIn, api, queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
  });

  await router.load();

  return { router, api, queryClient };
};

test("the Collections screen opens in the workspace, its list already loading", async () => {
  const { router, api, queryClient } = await open("/collections");

  expect(router.state.matches.map((match) => match.routeId)).toContain("/_workspace/collections");
  await vi.waitFor(() =>
    expect(queryClient.getQueryData(collectionsQuery(api).queryKey)?.[0]?.key).toBe("contacts"),
  );
});

test("a collection's screen keeps ?record= from its address, its records already loading", async () => {
  const { router, api, queryClient } = await open("/collections/contacts?record=nis");

  expect(router.state.matches.map((match) => match.routeId)).toContain(
    "/_workspace/collections/$key",
  );
  expect(router.state.location.search).toEqual({ record: "nis" });
  await vi.waitFor(() =>
    expect(queryClient.getQueryData(collectionQuery(api, "contacts").queryKey)?.records).toEqual(
      [],
    ),
  );
});

test("a record key of digits, typed into the address, still names the record", async () => {
  const { router } = await open("/collections/contacts?record=2024");

  expect(
    router.state.matches.find((match) => match.routeId === "/_workspace/collections/$key")?.search,
  ).toEqual({ record: "2024" });
});

test("a record's own address, as sign-in returns to it, opens its collection with its dialog", async () => {
  const { router } = await open("/collections/contacts/nis");

  await vi.waitFor(() => expect(router.state.location.pathname).toBe("/collections/contacts"));
  expect(router.state.location.search).toEqual({ record: "nis" });
});

test("only a non-empty record name is kept from the address", () => {
  expect(parseCollectionSearch({ record: "nis" })).toEqual({ record: "nis" });
  expect(parseCollectionSearch({ record: "" })).toEqual({});
  // The router reads `?record=2024` as JSON, a number; the key is its text
  expect(parseCollectionSearch({ record: 2024 })).toEqual({ record: "2024" });
  expect(parseCollectionSearch({ record: true })).toEqual({});
  expect(parseCollectionSearch({})).toEqual({});
});
