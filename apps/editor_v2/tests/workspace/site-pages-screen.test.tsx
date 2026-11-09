/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { act } from "react";
import { expect, test, vi } from "vitest";
import { createEditorApi, type SitePageSummary } from "../../src/api/client";
import { sitePagesQuery } from "../../src/api/queries";
import { SitePagesScreen } from "../../src/workspace/site-pages-screen";
import { renderInPage } from "../helpers/page-editor";

const pages: SitePageSummary[] = [
  {
    id: "terms",
    title: "Terms & Conditions",
    url: "/terms-conditions",
    visibility: "public",
  },
];

async function show(reply: () => Promise<Response>, cached?: SitePageSummary[]) {
  const fetch = vi.fn(reply);
  vi.stubGlobal("fetch", fetch);
  const api = createEditorApi("http://localhost:3020", "https://alpha.gov.bb");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ["/site-pages"] }),
  });

  if (cached) client.setQueryData(sitePagesQuery(api).queryKey, cached);
  await renderInPage(
    <RouterContextProvider router={router}>
      <QueryClientProvider client={client}>
        <main id="workspace-content" tabIndex={-1}>
          <SitePagesScreen api={api} />
        </main>
      </QueryClientProvider>
    </RouterContextProvider>,
  );

  return { fetch, client };
}

const waitFor = (assertion: () => void) =>
  act(async () => {
    await vi.waitFor(assertion);
  });

test("shows a loading state, then title links, public URLs and visibility without creation controls", async () => {
  let answer: (response: Response) => void = () => {};

  const response = new Promise<Response>((resolve) => {
    answer = resolve;
  });

  const h = await show(() => response);
  expect(document.body.textContent).toContain("Loading site pages");
  await act(async () => answer(Response.json({ pages })));
  await waitFor(() =>
    expect(document.querySelector('a[href="/site-pages/terms"]')?.textContent).toBe(
      "Terms & Conditions",
    ),
  );
  expect(
    document
      .querySelector('a[href="https://alpha.gov.bb/terms-conditions"]')
      ?.getAttribute("target"),
  ).toBe("_blank");
  expect(document.body.textContent).toContain("Public");
  expect(document.body.textContent).not.toContain("Create");
  expect(h.fetch.mock.calls[0]).toEqual([
    "http://localhost:3020/editor/site-pages",
    expect.objectContaining({ credentials: "include", cache: "no-store", method: "GET" }),
  ]);
});

test("distinguishes an empty index from a failed read and lets a failed read retry", async () => {
  let status = 503;
  const h = await show(async () => Response.json({ pages: [] }, { status }));
  await waitFor(() => expect(document.body.textContent).toContain("We could not load site pages"));
  expect(document.body.textContent).not.toContain("No site pages");
  status = 200;

  const retry = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Try again",
  );

  expect(retry).toBeDefined();
  await act(async () => retry?.click());
  await waitFor(() => expect(document.body.textContent).toContain("No site pages"));
  expect(h.fetch).toHaveBeenCalledTimes(2);
});

test.each([401, 403])("does not show cached rows after access is denied (%s)", async (status) => {
  await show(async () => Response.json({}, { status }), pages);
  await waitFor(() => expect(document.body.textContent).toContain("We could not load site pages"));
  expect(document.querySelector('a[href="/site-pages/terms"]')).toBeNull();

  if (status === 401) {
    const signIn = document.querySelector<HTMLAnchorElement>('a[href^="/auth"]');
    expect(signIn?.textContent).toBe("Sign in again");
    expect(new URL(signIn?.href ?? "").searchParams.get("returnTo")).toBe("/site-pages");
  } else expect(document.body.textContent).toContain("You do not have access");
});

test("keeps the last loaded list with a retry notice on a temporary refresh failure", async () => {
  await show(async () => Response.json({}, { status: 503 }), pages);
  await waitFor(() =>
    expect(document.body.textContent).toContain("We could not refresh site pages"),
  );
  expect(document.querySelector('a[href="/site-pages/terms"]')?.textContent).toBe(
    "Terms & Conditions",
  );
});
