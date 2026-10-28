/** @vitest-environment jsdom */
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { afterEach, expect, test, vi } from "vitest";
import { createEditorApi } from "../../src/api/client";
import { categoriesQuery } from "../../src/api/queries";
import type { EditorAuth } from "../../src/auth/session";
import { routeTree } from "../../src/routeTree.gen";

const signedIn: EditorAuth = {
  session: async () => ({
    ok: true,
    value: { email: "author@govtech.bb", expiresAt: Date.now() + 60 * 60 * 1000 },
  }),
  signIn: async (_origin, returnTo) => ({ ok: true, value: returnTo }),
  signOut: async () => ({ ok: true, value: undefined }),
};

afterEach(() => {
  vi.unstubAllGlobals();
});

test("the Categories screen opens in the workspace, its list already loading", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      new URL(input instanceof Request ? input.url : input).pathname === "/editor/categories"
        ? Response.json({
            categories: [
              {
                id: "6f1c1a52-2d0a-4f6e-9a57-8e0c2d1b3a01",
                parent_id: null,
                slug: "health",
                url: "/health",
                title: "Health",
                description: null,
                position: 0,
                services: 0,
                reserved_route: false,
                updated_at: "2026-10-26T12:00:00.000Z",
              },
            ],
          })
        : Response.json([]),
    ),
  );

  const api = createEditorApi("https://api.example.test");
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { auth: signedIn, api, queryClient },
    history: createMemoryHistory({ initialEntries: ["/categories"] }),
  });

  await router.load();

  expect(router.state.matches.map((match) => match.routeId)).toContain("/_workspace/categories");
  await vi.waitFor(() =>
    expect(
      queryClient.getQueryData(categoriesQuery(api).queryKey)?.map((item) => item.title),
    ).toEqual(["Health"]),
  );
});
