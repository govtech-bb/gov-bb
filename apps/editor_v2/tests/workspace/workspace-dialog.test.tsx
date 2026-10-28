/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { WorkspaceDialog } from "../../src/workspace/workspace-dialog";

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

test("a task is its body and its buttons, which with onSubmit are a form that sends without leaving", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const onSubmit = vi.fn();
  const root = createRoot(document.body.appendChild(document.createElement("div")));

  await act(async () =>
    root.render(
      <WorkspaceDialog
        open
        title="Rename service"
        description="The service name helps your team find its pages and form."
        close={() => {}}
        onSubmit={onSubmit}
        body={<input aria-label="Service name" />}
        footer={<button type="submit">Save service name</button>}
      />,
    ),
  );

  const form = document.querySelector('[role="dialog"] form')!;
  const submit = new Event("submit", { bubbles: true, cancelable: true });

  expect(form.querySelector('[aria-label="Service name"]')).not.toBeNull();
  expect(form.querySelector("button")?.textContent).toBe("Save service name");
  await act(async () => form.dispatchEvent(submit));
  expect(onSubmit).toHaveBeenCalledOnce();
  expect(submit.defaultPrevented).toBe(true);
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
    <WorkspaceDialog
      open={open}
      title="Create a service"
      description="The service starts as a draft entry page."
      pending={working}
      close={() => {}}
      body={<input aria-label="Service name" />}
      footer={<button type="submit">{working ? "Creating service…" : "Create service"}</button>}
    />
  );

  await act(async () => root.render(task(true, true)));
  // Made: the work is done and the dialog closes, in one change
  await act(async () => root.render(task(false, false)));

  const dialog = document.querySelector('[role="dialog"]')!;

  expect(dialog.hasAttribute("data-ending-style")).toBe(true);
  expect(dialog.querySelector('button[type="submit"]')?.textContent).toBe("Creating service…");
  await act(async () => fading.resolve());
  await act(async () => root.unmount());
  Reflect.deleteProperty(Element.prototype, "getAnimations");
});
