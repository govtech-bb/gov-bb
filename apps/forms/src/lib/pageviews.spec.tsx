import { act, render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { trackPageview } from "./analytics";
import { trackPageviewsOnPathChange } from "./pageviews";

vi.mock("./analytics", () => ({ trackPageview: vi.fn() }));

function renderRouter(initialPath: string) {
  const rootRoute = createRootRoute({ component: Outlet });
  const formRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/forms/$formId",
    component: () => <h1>{formRoute.useParams().formId}</h1>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([formRoute]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  trackPageviewsOnPathChange(router);
  render(<RouterProvider router={router} />);
  return router;
}

describe("trackPageviewsOnPathChange", () => {
  beforeEach(() => vi.mocked(trackPageview).mockClear());

  it("counts the first page load once", async () => {
    renderRouter("/forms/a?step=one");
    await screen.findByRole("heading", { name: "a" });
    expect(trackPageview).toHaveBeenCalledTimes(1);
  });

  it("counts a client-side navigation to a new path", async () => {
    const router = renderRouter("/forms/a");
    await screen.findByRole("heading", { name: "a" });

    await act(() =>
      router.navigate({ to: "/forms/$formId", params: { formId: "b" } }),
    );
    await screen.findByRole("heading", { name: "b" });

    expect(trackPageview).toHaveBeenCalledTimes(2);
  });

  it("does not count a change to only the step", async () => {
    const router = renderRouter("/forms/a?step=one");
    await screen.findByRole("heading", { name: "a" });

    await act(() =>
      router.navigate({
        to: "/forms/$formId",
        params: { formId: "a" },
        search: { step: "two" },
      }),
    );

    expect(router.state.location.search).toEqual({ step: "two" });
    expect(trackPageview).toHaveBeenCalledTimes(1);
  });

  it("counts a path change after a step change, and a return to a path", async () => {
    const router = renderRouter("/forms/a?step=one");
    await screen.findByRole("heading", { name: "a" });

    const go = (formId: string, step?: string) =>
      act(() =>
        router.navigate({
          to: "/forms/$formId",
          params: { formId },
          search: step ? { step } : {},
        }),
      );
    await go("a", "two");
    await go("b");
    await go("a");
    await screen.findByRole("heading", { name: "a" });

    expect(trackPageview).toHaveBeenCalledTimes(3);
  });
});
