/** @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Bar } from "./bar";
import { Button } from "./button";

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
      <Bar.Status>Unsaved changes</Bar.Status>
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

test("a focused tool keeps its focus as the window narrows past 1200px", async () => {
  let wide = true;
  const changes = new Set<() => void>();

  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return wide;
    },
    media: query,
    addEventListener: (_type: string, change: () => void) => changes.add(change),
    removeEventListener: (_type: string, change: () => void) => changes.delete(change),
  }));
  await render(<Bar.Tool icon={<svg />} label="Markdown" />);

  const tool = host.querySelector("button")!;

  await act(async () => tool.focus());
  await act(async () => {
    wide = false;
    changes.forEach((change) => change());
  });

  // The same button, now named by its tooltip, still has the focus
  expect(host.querySelector("button")).toBe(tool);
  expect(tool.hasAttribute("data-base-ui-tooltip-trigger")).toBe(true);
  expect(document.activeElement).toBe(tool);
});

test("a labelled bar's tools are one Tab stop, the arrow keys moving between them", async () => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  await render(
    <Bar.Root label="Page tools">
      <Bar.Title render={<h1 />}>Renew a passport</Bar.Title>
      <Bar.Actions>
        <Button icon={<svg />} aria-label="Undo" />
        <Bar.Separator />
        <Bar.Tool icon={<svg />} label="Preview page" />
        <Bar.Tool icon={<svg />} label="Markdown" />
        <Bar.Separator />
        <Button variant="accent">Publish changes</Button>
      </Bar.Actions>
    </Bar.Root>,
  );

  const name = (control: Element | null) =>
    control?.getAttribute("aria-label") ?? control?.textContent;

  const press = (key: string) =>
    act(async () => {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
    });

  const tools = [...host.querySelectorAll("button")];

  // Each tool keeps its tooltip and its name; only the first is in the tab order
  expect(tools.map(name)).toEqual(["Undo", "Preview page", "Markdown", "Publish changes"]);
  expect(tools.map((tool) => tool.tabIndex)).toEqual([0, -1, -1, -1]);
  expect(tools[1]!.hasAttribute("data-base-ui-tooltip-trigger")).toBe(true);

  await act(async () => tools[0]!.focus());
  await press("ArrowRight");
  expect(name(document.activeElement)).toBe("Preview page");
  await press("End");
  expect(name(document.activeElement)).toBe("Publish changes");
  // Round from the last to the first, as a menu's arrows go
  await press("ArrowRight");
  expect(name(document.activeElement)).toBe("Undo");
});

test("its crumbs are a landmark round a list, the last the screen you're on, in either tone", async () => {
  for (const tone of ["dark", "light"] as const) {
    await render(
      <Bar.Root key={tone} tone={tone}>
        <Bar.Crumbs
          crumbs={[
            { label: "Services", render: <a href="#services" /> },
            { label: "Renew a passport" },
          ]}
        />
      </Bar.Root>,
    );

    const trail = host.querySelector('nav[aria-label="Breadcrumb"]')!;
    const steps = [...trail.querySelectorAll("ol > li")];
    const link = trail.querySelector("a")!;

    expect(steps.map((step) => step.textContent)).toEqual(["Services", "/Renew a passport"]);
    // The separator is only for the eye
    expect(steps[1]!.querySelector('[aria-hidden="true"]')?.textContent).toBe("/");
    expect(trail.querySelector('[aria-current="page"]')?.textContent).toBe("Renew a passport");
    expect(link.hasAttribute("aria-current")).toBe(false);
    // A link: GovBB's focus ring, untouched, and a finger's size on a touch screen
    expect(link.className).not.toMatch(/outline-2/);
    expect(link.classList).toContain("pointer-coarse:min-h-11");
    expect(link.classList).toContain(tone === "dark" ? "hover:bg-white/10" : "hover:bg-hover");
  }
});
