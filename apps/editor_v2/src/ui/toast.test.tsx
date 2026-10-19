/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { dismissToast, toast, Toaster } from "./toast";

let host: HTMLDivElement;

let root: Root;

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Toaster />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

test("a toast raised outside React shows its title and description, and Dismiss removes it", async () => {
  await act(async () => {
    toast("Version 3 restored", { description: "Save to make it the current version." });
  });

  expect(document.body.textContent).toContain("Version 3 restored");
  expect(document.body.textContent).toContain("Save to make it the current version.");

  await act(async () => document.querySelector<HTMLElement>('[aria-label="Dismiss"]')!.click());
  await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));

  expect(document.body.textContent).not.toContain("Version 3 restored");
});

test("a toast's action is a named button that acts once and takes the toast away", async () => {
  const undo = vi.fn();
  await act(async () => {
    toast("Page deleted", { action: { label: "Undo", onClick: undo } });
  });

  const button = [...document.querySelectorAll("button")].find((b) => b.textContent === "Undo");
  expect(button).toBeDefined();

  await act(async () => button!.click());
  await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));

  expect(undo).toHaveBeenCalledTimes(1);
  expect(document.body.textContent).not.toContain("Page deleted");
});

test("dismissToast takes a toast away early, and a toast without an action has no action button", async () => {
  let id = "";
  await act(async () => {
    id = toast("Changes published");
  });

  expect(document.querySelectorAll("button")).toHaveLength(1); // only Dismiss
  await act(async () => dismissToast(id));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));

  expect(document.body.textContent).not.toContain("Changes published");
});
