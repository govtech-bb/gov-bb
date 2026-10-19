/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { DraftProvider, SourceEditor } from "../../src/host/source-ui";
import { DraftStore } from "../../src/persistence";
import { govbbPageCodec } from "../../src/presets/govbb-page";

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const button = (within: ParentNode, name: string) =>
  [...within.querySelectorAll("button")].find((item) => item.textContent === name)!;

test("Discard changes asks first, and discards the Markdown only when the author says so", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const store = new DraftStore("---\ntitle: Renew a passport\n---\n\n", govbbPageCodec);
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
