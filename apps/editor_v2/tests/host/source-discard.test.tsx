/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { DraftProvider, SourceEditor } from "../../src/host/source-ui";
import type { DraftStorage } from "../../src/persistence/types";
import { newPage, openDocument } from "../../src/workspace/documents";

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const memory = (): DraftStorage => {
  const items = new Map<string, string>();

  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
};

const button = (within: ParentNode, name: string) =>
  [...within.querySelectorAll("button")].find((item) => item.textContent === name)!;

test("Discard changes asks first, and discards the Markdown only when the author says so", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const store = openDocument(newPage("Renew a passport", "entry").document, memory());
  const root = createRoot(document.body.appendChild(document.createElement("div")));

  await act(async () =>
    root.render(
      <DraftProvider store={store}>
        <SourceEditor inline documentLabel="page" fileName="page.md" />
      </DraftProvider>,
    ),
  );
  await act(async () => store.edit(`${store.getSnapshot().source}\nAn unapplied line.\n`));
  expect(store.getSnapshot().dirty).toBe(true);

  await act(async () => button(document, "Discard changes").click());

  const question = () => document.querySelector('[role="alertdialog"]');

  expect(question()?.textContent).toContain("Discard your changes?");
  expect(store.getSnapshot().dirty).toBe(true);
  await act(async () => button(question()!, "Cancel").click());
  expect(store.getSnapshot().dirty).toBe(true);

  await act(async () => button(document, "Discard changes").click());
  await act(async () => button(question()!, "Discard changes").click());
  expect(store.getSnapshot().dirty).toBe(false);
  await act(async () => root.unmount());
});
