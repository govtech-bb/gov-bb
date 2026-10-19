/** @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ConfirmDialog } from "./confirm-dialog";

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

// The dialog renders in a portal outside the root
const dialog = () => document.querySelector<HTMLElement>('[role="alertdialog"]')!;

const button = (name: string) =>
  [...dialog().querySelectorAll("button")].find((item) => item.textContent === name)!;

const text = (id: string | null) => (id ? document.getElementById(id)?.textContent : undefined);

const escape = () =>
  act(async () => {
    dialog().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });

test("asks its question in an alert dialog, with the action's verb on its button", async () => {
  const onClose = vi.fn();
  const onConfirm = vi.fn();

  await render(
    <ConfirmDialog
      open
      onClose={onClose}
      title="Delete this page?"
      description="Its browser draft is kept."
      confirm="Delete page"
      onConfirm={onConfirm}
    />,
  );

  expect(text(dialog().getAttribute("aria-labelledby"))).toBe("Delete this page?");
  expect(text(dialog().getAttribute("aria-describedby"))).toBe("Its browser draft is kept.");
  await act(async () => button("Delete page").click());
  expect(onConfirm).toHaveBeenCalledOnce();
  await escape();
  expect(onClose).toHaveBeenCalledOnce();
});

test("while the action works, says so on its button and can't be closed or pressed again", async () => {
  const onClose = vi.fn();
  const onConfirm = vi.fn();

  await render(
    <ConfirmDialog
      open
      onClose={onClose}
      title="Delete this page?"
      description="Its browser draft is kept."
      confirm="Delete page"
      pendingLabel="Deleting page…"
      pending
      onConfirm={onConfirm}
    />,
  );

  const working = button("Deleting page…");

  expect(working.getAttribute("aria-disabled")).toBe("true");
  expect(working.disabled).toBe(false);
  await act(async () => working.click());
  expect(onConfirm).not.toHaveBeenCalled();
  expect(button("Cancel").disabled).toBe(true);
  await escape();
  expect(onClose).not.toHaveBeenCalled();
});

test("shows why the action failed in the dialog, which stays open", async () => {
  await render(
    <ConfirmDialog
      open
      onClose={() => {}}
      title="Delete this page?"
      description="Its browser draft is kept."
      confirm="Delete page"
      error="The page could not be deleted. Try again."
      onConfirm={() => {}}
    />,
  );

  expect(dialog().querySelector('[role="alert"]')?.textContent).toBe(
    "The page could not be deleted. Try again.",
  );
});
