/** @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AuthorCard, Caption, caption } from "./caption";

let host: HTMLDivElement;

let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const render = (node: ReactNode) => act(async () => root.render(node));

test("a caption is its icon, then its words, in the class a DOM-built caption takes too", async () => {
  await render(<Caption icon={<svg />}>Preview</Caption>);

  const drawn = host.firstElementChild!;

  expect(drawn.className).toBe(caption);
  expect(drawn.firstElementChild!.tagName).toBe("svg");
  expect(drawn.textContent).toBe("Preview");
  // 12px semibold and muted, its icon in GovBB's blue
  expect(caption.split(" ")).toEqual(
    expect.arrayContaining(["text-12", "font-semibold", "text-muted", "[&>svg]:text-blue-40"]),
  );
});

test("an author card sits on the desk's grey, captioned as the author's alone", async () => {
  await render(
    <AuthorCard icon={<svg />} title="Calculated fields" role="group" aria-label="Totals">
      <p>Total = Age + 1</p>
    </AuthorCard>,
  );

  const card = host.firstElementChild!;

  expect(card.getAttribute("role")).toBe("group");
  expect(card.className).toContain("bg-tint");
  expect(card.firstElementChild!.textContent).toBe("Calculated fields · not shown on the form");
  expect(card.lastElementChild!.textContent).toBe("Total = Age + 1");
});
