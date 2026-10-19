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
