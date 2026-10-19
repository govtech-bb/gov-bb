/** @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Bar } from "./bar";

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

test("with a label it's a named toolbar, its groups ruled off by separators", async () => {
  await render(
    <Bar.Root label="Page tools">
      <Bar.Title render={<h1 />}>Renew a passport</Bar.Title>
      <Bar.Status>Saved in this browser</Bar.Status>
      <Bar.Actions>
        <button type="button">Undo</button>
        <Bar.Separator />
        <button type="button">Preview</button>
      </Bar.Actions>
    </Bar.Root>,
  );

  const bar = host.firstElementChild!;

  expect(bar.getAttribute("role")).toBe("toolbar");
  expect(bar.getAttribute("aria-label")).toBe("Page tools");
  expect(bar.querySelector("h1")?.textContent).toBe("Renew a passport");
  expect(bar.querySelector('[role="separator"]')?.getAttribute("aria-orientation")).toBe(
    "vertical",
  );
});

test("without one it's a plain bar, and its rules are only lines", async () => {
  await render(
    <Bar.Root tone="dark">
      <Bar.Title>Services</Bar.Title>
      <Bar.Actions>
        <Bar.Status>employee@govtech.bb</Bar.Status>
        <Bar.Separator />
        <button type="button">Sign out</button>
      </Bar.Actions>
    </Bar.Root>,
  );

  const bar = host.firstElementChild!;

  expect(bar.hasAttribute("role")).toBe(false);
  expect(bar.querySelector('[role="separator"]')).toBeNull();
  expect(bar.querySelector('[aria-hidden="true"]')).not.toBeNull();
  // The dark tone's quiet text reads on navy
  expect(bar.className).toContain("bg-brand-dark");
  expect(
    [...bar.querySelectorAll("div")].find((part) => part.textContent === "employee@govtech.bb")!
      .className,
  ).toContain("text-blue-20");
});

test("a tool is named beside its icon on a wide screen, and by a tooltip on a narrower one", async () => {
  for (const wide of [true, false]) {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: wide,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    await render(<Bar.Tool key={String(wide)} icon={<svg />} label="Markdown" />);

    const tool = host.querySelector("button")!;

    // Read out by its name either way
    expect(tool.textContent).toBe("Markdown");
    expect(tool.hasAttribute("data-base-ui-tooltip-trigger")).toBe(!wide);
  }
});
