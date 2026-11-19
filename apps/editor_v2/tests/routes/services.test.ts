/** @vitest-environment jsdom */
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { expect, test } from "vitest";
import { createEditorApi } from "../../src/api/client";
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

test("the Services list reads its place from its address, keeping only what it can show", async () => {
  const router = createRouter({
    routeTree,
    context: {
      auth: signedIn,
      api: createEditorApi("http://localhost:3020"),
      queryClient: new QueryClient(),
    },
    history: createMemoryHistory({
      initialEntries: [
        `/services?category=Health&status=${encodeURIComponent('["draft","secret"]')}&sort=owner&page=2`,
      ],
    }),
  });

  await router.load();

  const list = router.state.matches.find((match) => match.routeId === "/_workspace/services");

  expect(list?.search).toEqual({ category: "Health", status: ["draft"], page: 2 });
});
