/** @vitest-environment jsdom */
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { afterEach, expect, test, vi } from "vitest";
import { createEditorApi, type ServiceSummary } from "../../src/api/client";
import { categoriesQuery, pageQuery, serviceQuery, servicesQuery } from "../../src/api/queries";
import type { EditorAuth } from "../../src/auth/session";
import { routeTree } from "../../src/routeTree.gen";

const session = vi.fn(async () => ({
  ok: true as const,
  value: { email: "author@govtech.bb", expiresAt: Date.now() + 60 * 60 * 1000 },
}));

const auth: EditorAuth = {
  session,
  signIn: async (_origin, returnTo) => ({ ok: true, value: returnTo }),
  signOut: async () => ({ ok: true, value: undefined }),
};

const service: ServiceSummary = {
  id: "22222222-2222-4222-8222-222222222222",
  url: "/family/birth-certificate",
  title: "Get a copy of a birth certificate",
  category: { slug: "family", title: "Family" },
  visibility: "public",
  form_id: null,
  has_start_page: false,
  page_count: 1,
  updated_at: "2026-10-01T09:00:00.000Z",
};

afterEach(() => vi.unstubAllGlobals());

test("pointing at a service's link starts loading the service and its entry page, without signing in", async () => {
  const asked: string[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      asked.push(path);

      return new Response(
        JSON.stringify(
          path === "/editor/categories"
            ? { categories: [] }
            : path.startsWith("/services/")
              ? { service, pages: [] }
              : { id: service.id },
        ),
      );
    }),
  );

  const api = createEditorApi("http://localhost:3020");
  const queryClient = new QueryClient();
  queryClient.setQueryData(servicesQuery(api).queryKey, [service]);

  const router = createRouter({
    routeTree,
    context: { auth, api, queryClient },
    history: createMemoryHistory({ initialEntries: ["/services"] }),
  });

  await router.preloadRoute({
    to: "/services/$serviceId/$documentId",
    params: { serviceId: service.id, documentId: service.id },
  });

  await vi.waitFor(() => expect(asked).toHaveLength(3));
  expect(queryClient.getQueryData(serviceQuery(api, service.id).queryKey)).toBeDefined();
  expect(queryClient.getQueryData(pageQuery(api, service.id).queryKey)).toBeDefined();
  expect(queryClient.getQueryData(categoriesQuery(api).queryKey)).toEqual([]);
  // Preloading never asks who's signed in
  expect(session).not.toHaveBeenCalled();
});
