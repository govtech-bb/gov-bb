/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SidePanel, useSidePanel } from "./side-panel";

let host: HTMLDivElement;

let root: Root;

// Whether the window is wide enough for the panel beside the canvas
let wide = true;

const listeners = new Set<() => void>();

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: wide,
    media: query,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  listeners.clear();
  wide = true;
  vi.unstubAllGlobals();
});

function Document() {
  const panel = useSidePanel();

  return (
    <>
      <SidePanel.Toggle panel={panel} label="Page settings" />
      <SidePanel.Root panel={panel} label="Page settings">
        <SidePanel.Section title="Publishing">
          <input aria-label="Visibility" />
        </SidePanel.Section>
      </SidePanel.Root>
    </>
  );
}

const render = () => act(async () => root.render(<Document />));

const toggle = () => host.querySelector<HTMLButtonElement>('button[aria-label="Page settings"]')!;

const resize = (next: boolean) =>
  act(async () => {
    wide = next;

    for (const listener of listeners) listener();
  });

test("on a wide screen, it opens beside the canvas and the toggle hides it", async () => {
  await render();

  const panel = host.querySelector("aside")!;

  expect(panel.getAttribute("aria-label")).toBe("Page settings");
  expect(panel.hidden).toBe(false);
  expect(toggle().getAttribute("aria-expanded")).toBe("true");
  expect(toggle().getAttribute("aria-controls")).toBe(panel.id);

  await act(async () => toggle().click());

  expect(panel.hidden).toBe(true);
  expect(toggle().getAttribute("aria-expanded")).toBe("false");
});

test("beside the page, it stays in view under the document's bar pinned above it", async () => {
  await render();

  expect(host.querySelector("aside")!.firstElementChild!.className.split(" ")).toEqual(
    expect.arrayContaining(["sticky", "top-(--bar-height)"]),
  );
});

test("its sections are named by their titles, headings under the page's h1", async () => {
  await render();

  const section = host.querySelector("section")!;
  const heading = document.getElementById(section.getAttribute("aria-labelledby")!)!;

  expect(heading.textContent).toBe("Publishing");
  expect(heading.tagName).toBe("H2");
});

test("on a narrow screen, it starts closed and the toggle opens it as a drawer", async () => {
  wide = false;
  await render();

  expect(host.querySelector("aside")).toBeNull();
  expect(toggle().getAttribute("aria-expanded")).toBe("false");

  await act(async () => toggle().click());

  const drawer = document.querySelector('[role="dialog"]')!;

  expect(document.getElementById(drawer.getAttribute("aria-labelledby")!)?.textContent).toBe(
    "Page settings",
  );
  expect(drawer.querySelector('[aria-label="Visibility"]')).not.toBeNull();
  // Its sections' headings sit under the drawer's own title
  expect(drawer.querySelector("h2")?.textContent).toBe("Page settings");
  expect(drawer.querySelector("section h3")?.textContent).toBe("Publishing");
  expect(toggle().getAttribute("aria-expanded")).toBe("true");

  await act(async () => drawer.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click());
  await vi.waitFor(() => expect(toggle().getAttribute("aria-expanded")).toBe("false"));
});

test("narrowing the window doesn't spring the drawer open over the page", async () => {
  await render();
  await resize(false);

  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(toggle().getAttribute("aria-expanded")).toBe("false");

  // Back on a wide screen, the panel is beside the canvas as it was
  await resize(true);

  expect(host.querySelector("aside")?.hidden).toBe(false);
});
