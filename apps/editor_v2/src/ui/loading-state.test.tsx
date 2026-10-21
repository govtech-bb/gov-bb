/** @vitest-environment jsdom */
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { LoadingState } from "./loading-state";

const state = (markup: string) =>
  new DOMParser().parseFromString(markup, "text/html").body.firstElementChild!;

const style = (element: Element) => element.querySelector(".trident-loader")?.getAttribute("style");

test("visibly names what is loading and announces it only once", () => {
  const loading = state(renderToStaticMarkup(<LoadingState label="Loading history…" />));

  expect(loading.querySelectorAll('[role="status"]')).toHaveLength(1);
  expect(loading.querySelector('[role="status"]')?.textContent).toBe("Loading history…");
  expect(loading.querySelector(".sr-only")).toBeNull();
  expect(loading.querySelector(".trident-loader")?.getAttribute("aria-hidden")).toBe("true");
});

test("a screen's trident is larger than a dialog's, and fills the height under the bar", () => {
  const page = state(renderToStaticMarkup(<LoadingState size="page" label="Loading page…" />));
  const section = state(renderToStaticMarkup(<LoadingState label="Loading history…" />));

  expect(style(page)).toContain("height:96px");
  expect(style(section)).toContain("height:48px");
  expect(page.className).toContain("min-h-[calc(100dvh-var(--bar-height))]");
});
