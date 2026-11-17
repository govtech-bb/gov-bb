/** @vitest-environment jsdom */
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { ApiFailure } from "../../src/api/client";
import { LoadFailure } from "../../src/workspace/load-failure";

const router = createRouter({
  routeTree: createRootRoute(),
  history: createMemoryHistory({ initialEntries: ["/categories"] }),
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

test("once what failed loads, Try again goes with the failure, and the screen's content takes the focus", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

  const content = document.body.appendChild(document.createElement("main"));
  content.id = "workspace-content";
  content.tabIndex = -1;
  const root = createRoot(content.appendChild(document.createElement("div")));

  const screen = (failed: boolean) =>
    act(async () =>
      root.render(
        <RouterContextProvider router={router}>
          {failed ? (
            <LoadFailure
              noun="categories"
              error={new ApiFailure(503)}
              retrying={false}
              retry={() => {}}
            />
          ) : (
            <p>Categories</p>
          )}
        </RouterContextProvider>,
      ),
    );

  await screen(true);

  const again = [...content.querySelectorAll("button")].find(
    (button) => button.textContent === "Try again",
  )!;

  again.focus();
  await screen(false);

  expect(document.activeElement).toBe(content);
  await act(async () => root.unmount());
});
