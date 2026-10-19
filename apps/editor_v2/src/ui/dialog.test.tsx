/** @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Dialog } from "./dialog";

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
const text = (id: string | null) => (id ? document.getElementById(id)?.textContent : undefined);

test("opens on its first field, named by its title, and closes from its close button", async () => {
  await render(
    <Dialog.Root>
      <Dialog.Trigger>Create service</Dialog.Trigger>
      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>Create a service</Dialog.Title>
          <Dialog.Description>It starts as a draft entry page.</Dialog.Description>
        </Dialog.Header>
        <Dialog.Body>
          <input aria-label="Name" />
        </Dialog.Body>
        <Dialog.Actions>
          <Dialog.Close>Cancel</Dialog.Close>
        </Dialog.Actions>
      </Dialog.Content>
    </Dialog.Root>,
  );

  const trigger = host.querySelector("button")!;

  await act(async () => trigger.click());

  const dialog = document.querySelector('[role="dialog"]')!;

  expect(text(dialog.getAttribute("aria-labelledby"))).toBe("Create a service");
  expect(text(dialog.getAttribute("aria-describedby"))).toBe("It starts as a draft entry page.");
  // The close button comes last, so it isn't what the dialog opens on
  await vi.waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toBe("Name"));
  await act(async () => dialog.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click());
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
});

test("leaves the close button off an alert dialog, which waits for an answer", async () => {
  await render(
    <Dialog.Root role="alertdialog" defaultOpen>
      <Dialog.Content size="sm">
        <Dialog.Header>
          <Dialog.Title>Delete this page?</Dialog.Title>
        </Dialog.Header>
        <Dialog.Actions>
          <Dialog.Close>Cancel</Dialog.Close>
        </Dialog.Actions>
      </Dialog.Content>
    </Dialog.Root>,
  );

  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  expect(document.querySelector('[aria-label="Close"]')).toBeNull();
});
