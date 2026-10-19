/** @vitest-environment jsdom */
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { StatusDot } from "./status-dot";

const dot = (markup: string) =>
  new DOMParser().parseFromString(markup, "text/html").body.firstElementChild!;

test("with a label, the dot stands in for the words: announced, and named on hover", () => {
  const labelled = dot(
    renderToStaticMarkup(<StatusDot tone="warning" label="Preview link only" />),
  );

  expect(labelled.getAttribute("role")).toBe("img");
  expect(labelled.getAttribute("aria-label")).toBe("Preview link only");
  expect(labelled.getAttribute("title")).toBe("Preview link only");
  expect(labelled.hasAttribute("aria-hidden")).toBe(false);
});

test("without one, it only backs up the words beside it", () => {
  const plain = dot(renderToStaticMarkup(<StatusDot tone="success" />));

  expect(plain.getAttribute("aria-hidden")).toBe("true");
  expect(plain.hasAttribute("role")).toBe(false);
});

test("off is an empty ring, so it differs from the others in shape as well as colour", () => {
  const off = dot(renderToStaticMarkup(<StatusDot tone="neutral" />)).className;
  const live = dot(renderToStaticMarkup(<StatusDot tone="success" />)).className;

  expect(off).toContain("border");
  expect(off).not.toMatch(/\bbg-/);
  expect(live).toMatch(/\bbg-/);
});
