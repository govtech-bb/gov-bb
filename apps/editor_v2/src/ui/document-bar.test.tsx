/** @vitest-environment jsdom */
import { act, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Bar } from "./bar";
import { Button } from "./button";
import { DocumentBar } from "./document-bar";
import { SidePanel, useSidePanel } from "./side-panel";

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

const button = (name: string) => <button type="button">{name}</button>;

const names = () => [...host.querySelectorAll("button")].map((control) => control.textContent);

const separators = () => host.querySelectorAll('[role="separator"]').length;

test("the title is the screen's h1, and the tools keep their places whatever order they're given in", async () => {
  await render(
    <DocumentBar
      label="Page tools"
      settings={button("Page settings")}
      publish={button("Publish changes")}
      source={button("Markdown")}
      preview={button("Preview page")}
      undo={button("Undo")}
      save={{ status: "saved" }}
      title="Renew a passport"
      notices={<p>Page editing is paused.</p>}
    />,
  );

  expect(host.querySelector('[role="toolbar"]')?.getAttribute("aria-label")).toBe("Page tools");
  expect(host.querySelector("h1")?.textContent).toBe("Renew a passport");
  expect(names()).toEqual(["Undo", "Preview page", "Markdown", "Publish changes", "Page settings"]);
  // Undo and redo | the ways to look at it | publishing | settings, at the end above its panel
  expect(separators()).toBe(3);
  // The notices sit under the bar, not in it
  expect(host.querySelector('[role="toolbar"] p')).toBeNull();
  expect(host.lastElementChild?.textContent).toBe("Page editing is paused.");
});

test("a preview can keep its document title without adding a second page heading", async () => {
  await render(<DocumentBar label="Page tools" title="Renew a passport" heading={false} />);

  expect(host.querySelector("h1")).toBeNull();
  expect(host.querySelector('[role="toolbar"]')?.textContent).toBe("Renew a passport");
});

test("where the work stands sits beside the title, and a failed save's message comes first under the bar", async () => {
  await render(
    <DocumentBar
      label="Page tools"
      title="Renew a passport"
      save={{ status: "failed", error: "We could not save this page.", onRetry: () => {} }}
      notices={<p>A newer version of this page has been saved.</p>}
    />,
  );

  const [bar, notices] = host.children;

  expect(bar?.textContent).toBe("Renew a passportNot saved");
  expect([...notices!.children].map((notice) => notice.textContent)).toEqual([
    "We could not save this page.Try again",
    "A newer version of this page has been saved.",
  ]);

  // Saved again, the message goes, and the notices with nothing to say go with it
  await render(
    <DocumentBar label="Page tools" title="Renew a passport" save={{ status: "saved" }} />,
  );
  expect(host.childElementCount).toBe(1);
  expect(host.textContent).toBe("Renew a passportSavedChanges saved");
});

test("a form fills the slots it has, and the bar closes up round the rest", async () => {
  await render(
    <DocumentBar
      label="Form tools"
      title="Apply for a permit"
      undo={button("Undo")}
      source={
        <>
          {button("Markdown")}
          {button("JSON")}
        </>
      }
    />,
  );

  expect(names()).toEqual(["Undo", "Markdown", "JSON"]);
  expect(separators()).toBe(1);
});

test("a tool stays mounted as the tools before it come and go", async () => {
  let mounts = 0;

  function Toggle() {
    useEffect(() => {
      mounts++;
    }, []);

    return button("Page settings");
  }

  const bar = (views: boolean) => (
    <DocumentBar
      label="Page tools"
      title="Renew a passport"
      source={views && button("Markdown")}
      publish={<span>Publish</span>}
      settings={<Toggle />}
    />
  );

  await render(bar(true));
  await render(bar(false));
  await render(bar(true));

  expect(mounts).toBe(1);
});

test("hidden while another document is open, its notices go with it", async () => {
  await render(
    <DocumentBar label="Page tools" title="Renew a passport" hidden notices={<p>Paused</p>} />,
  );

  expect([...host.children].map((part) => part.hasAttribute("hidden"))).toEqual([true, true]);
});

test("from a tablet up it's pinned to the top as the document scrolls under it, in one row", async () => {
  await render(<DocumentBar label="Page tools" title="Renew a passport" />);

  const bar = host.querySelector('[role="toolbar"]')!;

  // On the bar layer, above the canvas's own, such as the block rail, and named for the page's scroll padding (index.css)
  expect(bar.className.split(" ")).toEqual(
    expect.arrayContaining(["md:sticky", "md:top-0", "md:z-bar", "md:flex-nowrap"]),
  );
  expect(bar.hasAttribute("data-document-bar")).toBe(true);
});

test("every tool in its slots is one of its toolbar's controls: one Tab stop, the arrows between them", async () => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

  function Page() {
    const panel = useSidePanel();

    return (
      <DocumentBar
        label="Page tools"
        title="Renew a passport"
        undo={
          <>
            <Button icon={<svg />} aria-label="Undo" disabled />
            <Button icon={<svg />} aria-label="Redo" />
          </>
        }
        preview={<Bar.Tool icon={<svg />} label="Preview page" />}
        publish={<Button variant="accent">Publish changes</Button>}
        settings={<SidePanel.Toggle panel={panel} label="Page settings" />}
      />
    );
  }

  await render(<Page />);

  const named = (control: Element) => control.getAttribute("aria-label") ?? control.textContent;
  const controls = [...host.querySelectorAll<HTMLElement>('[role="toolbar"] button')];

  expect(controls.map(named)).toEqual([
    "Undo",
    "Redo",
    "Preview page",
    "Publish changes",
    "Page settings",
  ]);
  // Undo can't be used yet, so Redo holds the one Tab stop
  expect(controls.map((control) => control.getAttribute("tabindex"))).toEqual([
    "-1",
    "0",
    "-1",
    "-1",
    "-1",
  ]);

  await act(async () => controls[1]!.focus());

  for (const name of ["Preview page", "Publish changes", "Page settings"]) {
    await act(async () => {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }),
      );
    });
    expect(named(document.activeElement!)).toBe(name);
  }
});
