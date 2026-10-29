/** @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { shownText } from "../../tests/helpers/shown-text";
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
  Reflect.deleteProperty(Element.prototype, "getAnimations");
});

const render = (node: ReactNode) => act(async () => root.render(node));

// The dialog renders in a portal outside the root
const dialog = () => document.querySelector<HTMLElement>('[role="alertdialog"]')!;

const button = (name: string) =>
  [...dialog().querySelectorAll("button")].find((item) => shownText(item) === name)!;

const text = (id: string | null) => (id ? document.getElementById(id)?.textContent : undefined);

const escape = () =>
  act(async () => {
    dialog().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });

test("asks its question in an alert dialog, with the action's verb on its button", async () => {
  const onOpenChange = vi.fn();
  const onConfirm = vi.fn();

  await render(
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Delete this page?"
      description="Unsaved changes will be lost."
      confirmLabel="Delete page"
      onConfirm={onConfirm}
    />,
  );

  expect(text(dialog().getAttribute("aria-labelledby"))).toBe("Delete this page?");
  expect(text(dialog().getAttribute("aria-describedby"))).toBe("Unsaved changes will be lost.");
  await act(async () => button("Delete page").click());
  expect(onConfirm).toHaveBeenCalledOnce();
  await escape();
  expect(onOpenChange).toHaveBeenLastCalledWith(false, expect.anything());
  // Cancel closes it too
  await act(async () => button("Cancel").click());
  expect(onOpenChange).toHaveBeenCalledTimes(2);
  expect(onOpenChange).toHaveBeenLastCalledWith(false, expect.anything());
});

test("while the action works, says so on its button and can't be closed or pressed again", async () => {
  const onOpenChange = vi.fn();
  const onConfirm = vi.fn();

  await render(
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Delete this page?"
      description="Unsaved changes will be lost."
      confirmLabel="Delete page"
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
  expect(onOpenChange).not.toHaveBeenCalled();
});

test("shows why the action failed in the dialog, which stays open", async () => {
  await render(
    <ConfirmDialog
      open
      onOpenChange={() => {}}
      title="Delete this page?"
      description="Unsaved changes will be lost."
      confirmLabel="Delete page"
      error="The page could not be deleted. Try again."
      onConfirm={() => {}}
    />,
  );

  expect(dialog().querySelector('[role="alert"]')?.textContent).toBe(
    "The page could not be deleted. Try again.",
  );
});

test("closing, it keeps the words it had open while it fades, whatever changes behind it", async () => {
  // A browser holds a closing dialog for its fade; this one fades until it's told it's done
  const fading = Promise.withResolvers<void>();

  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: () => [{ finished: fading.promise }],
  });

  const leave = (open: boolean, dirty: boolean) => (
    <ConfirmDialog
      open={open}
      onOpenChange={() => {}}
      title={dirty ? "Leave without saving?" : "Continue?"}
      description={dirty ? "Your unsaved changes will be lost." : "Your changes have been saved."}
      confirmLabel={dirty ? "Leave without saving" : "Continue"}
      onConfirm={() => {}}
    />
  );

  await render(leave(true, true));
  // Leaving discards the changes, and the dialog closes
  await render(leave(false, false));

  expect(dialog().hasAttribute("data-ending-style")).toBe(true);
  expect(text(dialog().getAttribute("aria-labelledby"))).toBe("Leave without saving?");
  expect(text(dialog().getAttribute("aria-describedby"))).toBe(
    "Your unsaved changes will be lost.",
  );
  expect(button("Leave without saving")).toBeDefined();

  await act(async () => fading.resolve());
  await vi.waitFor(() => expect(document.querySelector('[role="alertdialog"]')).toBeNull());

  // Open again, it says what's true now
  await render(leave(true, false));
  expect(text(dialog().getAttribute("aria-labelledby"))).toBe("Continue?");
});

test("an action that loses nothing is teal rather than red", async () => {
  await render(
    <ConfirmDialog
      open
      onOpenChange={() => {}}
      title="Publish this page?"
      description="Citizens will see it at once."
      confirmLabel="Publish"
      variant="accent"
      onConfirm={() => {}}
    />,
  );

  expect(button("Publish").className).toContain("bg-interactive");
  expect(button("Publish").className).not.toContain("bg-error");
});
