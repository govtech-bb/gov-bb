/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SitePreview } from "./site-preview";

let root: Root;

let workspace: HTMLElement;

let trigger: HTMLButtonElement;

let calls: string[];

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  calls = [];
  workspace = document.createElement("div");
  workspace.dataset.cmsWorkspace = "";
  workspace.innerHTML = `<div data-document-bar><button data-site-preview-trigger>Preview page</button></div>`;
  trigger = workspace.querySelector("button")!;

  // jsdom has no Web Animations: stand in for the panels' replayed entry transitions and a
  // pending loader's infinite animation, which (as in Chromium) can't be finished.
  class CSSTransition {
    finish() {
      calls.push("finish");
    }
  }

  vi.stubGlobal("CSSTransition", CSSTransition);

  const loader = {
    finish: () => {
      throw new DOMException("Cannot finish an infinite animation", "InvalidStateError");
    },
  };

  Object.defineProperty(workspace, "getAnimations", {
    value: () => [loader, new CSSTransition()],
  });

  document.body.append(workspace);
  vi.spyOn(window, "scrollTo").mockImplementation((...args: unknown[]) => {
    calls.push(`scroll ${String(args[1])}`);
  });
  root = createRoot(document.createElement("div"));
});

afterEach(() => {
  workspace.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const open = () =>
  act(async () =>
    root.render(
      <SitePreview
        source=""
        editing={false}
        paused={false}
        onEditingChange={() => {}}
        controls={() => null}
        writerScrollY={1551}
      />,
    ),
  );

const close = () => act(async () => root.unmount());

test("closing settles the writer's replayed transitions, not its loaders, before restoring its scroll and focus", async () => {
  await open();
  expect(workspace.hidden).toBe(true);
  calls = [];
  await close();

  expect(workspace.hidden).toBe(false);
  expect(calls).toEqual(["finish", "scroll 1551"]);
  expect(document.activeElement).toBe(trigger);
});

test("closing into another preview or page leaves the writer's animations, scroll and focus alone", async () => {
  await open();
  calls = [];
  const next = document.createElement("div");
  next.dataset.cmsPreviewHost = "";
  document.body.append(next);
  await close();
  next.remove();

  expect(calls).toEqual([]);
  expect(document.activeElement).not.toBe(trigger);
});
