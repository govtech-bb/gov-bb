/** @vitest-environment jsdom */
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render, screen } from "@testing-library/react";
import { getRouter } from "./router";

// #3026: `/content` gates its children with an async `beforeLoad` and has no
// loader, so the router never caches its match. Re-entering `/content/edit`
// (which has a loader, so IS cached) used to reuse the cached child with a
// context built before the fresh parent `beforeLoad` resolved — `user` was
// undefined and the editor crashed on `user.login`.
function gatedTree() {
  const root = createRootRoute({ component: Outlet });
  const content = createRoute({
    getParentRoute: () => root,
    path: "/content",
    beforeLoad: async () => ({ user: { login: "tester" } }),
    component: Outlet,
  });
  const edit = createRoute({
    getParentRoute: () => content,
    path: "/edit",
    // A real loader awaits the network; the stale reload must outlast render.
    loader: () => new Promise((resolve) => setTimeout(resolve, 50)),
    component: function Editor() {
      const { user } = edit.useRouteContext();
      return <p>editing as {user.login}</p>;
    },
  });
  const services = createRoute({
    getParentRoute: () => root,
    path: "/services",
    component: () => <p>services</p>,
  });
  return root.addChildren([content.addChildren([edit]), services]);
}

it("keeps the gated user in context when re-entering the content editor", async () => {
  const router = createRouter({
    // The app's router config (typed to its own tree, hence the cast).
    ...(getRouter().options as object),
    routeTree: gatedTree(),
    history: createMemoryHistory({ initialEntries: ["/services"] }),
  });
  render(<RouterProvider router={router} />);
  expect(await screen.findByText("services")).toBeTruthy();

  await act(() => router.navigate({ to: "/content/edit" }));
  expect(await screen.findByText("editing as tester")).toBeTruthy();

  await act(() => router.navigate({ to: "/services" }));
  await act(() => router.navigate({ to: "/content/edit" }));
  expect(await screen.findByText("editing as tester")).toBeTruthy();
});
