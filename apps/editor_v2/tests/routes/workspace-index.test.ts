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

test("the editor's address opens the Services list, not a document", async () => {
  const router = createRouter({
    routeTree,
    context: {
      auth: signedIn,
      api: createEditorApi("http://localhost:3020"),
      queryClient: new QueryClient(),
    },
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  await router.load();

  expect(router.state.location.pathname).toBe("/services");
});
