/** @vitest-environment jsdom */
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { act } from "react";
import { expect, test, vi } from "vitest";
import { ApiFailure } from "../../src/api/client";
import { ListScreen } from "../../src/ui/list-screen";
import { listLoadView } from "../../src/workspace/list-load-view";
import { renderInPage } from "../helpers/page-editor";

const router = createRouter({
  routeTree: createRootRoute(),
  history: createMemoryHistory({ initialEntries: ["/services"] }),
});

test.each([
  [401, "Your session has ended. Sign in again to load services."],
  [403, "You do not have access to these services."],
  [
    404,
    "These services could not be found. They may have been removed, or the address may be wrong.",
  ],
  [503, "Check your connection, then try again."],
] as const)("a blocked list (%s) says why and offers the way on", async (status, sentence) => {
  const retry = vi.fn();

  const load = listLoadView(
    {
      data: status === 503 ? undefined : ["Last loaded row"],
      isError: true,
      error: new ApiFailure(status),
      isFetching: false,
      refetch: retry,
    },
    "services",
  );

  await renderInPage(
    <RouterContextProvider router={router}>
      <ListScreen
        title="Services"
        status={load.status}
        notices={load.notices}
        failure={load.failure}
      >
        Last loaded row
      </ListScreen>
    </RouterContextProvider>,
  );
  expect(document.body.textContent).toContain("We could not load services");
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(sentence);
  expect(document.body.textContent).not.toContain("Last loaded row");

  const again = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Try again",
  );

  if (status === 401) {
    const signIn = document.querySelector<HTMLAnchorElement>('a[href^="/auth"]');
    expect(signIn?.textContent).toBe("Sign in again");

    const target = new URL(signIn!.href);
    expect(target.pathname).toBe("/auth");
    expect(Object.fromEntries(target.searchParams)).toEqual({
      state: "sign-in",
      returnTo: "/services",
      reason: "provider",
    });
    expect(again).toBeUndefined();
  } else {
    expect(again).toBeDefined();
    await act(async () => again?.click());
    expect(retry).toHaveBeenCalledOnce();
  }
});
