/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { shownText } from "../../tests/helpers/shown-text";
import { Button } from "./button";
import { FormDialog } from "./form-dialog";

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Element.prototype, "getAnimations");
});

const button = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
    (item) => shownText(item) === name || item.getAttribute("aria-label") === name,
  )!;

test("its fields and buttons are a form, which sends without leaving, after a Cancel that closes it", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const onSubmit = vi.fn();
  const onOpenChange = vi.fn();
  const root = createRoot(document.body.appendChild(document.createElement("div")));

  await act(async () =>
    root.render(
      <FormDialog
        open
        onOpenChange={onOpenChange}
        title="Rename service"
        description="The service name helps your team find its pages and form."
        onSubmit={onSubmit}
        actions={
          <Button type="submit" variant="accent" size="md">
            Save service name
          </Button>
        }
      >
        <input aria-label="Service name" />
      </FormDialog>,
    ),
  );

  const form = document.querySelector('[role="dialog"] form')!;
  const submit = new Event("submit", { bubbles: true, cancelable: true });

  expect(form.querySelector('[aria-label="Service name"]')).not.toBeNull();
  // Cancel, then the button that finishes the task, last
  expect([...form.querySelectorAll("button")].map(shownText)).toEqual([
    "Cancel",
    "Save service name",
  ]);
  await act(async () => form.dispatchEvent(submit));
  expect(onSubmit).toHaveBeenCalledOnce();
  expect(submit.defaultPrevented).toBe(true);

  await act(async () => button("Cancel").click());
  expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
  await act(async () => root.unmount());
});

test("while it's pending, Cancel, its close button and Esc wait for the answer", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const onOpenChange = vi.fn();
  const root = createRoot(document.body.appendChild(document.createElement("div")));

  await act(async () =>
    root.render(
      <FormDialog
        open
        onOpenChange={onOpenChange}
        title="Create a service"
        description="The service starts as a draft entry page."
        pending
        onSubmit={() => {}}
        actions={
          <Button type="submit" pending pendingLabel="Creating service…">
            Create service
          </Button>
        }
      >
        <input aria-label="Service name" />
      </FormDialog>,
    ),
  );

  expect(button("Cancel").disabled).toBe(true);
  expect(button("Close").disabled).toBe(true);
  await act(async () => {
    document
      .querySelector('[role="dialog"]')!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  expect(onOpenChange).not.toHaveBeenCalled();
  await act(async () => root.unmount());
});

test("closed, it fades away showing what it showed open, though the task's answer changes it", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // A browser holds a closing dialog for its fade; this one fades until it's told it's done
  const fading = Promise.withResolvers<void>();

  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: () => [{ finished: fading.promise }],
  });

  const root = createRoot(document.body.appendChild(document.createElement("div")));

  const task = (open: boolean, working: boolean) => (
    <FormDialog
      open={open}
      onOpenChange={() => {}}
      title="Create a service"
      description="The service starts as a draft entry page."
      pending={working}
      onSubmit={() => {}}
      actions={
        <Button type="submit" pending={working} pendingLabel="Creating service…">
          Create service
        </Button>
      }
    >
      <input aria-label="Service name" />
    </FormDialog>
  );

  await act(async () => root.render(task(true, true)));
  // Made: the work is done and the dialog closes, in one change
  await act(async () => root.render(task(false, false)));

  const dialog = document.querySelector('[role="dialog"]')!;

  expect(dialog.hasAttribute("data-ending-style")).toBe(true);
  expect(shownText(dialog.querySelector('button[type="submit"]')!)).toBe("Creating service…");
  await act(async () => fading.resolve());
  await act(async () => root.unmount());
});
