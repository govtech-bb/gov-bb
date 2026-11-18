/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { createEditorApi } from "../../src/api/client";
import { AuthFailure, type EditorAuth } from "../../src/auth/session";
import { routeTree } from "../../src/routeTree.gen";

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

test("a problem with the app shows under its header, where the workspace's own problems go", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  // Nothing here reaches a server
  vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Offline")));
  vi.stubGlobal("scrollTo", () => {});

  let checkable = true;

  const auth: EditorAuth = {
    session: async () =>
      checkable
        ? {
            ok: true,
            value: { email: "author@govtech.bb", expiresAt: Date.now() + 60 * 60 * 1000 },
          }
        : { ok: false, error: new AuthFailure("unavailable") },
    signIn: async (_origin, returnTo) => ({ ok: true, value: returnTo }),
    signOut: async () => ({ ok: true, value: undefined }),
  };

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const router = createRouter({
    routeTree,
    context: { auth, api: createEditorApi("http://localhost:3020"), queryClient: client },
    history: createMemoryHistory({ initialEntries: ["/services"] }),
    Wrap: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });

  const root = createRoot(document.body.appendChild(document.createElement("div")));

  await act(async () => root.render(<RouterProvider router={router} />));
  await act(async () => router.load());

  const header = document.querySelector("header");

  expect(header?.textContent).toContain("Sign out");

  // Coming back to the window checks the session, which can't be checked now
  checkable = false;
  await act(async () => window.dispatchEvent(new Event("focus")));

  expect(header?.nextElementSibling?.textContent).toContain("We could not check your session.");
  await act(async () => root.unmount());
});
